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
import {
  registerCompanySchema,
  loginSchema,
  tasks,
  startSchema,
  loginEmailSchema,
  recoverSchema,
  updateEmailSchema,
  updatePasswordSchema,
  bannerInputSchema,
} from "@shared/schema";
import { validateEmailForAuth, normalizeEmail, isEmailFormat } from "./email-validate";
import { hashPassword, verifyPassword, generatePassword, generateMagicToken } from "./crypto-password";
import { sendMail } from "./mailer";
import { autoRegisterByEmail, MAGIC_TTL_SEC } from "./auto-register";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { requireApiKey, extractBearerKey, generateApiKey, hashApiKey } from "./api-keys";
import { resolveUploadAbs } from "./uploads-paths";
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
import {
  canAssignToWorker,
  isTaskServiceError,
  type TaskActor,
} from "./services/task-actor";
import { createTaskForActor } from "./services/task-create";
import { completeTaskForActor } from "./services/task-complete";
import {
  attachTaskPhoto,
  attachChecklistItemPhoto,
} from "./services/task-photo";

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
    // Math.random() не криптографически случаен — атакующий с access
    // к /uploads/ static directory мог теоретически brute-force'ить
    // 10^9 значений random suffix чтобы скачать чужое фото. С
    // crypto.randomBytes(8) — 16 hex символов (64 бита), практически
    // unguessable. Date.now() оставлен как удобный sort-by-time префикс
    // для админа; criticality смещена с timestamp на random.
    const randomSuffix = crypto.randomBytes(8).toString("hex");
    const uniqueSuffix = Date.now() + "-" + randomSuffix;
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

// Root (владелец сайта) — управление глобальными вещами вроде промо-баннеров.
// Строго по флагу users.is_root. НЕ равно isAdmin (тот — админ своей компании),
// регистрацией не выдаётся, фолбэков нет: нет is_root → нет доступа.
async function requireRoot(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  const user = await storage.getUserById(req.session.userId);
  if (!user || !user.isRoot) {
    return res.status(403).json({ message: "Доступ только для root" });
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

// canAssignToWorker переехал в ./services/task-actor — им пользуются и роуты,
// и Telegram-бот. Здесь он только импортируется, второй копии нет.

// Аутентификация: либо session (любой user), либо API key.
async function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction) {
  if (extractBearerKey(req)) {
    return requireApiKey(req, res, next);
  }
  return requireAuth(req, res, next);
}

/**
 * Хелпер: собрать TaskActor из express-запроса для сервисов задач.
 * API key считается машинной интеграцией с правами своей компании,
 * всё остальное — обычный session-пользователь.
 */
function actorFromReq(req: Request): TaskActor {
  if (req.apiKey) {
    return { kind: "apiKey", companyId: req.apiKey.companyId };
  }
  return { kind: "session", userId: req.session!.userId! };
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

// Поля юзера, которые НИКОГДА не должны уезжать клиенту. Появились с
// email-авторизацией: db.select().from(users) тянет всю строку, и старые
// res.json(user) начали бы отдавать хэш пароля и активный magic-токен.
// Глобальный sanitizer ниже вырезает их из ЛЮБОГО JSON-ответа — не нужно
// помнить про каждый из ~15 эндпоинтов, отдающих user, и про будущие.
const SENSITIVE_USER_KEYS = new Set([
  "passwordHash",
  "magicToken",
  "magicTokenExpiresAt",
]);

function stripSensitive(value: any): any {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_USER_KEYS.has(k)) continue;
      out[k] = stripSensitive(v);
    }
    return out;
  }
  return value;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Глобально оборачиваем res.json, чтобы вырезать чувствительные поля
  // юзера (passwordHash / magicToken) из всех ответов. Ставим первым.
  app.use((_req, res, next) => {
    const orig = res.json.bind(res);
    res.json = (body: any) => orig(stripSensitive(body));
    next();
  });

  // ===================== БАННЕРЫ =====================
  // Публичный список активных баннеров под место показа. Без авторизации —
  // используется публичными страницами (полоса сверху + блок в контенте).
  app.get("/api/banners", async (req, res) => {
    try {
      const placement = req.query.placement === "content" ? "content" : "top";
      const list = await storage.listActiveBanners(placement);
      res.json(list);
    } catch (err) {
      console.error("[banners] не удалось получить активные баннеры", err);
      res.status(500).json({ message: "Не удалось получить баннеры" });
    }
  });

  // Управление баннерами — только root.
  app.get("/api/admin/banners", requireRoot, async (_req, res) => {
    res.json(await storage.listAllBanners());
  });

  app.post("/api/admin/banners", requireRoot, async (req, res) => {
    const parsed = bannerInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные баннера", errors: parsed.error.flatten() });
    }
    const created = await storage.createBanner(parsed.data);
    res.status(201).json(created);
  });

  app.patch("/api/admin/banners/:id", requireRoot, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Некорректный id" });
    const parsed = bannerInputSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные баннера", errors: parsed.error.flatten() });
    }
    const updated = await storage.updateBanner(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Баннер не найден" });
    res.json(updated);
  });

  app.delete("/api/admin/banners/:id", requireRoot, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Некорректный id" });
    await storage.deleteBanner(id);
    res.json({ ok: true });
  });

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
  app.use("/api/auth/start", authLimiter);
  app.use("/api/auth/login-email", authLimiter);
  app.use("/api/auth/recover", authLimiter);
  app.use("/api/companies/register", authLimiter);
  // /api/users/register — открытый endpoint регистрации воркера к
  // существующей компании. Без strict-лимита бот мог через
  // generalLimiter (1000/15min) зарегистрировать сотни фейковых
  // аккаунтов в чужой компании (если узнает adminPhone) и спамить
  // её админу уведомлениями. Симметрия с companies/register.
  app.use("/api/users/register", authLimiter);

  // Photo upload limiter — heavy endpoint (multer + diskStorage). Без
  // отдельного лимита злоумышленник с одной сессии может через
  // generalLimiter (1000/15min в server/index.ts) залить 1000×10MB =
  // 10GB на диск и положить сервер.
  // 60 загрузок за 15 минут на IP: воркер делает 5-15 фото в день,
  // админ массово ставит example-photo на ~50 задач — оба укладываются.
  const photoUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Слишком много загрузок фото. Подождите 15 минут.",
    },
  });
  app.use("/api/tasks/:id/photo", photoUploadLimiter);
  app.use("/api/tasks/:id/example-photo", photoUploadLimiter);
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
      // user уже содержит isRoot (колонка) — UI показывает root-раздел по нему.
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

  // ============ Email-авторизация (лендинг, ветка как в ordersflow) ============

  // Единая точка входа: одно поле email.
  //   новый email   → авторегистрация + СРАЗУ сессия + welcome-письмо → {exists:false}
  //   существующий  → magic-login письмо → {exists:true} (клиент покажет шаг с паролем)
  app.post("/api/auth/start", async (req, res) => {
    try {
      const { email } = startSchema.parse(req.body);
      const base = getPublicTasksflowBaseUrl(req);

      // Существующий аккаунт → вход. MX/типо-проверку НЕ делаем: домен уже
      // «подтверждён» тем, что аккаунт есть (иначе свой же домен без MX,
      // напр. admin@tasksflow.ru, не смог бы войти). Достаточно формата.
      const normalizedEarly = normalizeEmail(email);
      if (isEmailFormat(normalizedEarly)) {
        const existing = await storage.getUserByEmail(normalizedEarly);
        if (existing) {
          const token = generateMagicToken();
          const expiresAt = Math.floor(Date.now() / 1000) + MAGIC_TTL_SEC;
          await storage.setMagicToken(existing.id, token, expiresAt);
          await sendMail({
            to: normalizedEarly,
            kind: "login-link",
            data: { email: normalizedEarly, magicUrl: `${base}/api/auth/magic/${token}` },
          }).catch((e) => console.error("[auth/start] login-link mail failed", e));
          return res.json({ exists: true });
        }
      }

      // Новый email → строгая проверка (типо + MX), чтобы не регистрировать мусор.
      const check = await validateEmailForAuth(email);
      if (!check.ok) {
        return res.status(400).json({
          message: check.error,
          field: "email",
          suggestion: check.suggestion,
        });
      }
      const normalized = check.normalized;

      // Новый email → авторегистрация + мгновенный автологин (на почту идти не надо)
      const { user, password, magicToken } = await autoRegisterByEmail(normalized);
      req.session.userId = user.id;
      await sendMail({
        to: normalized,
        kind: "welcome",
        data: { email: normalized, password, magicUrl: `${base}/api/auth/magic/${magicToken}` },
      }).catch((e) => console.error("[auth/start] welcome mail failed", e));
      return res.status(201).json({ exists: false, user });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error in /api/auth/start:", err);
      res.status(500).json({ message: "Ошибка входа" });
    }
  });

  // Вход по email + пароль (шаг «sent» в модалке для существующего email).
  app.post("/api/auth/login-email", async (req, res) => {
    try {
      const { email, password } = loginEmailSchema.parse(req.body);
      const normalized = normalizeEmail(email);
      const user = await storage.getUserByEmail(normalized);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "Неверный email или пароль", field: "password" });
      }
      req.session.userId = user.id;
      res.json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error in /api/auth/login-email:", err);
      res.status(500).json({ message: "Ошибка входа" });
    }
  });

  // Сброс пароля: новый пароль + magic-токен на почту. Всегда 200 (анти-энумерация).
  app.post("/api/auth/recover", async (req, res) => {
    try {
      const { email } = recoverSchema.parse(req.body);
      const normalized = normalizeEmail(email);
      const user = await storage.getUserByEmail(normalized);
      if (user) {
        const password = generatePassword(12);
        await storage.updateUserPassword(user.id, hashPassword(password));
        const token = generateMagicToken();
        const expiresAt = Math.floor(Date.now() / 1000) + MAGIC_TTL_SEC;
        await storage.setMagicToken(user.id, token, expiresAt);
        const base = getPublicTasksflowBaseUrl(req);
        await sendMail({
          to: normalized,
          kind: "recovery",
          data: { email: normalized, password, magicUrl: `${base}/api/auth/magic/${token}` },
        }).catch((e) => console.error("[auth/recover] mail failed", e));
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error in /api/auth/recover:", err);
      res.status(500).json({ message: "Ошибка" });
    }
  });

  // Magic-ссылка из письма: одноразовый вход → сессия → редирект в кабинет.
  app.get("/api/auth/magic/:token", async (req, res) => {
    try {
      const token = req.params.token;
      if (!/^[a-f0-9]{32}$/.test(token)) {
        return res.redirect("/login?magic=invalid");
      }
      const user = await storage.findUserByMagicToken(token);
      if (!user) {
        return res.redirect("/login?magic=expired");
      }
      await storage.clearMagicToken(user.id);
      req.session.userId = user.id;
      res.redirect("/dashboard");
    } catch (err: any) {
      console.error("Error in /api/auth/magic:", err);
      res.redirect("/login?magic=error");
    }
  });

  // ===== Аккаунт пользователя (кабинет /account): смена email и пароля =====
  app.put("/api/account/email", requireAuth, async (req, res) => {
    try {
      const { email } = updateEmailSchema.parse(req.body);
      const check = await validateEmailForAuth(email);
      if (!check.ok) {
        return res.status(400).json({ message: check.error, field: "email", suggestion: check.suggestion });
      }
      const existing = await storage.getUserByEmail(check.normalized);
      if (existing && existing.id !== req.session.userId) {
        return res.status(400).json({ message: "Этот email уже используется", field: "email" });
      }
      const updated = await storage.updateUserEmail(req.session.userId!, check.normalized);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("Error updating account email:", err);
      res.status(500).json({ message: "Ошибка" });
    }
  });

  app.put("/api/account/password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = updatePasswordSchema.parse(req.body);
      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      // Если пароль уже задан — требуем подтвердить текущий.
      if (user.passwordHash) {
        if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
          return res.status(400).json({ message: "Текущий пароль неверный", field: "currentPassword" });
        }
      }
      await storage.updateUserPassword(user.id, hashPassword(newPassword));
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("Error updating account password:", err);
      res.status(500).json({ message: "Ошибка" });
    }
  });

  // ===== Привязка Telegram (бот @thetasksflowbot) =====

  /**
   * Публичная проверка «поднялся ли бот».
   *
   * Нужна, чтобы не гадать вслепую: положили токен в .env, перезапустили —
   * и одним curl видно, подхватил сервер бота или нет. Секретов не
   * отдаёт: username бота публичен по определению, токена и chat_id тут
   * нет. Без неё диагностика упиралась в «залогинься и посмотри глазами».
   */
  app.get("/api/telegram/health", async (_req, res) => {
    try {
      const { getTelegramRuntime } = await import("./telegram");
      const rt = getTelegramRuntime();
      res.json({
        configured: Boolean(rt),
        username: rt?.me.username ?? null,
        mode: rt?.config.mode ?? null,
        // Какое имя переменной сработало — самая частая причина «токен
        // положил, а бот молчит»: в ProjectsFlow и DocsFlow оно другое.
        tokenEnv: process.env.TASKSFLOW_BOT_TOKEN
          ? "TASKSFLOW_BOT_TOKEN"
          : process.env.TELEGRAM_BOT_TOKEN
            ? "TELEGRAM_BOT_TOKEN"
            : null,
      });
    } catch {
      res.json({ configured: false, username: null, mode: null });
    }
  });

  /**
   * Статус привязки для страницы «Аккаунт».
   * botId отдаём осознанно — Login Widget'у он нужен на клиенте, и это
   * публичная часть токена (всё до двоеточия).
   */
  app.get("/api/me/telegram", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(404).json({ message: "Пользователь не найден" });
      const { getTelegramRuntime } = await import("./telegram");
      const rt = getTelegramRuntime();
      res.json({
        connected: user.telegramUserId != null,
        telegramUsername: user.telegramUsername ?? null,
        telegramFirstName: user.telegramFirstName ?? null,
        tgStarted: user.tgStartedAt != null,
        botConfigured: Boolean(rt),
        botId: rt?.config.botId ?? null,
        botUsername: rt?.config.botUsername ?? null,
        botDeepLink: rt?.config.botDeepLink ?? null,
      });
    } catch (err) {
      console.error("Error reading telegram status:", err);
      res.status(500).json({ message: "Ошибка" });
    }
  });

  app.post("/api/me/telegram/connect", requireAuth, async (req, res) => {
    try {
      const { getTelegramRuntime } = await import("./telegram");
      const rt = getTelegramRuntime();
      if (!rt) {
        return res.status(503).json({ message: "Telegram-бот не настроен" });
      }
      const {
        telegramLoginPayloadSchema,
        connectTelegramAccount,
        isTelegramLinkError,
      } = await import("./telegram/link");

      const payload = telegramLoginPayloadSchema.parse(req.body);
      try {
        await connectTelegramAccount({
          userId: req.session.userId!,
          payload,
          botToken: rt.config.botToken,
        });
      } catch (linkErr) {
        if (isTelegramLinkError(linkErr)) {
          return res
            .status(linkErr.status)
            .json({ message: linkErr.message, code: linkErr.code });
        }
        throw linkErr;
      }

      res.json({
        ok: true,
        connected: true,
        telegramUsername: payload.username ?? null,
        botDeepLink: rt.config.botDeepLink,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error connecting telegram:", err);
      res.status(500).json({ message: "Ошибка привязки Telegram" });
    }
  });

  app.delete("/api/me/telegram", requireAuth, async (req, res) => {
    try {
      await storage.clearTelegramLink(req.session.userId!);
      res.status(204).end();
    } catch (err) {
      console.error("Error unlinking telegram:", err);
      res.status(500).json({ message: "Ошибка отвязки Telegram" });
    }
  });

  /**
   * Webhook Telegram. Отвечаем 200 всегда, когда апдейт принят или отброшен
   * осознанно: 4xx заставит Telegram ретраить одно и то же сообщение.
   * На реальной ошибке обработки отдаём 503 — вот тогда ретрай уместен.
   */
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      const { getTelegramRuntime } = await import("./telegram");
      const rt = getTelegramRuntime();
      if (!rt) return res.status(200).json({ ok: false });

      // Секрет обязателен: без него вебхук принимает апдейты от кого угодно.
      if (!rt.config.webhookSecret) {
        console.warn("[telegram] webhook без TELEGRAM_WEBHOOK_SECRET — апдейт отброшен");
        return res.status(200).json({ ok: false });
      }
      const got = req.header("X-Telegram-Bot-Api-Secret-Token");
      if (got !== rt.config.webhookSecret) {
        return res.status(200).json({ ok: false });
      }

      const { handleUpdate } = await import("./telegram/handle-update");
      await handleUpdate(req.body, rt);
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Error handling telegram webhook:", err);
      res.status(503).json({ ok: false });
    }
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

      // Ищем администратора по телефону. Anti-enumeration: три разных
      // ветки (не найден / не админ / без компании) объединяем в одно
      // generic-сообщение, иначе атакующий через rate-лимитированный
      // бот может построить реестр админов компаний — узнать «номер X
      // = админ компании Y». Юзеру для UX достаточно знать «телефон
      // админа неверный, спроси у него».
      const admin = await storage.getUserByPhone(normalizedAdminPhone);
      if (!admin || !admin.isAdmin || !admin.companyId) {
        return res.status(400).json({
          message:
            "Не получилось привязаться к компании. Уточните у админа правильный номер.",
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
      // wesetupConfigured — НАСТРОИЛА ЛИ ИНТЕГРАЦИЮ САМА КОМПАНИЯ (свои
      // baseUrl+apiKey). По нему кабинет показывает журнальный режим.
      // Глобальный env WESETUP_* СПЕЦИАЛЬНО не учитываем: иначе журнальный
      // режим включился бы у всех. TasksFlow для публики — просто «ставить
      // задачи»; журналы WeSetup — только для тех, кто сам подключил интеграцию.
      const wesetupConfigured = !!(
        company?.wesetupBaseUrl?.trim() && company?.wesetupApiKey?.trim()
      );
      res.json(company ? { ...company, wesetupConfigured } : null);
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
   * Удаление разрешено всегда, включая случай «единственный admin компании».
   * После такого удаления компания остаётся без admin'а — это сознательное
   * решение пользователя (например, закрытие компании). Платформенный
   * админ при необходимости может промоутнуть оставшегося worker'а.
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
          (u) => u.isAdmin && u.id !== userId,
        );
        if (otherAdmins.length === 0) {
          console.warn(
            `[delete-own-account] Company ${user.companyId} loses its sole admin (user ${userId}). ${allUsers.length - 1} worker(s) become unmanaged.`,
          );
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
      //
      // Cap=255 синхронно с MySQL VARCHAR(255) и updateUserSchema.name
      // (см. shared/schema.ts → .max(255)). Раньше был slice(0, 200) —
      // имена 201-255 проходили schema, но handler обрезал silently.
      let normalizedName: string | null = null;
      if (typeof name === "string") {
        const trimmed = name.trim();
        if (trimmed) {
          normalizedName = trimmed.slice(0, 255);
        }
      } else if (name === null) {
        normalizedName = null;
      } else if (name !== undefined) {
        return res.status(400).json({ message: "Имя должно быть строкой" });
      }

      const updated = await storage.setUserName(user.id, normalizedName);

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
   *
   * ВАЖНО: ДОЛЖЕН быть зарегистрирован ВЫШЕ /api/tasks/:id, иначе
   * Express трактует "awaiting-verification" как :id и возвращает
   * 404. Раньше endpoint был ниже /api/tasks/:id и фактически
   * никогда не работал — VerificationBanner и /admin/verification
   * page были пустыми.
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
      const task = await createTaskForActor({
        input,
        actor: actorFromReq(req),
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
      if (isTaskServiceError(err)) {
        return res.status(err.status).json({ message: err.message });
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
      //
      // 2026-05-09: ВАЖНО — claimedByWorkerId NOT NULL означает что
      // этот task — sibling, баланс получил claimedByWorkerId (winner),
      // НЕ workerId (originally assigned). Reversal с workerId уведёт
      // его balance в минус (он не получал начисления). Скипаем reversal
      // для claimed-by-other tasks. Жалоба владельца «премия -180₽»
      // = 3 sibling-cleanups × 60₽ списано из чужих balance'ов.
      if (
        existing.price &&
        existing.price > 0 &&
        existing.workerId &&
        existing.claimedByWorkerId === null
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

      // Audit log (П-17 спека Wesetup): фиксируем deletion.
      const { recordAudit } = await import("./audit-log");
      const actorIdForDelete = (req as { userId?: number }).userId ?? null;
      void recordAudit({
        companyId: existing.companyId,
        actorWorkerId: actorIdForDelete,
        taskId: existing.id,
        action: "task.deleted",
        payload: {
          title: existing.title,
          wasCompleted: existing.isCompleted,
          workerId: existing.workerId,
        },
      });

      // Удаляем все привязанные к задаче файлы с диска. Раньше:
      // удалённая задача оставляла photoUrls + examplePhotoUrl как
      // orphan-файлы в /uploads/, ничем не убираемые — disk usage
      // рос неконтролируемо. Best-effort, не валим ответ при ошибке.
      try {
        const { unlink } = await import("fs/promises");
        const candidates: string[] = [];
        const photos = (existing as { photoUrls?: string[] }).photoUrls;
        if (Array.isArray(photos)) candidates.push(...photos);
        if (existing.photoUrl) candidates.push(existing.photoUrl);
        if (existing.examplePhotoUrl) candidates.push(existing.examplePhotoUrl);
        for (const rel of candidates) {
          const abs = resolveUploadAbs(rel);
          if (!abs) continue;
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
      // needCleanup — флаг «файл успешно сохранён multer'ом, но мы НЕ
      // дописали его в БД». finally-блок снесёт orphan. Сбрасываем в
      // false только когда photoUrls записан в task.
      let needCleanup = false;
      try {
        if (err) {
          // Ошибки multer (например, неверный тип файла / размер) —
          // multer fileFilter rejects до сохранения, файла на диске нет.
          console.error("Multer upload error:", err);
          return res.status(400).json({ message: err.message || "Ошибка загрузки файла" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "Файл не загружен" });
        }
        // С этого момента файл лежит на диске — нужен cleanup при early-return.
        needCleanup = true;

        const result = await attachTaskPhoto({
          taskId: Number(req.params.id),
          photoUrl: `/uploads/${req.file.filename}`,
          actor: actorFromReq(req),
        });

        // UPDATE успешен — файл теперь принадлежит БД, cleanup НЕ нужен.
        needCleanup = false;
        return res.json({
          photoUrl: result.photoUrl,
          photoUrls: result.photoUrls,
        });
      } catch (uploadErr: any) {
        if (isTaskServiceError(uploadErr)) {
          return res.status(uploadErr.status).json({ message: uploadErr.message });
        }
        console.error("Error uploading photo:", uploadErr);
        return res.status(500).json({ message: "Ошибка загрузки фото", error: uploadErr.message });
      } finally {
        if (needCleanup && req.file) {
          const abs = resolveUploadAbs(req.file.filename);
          if (abs) {
            const { unlink } = await import("fs/promises");
            await unlink(abs).catch(() => null);
          }
        }
      }
    });
  });

  // ===== Чек-лист (подзадачи): фото на пункт =====
  // Загрузка фото к пункту чек-листа → пункт помечается выполненным.
  // Фото на каждый пункт обязательно (галочку без фото не поставить).
  app.post("/api/tasks/:id/checklist/:itemId/photo", requireAuth, (req, res) => {
    res.setHeader("Content-Type", "application/json");
    upload.single("photo")(req, res, async (err: any) => {
      let needCleanup = false;
      try {
        if (err) return res.status(400).json({ message: err.message || "Ошибка загрузки файла" });
        if (!req.file) return res.status(400).json({ message: "Файл не загружен" });
        needCleanup = true;

        const result = await attachChecklistItemPhoto({
          taskId: Number(req.params.id),
          itemId: String(req.params.itemId),
          photoUrl: `/uploads/${req.file.filename}`,
          actor: actorFromReq(req),
        });

        needCleanup = false;
        return res.json({ photoUrl: result.photoUrl, task: result.task });
      } catch (uploadErr: any) {
        if (isTaskServiceError(uploadErr)) {
          return res.status(uploadErr.status).json({ message: uploadErr.message });
        }
        console.error("Error uploading checklist photo:", uploadErr);
        return res.status(500).json({ message: "Ошибка загрузки фото", error: uploadErr.message });
      } finally {
        if (needCleanup && req.file) {
          const abs = resolveUploadAbs(req.file.filename);
          if (abs) {
            const { unlink } = await import("fs/promises");
            await unlink(abs).catch(() => null);
          }
        }
      }
    });
  });

  // Убрать фото у пункта чек-листа (переснять) → если фото не осталось, пункт снова не выполнен.
  app.delete("/api/tasks/:id/checklist/:itemId/photo", requireAuth, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Задача не найдена" });

      const currentUser = await storage.getUserById(req.session.userId!);
      if (currentUser?.companyId != null && task.companyId !== currentUser.companyId) {
        return res.status(404).json({ message: "Задача не найдена" });
      }
      const isAllowed = currentUser?.isAdmin || task.workerId === req.session.userId;
      if (!isAllowed) return res.status(403).json({ message: "Вы не являетесь исполнителем этой задачи" });

      const url = typeof req.query.url === "string" ? req.query.url : "";
      const checklist = task.checklist || [];
      const idx = checklist.findIndex((it) => it.id === req.params.itemId);
      if (idx === -1) return res.status(404).json({ message: "Пункт чек-листа не найден" });

      const remaining = (checklist[idx].photoUrls || []).filter((u) => u !== url);
      const newChecklist = checklist.map((it, i) =>
        i === idx ? { ...it, photoUrls: remaining, done: remaining.length > 0 } : it,
      );
      const updatedTask = await storage.updateTask(taskId, { checklist: newChecklist });

      // Удаляем сам файл с диска (best-effort).
      const abs = resolveUploadAbs(url.replace(/^\/uploads\//, ""));
      if (abs) {
        const { unlink } = await import("fs/promises");
        await unlink(abs).catch(() => null);
      }
      return res.json({ task: updatedTask });
    } catch (e: any) {
      console.error("Error deleting checklist photo:", e);
      return res.status(500).json({ message: "Ошибка удаления фото" });
    }
  });

  // Загрузка примера фото для задачи (только админ)
  app.post("/api/tasks/:id/example-photo", requireAuth, requireAdmin, (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');

    upload.single("photo")(req, res, async (err: any) => {
      // см. комментарий к needCleanup в /api/tasks/:id/photo выше.
      let needCleanup = false;
      try {
        if (err) {
          console.error("Multer upload error:", err);
          return res.status(400).json({ message: err.message || "Ошибка загрузки файла" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "Файл не загружен" });
        }
        needCleanup = true;

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

        // UPDATE успешен — новый файл принадлежит БД.
        needCleanup = false;

        // Best-effort cleanup ПРЕДЫДУЩЕГО example-photo только после
        // успешного UPDATE — иначе получим status update fail +
        // потерянный example.
        if (previousExampleUrl && previousExampleUrl !== examplePhotoUrl) {
          try {
            const abs = resolveUploadAbs(previousExampleUrl);
            if (abs) {
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
      } finally {
        if (needCleanup && req.file) {
          const abs = resolveUploadAbs(req.file.filename);
          if (abs) {
            const { unlink } = await import("fs/promises");
            await unlink(abs).catch(() => null);
          }
        }
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

      // Удаляем файл с диска через resolveUploadAbs (защита от path traversal
      // через basename + защита от абсолютного photoUrl, см. uploads-paths.ts).
      const { unlink } = await import("fs/promises");
      const photoPath = resolveUploadAbs(task.examplePhotoUrl);
      if (!photoPath) {
        console.warn("Refusing to delete file outside uploads/:", task.examplePhotoUrl);
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
      const safeUnlink = async (relPath: string) => {
        const abs = resolveUploadAbs(relPath);
        if (!abs) {
          console.warn("Refusing to delete outside uploads/:", relPath);
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
      const result = await completeTaskForActor({
        taskId,
        actor: actorFromReq(req),
        comment,
      });
      return res.json(result.task);
    } catch (err: any) {
      if (isTaskServiceError(err)) {
        return res.status(err.status).json({ message: err.message });
      }
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

      // Авторизация: API-key (machine integration), исполнитель (свою
      // задачу), или session-admin. Раньше проверки не было — любой
      // авторизованный юзер из той же компании мог /uncomplete на
      // чужую задачу, что вычитало деньги с чужого баланса. Это
      // симметрично с /complete (см. line 1314-1317 ниже похожий
      // блок). См. tests/uncomplete-endpoint → "посторонний воркер".
      let isAllowed = false;
      if (req.apiKey) {
        isAllowed = true;
      } else if (req.session?.userId === task.workerId) {
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

      // Atomic isCompleted=true → false. Раньше: read+if+write
      // pattern → два concurrent /uncomplete оба видели true и оба
      // вычитали price из баланса. Теперь только один из них пройдёт
      // условный UPDATE (affectedRows>0) и сделает дебет.
      //
      // 2026-05-09: same fix как в DELETE — claimed-by-other tasks
      // имели начисление на claimedByWorkerId, не workerId. Reversal
      // с workerId уводит чужой balance в минус. Skip reversal если
      // это sibling-claimed task.
      const wasTransitioned = task.isCompleted
        ? await storage.transitionTaskToUncompleted(taskId)
        : false;
      if (
        wasTransitioned &&
        task.price &&
        task.price > 0 &&
        task.workerId &&
        task.claimedByWorkerId === null
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
              sourceRowKey: journalLink.rowKey ?? null,
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
        //
        // Если у задачи есть submittedValues (продавец заполнил форму
        // через /api/wesetup/complete-with-values, payload отложен до
        // approve), отправляем те значения в WeSetup. Иначе — пустой
        // values как для обычной /complete-задачи.
        if (task.journalLink) {
          let savedValues: Record<string, unknown> = {};
          if (task.submittedValues) {
            try {
              const parsed = JSON.parse(task.submittedValues);
              if (parsed && typeof parsed === "object") {
                savedValues = parsed as Record<string, unknown>;
              }
            } catch {
              /* corrupted JSON — отправим пустой values, лучше чем 500 */
            }
          }
          try {
            const target = await resolveWesetupTarget(req);
            if (!("error" in target)) {
              const { attemptOrEnqueue } = await import("./webhook-queue");
              await attemptOrEnqueue({
                taskId,
                eventType: "complete",
                targetUrl: `${target.baseUrl}/api/integrations/tasksflow/complete`,
                apiKey: target.key,
                payload: { taskId, isCompleted: true, values: savedValues },
              });
            }
          } catch (err) {
            console.warn(
              "[verify-approve] WeSetup mirror enqueue failed (non-fatal)",
              err instanceof Error ? err.message : err,
            );
          }
          // Очищаем submittedValues — они уже в WeSetup-журнале.
          if (task.submittedValues) {
            await db
              .update(tasks)
              .set({ submittedValues: null })
              .where(eq(tasks.id, taskId))
              .catch(() => null);
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
      // Чистим submittedValues — задача отклонена, продавец будет
      // заполнять форму заново. Без этого при повторном /complete-with-
      // values старые значения «застряли» бы в submitted_values.
      if (task.submittedValues) {
        await db
          .update(tasks)
          .set({ submittedValues: null })
          .where(eq(tasks.id, taskId))
          .catch(() => null);
      }
      const fresh = await storage.getTask(taskId);
      return res.json(fresh ?? task);
    } catch (err: any) {
      console.error("Error verifying task:", err);
      res.status(500).json({ message: "Ошибка проверки задачи" });
    }
  });

  // /api/tasks/awaiting-verification теперь регистрируется ВЫШЕ
  // /api/tasks/:id (см. блок ~720). Express матчит routes по
  // порядку, и static "awaiting-verification" должен быть до
  // dynamic ":id", иначе :id="awaiting-verification" → NaN → 404
  // и endpoint никогда не работал. Тесты в tests/awaiting-verification
  // ловят регрессию через 12 кейсов.

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
      //
      // ВАЖНО: insertUserSchema.isAdmin имеет .default(false) в Zod, поэтому
      // input.isAdmin === false срабатывает и для отсутствующего поля
      // (idempotent re-create) — это **демотило бы любого admin'а**, кого
      // WeSetup случайно ре-провизионировал. Используем raw req.body для
      // различения «явно false» vs «не передано». См. tests/api-user-provision
      // → "does NOT demote when isAdmin is undefined".
      const explicitDemote =
        typeof req.body === "object" &&
        req.body !== null &&
        (req.body as { isAdmin?: unknown }).isAdmin === false;

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
        // 30s timeout: catalog fetch — admin UI view, не должна
        // вешать handler если WeSetup тормозит. Без таймаута Express
        // ждёт до browser ~5min.
        signal: AbortSignal.timeout(30_000),
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
          signal: AbortSignal.timeout(30_000),
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
        signal: AbortSignal.timeout(30_000),
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

      // Photo-enforcement (2026-05-10): прокидываем task.requiresPhoto и
      // photoUrls в ответ, чтобы TaskFormFiller знал когда показывать
      // photo upload UI и блокировать «Сделал» без фото. Раньше форма
      // возвращалась без этих полей → юзер просто видел checkbox-фильд
      // «Сделал», нажимал, /complete-with-values пропускал без
      // photo-check (теперь чек добавлен). Без UI-аплоада — юзер видел
      // 400 «Необходимо загрузить фото» без способа загрузить.
      const taskMeta = {
        requiresPhoto: Boolean((task as any).requiresPhoto),
        photoUrls: Array.isArray((task as any).photoUrls)
          ? ((task as any).photoUrls as string[])
          : [],
        photoUrl: (task as any).photoUrl ?? null,
      };

      if (upstream.ok) {
        if (normalized?.form) {
          return res
            .status(upstream.status)
            .json({ ...normalized, task: taskMeta });
        }
        if (normalized && !upstreamJournalCode) {
          return res.status(404).json({
            message:
              "Задача не связана со строкой журнала WeSetup. Создайте журнальную задачу заново через режим WeSetup.",
          });
        }
        const fallback = await resolveTaskFormFromCatalog(target, taskId);
        if (fallback.resolved) {
          return res.json({ form: fallback.form, task: taskMeta });
        }
        if (normalized || !text.trim()) {
          return res
            .status(upstream.status)
            .json({ form: null, task: taskMeta });
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
      // 2026-05-10: photo-enforcement parity с /complete endpoint.
      // Раньше /complete-with-values (путь journal-задач WeSetup) шёл
      // мимо photo-check → юзер мог завершить задачу без фото даже
      // когда task.requiresPhoto=true. Теперь блокируем как и /complete.
      // Skip только для uncomplete (isCompleted:false) — там photo
      // не нужен, юзер откатывает, не завершает.
      const willComplete = Boolean(isCompleted ?? true);
      if (willComplete && task.requiresPhoto) {
        const taskPhotoUrls = (task as any).photoUrls || [];
        const hasPhotos = taskPhotoUrls.length > 0 || task.photoUrl;
        if (!hasPhotos) {
          return res
            .status(400)
            .json({ message: "Необходимо загрузить фото перед завершением" });
        }
      }
    } catch (err: any) {
      console.error("[wesetup-proxy] complete auth check failed", err);
      return res.status(500).json({ message: "Ошибка проверки прав" });
    }

    // Двухстадийная верификация для journal-задач.
    // Раньше /complete-with-values сразу:
    //   1) звонил WeSetup → applyRemoteCompletion записал в журнал
    //   2) transitionTaskToCompleted локально → isCompleted=true
    // — обходил submitForVerification, заведующая не видела задачу.
    //
    // Теперь если task.verifierWorkerId set + не self + isCompleted=true:
    // сохраняем JSON-payload в submitted_values, делаем submitForVerification,
    // НЕ ЗВОНИМ в WeSetup. Approve-handler позже сам отправит данные
    // в журнал. Это позволяет заведующей отклонить запись ДО того
    // как она попадёт в журнал WeSetup.
    const taskBeforeAny = await storage.getTask(taskId);
    const desired = Boolean(isCompleted ?? true);
    const meId = req.session?.userId;
    const requiresVerification =
      desired &&
      taskBeforeAny &&
      typeof taskBeforeAny.verifierWorkerId === "number" &&
      taskBeforeAny.verifierWorkerId !== meId;

    if (requiresVerification) {
      try {
        // Сохраняем payload для будущего approve. Локально transition
        // в submitted (verification_status) — задача появится в очереди
        // у заведующей.
        await db
          .update(tasks)
          .set({ submittedValues: JSON.stringify(values ?? {}) })
          .where(eq(tasks.id, taskId));
        const submitted = await storage.submitForVerification(taskId);
        if (!submitted) {
          // Concurrent submit или статус не позволяет (approved/already
          // submitted). Возвращаем текущий стейт — клиент рефрешит UI.
          const fresh = await storage.getTask(taskId);
          return res.status(200).json({
            message: "Задача уже в очереди на проверку",
            task: fresh,
            verificationPending: true,
          });
        }
        return res.status(200).json({
          message: "Отправлено на проверку заведующей",
          verificationPending: true,
        });
      } catch (err) {
        console.error(
          "[wesetup-proxy] submit-for-verification failed",
          err,
        );
        return res.status(500).json({
          message: "Не удалось отправить на проверку",
        });
      }
    }

    const completeJournalLinkIntegrationId = getJournalLinkIntegrationId(
      taskBeforeAny?.journalLink
    );
    const completePayload = {
      taskId,
      isCompleted: desired,
      values: values ?? {},
      ...(completeJournalLinkIntegrationId
        ? { integrationId: completeJournalLinkIntegrationId }
        : {}),
    };
    const completeUrl = `${baseUrl}/api/integrations/tasksflow/complete`;
    try {
      // AbortSignal.timeout — Node 17.3+ built-in. Без таймаута:
      // если WeSetup hang'нется, Express handler ждёт до browser
      // timeout (~5min), все pool-connection'ы заняты — TasksFlow
      // встаёт колом для всех воркеров. /complete-with-values
      // вызывается КАЖДЫМ завершением journal-задачи, самый
      // критичный по UX. 30s достаточно для медленного WeSetup, но
      // не висит часами.
      const upstream = await fetch(completeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(completePayload),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
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
          // 2026-05-09: skip reversal для sibling-claimed tasks —
          // balance был given to claimedByWorkerId, не workerId.
          if (
            fresh?.price &&
            fresh.price > 0 &&
            fresh.workerId &&
            fresh.claimedByWorkerId === null
          ) {
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
          signal: AbortSignal.timeout(30_000),
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
        // 60s — этот generic-proxy используется для sync-users и
        // sync-tasks, массовых операций. 30s могло обрезать на
        // больших компаниях.
        signal: AbortSignal.timeout(60_000),
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

  /**
   * GET /api/audit — Phase 2.10 спека Wesetup
   * (docs/superpowers/specs/2026-05-09-wesetup-tasksflow-integration-design.md, П-17).
   *
   * Возвращает audit-events за период, отфильтрованные по company.
   * Wesetup при рендере объединённого audit-report'а merge'ит эти
   * события с собственным AuditLog'ом по timestamp'у.
   *
   * Query params:
   *   - since (Unix sec, optional, default = now - 30d)
   *   - taskIds (comma-separated, optional — узкий filter для документа)
   *   - limit (default 500, max 5000)
   *
   * Multi-tenant safety: companyId берётся из API key или session-юзера,
   * caller не может его передавать — гарантия что org A не видит events org B.
   */
  app.get("/api/audit", requireAuthOrApiKey, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (companyId === null) {
        return res.status(403).json({ message: "Multi-tenant scope required" });
      }

      const sinceParam = req.query.since;
      const since =
        typeof sinceParam === "string"
          ? Number(sinceParam) || undefined
          : undefined;

      const taskIdsParam = req.query.taskIds;
      const taskIds =
        typeof taskIdsParam === "string"
          ? taskIdsParam
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isInteger(n) && n > 0)
          : undefined;

      const limitParam = req.query.limit;
      const limit =
        typeof limitParam === "string" ? Number(limitParam) || undefined : undefined;

      const { listAudit } = await import("./audit-log");
      const events = await listAudit({
        companyId,
        since,
        taskIds,
        limit,
      });

      res.json({ events, count: events.length });
    } catch (err) {
      console.error("[audit] list failed", err);
      res.status(500).json({ message: "Ошибка чтения audit log" });
    }
  });

  /**
   * POST /api/admin/reset-negative-balances
   *
   * Hot-fix endpoint: обнуляет отрицательные bonus_balance у workers
   * текущей компании. Background — bug до commit ef3e8ec: sibling-claimed
   * task'и при удалении уводили чужой balance в минус. После fix новые
   * случаи невозможны, но накопленные negative значения в БД остаются.
   *
   * Auth: API key (Wesetup admin) или session admin.
   * Multi-tenant: трогает только users текущей компании (companyId
   * из API key или session).
   * SAFE: только negative → 0. Положительные не трогаются.
   * Идемпотентно — повторный POST = no-op.
   *
   * Returns: { reset: <count>, users: [{id,phone,name,wasBalance}] }
   */
  app.post(
    "/api/admin/reset-negative-balances",
    requireAdminOrApiKey,
    async (req, res) => {
      try {
        const companyId = await getCompanyIdFromReq(req);
        if (companyId === null) {
          return res.status(403).json({ message: "Multi-tenant scope required" });
        }

        const { users: usersTable } = await import("@shared/schema");
        const { eq, and, lt } = await import("drizzle-orm");

        // Найти всех у кого balance < 0 в этой компании.
        const affected = await db
          .select({
            id: usersTable.id,
            phone: usersTable.phone,
            name: usersTable.name,
            wasBalance: usersTable.bonusBalance,
          })
          .from(usersTable)
          .where(
            and(eq(usersTable.companyId, companyId), lt(usersTable.bonusBalance, 0)),
          );

        if (affected.length === 0) {
          return res.json({ reset: 0, users: [] });
        }

        // Обнулить negative.
        await db
          .update(usersTable)
          .set({ bonusBalance: 0 })
          .where(
            and(eq(usersTable.companyId, companyId), lt(usersTable.bonusBalance, 0)),
          );

        console.log(
          `[reset-balances] company=${companyId} reset ${affected.length} negative balances`,
        );
        res.json({ reset: affected.length, users: affected });
      } catch (err) {
        console.error("[reset-balances] failed", err);
        res.status(500).json({ message: "Ошибка сброса балансов" });
      }
    },
  );

  return httpServer;
}
