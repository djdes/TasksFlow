import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { sendTaskCompletedEmail } from "./mail";
import { registerCompanySchema, loginSchema } from "@shared/schema";
import { requireApiKey, extractBearerKey, generateApiKey, hashApiKey } from "./api-keys";
import { parseJournalLink } from "@shared/journal-link";
import {
  findTaskFormInCatalog,
  normalizeTaskFormPayload,
  type WesetupCatalog,
} from "@shared/wesetup-journal-mode";
import {
  getPublicTasksflowBaseUrl,
  getPublicWesetupBaseUrl,
  toPublicWesetupUrl,
} from "./public-urls";

// Настройка загрузки файлов
const uploadsDir = path.join(process.cwd(), "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const taskId = req.params.id || "unknown";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `task-${taskId}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Только изображения разрешены"));
    }
  },
});

// Расширяем типы для сессий
declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

// Middleware для проверки авторизации
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  next();
}

// Middleware для проверки админских прав
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  const user = await storage.getUserById(req.session.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: "Требуются права администратора" });
  }
  next();
}

// Аутентификация: либо session admin, либо API key.
async function requireAdminOrApiKey(req: Request, res: Response, next: NextFunction) {
  if (extractBearerKey(req)) {
    return requireApiKey(req, res, next);
  }
  return requireAdmin(req, res, next);
}

// Аутентификация: либо session (любой user), либо API key.
async function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction) {
  if (extractBearerKey(req)) {
    return requireApiKey(req, res, next);
  }
  return requireAuth(req, res, next);
}

/** Хелпер: получить companyId из req либо от API key, либо от session. */
async function getCompanyIdFromReq(req: Request): Promise<number | null> {
  if (req.apiKey) return req.apiKey.companyId;
  if (req.session?.userId) {
    const user = await storage.getUserById(req.session.userId);
    return user?.companyId ?? null;
  }
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Auth
  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      
      // Нормализуем номер телефона
      const normalizedPhone = input.phone.replace(/\s+/g, "").replace(/-/g, "");
      
      const user = await storage.getUserByPhone(normalizedPhone);
      if (!user) {
        return res.status(401).json({
          message: "Пользователь с таким номером не найден",
          field: "phone",
        });
      }

      req.session.userId = user.id;
      res.json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error logging in:', err);
      res.status(500).json({ message: 'Ошибка авторизации', error: err.message });
    }
  });

  app.get(api.auth.me.path, async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.json(null);
      }
      
      const user = await storage.getUserById(req.session.userId);
      res.json(user || null);
    } catch (err: any) {
      console.error('Error fetching user:', err);
      res.status(500).json({ message: 'Ошибка', error: err.message });
    }
  });

  app.post(api.auth.logout.path, async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true });
    });
  });

  // Регистрация новой компании и администратора
  app.post("/api/companies/register", async (req, res) => {
    try {
      const input = registerCompanySchema.parse(req.body);

      // Нормализуем номер телефона
      const normalizedPhone = input.phone.replace(/\s+/g, "").replace(/-/g, "");

      // Проверяем, существует ли пользователь с таким телефоном
      const existingUser = await storage.getUserByPhone(normalizedPhone);
      if (existingUser) {
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      // Создаём компанию
      const company = await storage.createCompany({
        name: input.companyName,
        email: input.email,
      });

      // Создаём администратора компании
      const user = await storage.createUser({
        phone: normalizedPhone,
        name: input.adminName || undefined,
        isAdmin: true,
        companyId: company.id,
      });

      // Автоматически авторизуем пользователя
      req.session.userId = user.id;

      res.status(201).json({ company, user });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error registering company:', err);
      res.status(500).json({ message: 'Ошибка регистрации', error: err.message });
    }
  });

  // Регистрация пользователя к существующей компании (по телефону админа)
  app.post("/api/users/register", async (req, res) => {
    try {
      const registerUserSchema = z.object({
        phone: loginSchema.shape.phone,
        name: z.string().min(1, "Введите имя"),
        adminPhone: loginSchema.shape.phone,
      });

      const input = registerUserSchema.parse(req.body);

      // Нормализуем номера телефонов
      const normalizedPhone = input.phone.replace(/\s+/g, "").replace(/-/g, "");
      const normalizedAdminPhone = input.adminPhone.replace(/\s+/g, "").replace(/-/g, "");

      // Проверяем, существует ли пользователь с таким телефоном
      const existingUser = await storage.getUserByPhone(normalizedPhone);
      if (existingUser) {
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      // Ищем администратора по телефону
      const admin = await storage.getUserByPhone(normalizedAdminPhone);
      if (!admin) {
        return res.status(400).json({
          message: "Администратор с таким номером не найден",
          field: "adminPhone",
        });
      }

      if (!admin.isAdmin) {
        return res.status(400).json({
          message: "Указанный пользователь не является администратором",
          field: "adminPhone",
        });
      }

      if (!admin.companyId) {
        return res.status(400).json({
          message: "У администратора не привязана компания",
          field: "adminPhone",
        });
      }

      // Создаём пользователя в компании админа
      const user = await storage.createUser({
        phone: normalizedPhone,
        name: input.name,
        isAdmin: false,
        companyId: admin.companyId,
      });

      // Автоматически авторизуем пользователя
      req.session.userId = user.id;

      res.status(201).json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error registering user:', err);
      res.status(500).json({ message: 'Ошибка регистрации', error: err.message });
    }
  });

  // Получить компанию текущего пользователя
  app.get("/api/companies/me", requireAuthOrApiKey, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.json(null);
      }
      const company = await storage.getCompanyById(companyId);
      res.json(company || null);
    } catch (err: any) {
      console.error('Error fetching company:', err);
      res.status(500).json({ message: 'Ошибка', error: err.message });
    }
  });

  // Обновить компанию (только админ)
  app.put("/api/companies/me", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user || !user.companyId) {
        return res.status(400).json({ message: 'Компания не найдена' });
      }

      const updateCompanySchema = z.object({
        name: z.string().trim().min(1, "Название компании обязательно"),
        email: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((value) => (value ? value : null)),
        wesetupBaseUrl: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((value) =>
            value === undefined ? undefined : value ? value.replace(/\/+$/, "") : null
          )
          .refine(
            (value) =>
              value === null ||
              value === undefined ||
              /^https?:\/\/[^/\s]+/i.test(value),
            "Адрес WeSetup должен начинаться с http:// или https://"
          ),
        wesetupApiKey: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((value) =>
            value === undefined ? undefined : value ? value : null
          ),
      });

      const parsed = updateCompanySchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return res.status(400).json({
          message: issue?.message || "Некорректные данные компании",
          field: issue?.path.join("."),
        });
      }

      const { name, email, wesetupBaseUrl, wesetupApiKey } = parsed.data;
      const updateData: {
        name: string;
        email: string | null;
        wesetupBaseUrl?: string | null;
        wesetupApiKey?: string | null;
      } = {
        name,
        email,
      };
      if (wesetupBaseUrl !== undefined) updateData.wesetupBaseUrl = wesetupBaseUrl;
      if (wesetupApiKey !== undefined) updateData.wesetupApiKey = wesetupApiKey;

      const company = await storage.updateCompany(user.companyId, updateData);

      res.json(company);
    } catch (err: any) {
      console.error('Error updating company:', err);
      res.status(500).json({ message: 'Ошибка обновления компании', error: err.message });
    }
  });

  // Обновить имя текущего пользователя (для админа - собственное имя)
  app.put("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const { name } = req.body;
      const user = await storage.getUserById(req.session.userId!);

      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      const updated = await storage.updateUser(user.id, {
        phone: user.phone,
        name: name?.trim() || null,
      });

      res.json(updated);
    } catch (err: any) {
      console.error('Error updating user:', err);
      res.status(500).json({ message: 'Ошибка обновления', error: err.message });
    }
  });

  // Workers
  app.get(api.workers.list.path, requireAuthOrApiKey, async (req, res) => {
    try {
      // Фильтруем по компании (session-user или api key)
      const companyId = await getCompanyIdFromReq(req);
      const workers = await storage.getWorkers(companyId ?? undefined);
      res.json(workers);
    } catch (err: any) {
      console.error('Error fetching workers:', err);
      res.status(500).json({ message: 'Ошибка загрузки сотрудников', error: err.message });
    }
  });

  app.get(api.workers.get.path, async (req, res) => {
    try {
      const worker = await storage.getWorker(Number(req.params.id));
      if (!worker) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      res.json(worker);
    } catch (err: any) {
      console.error('Error fetching worker:', err);
      res.status(500).json({ message: 'Ошибка', error: err.message });
    }
  });

  app.post(api.workers.create.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.workers.create.input.parse(req.body);
      // Добавляем companyId текущего пользователя
      const user = await storage.getUserById(req.session.userId!);
      const worker = await storage.createWorker({
        ...input,
        companyId: user?.companyId ?? undefined,
      });
      res.status(201).json(worker);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error creating worker:', err);
      res.status(500).json({ message: 'Ошибка создания сотрудника', error: err.message });
    }
  });

  app.put(api.workers.update.path, async (req, res) => {
    try {
      const input = api.workers.update.input.parse(req.body);
      const worker = await storage.updateWorker(Number(req.params.id), input);
      if (!worker) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      res.json(worker);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error updating worker:', err);
      res.status(500).json({ message: 'Ошибка обновления', error: err.message });
    }
  });

  app.delete(api.workers.delete.path, async (req, res) => {
    try {
      await storage.deleteWorker(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      console.error('Error deleting worker:', err);
      res.status(500).json({ message: 'Ошибка удаления', error: err.message });
    }
  });

  // Tasks
  app.get(api.tasks.list.path, requireAuthOrApiKey, async (req, res) => {
    try {
      // Фильтруем по компании (session-user или api key)
      const companyId = await getCompanyIdFromReq(req);
      const tasks = await storage.getTasks(companyId ?? undefined);
      res.json(tasks);
    } catch (err: any) {
      console.error('Error fetching tasks:', err);
      res.status(500).json({ message: 'Ошибка загрузки задач', error: err.message });
    }
  });

  app.get(api.tasks.get.path, requireAuthOrApiKey, async (req, res) => {
    try {
      const task = await storage.getTask(Number(req.params.id));
      if (!task) {
        return res.status(404).json({ message: 'Задача не найдена' });
      }
      res.json(task);
    } catch (err: any) {
      console.error('Error fetching task:', err);
      res.status(500).json({ message: 'Ошибка', error: err.message });
    }
  });

  app.post(api.tasks.create.path, requireAdminOrApiKey, async (req, res) => {
    try {
      const input = api.tasks.create.input.parse(req.body);
      // companyId — из session-user или api key
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const task = await storage.createTask({
        ...input,
        companyId,
      });
      res.status(201).json(task);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error creating task:', err);
      res.status(500).json({ message: 'Ошибка создания задачи', error: err.message });
    }
  });

  app.put(api.tasks.update.path, requireAdminOrApiKey, async (req, res) => {
    try {
      const input = api.tasks.update.input.parse(req.body);
      const task = await storage.updateTask(Number(req.params.id), input);
      if (!task) {
        return res.status(404).json({ message: 'Задача не найдена' });
      }
      res.json(task);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error updating task:', err);
      res.status(500).json({ message: 'Ошибка обновления', error: err.message });
    }
  });

  app.delete(api.tasks.delete.path, requireAdminOrApiKey, async (req, res) => {
    try {
      await storage.deleteTask(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      console.error('Error deleting task:', err);
      res.status(500).json({ message: 'Ошибка удаления', error: err.message });
    }
  });

  // Загрузка фото для задачи (поддержка до 10 фотографий)
  app.post("/api/tasks/:id/photo", requireAuth, (req, res, next) => {
    // Устанавливаем заголовок Content-Type для JSON ответов
    res.setHeader('Content-Type', 'application/json');

    upload.single("photo")(req, res, async (err: any) => {
      try {
        if (err) {
          // Ошибки multer (например, неверный тип файла / размер)
          console.error("Multer upload error:", err);
          return res.status(400).json({ message: err.message || "Ошибка загрузки файла" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "Файл не загружен" });
        }

        const taskId = Number(req.params.id);
        const task = await storage.getTask(taskId);
        if (!task) {
          return res.status(404).json({ message: "Задача не найдена" });
        }

        // Проверяем права: исполнитель или админ
        const currentUser = await storage.getUserById(req.session.userId!);
        const isAllowed = currentUser?.isAdmin || task.workerId === req.session.userId;
        if (!isAllowed) {
          return res.status(403).json({ message: "Вы не являетесь исполнителем этой задачи" });
        }

        // Проверяем лимит фотографий (максимум 10)
        const currentPhotos = (task as any).photoUrls || [];
        if (currentPhotos.length >= 10) {
          return res.status(400).json({ message: "Достигнут лимит фотографий (максимум 10)" });
        }

        const photoUrl = `/uploads/${req.file.filename}`;
        // Добавляем новое фото в массив
        const newPhotoUrls = [...currentPhotos, photoUrl];
        const updatedTask = await storage.updateTask(taskId, {
          photoUrls: newPhotoUrls,
          photoUrl: photoUrl // Для обратной совместимости, храним последнее фото
        });
        if (!updatedTask) {
          return res.status(500).json({ message: "Ошибка обновления задачи" });
        }

        return res.json({
          photoUrl: photoUrl,
          photoUrls: (updatedTask as any).photoUrls || []
        });
      } catch (uploadErr: any) {
        console.error("Error uploading photo:", uploadErr);
        return res.status(500).json({ message: "Ошибка загрузки фото", error: uploadErr.message });
      }
    });
  });

  // Загрузка примера фото для задачи (только админ)
  app.post("/api/tasks/:id/example-photo", requireAuth, requireAdmin, (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');

    upload.single("photo")(req, res, async (err: any) => {
      try {
        if (err) {
          console.error("Multer upload error:", err);
          return res.status(400).json({ message: err.message || "Ошибка загрузки файла" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "Файл не загружен" });
        }

        const taskId = Number(req.params.id);
        const task = await storage.getTask(taskId);
        if (!task) {
          return res.status(404).json({ message: "Задача не найдена" });
        }

        const examplePhotoUrl = `/uploads/${req.file.filename}`;
        const updatedTask = await storage.updateTask(taskId, { examplePhotoUrl });

        if (!updatedTask) {
          return res.status(500).json({ message: "Ошибка обновления задачи" });
        }

        return res.json({ examplePhotoUrl: updatedTask.examplePhotoUrl });
      } catch (uploadErr: any) {
        console.error("Error uploading example photo:", uploadErr);
        return res.status(500).json({ message: "Ошибка загрузки фото", error: uploadErr.message });
      }
    });
  });

  // Удаление примера фото задачи (только админ)
  app.delete("/api/tasks/:id/example-photo", requireAuth, requireAdmin, async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      if (!task.examplePhotoUrl) {
        return res.status(400).json({ message: "У задачи нет примера фото" });
      }

      // Удаляем файл с диска
      const { unlink } = await import("fs/promises");
      const photoPath = path.join(process.cwd(), task.examplePhotoUrl);
      try {
        await unlink(photoPath);
      } catch (unlinkErr: any) {
        console.error("Error deleting example photo file:", unlinkErr);
      }

      const updatedTask = await storage.updateTask(taskId, { examplePhotoUrl: null });
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting example photo:", err);
      res.status(500).json({ message: "Ошибка удаления примера фото", error: err.message });
    }
  });

  // Удаление конкретного фото задачи по URL
  app.delete("/api/tasks/:id/photo", requireAuth, async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    try {
      const taskId = Number(req.params.id);
      const photoUrlToDelete = req.query.url as string; // URL фото для удаления

      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Проверяем права: исполнитель или админ
      const currentUser = await storage.getUserById(req.session.userId!);
      const isAllowed = currentUser?.isAdmin || task.workerId === req.session.userId;
      if (!isAllowed) {
        return res.status(403).json({ message: "Нет прав для удаления фото" });
      }

      const currentPhotos: string[] = (task as any).photoUrls || [];

      // Если передан конкретный URL, удаляем только его
      if (photoUrlToDelete) {
        if (!currentPhotos.includes(photoUrlToDelete)) {
          return res.status(400).json({ message: "Фото не найдено" });
        }

        // Удаляем файл с диска
        const { unlink } = await import("fs/promises");
        const photoPath = path.join(process.cwd(), photoUrlToDelete);
        try {
          await unlink(photoPath);
        } catch (unlinkErr: any) {
          console.error("Error deleting photo file:", unlinkErr);
        }

        // Обновляем массив фото
        const newPhotoUrls = currentPhotos.filter(url => url !== photoUrlToDelete);
        const lastPhotoUrl = newPhotoUrls.length > 0 ? newPhotoUrls[newPhotoUrls.length - 1] : null;

        const updatedTask = await storage.updateTask(taskId, {
          photoUrls: newPhotoUrls.length > 0 ? newPhotoUrls : null,
          photoUrl: lastPhotoUrl
        });

        if (!updatedTask) {
          return res.status(500).json({ message: "Ошибка обновления задачи" });
        }

        return res.json({
          success: true,
          photoUrls: (updatedTask as any).photoUrls || []
        });
      }

      // Если URL не передан, удаляем все фото (старое поведение)
      if (currentPhotos.length === 0 && !task.photoUrl) {
        return res.status(400).json({ message: "У задачи нет фото" });
      }

      // Удаляем все файлы с диска
      const { unlink } = await import("fs/promises");
      for (const photoUrl of currentPhotos) {
        const photoPath = path.join(process.cwd(), photoUrl);
        try {
          await unlink(photoPath);
        } catch (unlinkErr: any) {
          console.error("Error deleting photo file:", unlinkErr);
        }
      }

      // Также удаляем старый photoUrl если он есть и не в массиве
      if (task.photoUrl && !currentPhotos.includes(task.photoUrl)) {
        const photoPath = path.join(process.cwd(), task.photoUrl);
        try {
          await unlink(photoPath);
        } catch (unlinkErr: any) {
          console.error("Error deleting legacy photo file:", unlinkErr);
        }
      }

      // Обновляем задачу, убирая все фото
      const updatedTask = await storage.updateTask(taskId, {
        photoUrls: null,
        photoUrl: null
      });
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      res.json({ success: true, photoUrls: [] });
    } catch (err: any) {
      console.error("Error deleting photo:", err);
      res.status(500).json({ message: "Ошибка удаления фото", error: err.message });
    }
  });

  // Отметить задачу выполненной
  app.post(api.tasks.complete.path, requireAuthOrApiKey, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const { comment } = req.body || {};
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Проверка прав: API key имеет админские права, иначе исполнитель или session-админ.
      let isAllowed = false;
      if (req.apiKey) {
        isAllowed = true;
      } else if (req.session.userId === task.workerId) {
        isAllowed = true;
      } else if (req.session?.userId) {
        const currentUser = await storage.getUserById(req.session.userId);
        if (currentUser?.isAdmin) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        return res.status(403).json({ message: "Нет прав для изменения задачи" });
      }

      // Если требуется фото, проверяем что оно загружено
      const taskPhotoUrls = (task as any).photoUrls || [];
      const hasPhotos = taskPhotoUrls.length > 0 || task.photoUrl;
      if (task.requiresPhoto && !hasPhotos) {
        return res.status(400).json({ message: "Необходимо загрузить фото перед завершением" });
      }

      const updatedTask = await storage.updateTask(taskId, { isCompleted: true });
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      // Если у задачи есть стоимость и исполнитель, добавляем к балансу
      if (task.price && task.price > 0 && task.workerId) {
        await storage.updateUserBalance(task.workerId, task.price);
      }

      // Отправляем email на email компании с прикрепленными фото (если есть)
      const worker = task.workerId ? await storage.getUserById(task.workerId) : null;
      const workerName = worker?.name || worker?.phone || "Неизвестный";
      // Получаем email компании для уведомления (из api-key или session-юзера).
      const companyId = await getCompanyIdFromReq(req);
      const company = companyId ? await storage.getCompanyById(companyId) : null;
      sendTaskCompletedEmail(
        task.title,
        workerName,
        taskPhotoUrls.length > 0 ? taskPhotoUrls : (task.photoUrl ? [task.photoUrl] : null),
        company?.email,
        comment
      );

      res.json(updatedTask);
    } catch (err: any) {
      console.error("Error completing task:", err);
      res.status(500).json({ message: "Ошибка завершения задачи", error: err.message });
    }
  });

  // Отменить завершение задачи (любой авторизованный пользователь)
  app.post("/api/tasks/:id/uncomplete", requireAuthOrApiKey, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Если задача была выполнена и имела стоимость, вычитаем из баланса
      if (task.isCompleted && task.price && task.price > 0 && task.workerId) {
        await storage.updateUserBalance(task.workerId, -task.price);
      }

      const updatedTask = await storage.updateTask(taskId, { isCompleted: false });
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      res.json(updatedTask);
    } catch (err: any) {
      console.error("Error uncompleting task:", err);
      res.status(500).json({ message: "Ошибка отмены завершения задачи", error: err.message });
    }
  });

  // Users
  app.get(api.users.list.path, requireAuthOrApiKey, async (req, res) => {
    try {
      // Фильтруем по компании (session или API key)
      const companyId = await getCompanyIdFromReq(req);
      const users = await storage.getAllUsers(companyId ?? undefined);
      res.json(users);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      res.status(500).json({ message: 'Ошибка загрузки пользователей', error: err.message });
    }
  });

  app.post(api.users.create.path, requireAdminOrApiKey, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const requestedAdmin =
        input.isAdmin === true ||
        input.role === "admin" ||
        input.role === "manager";

      // Проверяем, существует ли пользователь
      const normalizedPhone = input.phone.replace(/\s+/g, "").replace(/-/g, "");
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }

      const existingUser = await storage.getUserByPhone(normalizedPhone);
      if (existingUser) {
        if (existingUser.companyId === companyId && requestedAdmin && !existingUser.isAdmin) {
          const promoted = await storage.setUserAdmin(existingUser.id, true);
          return res.json(promoted || existingUser);
        }
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      const user = await storage.createUser({
        phone: normalizedPhone,
        name: input.name,
        isAdmin: requestedAdmin,
        companyId,
      });

      res.status(201).json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error creating user:', err);
      res.status(500).json({ message: 'Ошибка создания пользователя', error: err.message });
    }
  });

  app.put(api.users.update.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const input = api.users.update.input.parse(req.body);

      // Проверяем, существует ли пользователь
      const existingUser = await storage.getUserById(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      // Проверяем, не занят ли номер другим пользователем
      const normalizedPhone = input.phone.replace(/\s+/g, "").replace(/-/g, "");
      const userWithPhone = await storage.getUserByPhone(normalizedPhone);
      if (userWithPhone && userWithPhone.id !== userId) {
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      const user = await storage.updateUser(userId, input);
      res.json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error updating user:', err);
      res.status(500).json({ message: 'Ошибка обновления пользователя', error: err.message });
    }
  });

  // Сброс баланса пользователя (только для админа)
  app.post("/api/users/:id/reset-balance", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const user = await storage.resetUserBalance(userId);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      res.json(user);
    } catch (err: any) {
      console.error("Error resetting user balance:", err);
      res.status(500).json({ message: "Ошибка сброса баланса", error: err.message });
    }
  });

  // Удаление пользователя (только для админа)
  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const currentUser = await storage.getUserById(req.session.userId!);

      // Нельзя удалить самого себя
      if (userId === req.session.userId) {
        return res.status(400).json({ message: "Нельзя удалить самого себя" });
      }

      const userToDelete = await storage.getUserById(userId);
      if (!userToDelete) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      // Нельзя удалять админов
      if (userToDelete.isAdmin) {
        return res.status(400).json({ message: "Нельзя удалить администратора" });
      }

      // Проверяем что пользователь из той же компании
      if (userToDelete.companyId !== currentUser?.companyId) {
        return res.status(403).json({ message: "Нет прав для удаления этого пользователя" });
      }

      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting user:", err);
      res.status(500).json({ message: "Ошибка удаления пользователя", error: err.message });
    }
  });

  // ===================== API KEYS =====================

  app.get("/api/api-keys", requireAuth, requireAdmin, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const rows = await storage.listApiKeysByCompany(companyId);
      const sanitized = rows.map(r => ({
        id: r.id,
        name: r.name,
        keyPrefix: r.keyPrefix,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt ?? 0,
        revokedAt: r.revokedAt ?? 0,
      }));
      res.json(sanitized);
    } catch (err) {
      console.error("[api-keys] list failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/api-keys", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({ name: z.string().trim().min(1).max(100) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Название обязательно (1-100 символов)" });
      }
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId || !req.session?.userId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const activeCount = await storage.countActiveApiKeysByCompany(companyId);
      if (activeCount >= 50) {
        return res.status(400).json({ message: "Достигнут лимит активных ключей (50)" });
      }
      const plaintext = generateApiKey();
      const keyHash = hashApiKey(plaintext);
      const keyPrefix = plaintext.slice(0, 12);
      const created = await storage.createApiKey({
        name: parsed.data.name,
        keyHash,
        keyPrefix,
        companyId,
        createdByUserId: req.session.userId,
      });
      res.json({
        id: created.id,
        name: created.name,
        keyPrefix: created.keyPrefix,
        createdAt: created.createdAt,
        secret: plaintext,
      });
    } catch (err) {
      console.error("[api-keys] create failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/api-keys/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Неверный id" });
      }
      const companyId = await getCompanyIdFromReq(req);
      const record = await storage.getApiKeyById(id);
      if (!record || record.companyId !== companyId) {
        return res.status(404).json({ message: "Ключ не найден" });
      }
      if (record.revokedAt && record.revokedAt > 0) {
        return res.json({ ok: true, already: true });
      }
      await storage.revokeApiKey(id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[api-keys] revoke failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===================== WESETUP PROXY =====================
  // Тонкий прокси, чтобы создание задачи в «Журнальном» режиме не зависело
  // от того, видит ли браузер админа сервер WeSetup. Сервер TasksFlow ходит
  // в WeSetup со своим WESETUP_API_KEY (тот же tfk_, что админ вписал в
  // настройках интеграции в WeSetup) и отдаёт каталог фронту.

  // Каталог всех журналов (любого типа), которые WeSetup готов
  // предложить TasksFlow для привязки. Старый /cleaning-catalog
  // оставлен для обратной совместимости — внутри он ходит сюда же.
  type ResolvedWesetupTarget = {
    baseUrl: string;
    key: string;
    companyId: number | null;
    source: "company" | "env";
  };
  type WesetupTargetResult =
    | ResolvedWesetupTarget
    | { error: string; status: number };

  async function fetchWesetupCatalogFromTarget(target: ResolvedWesetupTarget) {
    const upstream = await fetch(
      `${target.baseUrl}/api/integrations/tasksflow/journals-catalog`,
      {
        headers: { Authorization: `Bearer ${target.key}` },
        cache: "no-store",
      }
    );
    return upstream;
  }

  function extractUpstreamMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const data = payload as { message?: unknown; error?: unknown };
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
    return null;
  }

  function normalizeWesetupNetworkError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err || "");
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/i.test(message)) {
      return "WeSetup недоступен. Проверьте адрес, ключ и доступность сервера.";
    }
    return message || "Network error";
  }

  async function fetchWesetupJournalsCatalog(req: Request) {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      throw Object.assign(new Error(target.error), { status: target.status });
    }
    return fetchWesetupCatalogFromTarget(target);
  }

  app.get("/api/wesetup/journals-catalog", requireAuth, requireAdmin, async (req, res) => {
    try {
      const upstream = await fetchWesetupJournalsCatalog(req);
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "application/json"
      );
      res.send(text);
    } catch (err: any) {
      console.error("[wesetup-proxy] journals-catalog failed", err);
      res.status(err?.status || 502).json({
        message: normalizeWesetupNetworkError(err),
      });
    }
  });

  // Backwards-compat shim: старая страница CreateTask.tsx звала
  // /cleaning-catalog. Теперь оборачиваем универсальный ответ так,
  // чтобы клиент, ожидающий старый формат, не падал.
  app.get("/api/wesetup/cleaning-catalog", requireAuth, requireAdmin, async (req, res) => {
    try {
      const upstream = await fetchWesetupJournalsCatalog(req);
      if (!upstream.ok) {
        const text = await upstream.text();
        res.status(upstream.status);
        res.setHeader(
          "Content-Type",
          upstream.headers.get("content-type") || "application/json"
        );
        return res.send(text);
      }
      const data = (await upstream.json()) as {
        journals?: Array<{
          templateCode: string;
          documents: Array<{
            documentId: string;
            documentTitle: string;
            period: { from: string; to: string };
            rows: Array<{
              rowKey: string;
              label: string;
              sublabel?: string;
              responsibleUserId: string | null;
              existingTasksflowTaskId: number | null;
            }>;
          }>;
        }>;
      };
      const cleaning = data.journals?.find((j) => j.templateCode === "cleaning");
      const documents = (cleaning?.documents ?? []).map((doc) => ({
        documentId: doc.documentId,
        title: doc.documentTitle,
        period: doc.period,
        pairs: doc.rows.map((row) => ({
          rowKey: row.rowKey,
          cleaningTitle: row.label,
          cleaningUserName: row.label,
          controlTitle: row.sublabel ?? "",
          controlUserName: null,
          cleaningUserId: row.responsibleUserId,
          existingTasksflowTaskId: row.existingTasksflowTaskId,
        })),
      }));
      res.json({ journalCode: "cleaning", documents });
    } catch (err: any) {
      console.error("[wesetup-proxy] cleaning-catalog (compat) failed", err);
      res.status(err?.status || 502).json({
        message: normalizeWesetupNetworkError(err),
      });
    }
  });

  // Прокси, который минтит HMAC-токен на WeSetup и отдаёт фронту
  // готовый URL вида
  //   https://wesetup.ru/task-fill/<taskId>?token=<signed>&return=<back>
  // Браузер редиректит сотрудника на этот URL — WeSetup рендерит
  // ту же форму, которой пользуется админ в своём журнале. Никакой
  // WeSetup-сессии у сотрудника не нужно: токен HMAC'ан нашим
  // webhookSecret.
  /**
   * Resolve the WeSetup integration pair for the current request. Each
   * TasksFlow company owns its own (baseUrl, apiKey) pair — stored on
   * `companies.wesetup_base_url / wesetup_api_key`. Falls back to the
   * legacy single-tenant `.env` values when the company row is null so
   * old deployments keep working.
   */
  async function resolveWesetupTarget(req: Request): Promise<WesetupTargetResult> {
    const userId = (req as any).session?.userId;
    let companyId: number | null = null;
    if (userId) {
      const u = await storage.getUserById(userId);
      companyId = u?.companyId ?? null;
    }
    if (companyId) {
      const company = await storage.getCompanyById(companyId);
      const companyBaseUrl = company?.wesetupBaseUrl?.trim().replace(/\/+$/, "");
      const companyKey = company?.wesetupApiKey?.trim();
      if (companyBaseUrl && companyKey) {
        return {
          baseUrl: companyBaseUrl,
          key: companyKey,
          companyId,
          source: "company",
        };
      }
      if (companyBaseUrl || companyKey) {
        return {
          error:
            "WeSetup-интеграция компании настроена не полностью: нужны и baseUrl, и apiKey.",
          status: 503,
        };
      }
    }
    const baseUrl = process.env.WESETUP_BASE_URL?.trim().replace(/\/+$/, "");
    const key = process.env.WESETUP_API_KEY?.trim();
    if (baseUrl && key) {
      return { baseUrl, key, companyId, source: "env" };
    }
    return {
      error:
        "WeSetup-интеграция не настроена для этой компании. Добавьте wesetup_api_key в companies или WESETUP_API_KEY в .env.",
      status: 503,
    };
  }

  app.get("/api/wesetup/health", requireAuth, requireAdmin, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({
        ok: false,
        message: target.error,
      });
    }

    try {
      const upstream = await fetchWesetupCatalogFromTarget(target);
      const text = await upstream.text();
      const parsed = parseJsonOrUndefined(text);
      const upstreamMessage = extractUpstreamMessage(parsed);

      if (!upstream.ok) {
        return res.status(upstream.status === 401 || upstream.status === 403 ? 401 : 502).json({
          ok: false,
          upstreamStatus: upstream.status,
          message:
            upstreamMessage ||
            `WeSetup вернул HTTP ${upstream.status}. Проверьте ключ и адрес интеграции.`,
        });
      }

      const catalog = parsed as Partial<WesetupCatalog> | undefined;
      if (!catalog || !Array.isArray(catalog.journals)) {
        return res.status(502).json({
          ok: false,
          upstreamStatus: upstream.status,
          message: "WeSetup ответил не каталогом журналов TasksFlow.",
        });
      }

      res.json({
        ok: true,
        source: target.source,
        baseUrl: target.baseUrl,
        journalsCount: catalog.journals.length,
        formsCount: catalog.journals.filter((journal) => Boolean(journal.taskForm)).length,
        assignableUsersCount: Array.isArray(catalog.assignableUsers)
          ? catalog.assignableUsers.length
          : 0,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        message: normalizeWesetupNetworkError(err),
      });
    }
  });

  app.get("/api/wesetup/task-fill-url", requireAuth, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({ message: target.error });
    }
    const { baseUrl, key } = target;
    const taskId = Number(req.query.taskId);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "Bad taskId" });
    }
    try {
      const upstream = await fetch(
        `${baseUrl}/api/integrations/tasksflow/task-fill-token`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ taskId }),
          cache: "no-store",
        }
      );
      const text = await upstream.text();
      if (!upstream.ok) {
        res.status(upstream.status);
        res.setHeader(
          "Content-Type",
          upstream.headers.get("content-type") || "application/json"
        );
        return res.send(text);
      }
      const data = parseJsonOrUndefined(text) as { url?: string; token?: string } | undefined;
      if (!data) {
        return res.status(502).json({
          message: "WeSetup вернул не JSON при создании ссылки заполнения.",
        });
      }
      if (!data?.url) {
        return res.status(502).json({ message: "No url in response" });
      }
      // Tack on a public return= parameter so the worker can bounce back to
      // TasksFlow after submit. WeSetup may be called through localhost on the
      // server, but the browser must never receive localhost in production.
      const returnUrl = `${getPublicTasksflowBaseUrl(req)}/dashboard`;
      const publicWesetupBaseUrl = getPublicWesetupBaseUrl(baseUrl);
      const publicTaskFillUrl = toPublicWesetupUrl(data.url, publicWesetupBaseUrl);
      const sep = publicTaskFillUrl.includes("?") ? "&" : "?";
      const finalUrl = `${publicTaskFillUrl}${sep}return=${encodeURIComponent(
        returnUrl
      )}`;
      res.json({ url: finalUrl, token: data.token });
    } catch (err: any) {
      console.error("[wesetup-proxy] task-fill-url failed", err);
      res.status(502).json({ message: normalizeWesetupNetworkError(err) });
    }
  });

  function parseJsonOrUndefined(text: string): unknown | undefined {
    if (!text.trim()) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  async function resolveTaskFormFromCatalog(
    target: ResolvedWesetupTarget,
    taskId: number
  ): Promise<{ resolved: true; form: unknown | null } | { resolved: false }> {
    const task = await storage.getTask(taskId);
    const journalLink = parseJournalLink(task?.journalLink);
    if (!journalLink) return { resolved: false };

    const catalogResponse = await fetchWesetupCatalogFromTarget(target);
    if (!catalogResponse.ok) return { resolved: false };
    const catalogText = await catalogResponse.text();
    const catalog = parseJsonOrUndefined(catalogText) as WesetupCatalog | undefined;
    if (!catalog?.journals) return { resolved: false };

    return {
      resolved: true,
      form: findTaskFormInCatalog(catalog, journalLink.kind),
    };
  }

  // Прокси для task-form: фронт задачи зовёт сюда,
  // когда сотруднику нужно показать форму заполнения перед
  // «Выполнено». Возвращает TaskFormSchema или null.
  app.get("/api/wesetup/task-form", requireAuth, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({ message: target.error });
    }
    const { baseUrl, key } = target;
    const taskId = Number(req.query.taskId);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "taskId required" });
    }
    try {
      const upstream = await fetch(
        `${baseUrl}/api/integrations/tasksflow/task-form?taskId=${encodeURIComponent(String(taskId))}`,
        {
          headers: { Authorization: `Bearer ${key}` },
          cache: "no-store",
        }
      );
      const text = await upstream.text();
      const parsed = parseJsonOrUndefined(text);
      const normalized =
        parsed === undefined ? null : normalizeTaskFormPayload(parsed);

      if (upstream.ok) {
        if (normalized) {
          return res.status(upstream.status).json(normalized);
        }
        if (!text.trim()) {
          return res.status(upstream.status).json({ form: null });
        }
        const fallback = await resolveTaskFormFromCatalog(target, taskId);
        if (fallback.resolved) {
          return res.json({ form: fallback.form });
        }
        return res.status(502).json({
          message: "WeSetup вернул task-form в неизвестном формате",
        });
      }

      if ([404, 500, 502, 503].includes(upstream.status)) {
        const fallback = await resolveTaskFormFromCatalog(target, taskId);
        if (fallback.resolved) {
          return res.json({ form: fallback.form });
        }
      }

      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      res.send(text);
    } catch (err: any) {
      console.error("[wesetup-proxy] task-form failed", err);
      res.status(502).json({ message: normalizeWesetupNetworkError(err) });
    }
  });

  // Прокси для «выполнить с данными формы». Отличие от обычного
  // /api/tasks/:id/complete в том, что здесь летят structured values,
  // которые WeSetup разложит по колонкам журнала. После успеха тут же
  // отмечаем задачу выполненной локально.
  app.post("/api/wesetup/complete-with-values", requireAuth, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({ message: target.error });
    }
    const { baseUrl, key } = target;
    const { taskId, values, isCompleted } = req.body || {};
    if (typeof taskId !== "number") {
      return res.status(400).json({ message: "taskId должен быть числом" });
    }

    // Проверим, что сотрудник — исполнитель этой задачи (или админ).
    try {
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const user = req.session?.userId
        ? await storage.getUserById(req.session.userId)
        : null;
      const isAllowed =
        user?.isAdmin || (task.workerId && user?.id === task.workerId);
      if (!isAllowed) {
        return res.status(403).json({
          message: "Вы не являетесь исполнителем этой задачи",
        });
      }
    } catch (err: any) {
      console.error("[wesetup-proxy] complete auth check failed", err);
      return res.status(500).json({ message: "Ошибка проверки прав" });
    }

    try {
      const upstream = await fetch(
        `${baseUrl}/api/integrations/tasksflow/complete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId,
            isCompleted: Boolean(isCompleted ?? true),
            values: values ?? {},
          }),
          cache: "no-store",
        }
      );
      const text = await upstream.text();
      if (upstream.ok) {
        // Also mark the local TF task as completed so dashboard's 1/4
        // counter updates without waiting for the pull sync.
        try {
          await storage.updateTask(taskId, {
            isCompleted: Boolean(isCompleted ?? true),
          });
        } catch (err) {
          console.error("[wesetup-proxy] local complete mirror failed", err);
        }
      }
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      res.send(text);
    } catch (err: any) {
      console.error("[wesetup-proxy] complete failed", err);
      res.status(502).json({ message: normalizeWesetupNetworkError(err) });
    }
  });

  // Прокси для bind-row: фронт CreateTask в журнальном режиме шлёт сюда
  // {documentId, rowKey, title?}. WeSetup создаёт задачу у себя через
  // свою же сохранённую интеграцию + регистрирует TaskLink, и возвращает
  // нам id уже созданной задачи. Мы не дублируем создание — ответ
  // содержит `tasksflowTaskId`, фронт просто рефрешит список.
  app.post("/api/wesetup/bind-row", requireAuth, requireAdmin, async (req, res) => {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({ message: target.error });
    }
    const { baseUrl, key } = target;
    try {
      const upstream = await fetch(
        `${baseUrl}/api/integrations/tasksflow/bind-row`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(req.body || {}),
          cache: "no-store",
        }
      );
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "application/json"
      );
      res.send(text);
    } catch (err: any) {
      console.error("[wesetup-proxy] bind-row failed", err);
      res.status(502).json({
        message: `Не удалось связать с журналом WeSetup: ${normalizeWesetupNetworkError(err)}`,
      });
    }
  });

  return httpServer;
}
