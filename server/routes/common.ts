// Общее для маршрутов: загрузка файлов, проверки прав, хелперы запросов.
// Перенесено из server/routes.ts без изменений поведения.
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import crypto from "node:crypto";
import { existsSync, mkdirSync } from "fs";
import { storage } from "../storage";
import { type Company, type User } from "@shared/schema";
import { requireApiKey, extractBearerKey } from "../api-keys";
import { isStatelessSession } from "../api-key-session";
import { lockRemaining, nowSec } from "../pin-auth";
import { parseNotifySettings } from "@shared/notify";
import { parsePhotoSettings } from "@shared/photo-settings";
import { companyPlan, planLimitsEnforced } from "../plan-limits";
import { type TaskActor } from "../services/task-actor";
import { accessOf } from "../access";
import { canAssignTo, isTaskAdmin, parseAccessSettings, type AccessRole } from "@shared/roles";

// Настройка загрузки файлов
export const uploadsDir = path.join(process.cwd(), "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

// Расширение берём от mime-type, не от user-supplied originalname.
// Иначе можно загрузить evil.php с Content-Type: image/jpeg и
// сохранить как task-X-Y.php. На текущем prod (Node без PHP)
// не критично, но defense-in-depth.
export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

export const multerStorage = multer.diskStorage({
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

export const upload = multer({
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
    /** Когда вошли по email (пароль или ссылка из письма). */
    emailAuthAt?: number;
    /** Вход руководителя для просмотра: userId — сотрудник, исходный вход здесь. */
    impersonatorId?: number;
  }
}

/**
 * API-ключ на маршруте кабинета: действует от имени создателя ключа, пока
 * тот админ компании ключа, — те же права, что у админа в интерфейсе.
 * Запрос с ключом идёт без cookie-сессии (server/api-key-session.ts), поэтому
 * userId живёт один запрос. false — ответ уже отправлен.
 */
export async function sessionFromApiKey(req: Request, res: Response): Promise<boolean> {
  if (req.session.userId || !extractBearerKey(req)) return true;
  // Настоящую сессию не трогаем: userId в ней сохранился бы и ушёл cookie.
  if ("cookie" in req.session && !isStatelessSession(req.session)) return true;
  let valid = false;
  await requireApiKey(req, res, () => {
    valid = true;
  });
  if (!valid || !req.apiKey) return false;
  const owner = await storage.getUserById(req.apiKey.createdByUserId);
  if (!owner || !owner.isAdmin || owner.companyId !== req.apiKey.companyId) {
    res.status(403).json({
      message: "Создатель API-ключа больше не администратор этой компании — выпустите новый ключ",
    });
    return false;
  }
  req.session.userId = owner.id;
  if (req.method !== "GET") {
    console.info(`[api-key] key=${req.apiKey.id} от имени user=${owner.id}: ${req.method} ${req.path}`);
  }
  return true;
}

// Middleware для проверки авторизации
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await sessionFromApiKey(req, res))) return;
  } catch (err) {
    return next(err);
  }
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  next();
}

// Middleware для проверки админских прав
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await sessionFromApiKey(req, res))) return;
  } catch (err) {
    return next(err);
  }
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
// По API-ключу root недоступен никогда, даже если ключ выпустил root.
export async function requireRoot(req: Request, res: Response, next: NextFunction) {
  if (extractBearerKey(req)) {
    return res.status(403).json({ message: "Доступ только для root" });
  }
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
export async function requireAdminOrApiKey(req: Request, res: Response, next: NextFunction) {
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
export async function requireAdminOrManagerOrApiKey(
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
  // Руководитель из WeSetup (даже с пустым [] подчинённых) или своя роль
  // с правом «Ставит задачи» — shared/roles.ts.
  if ((await accessOf(user)).manageTasks) {
    return next();
  }
  return res
    .status(403)
    .json({ message: "Только админ или руководитель может управлять задачами" });
}

/**
 * Сессия с правом на людей: админ или роль «Добавляет сотрудников».
 * Кого именно можно менять — проверяет хендлер (canManageUser).
 */
export async function requireUserManager(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await sessionFromApiKey(req, res))) return;
  } catch (err) {
    return next(err);
  }
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  const user = await storage.getUserById(req.session.userId);
  if (!user) {
    return res.status(401).json({ message: "Пользователь не найден" });
  }
  if (user.isAdmin || (await accessOf(user)).manageUsers) {
    return next();
  }
  return res.status(403).json({ message: "Добавлять и менять сотрудников может админ или руководитель" });
}

export async function requireUserManagerOrApiKey(req: Request, res: Response, next: NextFunction) {
  if (extractBearerKey(req)) {
    return requireApiKey(req, res, next);
  }
  return requireUserManager(req, res, next);
}

/**
 * Сессия, которая ставит задачи: админ, роль «Ставит задачи» или
 * руководитель из WeSetup. Чью задачу можно менять — canEditTaskOf().
 */
export async function requireTaskManager(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await sessionFromApiKey(req, res))) return;
  } catch (err) {
    return next(err);
  }
  if (!req.session.userId) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  const user = await storage.getUserById(req.session.userId);
  if (user && (user.isAdmin || (await accessOf(user)).manageTasks)) {
    return next();
  }
  return res.status(403).json({ message: "Требуются права администратора" });
}

/** Может править эту задачу: админ — любую, руководитель — в своём круге. */
export async function canEditTaskOf(req: Request, task: { workerId: number | null }): Promise<boolean> {
  if (req.apiKey) return true;
  const me = await storage.getUserById(req.session.userId!);
  if (!me) return false;
  if (me.isAdmin) return true;
  return canAssignTo(await accessOf(me), task.workerId);
}

// Кому можно назначать задачи — canAssignTo из shared/roles.ts (учитывает
// и руководителя из WeSetup, и свою роль компании).

// Аутентификация: либо session (любой user), либо API key.
export async function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction) {
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
export function actorFromReq(req: Request): TaskActor {
  if (req.apiKey) {
    return { kind: "apiKey", companyId: req.apiKey.companyId };
  }
  return { kind: "session", userId: req.session!.userId! };
}

/**
 * Исполнитель задачи или тот, кто ведёт задачи всей компании: админ или
 * роль с «Ставит задачи» (shared/roles.ts isTaskAdmin).
 */
export async function canActOnTask(
  user: User | undefined,
  task: { workerId: number | null },
): Promise<boolean> {
  if (!user) return false;
  if (task.workerId != null && task.workerId === user.id) return true;
  if (user.isAdmin) return true;
  return isTaskAdmin(await accessOf(user));
}

/** Роль из запроса: своя роль этой компании, null — «Сотрудник». */
export async function resolveRoleGrant(
  companyId: number,
  roleId: number | null | undefined,
): Promise<{ role: AccessRole | null } | { error: string }> {
  if (roleId == null) return { role: null };
  const role = await storage.getCompanyRole(roleId);
  if (!role || role.companyId !== companyId) return { error: "Роль не найдена — обновите страницу" };
  return { role };
}

/** Хелпер: получить companyId из req либо от API key, либо от session. */
/**
 * Компания для клиента: без служебного состояния сброса и напоминаний,
 * с разобранными настройками напоминаний. Ключ WeSetup — только админу
 * и интеграции по API-ключу.
 */
export function toPublicCompany(company: Company, withSecrets: boolean) {
  const { lastResetDay: _lastResetDay, notifyState: _notifyState, notifySettings, photoSettings, accessSettings, ...rest } = company;
  // wesetupConfigured — настроила ли интеграцию сама компания (свои
  // baseUrl+apiKey). По нему кабинет показывает журнальный режим;
  // глобальный env WESETUP_* специально не учитываем.
  const wesetupConfigured = !!(company.wesetupBaseUrl?.trim() && company.wesetupApiKey?.trim());
  return {
    ...rest,
    wesetupApiKey: withSecrets ? rest.wesetupApiKey : null,
    notify: parseNotifySettings(notifySettings),
    photo: parsePhotoSettings(photoSettings),
    planInfo: { ...companyPlan(company), until: company.planUntil ?? null, enforced: planLimitsEnforced() },
    wesetupConfigured,
    // Выполненное сотрудником уходит на проверку (shared/roles.ts).
    employeeApproval: parseAccessSettings(accessSettings).employeeApproval,
  };
}

/** Вход по email меньше 30 минут назад: PIN можно задать, не помня текущий. */
export const EMAIL_PIN_RESET_WINDOW_SEC = 30 * 60;
export function canResetPinByEmail(req: Request): boolean {
  const at = req.session?.emailAuthAt;
  return typeof at === "number" && nowSec() - at < EMAIL_PIN_RESET_WINDOW_SEC;
}

export async function getCompanyIdFromReq(req: Request): Promise<number | null> {
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
export const SENSITIVE_USER_KEYS = new Set([
  "passwordHash",
  "magicToken",
  "magicTokenExpiresAt",
  // Код привязки Telegram: с ним можно привязать свой Telegram к чужому
  // аккаунту. PIN и счётчики его проверки — тем более не для клиента.
  "tgLinkCode",
  "tgLinkCodeExpiresAt",
  "pinHash",
  "pinFailedAttempts",
  "pinLockedUntil",
]);

export function stripSensitive(value: any): any {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    // Строка пользователя: вместо хэша отдаём только факт «PIN задан» и
    // «вход заблокирован» — руководителю это нужно в списке сотрудников.
    if ("pinHash" in value) {
      out.hasPin = Boolean(value.pinHash);
      out.pinLocked = lockRemaining(value) > 0;
    }
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_USER_KEYS.has(k)) continue;
      out[k] = stripSensitive(v);
    }
    return out;
  }
  return value;
}
