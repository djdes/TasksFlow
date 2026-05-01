import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import multer from "multer";
import path from "path";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { existsSync, mkdirSync } from "fs";
import { storage, DatabaseStorage } from "./storage";
import { normalizePhone } from "./phone-normalize";
import { api } from "@shared/routes";
import { z } from "zod";
import { sendTaskCompletedEmail } from "./mail";
import { isPublicHttpsUrl } from "./url-allowlist";
import { registerCompanySchema, loginSchema } from "@shared/schema";
import { requireApiKey, extractBearerKey, generateApiKey, hashApiKey } from "./api-keys";
import {
  encryptApiKey,
  decryptApiKey,
  isApiKeyRevealEnabled,
} from "./api-key-crypto";
import {
  getJournalLinkIntegrationId,
  parseJournalLink,
} from "@shared/journal-link";
import type { JournalLink } from "@shared/journal-link";
import {
  findTaskFormInCatalog,
  journalKindToTemplateCode,
  normalizeTaskFormPayload,
  type TaskFormSchema,
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

// Расширение берём от mime-type, не от user-supplied originalname.
// Иначе можно загрузить evil.php с Content-Type: image/jpeg и
// сохранить как task-X-Y.php. На текущем prod (Node без PHP)
// не критично, но defense-in-depth.
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const rawTaskId = req.params.id || "unknown";
    // Защита от инъекции в filename: только digits либо "unknown".
    const safeTaskId = /^\d+$/.test(rawTaskId) ? rawTaskId : "unknown";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = EXT_BY_MIME[file.mimetype] ?? ".bin";
    cb(null, `task-${safeTaskId}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Разрешаем только конкретные image-mime'ы из allowlist'а EXT_BY_MIME.
    // Раньше принимали любой image/*, что в теории включает application/svg+xml
    // или image/svg (потенциал XSS через embedded script).
    if (EXT_BY_MIME[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error("Разрешены: JPG, PNG, WebP, GIF, HEIC"));
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

/**
 * Аутентификация: API key, ИЛИ session admin, ИЛИ session non-admin
 * с managedWorkerIds (т.е. руководитель). Используется на task
 * create/update/delete — раньше требовал admin, но шеф-повар теперь
 * может создавать задачи своим поварам и не может — техам.
 *
 * Конкретный scope-check (workerId in managed?) делается в самом
 * хендлере, потому что только он знает payload. Здесь только
 * фильтрует «совсем без прав на создание».
 */
async function requireAdminOrManagerOrApiKey(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (extractBearerKey(req)) {
    return requireApiKey(req, res, next);
  }
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  const user = await storage.getUserById(req.session.userId);
  if (!user) {
    return res.status(401).json({ message: "Пользователь не найден" });
  }
  if (user.isAdmin) {
    return next();
  }
  const managed = DatabaseStorage.parseManagedWorkerIds(user.managedWorkerIds);
  if (Array.isArray(managed)) {
    return next(); // даже пустой [] — это «руководитель», просто без подчинённых
  }
  return res
    .status(403)
    .json({ message: "Только админ или руководитель может управлять задачами" });
}

/**
 * Проверка: может ли user назначать задачи указанному workerId.
 *   • admin — всегда да
 *   • manager (managedWorkerIds set) — только если worker в scope
 *     или это он сам
 *   • обычный воркер — только себе
 */
function canAssignToWorker(
  user: { id: number; isAdmin: boolean; managedWorkerIds: string | null },
  targetWorkerId: number | null | undefined
): boolean {
  if (user.isAdmin) return true;
  if (!targetWorkerId) return false; // нельзя оставить «без исполнителя» если ты не админ
  if (targetWorkerId === user.id) return true;
  const m2 = DatabaseStorage.parseManagedWorkerIds(user.managedWorkerIds);
  if (!Array.isArray(m2)) return false;
  return m2.includes(targetWorkerId);
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

  // Rate-limit login и публичные регистрационные endpoint'ы. TasksFlow
  // авторизуется только по телефону (без пароля!) — без лимитера
  // атакующий мог переберать +7XXXXXXXXXX за секунду и получать
  // session-cookie любого worker'а, чей телефон совпал.
  // 20 attempts / минуту с одного IP — достаточно для legit-юзера
  // (двойной тап / опечатка), но 28800/день делает перебор Russian
  // phone space (~10⁹) непрактичным.
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Слишком много попыток входа. Подождите минуту." },
  });
  app.use("/api/auth/login", authLimiter);
  app.use("/api/companies/register", authLimiter);
  app.use("/api/users/register", authLimiter);

  // Auth
  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      
      // Нормализуем номер телефона
      const normalizedPhone = normalizePhone(input.phone);
      
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
      res.status(500).json({ message: 'Ошибка авторизации' });
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
      res.status(500).json({ message: 'Ошибка' });
    }
  });

  app.post(api.auth.logout.path, async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false });
      }
      res.json({ success: true });
    });
  });

  // Регистрация новой компании и администратора
  app.post("/api/companies/register", async (req, res) => {
    try {
      const input = registerCompanySchema.parse(req.body);

      // Нормализуем номер телефона
      const normalizedPhone = normalizePhone(input.phone);

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
      res.status(500).json({ message: 'Ошибка регистрации' });
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
      const normalizedPhone = normalizePhone(input.phone);
      const normalizedAdminPhone = normalizePhone(input.adminPhone);

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
      res.status(500).json({ message: 'Ошибка регистрации' });
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
      res.status(500).json({ message: 'Ошибка' });
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
          .transform((value) => (value ? value : null))
          .refine(
            // Email: либо null/undefined, либо валидный формат.
            // Раньше принимали любой мусор → ломались уведомления о
            // выполненных задачах.
            (value) =>
              value === null ||
              value === undefined ||
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
            "Введите корректный email"
          ),
        wesetupBaseUrl: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((value) =>
            value === undefined ? undefined : value ? value.replace(/\/+$/, "") : null
          )
          .refine(
            // Защита от SSRF: только публичные http(s) URL'ы. Раньше
            // /^https?:\/\// разрешал http://localhost:6379 и
            // http://169.254.169.254 → SSRF-канал из админки.
            (value) =>
              value === null || value === undefined || isPublicHttpsUrl(value),
            "URL WeSetup должен быть публичным http(s) — internal/localhost адреса запрещены"
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
      res.status(500).json({ message: 'Ошибка обновления компании' });
    }
  });

  // Обновить имя текущего пользователя (для админа - собственное имя)
  /**
   * Self-deletion: текущий user удаляет свой аккаунт.
   * Если он единственный admin company — отказываем (нужно сначала
   * назначить другого admin'а, иначе компания останется без управления).
   * Сессия после успеха уничтожается.
   */
  app.delete("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      if (user.isAdmin && user.companyId) {
        const allUsers = await storage.getAllUsers(user.companyId);
        const otherAdmins = allUsers.filter(
          (u) => u.isAdmin && u.id !== userId
        );
        if (otherAdmins.length === 0) {
          return res.status(400).json({
            message:
              "Нельзя удалить аккаунт — вы единственный администратор компании. " +
              "Сначала назначьте другого администратора в /admin/users.",
          });
        }
      }

      await storage.deleteUser(userId);
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    } catch (err: any) {
      console.error("Error deleting own account:", err);
      res.status(500).json({
        message: "Ошибка удаления аккаунта",
        error: err?.message,
      });
    }
  });

  app.put("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const { name } = req.body ?? {};
      const user = await storage.getUserById(req.session.userId!);

      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      // Раньше: name?.trim() крашил с TypeError если name был числом
      // или объектом — попадало в catch как непонятный 500.
      // Также длина не лимитировалась — кто-то мог пихнуть мегабайт.
      let normalizedName: string | null = null;
      if (typeof name === "string") {
        const trimmed = name.trim();
        if (trimmed) {
          normalizedName = trimmed.slice(0, 200);
        }
      } else if (name === null) {
        normalizedName = null;
      } else if (name !== undefined) {
        return res.status(400).json({ message: "Имя должно быть строкой" });
      }

      const updated = await storage.updateUser(user.id, {
        phone: user.phone,
        name: normalizedName,
      });

      res.json(updated);
    } catch (err: any) {
      console.error('Error updating user:', err);
      res.status(500).json({ message: 'Ошибка обновления' });
    }
  });

  // Workers
  app.get(api.workers.list.path, requireAuthOrApiKey, async (req, res) => {
    try {
      // Фильтруем по компании. Раньше: companyId ?? undefined →
      // storage.getWorkers(undefined) возвращал ВСЕХ воркеров из
      // ВСЕХ компаний. Edge case: юзер залогинен, потом удалён
      // админом — session ещё валидна, но getCompanyIdFromReq
      // возвращает null → leak всей БД воркеров.
      const companyId = await getCompanyIdFromReq(req);
      if (companyId === null) {
        return res.json([]);
      }
      const workers = await storage.getWorkers(companyId);
      res.json(workers);
    } catch (err: any) {
      console.error('Error fetching workers:', err);
      res.status(500).json({ message: 'Ошибка загрузки сотрудников' });
    }
  });

  app.get(api.workers.get.path, requireAuthOrApiKey, async (req, res) => {
    try {
      const worker = await storage.getWorker(Number(req.params.id));
      if (!worker) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      const companyId = await getCompanyIdFromReq(req);
      if (companyId !== null && worker.companyId !== companyId) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      res.json(worker);
    } catch (err: any) {
      console.error('Error fetching worker:', err);
      res.status(500).json({ message: 'Ошибка' });
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
      res.status(500).json({ message: 'Ошибка создания сотрудника' });
    }
  });

  app.put(api.workers.update.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.workers.update.input.parse(req.body);
      // Multi-tenant scope: только сотрудники своей компании.
      const existing = await storage.getWorker(Number(req.params.id));
      if (!existing) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      const companyId = await getCompanyIdFromReq(req);
      if (companyId !== null && existing.companyId !== companyId) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
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
      res.status(500).json({ message: 'Ошибка обновления' });
    }
  });

  app.delete(api.workers.delete.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      // Multi-tenant scope: только сотрудники своей компании.
      const existing = await storage.getWorker(Number(req.params.id));
      if (!existing) {
        return res.status(204).send();
      }
      const companyId = await getCompanyIdFromReq(req);
      if (companyId !== null && existing.companyId !== companyId) {
        return res.status(404).json({ message: 'Сотрудник не найден' });
      }
      await storage.deleteWorker(Number(req.params.id));
      res.status(204).send();
    } catch (err: any) {
      console.error('Error deleting worker:', err);
      res.status(500).json({ message: 'Ошибка удаления' });
    }
  });

  // Tasks
  app.get(api.tasks.list.path, requireAuthOrApiKey, async (req, res) => {
    try {
      // Фильтруем по компании. Если companyId не разрезолвился
      // (юзер удалён / no company) — возвращаем пустой список.
      // Раньше: storage.getTasks(undefined) тащил ВСЕ задачи из БД,
      // потом filter по managed-workers их выкидывал, но запрос всё
      // равно бил по всей таблице.
      const companyId = await getCompanyIdFromReq(req);
      if (companyId === null) {
        return res.json([]);
      }
      const tasks = await storage.getTasks(companyId);

      // Manager-scope фильтр (Phase 2 hierarchy):
      //   • Админ или API key → видит всё (return as is)
      //   • Не-админ с managedWorkerIds → видит задачи своих
      //     подчинённых + свои собственные
      //   • Не-админ без scope → видит ТОЛЬКО свои (старое поведение
      //     для обычного воркера; в TasksFlow раньше клиент сам
      //     фильтровал, теперь дублируем на сервере для безопасности
      //     — клиентский фильтр можно обойти)
      if (req.apiKey) return res.json(tasks);
      const userId = req.session?.userId;
      if (!userId) return res.json(tasks);
      const me = await storage.getUserById(userId);
      if (!me) return res.json([]);
      if (me.isAdmin) return res.json(tasks);

      const managed = DatabaseStorage.parseManagedWorkerIds(me.managedWorkerIds);
      if (managed === null) {
        // Обычный воркер — только свои
        return res.json(tasks.filter((t) => t.workerId === userId));
      }
      const allowed = new Set<number>(managed);
      allowed.add(userId); // свои задачи руководитель тоже видит
      res.json(tasks.filter((t) => t.workerId !== null && allowed.has(t.workerId)));
    } catch (err: any) {
      console.error('Error fetching tasks:', err);
      res.status(500).json({ message: 'Ошибка загрузки задач' });
    }
  });

  app.get(api.tasks.get.path, requireAuthOrApiKey, async (req, res) => {
    try {
      const task = await storage.getTask(Number(req.params.id));
      if (!task) {
        return res.status(404).json({ message: 'Задача не найдена' });
      }
      // Multi-tenant scope: запрещаем cross-company чтение.
      const companyId = await getCompanyIdFromReq(req);
      if (companyId !== null && task.companyId !== companyId) {
        return res.status(404).json({ message: 'Задача не найдена' });
      }
      res.json(task);
    } catch (err: any) {
      console.error('Error fetching task:', err);
      res.status(500).json({ message: 'Ошибка' });
    }
  });

  app.post(api.tasks.create.path, requireAdminOrManagerOrApiKey, async (req, res) => {
    try {
      const input = api.tasks.create.input.parse(req.body);
      // companyId — из session-user или api key
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }

      // Multi-tenant scope: workerId должен принадлежать той же компании.
      // Иначе админ компании A мог бы создать задачу со ссылкой на
      // worker'а компании B — задача попадёт в task-list компании A
      // с broken workerId, либо в список «моих задач» worker'а B
      // (зависит от фильтра).
      if (input.workerId != null) {
        const worker = await storage.getUserById(input.workerId);
        if (!worker || worker.companyId !== companyId) {
          return res.status(404).json({
            message: "Сотрудник не найден",
          });
        }
      }

      // Scope-check: руководитель может назначать задачи только своим
      // подчинённым. Админ и API key пропускаются.
      if (!req.apiKey && req.session?.userId) {
        const me = await storage.getUserById(req.session.userId);
        if (me && !me.isAdmin) {
          if (!canAssignToWorker(me, input.workerId ?? null)) {
            return res.status(403).json({
              message: "Можно назначать задачи только своим подчинённым",
            });
          }
        }
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
      res.status(500).json({ message: 'Ошибка создания задачи' });
    }
  });

  app.put(api.tasks.update.path, requireAdminOrManagerOrApiKey, async (req, res) => {
    try {
      const input = api.tasks.update.input.parse(req.body);

      // Multi-tenant scope-check: задача должна быть в той же компании.
      // Делаем это ДО любой scope-проверки руководителя, чтобы не утекало
      // существование задач чужих компаний через 403 vs 404.
      const existing = await storage.getTask(Number(req.params.id));
      if (!existing) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (callerCompanyId !== null && existing.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // FINANCIAL SAFETY: PUT не должен менять состояния которые
      // влияют на баланс (isCompleted, price на completed task,
      // переназначение workerId на completed task) — иначе баланс
      // теряет связь с реально выполненной работой. Раньше:
      //   - PUT { isCompleted: true } флипал статус БЕЗ начисления
      //     баланса (admin'ы сделали так чтобы скрыть задачу,
      //     сотрудник терял зарплату).
      //   - PUT { price: 5000 } на уже completed задаче не вызывал
      //     correction баланса — старая цена в balance, новая в task.
      //   - PUT { workerId: B } на completed задаче перевешивал task
      //     на B, но balance оставался у A.
      // Правильный flow: завершение через POST /complete + uncomplete.
      // Цена и worker — менять можно ТОЛЬКО на не-completed task.
      if (input.isCompleted !== undefined) {
        return res.status(400).json({
          message: "isCompleted нельзя менять через PUT — используйте /complete или /uncomplete",
        });
      }
      if (existing.isCompleted) {
        if (
          input.price !== undefined &&
          input.price !== (existing.price ?? 0)
        ) {
          return res.status(400).json({
            message:
              "Цена выполненной задачи фиксируется. Сначала отмените выполнение, затем измените цену.",
          });
        }
        if (
          input.workerId !== undefined &&
          input.workerId !== existing.workerId
        ) {
          return res.status(400).json({
            message:
              "Исполнителя выполненной задачи нельзя менять — баланс уже начислен. Сначала отмените выполнение.",
          });
        }
      }

      // Multi-tenant scope: если переназначаем workerId — новый
      // worker должен быть в той же компании. Иначе можно «отправить»
      // задачу чужому юзеру.
      if (input.workerId != null && input.workerId !== existing.workerId) {
        const newWorker = await storage.getUserById(input.workerId);
        if (
          !newWorker ||
          (callerCompanyId !== null && newWorker.companyId !== callerCompanyId)
        ) {
          return res.status(404).json({ message: "Сотрудник не найден" });
        }
      }

      // Scope-check для руководителя на edit:
      //   • Текущий workerId задачи должен быть в его scope
      //   • Если пытаются переназначить — новый workerId тоже в scope
      if (!req.apiKey && req.session?.userId) {
        const me = await storage.getUserById(req.session.userId);
        if (me && !me.isAdmin) {
          if (
            !canAssignToWorker(me, existing.workerId ?? null) ||
            (input.workerId !== undefined &&
              !canAssignToWorker(me, input.workerId))
          ) {
            return res.status(403).json({
              message: "Можно редактировать только задачи своих подчинённых",
            });
          }
        }
      }

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
      res.status(500).json({ message: 'Ошибка обновления' });
    }
  });

  app.delete(api.tasks.delete.path, requireAdminOrManagerOrApiKey, async (req, res) => {
    try {
      // Multi-tenant scope-check: задача должна быть в той же компании.
      const existing = await storage.getTask(Number(req.params.id));
      if (!existing) {
        return res.status(204).send();
      }
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (callerCompanyId !== null && existing.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Scope-check на delete — те же правила, что и на edit.
      if (!req.apiKey && req.session?.userId) {
        const me = await storage.getUserById(req.session.userId);
        if (me && !me.isAdmin) {
          if (!canAssignToWorker(me, existing.workerId ?? null)) {
            return res.status(403).json({
              message: "Можно удалять только задачи своих подчинённых",
            });
          }
        }
      }

      // FINANCIAL SAFETY: при удалении completed task с positive price
      // вычитаем из баланса исполнителя — иначе balance остаётся с
      // «phantom»-зарплатой, без следа в task-журнале. Раньше: admin
      // удалял старую completed задачу для очистки списка → у worker'а
      // остался остаток оплаты без подтверждения; невозможно сверить.
      //
      // Race-fix: используем атомарный transitionTaskToUncompleted.
      // Без него два concurrent DELETE могли оба прочитать
      // isCompleted=true, оба вычесть price (двойной дебет) и потом
      // оба удалить таск (одно affectedRows=0, но без error). Теперь
      // только один из них переведёт isCompleted в false и сделает
      // дебет; остальные получат transitioned=false и пропустят.
      if (
        existing.price &&
        existing.price > 0 &&
        existing.workerId
      ) {
        try {
          const reversed = await storage.transitionTaskToUncompleted(
            Number(req.params.id),
          );
          if (reversed) {
            await storage.updateUserBalance(existing.workerId, -existing.price);
          }
        } catch (balanceErr) {
          console.error(
            "[task-delete] balance reversal failed",
            balanceErr,
          );
          return res.status(500).json({
            message: "Не удалось обновить баланс при удалении задачи",
          });
        }
      }

      await storage.deleteTask(Number(req.params.id));

      // Удаляем все привязанные к задаче файлы с диска. Раньше:
      // удалённая задача оставляла photoUrls + examplePhotoUrl как
      // orphan-файлы в /uploads/, ничем не убираемые — disk usage
      // рос неконтролируемо. Best-effort, не валим ответ при ошибке.
      try {
        const uploadsRoot = path.resolve(process.cwd(), "uploads");
        const { unlink } = await import("fs/promises");
        const candidates: string[] = [];
        const photos = (existing as { photoUrls?: string[] }).photoUrls;
        if (Array.isArray(photos)) candidates.push(...photos);
        if (existing.photoUrl) candidates.push(existing.photoUrl);
        if (existing.examplePhotoUrl) candidates.push(existing.examplePhotoUrl);
        for (const rel of candidates) {
          if (typeof rel !== "string" || !rel) continue;
          const abs = path.resolve(process.cwd(), rel);
          if (!abs.startsWith(uploadsRoot + path.sep)) continue;
          await unlink(abs).catch(() => null);
        }
      } catch (cleanupErr) {
        console.warn("[task-delete] orphan files cleanup failed", cleanupErr);
      }

      res.status(204).send();
    } catch (err: any) {
      console.error('Error deleting task:', err);
      res.status(500).json({ message: 'Ошибка удаления' });
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

        // Multi-tenant scope-check: задача должна принадлежать компании
        // текущего юзера (защита от cross-tenant photo upload).
        const currentUser = await storage.getUserById(req.session.userId!);
        if (currentUser?.companyId != null && task.companyId !== currentUser.companyId) {
          return res.status(404).json({ message: "Задача не найдена" });
        }

        // Проверяем права: исполнитель или админ
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

        // Multi-tenant scope: админ другой компании не должен загружать.
        const adminCompanyId = await getCompanyIdFromReq(req);
        if (adminCompanyId !== null && task.companyId !== adminCompanyId) {
          return res.status(404).json({ message: "Задача не найдена" });
        }

        // Если у задачи уже был example-photo — удаляем старый файл с
        // диска, чтобы не плодить orphan-файлы. Раньше: каждая
        // переустановка example-photo оставляла старый файл навсегда,
        // /uploads/ распухал на десятки тысяч orphan-ов и в конце
        // концов забивал diskspace.
        const previousExampleUrl = task.examplePhotoUrl;

        const examplePhotoUrl = `/uploads/${req.file.filename}`;
        const updatedTask = await storage.updateTask(taskId, { examplePhotoUrl });

        if (!updatedTask) {
          return res.status(500).json({ message: "Ошибка обновления задачи" });
        }

        // Best-effort cleanup только после успешного UPDATE — иначе
        // получим status update fail + потерянный example.
        if (previousExampleUrl && previousExampleUrl !== examplePhotoUrl) {
          try {
            const uploadsRoot = path.resolve(process.cwd(), "uploads");
            const abs = path.resolve(process.cwd(), previousExampleUrl);
            if (abs.startsWith(uploadsRoot + path.sep)) {
              const { unlink } = await import("fs/promises");
              await unlink(abs).catch(() => null);
            }
          } catch (cleanupErr) {
            console.warn("[example-photo] orphan cleanup failed", cleanupErr);
          }
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

      // Multi-tenant scope: админ другой компании не должен трогать.
      const adminCompanyId = await getCompanyIdFromReq(req);
      if (adminCompanyId !== null && task.companyId !== adminCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      if (!task.examplePhotoUrl) {
        return res.status(400).json({ message: "У задачи нет примера фото" });
      }

      // Удаляем файл с диска. Защищаемся от path traversal: разрешаем
      // только пути внутри uploads/ относительно cwd.
      const { unlink } = await import("fs/promises");
      const photoPath = path.resolve(process.cwd(), task.examplePhotoUrl);
      const uploadsRoot = path.resolve(process.cwd(), "uploads");
      if (!photoPath.startsWith(uploadsRoot + path.sep)) {
        console.warn("Refusing to delete file outside uploads/:", photoPath);
      } else {
        try {
          await unlink(photoPath);
        } catch (unlinkErr: any) {
          console.error("Error deleting example photo file:", unlinkErr);
        }
      }

      const updatedTask = await storage.updateTask(taskId, { examplePhotoUrl: null });
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting example photo:", err);
      res.status(500).json({ message: "Ошибка удаления примера фото" });
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

      // Multi-tenant scope: задача должна принадлежать компании текущего юзера.
      const currentUser = await storage.getUserById(req.session.userId!);
      if (currentUser?.companyId != null && task.companyId !== currentUser.companyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Проверяем права: исполнитель или админ
      const isAllowed = currentUser?.isAdmin || task.workerId === req.session.userId;
      if (!isAllowed) {
        return res.status(403).json({ message: "Нет прав для удаления фото" });
      }

      const currentPhotos: string[] = (task as any).photoUrls || [];

      // Helper: безопасное удаление файла только внутри uploads/.
      const uploadsRoot = path.resolve(process.cwd(), "uploads");
      const safeUnlink = async (relPath: string) => {
        const abs = path.resolve(process.cwd(), relPath);
        if (!abs.startsWith(uploadsRoot + path.sep)) {
          console.warn("Refusing to delete outside uploads/:", abs);
          return;
        }
        const { unlink } = await import("fs/promises");
        try { await unlink(abs); } catch (e: any) { console.error("unlink:", e?.message); }
      };

      // Если передан конкретный URL, удаляем только его
      if (photoUrlToDelete) {
        if (!currentPhotos.includes(photoUrlToDelete)) {
          return res.status(400).json({ message: "Фото не найдено" });
        }

        await safeUnlink(photoUrlToDelete);

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
      for (const photoUrl of currentPhotos) {
        await safeUnlink(photoUrl);
      }

      // Также удаляем старый photoUrl если он есть и не в массиве
      if (task.photoUrl && !currentPhotos.includes(task.photoUrl)) {
        await safeUnlink(task.photoUrl);
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
      res.status(500).json({ message: "Ошибка удаления фото" });
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

      // Multi-tenant scope-check: задача должна принадлежать компании
      // вызывающей стороны (API key чужой компании или session-юзер
      // другой компании не должны завершать задачу).
      const callerCompanyIdForComplete = await getCompanyIdFromReq(req);
      if (callerCompanyIdForComplete !== null && task.companyId !== callerCompanyIdForComplete) {
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

      // Идемпотентность: если задача уже выполнена — возвращаем 200 с
      // текущим состоянием БЕЗ повторного начисления баланса.
      if (task.isCompleted) {
        return res.json(task);
      }
      // Phase 1 двухстадийной верификации: если задача уже в
      // «submitted» — повторный /complete от того же воркера не
      // должен ничего делать (она уже ждёт verifier'а). API key
      // (machine integrations) обходит, чтобы старая интеграция не
      // ломалась.
      if (
        !req.apiKey &&
        task.verificationStatus === "submitted"
      ) {
        return res.json(task);
      }

      // Если требуется фото, проверяем что оно загружено
      const taskPhotoUrls = (task as any).photoUrls || [];
      const hasPhotos = taskPhotoUrls.length > 0 || task.photoUrl;
      if (task.requiresPhoto && !hasPhotos) {
        return res.status(400).json({ message: "Необходимо загрузить фото перед завершением" });
      }

      // Phase 1 двухстадийной верификации:
      //   • Если у задачи есть verifier_worker_id и текущий вызов —
      //     не от API-key (machine integrations apruvят сами) и не от
      //     самого verifier'а (он своё approve делает через /verify),
      //     то задача переходит в submitted. Balance НЕ начисляется
      //     до approve. WeSetup-mirror тоже не отправляется (его
      //     уйдёт после approve).
      //   • Если verifier == текущий юзер — он завершает задачу как
      //     обычно (исполнитель и проверяющий совпадают для shared-
      //     задач, где руководитель сам в смене).
      //   • Если verifier_worker_id == NULL/undefined — старое
      //     поведение (legacy задачи без проверки). undefined может
      //     прилетать на legacy-БД где schema-self-check ещё не
      //     добавил колонки.
      const requiresVerification =
        !req.apiKey &&
        typeof task.verifierWorkerId === "number" &&
        task.verifierWorkerId !== req.session?.userId;
      if (requiresVerification) {
        const submitted = await storage.submitForVerification(taskId);
        if (!submitted) {
          // Concurrent submit или статус не позволяет (approved/already
          // submitted). Отдаём текущий стейт.
          const fresh = await storage.getTask(taskId);
          return res.json(fresh ?? task);
        }
        const updatedTask = await storage.getTask(taskId);
        // КРИТИЧНО: тут возвращаемся БЕЗ запуска WeSetup-mirror и БЕЗ
        // credit'а balance. Mirror отправится только когда verifier
        // нажмёт «Принять» в WeSetup (см. POST /verifier endpoint там),
        // — до approve журнальный entry в WeSetup НЕ помечается
        // выполненным.
        return res.json(updatedTask ?? task);
      }

      // Race-safe атомарный переход isCompleted=false → true. Если
      // одновременные POST'ы — только один получит true и начислит
      // баланс. Остальные получат transitioned=false и пропустят
      // updateUserBalance. Раньше storage.updateTask без conditional
      // WHERE → два concurrent POST'а оба видели isCompleted=false,
      // оба добавляли task.price → двойная оплата.
      const transitioned = await storage.transitionTaskToCompleted(taskId);
      if (!transitioned) {
        // Кто-то параллельно уже завершил — отдаём текущий стейт.
        const fresh = await storage.getTask(taskId);
        return res.json(fresh ?? task);
      }
      const updatedTask = await storage.getTask(taskId);
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      // Если у задачи есть стоимость и исполнитель, добавляем к балансу
      if (task.price && task.price > 0 && task.workerId) {
        await storage.updateUserBalance(task.workerId, task.price);
      }

      // Race-for-bonus: если задача журнальная и с премией, помечаем
      // sibling-задачи (тот же documentId+kind, другие воркеры,
      // невыполненные) как «забранные» победителем — они переедут в
      // раздел «Сделано другими» в дашборде.
      const journalLink = parseJournalLink(task.journalLink);
      const hasBonus = (task.price ?? 0) > 0 ||
        (journalLink?.bonusAmountKopecks ?? 0) > 0;
      if (
        journalLink &&
        hasBonus &&
        task.workerId &&
        !journalLink.isFreeText
      ) {
        try {
          const claimed = await storage.claimSiblingTasks({
            sourceTaskId: task.id,
            documentId: journalLink.documentId,
            journalKind: journalLink.kind,
            claimedByWorkerId: task.workerId,
            companyId: task.companyId ?? null,
            completedAt: Math.floor(Date.now() / 1000),
          });
          if (claimed > 0) {
            console.log(
              `[claim] task ${task.id} claimed ${claimed} sibling(s) for ${journalLink.kind}/${journalLink.documentId}`
            );
          }
        } catch (claimErr) {
          // Не валим основной /complete если claim не прошёл — задача
          // выполнена, баланс начислен; sibling-claim это «приятный
          // бонус» UX'а, а не critical path.
          console.error("[claim] failed", claimErr);
        }
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
      res.status(500).json({ message: "Ошибка завершения задачи" });
    }
  });

  // Отменить завершение задачи (любой авторизованный пользователь)
  /**
   * WeSetup → TF mirror: отметить задачу как «возвращена на доработку
   * verifier'ом». Вызывается из POST /api/journal-documents/<id>/verifier
   * на стороне WeSetup при reject-cells / reject-document.
   *
   * POST /api/tasks/:id/mark-returned
   * Headers: Authorization: Bearer tfk_…
   * Body: { reason: string }
   *
   * Сохраняет rejectReason + verification_status="rejected" + isCompleted
   * в false (если был true), чтобы worker увидел задачу снова в активных
   * с красной плашкой «Возвращено». Балансы не трогаем — это решение
   * verifier'а, не worker'а.
   *
   * Auth: только API-key (machine-to-machine от WeSetup) или admin.
   */
  app.post("/api/tasks/:id/mark-returned", requireAuthOrApiKey, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const reasonRaw = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      // Cap длины: причина показывается в карточке задачи и в push-нотификации;
      // 1000 символов — щедро для управляющего и одновременно блокирует
      // payload-flood попытки.
      const reason = reasonRaw.slice(0, 1000);
      if (!Number.isFinite(taskId) || !reason) {
        return res.status(400).json({ message: "Bad task id or reason" });
      }
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (callerCompanyId !== null && task.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      // Авторизация: API-key или admin'у можно. Простой воркер не
      // должен отмечать чужие задачи как «возвращённые».
      let allowed = false;
      if (req.apiKey) {
        allowed = true;
      } else if (req.session?.userId) {
        const me = await storage.getUserById(req.session.userId);
        if (me?.isAdmin) allowed = true;
      }
      if (!allowed) {
        return res.status(403).json({ message: "Нет прав" });
      }
      await storage.updateTask(taskId, {
        // updateTask примет verification поля если они в schema —
        // см. shared/schema.ts. Если завершена — переоткрываем
        // (worker должен исправить).
        ...(task.isCompleted ? { isCompleted: false } : {}),
        verificationStatus: "rejected",
        rejectReason: reason,
        verifiedAt: Math.floor(Date.now() / 1000),
      } as never);
      const fresh = await storage.getTask(taskId);
      return res.json(fresh ?? task);
    } catch (err: any) {
      console.error("[mark-returned] failed", err);
      return res.status(500).json({ message: "Ошибка" });
    }
  });

  app.post("/api/tasks/:id/uncomplete", requireAuthOrApiKey, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Multi-tenant scope: задача должна принадлежать компании
      // вызывающей стороны.
      const callerCompanyIdForUncomplete = await getCompanyIdFromReq(req);
      if (callerCompanyIdForUncomplete !== null && task.companyId !== callerCompanyIdForUncomplete) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Atomic isCompleted=true → false. Раньше: read+if+write
      // pattern → два concurrent /uncomplete оба видели true и оба
      // вычитали price из баланса. Теперь только один из них пройдёт
      // условный UPDATE (affectedRows>0) и сделает дебет.
      const wasTransitioned = task.isCompleted
        ? await storage.transitionTaskToUncompleted(taskId)
        : false;
      if (
        wasTransitioned &&
        task.price &&
        task.price > 0 &&
        task.workerId
      ) {
        await storage.updateUserBalance(task.workerId, -task.price);
      }

      const updatedTask = await storage.getTask(taskId);
      if (!updatedTask) {
        return res.status(500).json({ message: "Ошибка обновления задачи" });
      }

      // Если задача журнальная — синхронизируем reopen в WeSetup, чтобы
      // link.remoteStatus стал "active". Иначе при повторном /complete
      // WeSetup-сторона ещё считает задачу completed, и UI ведёт себя
      // непредсказуемо («уже выполнял» / задача мгновенно возвращается).
      //
      // attemptOrEnqueue делает первую попытку синхронно; на сетевой
      // сбой / 5xx — кладёт в webhook_deliveries и worker ретраит
      // по backoff-лестнице. Раньше был fire-and-forget с одним retry
      // и terral lost data при downtime (см. P1#6).
      if (task.journalLink) {
        try {
          const target = await resolveWesetupTarget(req);
          if (!("error" in target)) {
            const { attemptOrEnqueue } = await import("./webhook-queue");
            await attemptOrEnqueue({
              taskId,
              eventType: "uncomplete",
              targetUrl: `${target.baseUrl}/api/integrations/tasksflow/complete`,
              apiKey: target.key,
              payload: { taskId, isCompleted: false, values: {} },
            });
          }
        } catch (err) {
          console.warn(
            "[uncomplete] WeSetup reopen sync enqueue failed (non-fatal)",
            err instanceof Error ? err.message : err,
          );
        }
      }

      res.json(updatedTask);
    } catch (err: any) {
      console.error("Error uncompleting task:", err);
      res.status(500).json({ message: "Ошибка отмены завершения задачи" });
    }
  });

  /**
   * Phase 2 двухстадийной верификации: одобрить/отклонить задачу.
   *
   *   POST /api/tasks/:id/verify
   *   Body:
   *     { decision: "approve" }
   *     { decision: "reject", reason: "<текст>" }
   *
   * Кто может:
   *   • API key (machine integrations) — для server-to-server подтверждений.
   *   • session-юзер == task.verifierWorkerId — назначенный проверяющий.
   *   • session-юзер == admin компании — overrides verifier'а
   *     (admin всегда может закрыть задачу, чтобы pipeline не вис при
   *     отпуске verifier'а).
   *
   * approve: 'submitted' → 'approved'. Запускает все side-effects, как
   * обычный /complete: balance, sibling-claim, email. WeSetup-mirror
   * (если task.journalLink) тоже отправится — т.е. журнал считается
   * заполненным только сейчас.
   *
   * reject: 'submitted' → 'rejected'. Никаких credit'ов; задача
   * вернулась в active у сотрудника с пометкой rejectReason.
   */
  app.post("/api/tasks/:id/verify", requireAuthOrApiKey, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      if (!Number.isFinite(taskId)) {
        return res.status(400).json({ message: "Bad task id" });
      }

      const decisionRaw = (req.body || {}).decision;
      const reasonRaw = (req.body || {}).reason;
      if (decisionRaw !== "approve" && decisionRaw !== "reject") {
        return res
          .status(400)
          .json({ message: "decision должен быть 'approve' или 'reject'" });
      }
      if (
        decisionRaw === "reject" &&
        (typeof reasonRaw !== "string" || !reasonRaw.trim())
      ) {
        return res
          .status(400)
          .json({ message: "Для отказа укажите причину (reason)" });
      }
      const decision = decisionRaw as "approve" | "reject";
      // Cap длины такой же как в /mark-returned: причина рендерится в
      // карточке задачи + push-нотификации, 1000 символов щедро для
      // управляющего и блокирует payload-flood.
      const reason =
        decision === "reject"
          ? String(reasonRaw).trim().slice(0, 1000)
          : null;

      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Multi-tenant scope.
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (
        callerCompanyId !== null &&
        task.companyId !== callerCompanyId
      ) {
        return res.status(404).json({ message: "Задача не найдена" });
      }

      // Pre-condition: задача должна быть «submitted».
      if (task.verificationStatus !== "submitted") {
        return res.status(409).json({
          message:
            "Задача не находится на проверке (текущий статус: " +
            (task.verificationStatus ?? "—") +
            ")",
        });
      }

      // Доступ: API key, verifier_worker_id, или admin.
      let verifierUserId: number | null = null;
      if (req.apiKey) {
        // Machine: используем верификатора как id (если задан) или 0
        // как «system». В updates ставим verified_by_user_id из task.
        verifierUserId = task.verifierWorkerId ?? 0;
      } else if (req.session?.userId) {
        const me = await storage.getUserById(req.session.userId);
        if (
          me &&
          (me.isAdmin || me.id === task.verifierWorkerId)
        ) {
          verifierUserId = me.id;
        }
      }
      if (verifierUserId === null) {
        return res.status(403).json({
          message:
            "Только назначенный проверяющий или администратор может одобрять/отклонять задачи",
        });
      }

      if (decision === "approve") {
        const ok = await storage.approveVerification(taskId, verifierUserId);
        if (!ok) {
          const fresh = await storage.getTask(taskId);
          return res.json(fresh ?? task);
        }
        // Side-effects (balance, sibling-claim, WeSetup-mirror) —
        // те же что в /complete, но запускаем сейчас, при approve.
        if (task.price && task.price > 0 && task.workerId) {
          await storage.updateUserBalance(task.workerId, task.price);
        }
        const journalLink = parseJournalLink(task.journalLink);
        const hasBonus =
          (task.price ?? 0) > 0 ||
          (journalLink?.bonusAmountKopecks ?? 0) > 0;
        if (
          journalLink &&
          hasBonus &&
          task.workerId &&
          !journalLink.isFreeText
        ) {
          try {
            const claimed = await storage.claimSiblingTasks({
              sourceTaskId: task.id,
              documentId: journalLink.documentId,
              journalKind: journalLink.kind,
              claimedByWorkerId: task.workerId,
              companyId: task.companyId ?? null,
              completedAt: Math.floor(Date.now() / 1000),
            });
            if (claimed > 0) {
              console.log(
                `[verify-approve] task ${task.id} claimed ${claimed} siblings`,
              );
            }
          } catch (claimErr) {
            console.error("[verify-approve] sibling claim failed", claimErr);
          }
        }
        // WeSetup-mirror через webhook-queue (тот же путь что обычный
        // /complete на journal-bound задаче). Если упстрим лежит —
        // worker ретраит.
        if (task.journalLink) {
          try {
            const target = await resolveWesetupTarget(req);
            if (!("error" in target)) {
              const { attemptOrEnqueue } = await import("./webhook-queue");
              await attemptOrEnqueue({
                taskId,
                eventType: "complete",
                targetUrl: `${target.baseUrl}/api/integrations/tasksflow/complete`,
                apiKey: target.key,
                payload: { taskId, isCompleted: true, values: {} },
              });
            }
          } catch (err) {
            console.warn(
              "[verify-approve] WeSetup mirror enqueue failed (non-fatal)",
              err instanceof Error ? err.message : err,
            );
          }
        }
        const fresh = await storage.getTask(taskId);
        return res.json(fresh ?? task);
      }

      // decision === "reject"
      const ok = await storage.rejectVerification(
        taskId,
        verifierUserId,
        reason!,
      );
      if (!ok) {
        const fresh = await storage.getTask(taskId);
        return res.json(fresh ?? task);
      }
      const fresh = await storage.getTask(taskId);
      return res.json(fresh ?? task);
    } catch (err: any) {
      console.error("Error verifying task:", err);
      res.status(500).json({ message: "Ошибка проверки задачи" });
    }
  });

  /**
   * Список задач, ждущих проверки от текущего пользователя.
   * Используется UI-табом «На проверке» в Dashboard'е verifier'а.
   *
   *   GET /api/tasks/awaiting-verification
   *   200 → Task[]
   *   401 → не авторизован
   *
   * Возвращает все задачи с verification_status='submitted' и
   * verifier_worker_id == session.userId, в скоупе компании.
   * Admin'у — всё submitted в его компании.
   */
  app.get("/api/tasks/awaiting-verification", requireAuth, async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ message: "Не авторизован" });
      const me = await storage.getUserById(userId);
      if (!me) return res.status(401).json({ message: "Не авторизован" });
      const companyId = me.companyId ?? null;
      if (companyId === null) return res.json([]);

      const allTasks = await storage.getTasks(companyId);
      const filtered = allTasks.filter((t) => {
        if (t.verificationStatus !== "submitted") return false;
        if (me.isAdmin) return true;
        return t.verifierWorkerId === userId;
      });
      res.json(filtered);
    } catch (err: any) {
      console.error("Error listing awaiting-verification tasks:", err);
      res.status(500).json({ message: "Ошибка загрузки" });
    }
  });

  // Users
  app.get(api.users.list.path, requireAuthOrApiKey, async (req, res) => {
    try {
      // Фильтруем по компании. Раньше: companyId ?? undefined тянул
      // ВСЕХ юзеров из ВСЕХ компаний при null (deleted-user-with-
      // valid-session edge case).
      const companyId = await getCompanyIdFromReq(req);
      if (companyId === null) {
        return res.json([]);
      }
      const users = await storage.getAllUsers(companyId);

      // Manager-scope: при создании задачи руководитель видит в
      // worker-dropdown только своих подчинённых. Админу — всё, как
      // и раньше. Сам себя руководитель тоже видит (может назначить
      // задачу себе). Без apiKey — для CI/syncs пропускаем фильтр.
      if (req.apiKey) return res.json(users);
      const userId = req.session?.userId;
      if (!userId) return res.json(users);
      const me = users.find((u) => u.id === userId);
      if (!me || me.isAdmin) return res.json(users);

      const managed = DatabaseStorage.parseManagedWorkerIds(me.managedWorkerIds);
      if (managed === null) {
        // Обычный воркер — только себя
        return res.json(users.filter((u) => u.id === userId));
      }
      const allowed = new Set<number>(managed);
      allowed.add(userId);
      res.json(users.filter((u) => allowed.has(u.id)));
    } catch (err: any) {
      console.error('Error fetching users:', err);
      res.status(500).json({ message: 'Ошибка загрузки пользователей' });
    }
  });

  /**
   * PUT /api/admin/users/:id/managed-workers
   *
   * Body: { workerIds: number[] }
   *
   * Только apiKey — это write-side для WeSetup ↔ TasksFlow синхронизации.
   * Никаких юзерских action'ов из UI. WeSetup пушит сюда массив TF
   * user IDs, которыми руководит этот человек, после каждого изменения
   * /settings/staff-hierarchy на стороне WeSetup.
   *
   * Сессионных админов не пускаем намеренно — иерархия живёт в WeSetup,
   * чтобы не было двух источников истины. Если бы тут разрешили
   * руками править — ушли бы из синка после следующего push'а из
   * WeSetup, и пользователь бы не понял.
   */
  app.put("/api/admin/users/:id/managed-workers", requireApiKey, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ message: "Bad userId" });
      }

      // Multi-tenant scope: API key одной компании не должен изменять
      // managed-workers юзера другой компании.
      const callerCompanyId = await getCompanyIdFromReq(req);
      const targetUser = await storage.getUserById(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (callerCompanyId !== null && targetUser.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "User not found" });
      }

      const body = req.body as { workerIds?: unknown };
      const list = Array.isArray(body?.workerIds)
        ? body.workerIds.filter(
            (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0
          )
        : null;
      if (list === null) {
        return res.status(400).json({ message: "workerIds must be number[]" });
      }

      // Также фильтруем workerIds — оставляем только тех, кто реально
      // в той же компании. Иначе можно подсунуть worker'а другой
      // компании в managed-список (он его всё равно не увидит, но
      // лучше не хранить мусорные ссылки).
      if (callerCompanyId !== null && list.length > 0) {
        const allWorkers = await storage.getWorkers(callerCompanyId);
        const allowedIds = new Set(allWorkers.map((w) => w.id));
        const filtered = list.filter((id) => allowedIds.has(id));
        if (filtered.length !== list.length) {
          // Тихо отбрасываем чужих — UI пусть не падает, но и в БД
          // не пишем мусор.
          list.length = 0;
          for (const id of filtered) list.push(id);
        }
      }

      const updated = await storage.setManagedWorkers(userId, list);
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ ok: true, count: list.length });
    } catch (err: any) {
      console.error('[managed-workers] failed', err);
      res.status(500).json({ message: 'Ошибка сохранения иерархии' });
    }
  });

  app.post(api.users.create.path, requireAdminOrApiKey, async (req, res) => {
    try {
      const input = api.users.create.input.parse(req.body);
      const requestedAdmin =
        input.isAdmin === true ||
        input.role === "admin" ||
        input.role === "manager";
      // Explicit demote-сигнал: WeSetup передаёт isAdmin:false когда хочет
      // снять admin-флаг с уже-существующего юзера (раньше это не работало
      // — endpoint просто возвращал 400 «уже существует»). Различаем
      // undefined (skip) vs false (demote).
      const explicitDemote = input.isAdmin === false;

      // Проверяем, существует ли пользователь
      const normalizedPhone = normalizePhone(input.phone);
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }

      const existingUser = await storage.getUserByPhone(normalizedPhone);
      if (existingUser) {
        // Если повторный create передал position — обновляем должность
        // на месте (idempotent merge: WeSetup может прокинуть свежее
        // значение из своей JobPosition без полного rebuild).
        if (
          input.position !== undefined &&
          existingUser.companyId === companyId &&
          (input.position ?? null) !== (existingUser.position ?? null)
        ) {
          await storage.setUserPosition(existingUser.id, input.position ?? null);
        }
        // Demote: если WeSetup явно прислал isAdmin:false и юзер сейчас
        // admin — снимаем флаг. Это позволяет WeSetup-task-visibility
        // корректно убрать admin-роль с заведующей/менеджеров когда
        // менеджер откатил настройку.
        if (
          existingUser.companyId === companyId &&
          explicitDemote &&
          existingUser.isAdmin
        ) {
          const demoted = await storage.setUserAdmin(existingUser.id, false);
          return res.json(demoted || existingUser);
        }
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
        position: input.position ?? null,
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
      res.status(500).json({ message: 'Ошибка создания пользователя' });
    }
  });

  // ============================================================
  // Invitations: QR-приглашения сотрудников
  // ============================================================
  // Админ нажимает «Сгенерировать QR» → создаётся invitations row,
  // отдаётся ссылка вида /join/<token>. Сотрудник открывает её,
  // вводит имя+телефон, попадает в кабинет. Подробности — spec
  // docs/superpowers/specs/2026-04-28-invitations-qr-design.md.

  app.post(api.invitations.create.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.invitations.create.input.parse(req.body);
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const adminId = req.session.userId;
      if (!adminId) {
        return res.status(401).json({ message: "Нет сессии" });
      }

      const isAdmin = input.role === "admin" || input.role === "manager";
      const token = crypto.randomBytes(32).toString("base64url");

      const inv = await storage.createInvitation({
        token,
        companyId,
        createdByUserId: adminId,
        position: input.position ?? null,
        isAdmin,
      });

      const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
        `${req.protocol}://${req.get("host")}`;
      const url = `${baseUrl}/join/${inv.token}`;

      res.status(201).json({
        id: inv.id,
        token: inv.token,
        url,
        position: inv.position,
        isAdmin: inv.isAdmin,
        createdAt: inv.createdAt,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error creating invitation:", err);
      res.status(500).json({ message: "Ошибка создания приглашения" });
    }
  });

  app.get(api.invitations.list.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) return res.json([]);
      const includeAll = req.query.includeAll === "true";
      const list = await storage.getInvitationsByCompany(companyId, includeAll);
      res.json(list);
    } catch (err: any) {
      console.error("Error listing invitations:", err);
      res.status(500).json({ message: "Ошибка загрузки приглашений" });
    }
  });

  app.post("/api/invitations/:id/revoke", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Некорректный id" });
      }
      const adminCompanyId = await getCompanyIdFromReq(req);
      const inv = await storage.getInvitationById(id);
      // 404 — и для чужой компании, и для несуществующего id (не подтверждаем существование).
      if (!inv || inv.companyId !== adminCompanyId) {
        return res.status(404).json({ message: "Приглашение не найдено" });
      }
      if (inv.usedAt || inv.revokedAt) {
        return res.status(400).json({ message: "Приглашение уже неактивно" });
      }
      const updated = await storage.revokeInvitation(id);
      res.json(updated);
    } catch (err: any) {
      console.error("Error revoking invitation:", err);
      res.status(500).json({ message: "Ошибка отзыва приглашения" });
    }
  });

  // Публичные ручки приглашений: 30 запросов/минуту с IP. Защита от
  // перебора токенов чисто символическая — энтропия 256 бит и так
  // делает перебор нереальным, но это бесплатно. Применяется ко всему
  // /api/invitations/by-token/* (preview + accept).
  const inviteAcceptLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Слишком много запросов, попробуйте через минуту" },
  });
  app.use("/api/invitations/by-token", inviteAcceptLimiter);

  // Публичная: превью приглашения по токену.
  // Намеренно не отдаём id/companyId/createdByUserId/isAdmin —
  // только то, что нужно показать сотруднику на форме регистрации.
  app.get("/api/invitations/by-token/:token", async (req, res) => {
    try {
      const inv = await storage.getInvitationByToken(req.params.token);
      if (!inv) return res.json({ valid: false, reason: "not_found" });
      if (inv.revokedAt) return res.json({ valid: false, reason: "revoked" });
      if (inv.usedAt) return res.json({ valid: false, reason: "used" });
      const company = await storage.getCompanyById(inv.companyId);
      if (!company) return res.json({ valid: false, reason: "not_found" });
      res.json({
        valid: true,
        companyName: company.name,
        position: inv.position,
      });
    } catch (err: any) {
      console.error("Error reading invitation:", err);
      res.status(500).json({ message: "Ошибка чтения приглашения" });
    }
  });

  // Публичная: принять приглашение, создать User, авто-логин.
  // Race-protected: атомарный markInvitationUsed; если не успели —
  // откатываем созданного юзера и определяем причину повторным чтением.
  app.post("/api/invitations/by-token/:token/accept", async (req, res) => {
    try {
      const input = api.invitations.accept.input.parse(req.body);

      const inv = await storage.getInvitationByToken(req.params.token);
      if (!inv) {
        return res.status(400).json({ reason: "not_found", message: "Ссылка не найдена" });
      }
      if (inv.revokedAt) {
        return res.status(400).json({ reason: "revoked", message: "Приглашение отозвано" });
      }
      if (inv.usedAt) {
        return res.status(400).json({ reason: "used", message: "Приглашение уже использовано" });
      }

      const normalizedPhone = normalizePhone(input.phone);
      const existing = await storage.getUserByPhone(normalizedPhone);
      if (existing) {
        // НЕ помечаем приглашение как used — пусть человек попробует
        // другой телефон по той же ссылке.
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      const user = await storage.createUser({
        phone: normalizedPhone,
        name: input.name,
        isAdmin: inv.isAdmin,
        companyId: inv.companyId,
        position: inv.position,
      });

      const ok = await storage.markInvitationUsed(inv.id, user.id);
      if (!ok) {
        // Race: пока создавали юзера, кто-то опередил или приглашение
        // отозвали. Откатываем юзера, определяем причину повторным чтением.
        await storage.deleteUser(user.id);
        const refreshed = await storage.getInvitationByToken(req.params.token);
        const reason = refreshed?.revokedAt ? "revoked" : "used";
        return res.status(400).json({
          reason,
          message: reason === "used"
            ? "Приглашение уже использовано"
            : "Приглашение отозвано",
        });
      }

      const company = await storage.getCompanyById(inv.companyId);
      req.session.userId = user.id;

      res.status(201).json({
        user,
        company: company
          ? { id: company.id, name: company.name }
          : { id: inv.companyId, name: "" },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error accepting invitation:", err);
      res.status(500).json({ message: "Ошибка регистрации" });
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

      // Multi-tenant scope: админ может править только своих юзеров.
      const currentUser = await storage.getUserById(req.session.userId!);
      if (currentUser?.companyId != null && existingUser.companyId !== currentUser.companyId) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      // Проверяем, не занят ли номер другим пользователем
      const normalizedPhone = normalizePhone(input.phone);
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
      res.status(500).json({ message: 'Ошибка обновления пользователя' });
    }
  });

  // Сброс баланса пользователя (только для админа)
  app.post("/api/users/:id/reset-balance", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);

      // Multi-tenant scope: админ может ресетить только своих юзеров.
      const targetUser = await storage.getUserById(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      const currentUser = await storage.getUserById(req.session.userId!);
      if (currentUser?.companyId != null && targetUser.companyId !== currentUser.companyId) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      const user = await storage.resetUserBalance(userId);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      res.json(user);
    } catch (err: any) {
      console.error("Error resetting user balance:", err);
      res.status(500).json({ message: "Ошибка сброса баланса" });
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

      // Multi-tenant scope: company-уровневый админ удаляет только
      // юзеров своей компании. Раньше check был
      // `userToDelete.companyId !== currentUser?.companyId`, что в
      // частном случае «оба null» давал permit и легаси юзер без
      // companyId мог удалить такого же без companyId юзера в другой
      // соседней инсталляции (если миграция оставила NULL companyId).
      // Шаблон выровнен с /reset-balance — если у админа нет
      // companyId, считаем его платформенным и разрешаем; иначе
      // требуем match.
      if (
        currentUser?.companyId != null &&
        userToDelete.companyId !== currentUser.companyId
      ) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting user:", err);
      res.status(500).json({ message: "Ошибка удаления пользователя" });
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
      const revealEnabled = isApiKeyRevealEnabled();
      const sanitized = rows.map(r => ({
        id: r.id,
        name: r.name,
        keyPrefix: r.keyPrefix,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt ?? 0,
        revokedAt: r.revokedAt ?? 0,
        // Можно ли «открыть и посмотреть» plaintext через reveal-endpoint.
        // Старые ключи (созданные до миграции) keyEncrypted=NULL — для них
        // только rotate. Новые ключи — true если env API_KEY_REVEAL_SECRET
        // задан в момент создания.
        revealable: revealEnabled && Boolean(r.keyEncrypted),
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
      // Если env API_KEY_REVEAL_SECRET задан — шифруем plaintext и
      // сохраняем рядом с hash'ем, чтобы потом можно было «открыть и
      // посмотреть» через /api/api-keys/:id/reveal. Без env — старое
      // поведение (только hash, plaintext одноразовый).
      let keyEncrypted: string | null = null;
      if (isApiKeyRevealEnabled()) {
        try {
          keyEncrypted = encryptApiKey(plaintext);
        } catch (encErr) {
          console.error("[api-keys] encrypt failed", encErr);
          // Не валим запрос — пусть ключ создастся как раньше, без reveal.
        }
      }
      const created = await storage.createApiKey({
        name: parsed.data.name,
        keyHash,
        keyPrefix,
        keyEncrypted,
        companyId,
        createdByUserId: req.session.userId,
      });

      // Auto-bridge: пересчитываем company.wesetupApiKey на самый
      // свежий активный encrypted ключ. Раньше заполнялось только
      // первый раз — после ротации старый plaintext в company.
      // wesetupApiKey протухал и интеграция тихо ломалась. Теперь
      // single source of truth: api_keys (с encryption) → company.
      await syncCompanyWesetupBridge(companyId).catch((err) => {
        console.warn("[api-keys] bridge sync failed (non-fatal)", err);
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
      // После revoke может пропасть текущий bridge — пересчитываем,
      // чтобы interactive integration не сломалась тихо.
      if (companyId) {
        await syncCompanyWesetupBridge(companyId).catch(() => null);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[api-keys] revoke failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /**
   * POST /api/api-keys/:id/reveal — расшифровать и вернуть plaintext.
   * Требует admin сессии. Доступно только если ключ был создан после
   * миграции add-api-key-encrypted И env API_KEY_REVEAL_SECRET задан.
   * Для старых ключей возвращаем 410 Gone с инструкцией про rotate.
   */
  // Rate-limit на reveal-эндпоинт: даже у админа есть лимит на
  // распаковку plaintext-ключей (защита от случайной утечки сессии
  // — атакующий не сможет дёрнуть reveal на каждом id за минуту).
  const revealLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // 10 reveal'ов на 15 мин на IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message:
        "Слишком много попыток открыть ключ за последние 15 минут. Подождите.",
    },
    validate: false as never,
  });
  app.use("/api/api-keys/:id/reveal", revealLimiter);

  app.post("/api/api-keys/:id/reveal", requireAuth, requireAdmin, async (req, res) => {
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
        return res
          .status(410)
          .json({ message: "Ключ отозван — посмотреть нельзя." });
      }
      if (!record.keyEncrypted) {
        return res.status(410).json({
          message:
            "Этот ключ создан до включения функции «Показать». " +
            "Нажмите «Перевыпустить» чтобы получить новый plaintext.",
          rotateAvailable: true,
        });
      }
      if (!isApiKeyRevealEnabled()) {
        return res.status(503).json({
          message:
            "API_KEY_REVEAL_SECRET не задан в env. " +
            "Без него расшифровать ключ невозможно.",
        });
      }
      let plaintext: string;
      try {
        plaintext = decryptApiKey(record.keyEncrypted);
      } catch (err) {
        console.error("[api-keys] reveal decrypt failed", err);
        return res.status(500).json({
          message:
            "Не удалось расшифровать ключ. Возможно, изменился " +
            "API_KEY_REVEAL_SECRET — перевыпустите ключ.",
        });
      }
      // Sanity-check: первые 12 символов plaintext должны совпасть с
      // keyPrefix. Если нет — БД покрашена, не отдаём ничего.
      if (plaintext.slice(0, 12) !== record.keyPrefix) {
        console.error(
          `[api-keys] reveal mismatch id=${id} prefix=${record.keyPrefix}`,
        );
        return res
          .status(500)
          .json({ message: "Целостность ключа нарушена. Перевыпустите." });
      }
      res.json({
        id: record.id,
        name: record.name,
        keyPrefix: record.keyPrefix,
        secret: plaintext,
      });
    } catch (err) {
      console.error("[api-keys] reveal failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /**
   * POST /api/api-keys/:id/rotate — отозвать старый и создать новый
   * с тем же name. Возвращает новый plaintext (и encrypted если
   * reveal включён). Удобно для ключей, которые нельзя «посмотреть»
   * (создавались до миграции), а также для штатной ротации.
   */
  app.post("/api/api-keys/:id/rotate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: "Неверный id" });
      }
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId || !req.session?.userId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const old = await storage.getApiKeyById(id);
      if (!old || old.companyId !== companyId) {
        return res.status(404).json({ message: "Ключ не найден" });
      }
      // Revoke старый (если ещё активен), чтобы не было двух одинаковых
      // имён в листинге.
      if (!old.revokedAt || old.revokedAt === 0) {
        await storage.revokeApiKey(id);
      }
      const plaintext = generateApiKey();
      const keyHash = hashApiKey(plaintext);
      const keyPrefix = plaintext.slice(0, 12);
      let keyEncrypted: string | null = null;
      if (isApiKeyRevealEnabled()) {
        try {
          keyEncrypted = encryptApiKey(plaintext);
        } catch (encErr) {
          console.error("[api-keys] encrypt during rotate failed", encErr);
        }
      }
      const created = await storage.createApiKey({
        name: old.name,
        keyHash,
        keyPrefix,
        keyEncrypted,
        companyId,
        createdByUserId: req.session.userId,
      });
      // Если ротировали bridge-ключ, переключим company.wesetupApiKey
      // на свежий plaintext автоматически. Иначе integration сломается
      // в момент следующего proxy-вызова (старый ключ revoked).
      await syncCompanyWesetupBridge(companyId).catch(() => null);
      res.json({
        id: created.id,
        name: created.name,
        keyPrefix: created.keyPrefix,
        createdAt: created.createdAt,
        secret: plaintext,
        rotatedFromId: old.id,
      });
    } catch (err) {
      console.error("[api-keys] rotate failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /**
   * Single source of truth: companies.wesetup_api_key/base_url
   * пересчитываются после любого create/rotate/revoke. Берём самый
   * свежий активный ключ с keyEncrypted (raw plaintext), расшифровываем
   * и пишем в company. Старые ключи без keyEncrypted (до миграции
   * add-api-key-encrypted) пропускаем — для них bridge нельзя
   * восстановить, надо вручную rotate.
   *
   * Если ни одного encrypted ключа не осталось — НЕ затираем
   * существующий company.wesetupApiKey. Это страховка для legacy
   * случаев когда юзер вписал tfk_… вручную ещё до миграции.
   */
  async function syncCompanyWesetupBridge(companyId: number): Promise<void> {
    const company = await storage.getCompanyById(companyId);
    if (!company) return;

    const keys = await storage.listApiKeysByCompany(companyId);
    const candidates = keys
      .filter((k) => (!k.revokedAt || k.revokedAt === 0) && k.keyEncrypted)
      .sort((a, b) => b.createdAt - a.createdAt);
    const top = candidates[0];

    if (!top || !top.keyEncrypted) {
      // Нечего подставлять. Дополнительно проверяем что текущий
      // wesetupApiKey ХОТЯ БЫ соответствует какому-то активному
      // hash'у. Если нет — обнуляем bridge: иначе WeSetup продолжит
      // дёргать TF с отозванным ключом и получать тихие 401.
      const activeKeys = keys.filter(
        (k) => !k.revokedAt || k.revokedAt === 0
      );
      if (company.wesetupApiKey) {
        const matchesActive = activeKeys.some(
          (k) => k.keyHash === hashApiKey(company.wesetupApiKey as string)
        );
        if (!matchesActive) {
          await storage.updateCompany(companyId, {
            wesetupApiKey: null,
            wesetupBaseUrl: company.wesetupBaseUrl,
          });
        }
      }
      return;
    }

    let plaintext: string;
    try {
      plaintext = decryptApiKey(top.keyEncrypted);
    } catch (err) {
      console.warn("[bridge-sync] decrypt failed for key id=%s", top.id, err);
      return;
    }
    if (
      company.wesetupApiKey === plaintext &&
      company.wesetupBaseUrl &&
      company.wesetupBaseUrl.length > 0
    ) {
      return;
    }
    await storage.updateCompany(companyId, {
      wesetupApiKey: plaintext,
      wesetupBaseUrl: company.wesetupBaseUrl ?? "https://wesetup.ru",
    });
  }

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
    const task = await storage.getTask(taskId);
    if (!task) {
      return res.status(404).json({ message: "Задача не найдена" });
    }
    // Multi-tenant scope: задача должна принадлежать компании юзера.
    const callerCompanyId = await getCompanyIdFromReq(req);
    if (callerCompanyId !== null && task.companyId !== callerCompanyId) {
      return res.status(404).json({ message: "Задача не найдена" });
    }
    const journalLinkIntegrationId = getJournalLinkIntegrationId(
      task.journalLink
    );
    try {
      const upstream = await fetch(
        `${baseUrl}/api/integrations/tasksflow/task-fill-token`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId,
            ...(journalLinkIntegrationId
              ? { integrationId: journalLinkIntegrationId }
              : {}),
          }),
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
    const templateCode = journalKindToTemplateCode(journalLink.kind);
    const journal = catalog.journals.find(
      (item) =>
        item.templateCode === templateCode ||
        `wesetup-${item.templateCode}` === journalLink.kind
    );
    const form = findTaskFormInCatalog(catalog, journalLink.kind);

    return {
      resolved: true,
      form: form ?? createGenericJournalTaskForm(journalLink, journal?.label),
    };
  }

  function createGenericJournalTaskForm(
    journalLink: JournalLink,
    journalLabel?: string | null
  ): TaskFormSchema {
    const templateCode = journalKindToTemplateCode(journalLink.kind);
    return {
      intro: journalLabel
        ? `WeSetup пока не передал структуру формы для журнала «${journalLabel}». Можно подтвердить выполнение и оставить комментарий.`
        : "WeSetup пока не передал структуру формы для этого журнала. Можно подтвердить выполнение и оставить комментарий.",
      fields: [
        {
          type: "hidden",
          key: "journalCode",
          label: "Код журнала",
          defaultValue: templateCode,
        },
        {
          type: "hidden",
          key: "documentId",
          label: "Документ",
          defaultValue: journalLink.documentId,
        },
        {
          type: "hidden",
          key: "rowKey",
          label: "Строка",
          defaultValue: journalLink.rowKey,
        },
        {
          type: "boolean",
          key: "completed",
          label: "Работа выполнена",
          defaultValue: true,
        },
        {
          type: "textarea",
          key: "comment",
          label: "Комментарий",
          placeholder: "Что сделано / замечания",
        },
      ],
      submitLabel: "Отправить в WeSetup",
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
    let task: Awaited<ReturnType<typeof storage.getTask>>;
    try {
      task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      // Multi-tenant scope: задача должна принадлежать компании юзера.
      const callerCompanyId = await getCompanyIdFromReq(req);
      if (callerCompanyId !== null && task.companyId !== callerCompanyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const journalLinkIntegrationId = getJournalLinkIntegrationId(
        task.journalLink
      );
      const upstreamUrl = new URL(
        `${baseUrl}/api/integrations/tasksflow/task-form`
      );
      upstreamUrl.searchParams.set("taskId", String(taskId));
      if (journalLinkIntegrationId) {
        upstreamUrl.searchParams.set("integrationId", journalLinkIntegrationId);
      }
      const upstream = await fetch(upstreamUrl, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      const text = await upstream.text();
      const parsed = parseJsonOrUndefined(text);
      const normalized =
        parsed === undefined ? null : normalizeTaskFormPayload(parsed);
      const parsedObject =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
      const upstreamJournalCode =
        typeof parsedObject?.journalCode === "string"
          ? parsedObject.journalCode
          : null;

      if (upstream.ok) {
        if (normalized?.form) {
          return res.status(upstream.status).json(normalized);
        }
        if (normalized && !upstreamJournalCode) {
          return res.status(404).json({
            message:
              "Задача не связана со строкой журнала WeSetup. Создайте журнальную задачу заново через режим WeSetup.",
          });
        }
        const fallback = await resolveTaskFormFromCatalog(target, taskId);
        if (fallback.resolved) {
          return res.json({ form: fallback.form });
        }
        if (normalized || !text.trim()) {
          return res.status(upstream.status).json({ form: null });
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

    // Проверим, что сотрудник — исполнитель этой задачи (или админ),
    // и что задача принадлежит компании текущего юзера (multi-tenant).
    try {
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const user = req.session?.userId
        ? await storage.getUserById(req.session.userId)
        : null;
      if (user?.companyId != null && task.companyId !== user.companyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
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

    const completeJournalLinkIntegrationId = getJournalLinkIntegrationId(
      (await storage.getTask(taskId))?.journalLink
    );
    const completePayload = {
      taskId,
      isCompleted: Boolean(isCompleted ?? true),
      values: values ?? {},
      ...(completeJournalLinkIntegrationId
        ? { integrationId: completeJournalLinkIntegrationId }
        : {}),
    };
    const completeUrl = `${baseUrl}/api/integrations/tasksflow/complete`;
    try {
      const upstream = await fetch(completeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(completePayload),
        cache: "no-store",
      });
      const text = await upstream.text();
      // Local mirror logic. Атомарный переход + начисление баланса
      // если task.price > 0. Раньше `storage.updateTask({isCompleted})`
      // флипал статус БЕЗ начисления — журнальные bonus-задачи
      // выполнялись через /complete-with-values без зарплаты.
      // Кроме того без atomicity параллельные complete + complete-
      // with-values могли двойно зачислить (race), здесь
      // transitionTaskToCompleted закрывает обе дыры.
      const finishLocally = async (): Promise<void> => {
        const desired = Boolean(isCompleted ?? true);
        if (!desired) {
          // uncomplete-флоу: симметричный к complete атомарный
          // переход. Без него concurrent /uncomplete + /complete-
          // with-values{isCompleted:false} могли двойно дебетовать
          // воркера (оба видят isCompleted=true, оба вычитают).
          const transitioned = await storage.transitionTaskToUncompleted(taskId);
          if (!transitioned) return; // уже не completed — никакого debit'а
          const fresh = await storage.getTask(taskId);
          if (fresh?.price && fresh.price > 0 && fresh.workerId) {
            await storage.updateUserBalance(fresh.workerId, -fresh.price);
          }
          return;
        }
        const transitioned = await storage.transitionTaskToCompleted(taskId);
        if (!transitioned) return; // уже выполнена — никакого double-pay
        const fresh = await storage.getTask(taskId);
        if (fresh?.price && fresh.price > 0 && fresh.workerId) {
          await storage.updateUserBalance(fresh.workerId, fresh.price);
        }
      };
      if (upstream.ok) {
        try {
          await finishLocally();
        } catch (err) {
          console.error("[wesetup-proxy] local complete mirror failed", err);
        }
      } else if (upstream.status >= 500 || upstream.status === 408 || upstream.status === 429) {
        // 5xx/408/429 — WeSetup временно недоступен. Кладём в очередь
        // чтобы worker дотащил данные сотрудника позже (см. P1#6).
        // Локально TF-task уже отметим выполненным, чтобы dashboard
        // обновился сразу — иначе сотрудник видит «не сохранено» и
        // тапает повторно, плодя дубли.
        try {
          await finishLocally();
        } catch {
          /* non-fatal */
        }
        try {
          const { attemptOrEnqueue } = await import("./webhook-queue");
          await attemptOrEnqueue({
            taskId,
            eventType: "complete",
            targetUrl: completeUrl,
            apiKey: key,
            payload: completePayload,
          });
        } catch (enqueueErr) {
          console.error(
            "[wesetup-proxy] failed to enqueue complete for retry",
            enqueueErr,
          );
        }
      }
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      res.send(text);
    } catch (err: any) {
      // Network error / timeout — упстрим лежит. Сохраняем delivery
      // в очередь, локально таск отмечаем как выполненный, и отдаём
      // юзеру 202 Accepted с пояснением.
      console.error("[wesetup-proxy] complete failed", err);
      try {
        // Тот же atomic+balance путь что в success/5xx ветках выше.
        const desired = Boolean(isCompleted ?? true);
        if (desired) {
          const transitioned = await storage.transitionTaskToCompleted(taskId);
          if (transitioned) {
            const fresh = await storage.getTask(taskId);
            if (fresh?.price && fresh.price > 0 && fresh.workerId) {
              await storage.updateUserBalance(fresh.workerId, fresh.price);
            }
          }
        }
      } catch {
        /* non-fatal */
      }
      try {
        const { attemptOrEnqueue } = await import("./webhook-queue");
        await attemptOrEnqueue({
          taskId,
          eventType: "complete",
          targetUrl: completeUrl,
          apiKey: key,
          payload: completePayload,
        });
        return res.status(202).json({
          message:
            "WeSetup временно недоступен. Задача сохранена локально, " +
            "данные досинхронизируются автоматически.",
          queued: true,
        });
      } catch (enqueueErr) {
        console.error(
          "[wesetup-proxy] failed to enqueue complete after network error",
          enqueueErr,
        );
        return res
          .status(502)
          .json({ message: normalizeWesetupNetworkError(err) });
      }
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

  // ===================== WESETUP SYNC PROXIES =====================
  // Триггер-кнопки в /admin/integrations звонят сюда вместо WeSetup
  // напрямую: TF держит креды (wesetupBaseUrl + wesetupApiKey per
  // company), и сотруднику без доступа к админке WeSetup проще
  // дёрнуть синхронизацию из родного TF UI. Все четыре эндпоинта —
  // тонкие proxy: метод+тело форвардятся как есть, ответ возвращаем
  // без обработки. Логика — на стороне WeSetup.
  //
  // sync-users      WeSetup ↔ TF user mapping (двусторонне с P1#4)
  // sync-tasks      WeSetup pull выполненных задач из TF
  // sync-hierarchy  ManagerScope → managedWorkerIds на воркерах
  // bulk-assign-today  массово создать задачи на сегодня по журналам
  // links           таблица WeSetup↔TF user link (для просмотра)
  async function proxyToWesetup(
    req: Request,
    res: Response,
    path: string,
    method: "GET" | "POST",
  ) {
    const target = await resolveWesetupTarget(req);
    if ("error" in target) {
      return res.status(target.status).json({ message: target.error });
    }
    const { baseUrl, key } = target;
    try {
      const upstream = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          ...(method === "POST"
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: method === "POST" ? JSON.stringify(req.body || {}) : undefined,
        cache: "no-store",
      });
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "application/json",
      );
      res.send(text);
    } catch (err: any) {
      console.error(`[wesetup-proxy] ${path} failed`, err);
      res.status(502).json({
        message: normalizeWesetupNetworkError(err),
      });
    }
  }

  app.post("/api/wesetup/sync-users", requireAuth, requireAdmin, (req, res) =>
    proxyToWesetup(req, res, "/api/integrations/tasksflow/sync-users", "POST"),
  );
  app.post("/api/wesetup/sync-tasks", requireAuth, requireAdmin, (req, res) =>
    proxyToWesetup(req, res, "/api/integrations/tasksflow/sync-tasks", "POST"),
  );
  app.post(
    "/api/wesetup/sync-hierarchy",
    requireAuth,
    requireAdmin,
    (req, res) =>
      proxyToWesetup(req, res, "/api/integrations/tasksflow/sync-hierarchy", "POST"),
  );
  app.post(
    "/api/wesetup/bulk-assign-today",
    requireAuth,
    requireAdmin,
    (req, res) =>
      proxyToWesetup(
        req,
        res,
        "/api/integrations/tasksflow/bulk-assign-today",
        "POST",
      ),
  );
  app.get("/api/wesetup/links", requireAuth, requireAdmin, (req, res) =>
    proxyToWesetup(req, res, "/api/integrations/tasksflow/links", "GET"),
  );

  // ===================== WEBHOOK QUEUE DASHBOARD =====================
  // Видимая статистика очереди отложенных доставок (см. webhook-queue.ts).
  // Без этого админ не знает «у нас что-то завязло» — данные сотрудников
  // могут лежать пол-дня и никто не заметит.
  app.get(
    "/api/admin/webhook-queue/stats",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        // Multi-tenant scope: webhookDeliveries не имеет companyId,
        // только taskId. Раньше: возвращали ВСЕ deliveries из ВСЕХ
        // компаний — admin компании A видел ошибки доставок компании B
        // (включая targetUrl и apiKey-prefix в lastError). Теперь
        // сначала собираем taskIds компании, потом фильтруем deliveries.
        const adminCompanyId = await getCompanyIdFromReq(req);
        if (adminCompanyId === null) {
          return res.json({
            stats: { pending: 0, delivered: 0, failed: 0, cancelled: 0 },
            recentFailed: [],
          });
        }

        const { db } = await import("./db");
        const { webhookDeliveries, tasks: tasksTable } = await import("@shared/schema");
        const { sql, eq, and, inArray, desc } = await import("drizzle-orm");

        // Список taskIds компании (limit для perf — обычно их немного,
        // но огромная org может иметь 10к+).
        const myTasks = await db
          .select({ id: tasksTable.id })
          .from(tasksTable)
          .where(eq(tasksTable.companyId, adminCompanyId));
        const myTaskIds = myTasks.map((t) => t.id);
        if (myTaskIds.length === 0) {
          return res.json({
            stats: { pending: 0, delivered: 0, failed: 0, cancelled: 0 },
            recentFailed: [],
          });
        }

        const rows = await db
          .select({
            status: webhookDeliveries.status,
            count: sql<number>`count(*)`,
          })
          .from(webhookDeliveries)
          .where(inArray(webhookDeliveries.taskId, myTaskIds))
          .groupBy(webhookDeliveries.status);
        const stats = { pending: 0, delivered: 0, failed: 0, cancelled: 0 };
        for (const r of rows) {
          if (r.status === 0) stats.pending = Number(r.count);
          else if (r.status === 1) stats.delivered = Number(r.count);
          else if (r.status === 2) stats.failed = Number(r.count);
          else if (r.status === 3) stats.cancelled = Number(r.count);
        }
        // Top-N последних failed — только для своей компании.
        const recentFailed = await db
          .select()
          .from(webhookDeliveries)
          .where(
            and(
              eq(webhookDeliveries.status, 2),
              inArray(webhookDeliveries.taskId, myTaskIds)
            )
          )
          .orderBy(desc(webhookDeliveries.updatedAt))
          .limit(20);
        res.json({
          stats,
          recentFailed: recentFailed.map((d) => ({
            id: d.id,
            taskId: d.taskId,
            eventType: d.eventType,
            attempts: d.attempts,
            lastError: d.lastError,
            updatedAt: d.updatedAt,
          })),
        });
      } catch (err) {
        // Если таблицы ещё нет (миграция не прогнана) — возвращаем
        // пустую статистику + флаг, чтобы UI показал «миграция не
        // прогнана» вместо красного error-стейта.
        const message = err instanceof Error ? err.message : String(err);
        const tableMissing = /webhook_deliveries.*doesn'?t exist|Unknown table/i.test(
          message,
        );
        if (tableMissing) {
          return res.json({
            stats: { pending: 0, delivered: 0, failed: 0, cancelled: 0 },
            recentFailed: [],
            migrationNeeded: true,
          });
        }
        console.error("[webhook-queue-stats] failed", err);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    },
  );

  return httpServer;
}
