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
  app.get("/api/companies/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user || !user.companyId) {
        return res.json(null);
      }

      const company = await storage.getCompanyById(user.companyId);
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

      const { name, email } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'Название компании обязательно' });
      }

      const company = await storage.updateCompany(user.companyId, {
        name: name.trim(),
        email: email?.trim() || null,
      });

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
  app.get(api.workers.list.path, requireAuth, async (req, res) => {
    try {
      // Фильтруем по компании текущего пользователя
      const user = await storage.getUserById(req.session.userId!);
      const workers = await storage.getWorkers(user?.companyId ?? undefined);
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
  app.get(api.tasks.list.path, requireAuth, async (req, res) => {
    try {
      // Фильтруем по компании текущего пользователя
      const user = await storage.getUserById(req.session.userId!);
      const tasks = await storage.getTasks(user?.companyId ?? undefined);
      console.log("GET /api/tasks - tasks count:", tasks.length);
      tasks.forEach((task, index) => {
        console.log(`Task ${index + 1}: id=${task.id}, title=${task.title}, photoUrl=${task.photoUrl}, isCompleted=${task.isCompleted}`);
      });
      res.json(tasks);
    } catch (err: any) {
      console.error('Error fetching tasks:', err);
      res.status(500).json({ message: 'Ошибка загрузки задач', error: err.message });
    }
  });

  app.get(api.tasks.get.path, requireAuth, async (req, res) => {
    try {
      const task = await storage.getTask(Number(req.params.id));
      if (!task) {
        return res.status(404).json({ message: 'Задача не найдена' });
      }
      console.log("GET /api/tasks/:id - task:", task);
      res.json(task);
    } catch (err: any) {
      console.error('Error fetching task:', err);
      res.status(500).json({ message: 'Ошибка', error: err.message });
    }
  });

  app.post(api.tasks.create.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("POST /api/tasks - req.body:", req.body);
      const input = api.tasks.create.input.parse(req.body);
      console.log("POST /api/tasks - parsed input:", input);
      // Добавляем companyId текущего пользователя
      const user = await storage.getUserById(req.session.userId!);
      const task = await storage.createTask({
        ...input,
        companyId: user?.companyId ?? undefined,
      });
      console.log("POST /api/tasks - created task:", task);
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

  app.put(api.tasks.update.path, requireAuth, requireAdmin, async (req, res) => {
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

  app.delete(api.tasks.delete.path, requireAuth, requireAdmin, async (req, res) => {
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
        console.log("Uploading photo for task:", taskId, "photoUrl:", photoUrl);

        // Добавляем новое фото в массив
        const newPhotoUrls = [...currentPhotos, photoUrl];
        const updatedTask = await storage.updateTask(taskId, {
          photoUrls: newPhotoUrls,
          photoUrl: photoUrl // Для обратной совместимости, храним последнее фото
        });
        console.log("Updated task:", updatedTask);

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
        console.log("Uploading example photo for task:", taskId, "examplePhotoUrl:", examplePhotoUrl);
        const updatedTask = await storage.updateTask(taskId, { examplePhotoUrl });
        console.log("Updated task with example photo:", updatedTask);

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
        console.log("Deleted example photo file:", photoPath);
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
          console.log("Deleted photo file:", photoPath);
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
          console.log("Deleted photo file:", photoPath);
        } catch (unlinkErr: any) {
          console.error("Error deleting photo file:", unlinkErr);
        }
      }

      // Также удаляем старый photoUrl если он есть и не в массиве
      if (task.photoUrl && !currentPhotos.includes(task.photoUrl)) {
        const photoPath = path.join(process.cwd(), task.photoUrl);
        try {
          await unlink(photoPath);
          console.log("Deleted legacy photo file:", photoPath);
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
  app.post(api.tasks.complete.path, requireAuth, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const { comment } = req.body || {};
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Проверка прав: исполнитель или админ
      let isAllowed = false;
      if (req.session.userId === task.workerId) {
        isAllowed = true;
      } else {
        const currentUser = await storage.getUserById(req.session.userId!);
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
        console.log(`Added ${task.price} to user ${task.workerId} balance for completing task ${taskId}`);
      }

      // Отправляем email на email компании с прикрепленными фото (если есть)
      const worker = task.workerId ? await storage.getUserById(task.workerId) : null;
      const workerName = worker?.name || worker?.phone || "Неизвестный";
      // Получаем email компании для уведомления
      const currentUser = await storage.getUserById(req.session.userId!);
      const company = currentUser?.companyId ? await storage.getCompanyById(currentUser.companyId) : null;
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
  app.post("/api/tasks/:id/uncomplete", requireAuth, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Если задача была выполнена и имела стоимость, вычитаем из баланса
      if (task.isCompleted && task.price && task.price > 0 && task.workerId) {
        await storage.updateUserBalance(task.workerId, -task.price);
        console.log(`Subtracted ${task.price} from user ${task.workerId} balance for uncompleting task ${taskId}`);
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
  app.get(api.users.list.path, requireAuth, async (req, res) => {
    try {
      // Фильтруем по компании текущего пользователя
      const currentUser = await storage.getUserById(req.session.userId!);
      const users = await storage.getAllUsers(currentUser?.companyId ?? undefined);
      res.json(users);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      res.status(500).json({ message: 'Ошибка загрузки пользователей', error: err.message });
    }
  });

  app.post(api.users.create.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("Create user request body:", req.body);
      const input = api.users.create.input.parse(req.body);
      console.log("Parsed input:", input);

      // Проверяем, существует ли пользователь
      const normalizedPhone = input.phone.replace(/\s+/g, "").replace(/-/g, "");
      const existingUser = await storage.getUserByPhone(normalizedPhone);
      if (existingUser) {
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      // Добавляем companyId текущего пользователя
      const currentUser = await storage.getUserById(req.session.userId!);
      const user = await storage.createUser({
        ...input,
        phone: normalizedPhone,
        isAdmin: false, // Только админ может создавать пользователей, но не может создавать других админов через API
        companyId: currentUser?.companyId ?? undefined,
      });

      res.status(201).json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        console.log("Zod validation error:", err.errors);
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
      console.log(`Reset balance for user ${userId}`);
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
      console.log(`User ${userId} deleted by admin ${req.session.userId}`);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting user:", err);
      res.status(500).json({ message: "Ошибка удаления пользователя", error: err.message });
    }
  });

  return httpServer;
}
