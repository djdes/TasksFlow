import type { NextFunction, Request, Response, Express } from "express";
import type { User } from "@shared/schema";
import { api } from "@shared/routes";
import { canGrantRole, canManageUser, parseManagedIds, PERMISSION_KEYS, type AccessRole, type UserAccess } from "@shared/roles";
import { accessOf, roleOf } from "./access";
import { storage } from "./storage";
import { extractBearerKey } from "./api-keys";
import { recordAudit } from "./audit-log";

/** Просмотр не даёт руководителю чужую компанию или более широкие права. */
export async function canImpersonate(actor: User, target: User, resolved?: { access: UserAccess; role: AccessRole | null }): Promise<boolean> {
  if (!actor.companyId || actor.companyId !== target.companyId || actor.id === target.id || target.isRoot) return false;
  const access = resolved?.access ?? await accessOf(actor);
  if (access.isAdmin) return true;
  if (target.isAdmin) return false;
  const role = resolved ? resolved.role : await roleOf(target);
  const ownRole = role?.companyId === target.companyId ? role : null;
  if (canManageUser(access, target, ownRole) && canGrantRole(access, ownRole)) return true;
  // WeSetup: только свои обычные сотрудники, без расширенных прав и своих людей.
  return !!parseManagedIds(actor.managedWorkerIds)?.includes(target.id)
    && parseManagedIds(target.managedWorkerIds) === null
    && !PERMISSION_KEYS.some((key) => ownRole?.permissions[key]);
}

const readOnlyMessage = "Вы смотрите кабинет сотрудника. Для изменений вернитесь в свой аккаунт.";

/** До всех API-маршрутов: права отзываются сразу, записи и повторный вход закрыты. */
export async function guardImpersonation(req: Request, res: Response, next: NextFunction) {
  if (!/^\/api(?:\/|$)/i.test(req.path)) return next();
  const actorId = req.session?.impersonatorId;
  if (!actorId) return next();
  res.setHeader("Cache-Control", "private, no-store");
  const path = req.path.toLowerCase().replace(/\/+$/, "");
  if (req.method === "POST" && (path === api.auth.stopImpersonating.path || path === api.auth.logout.path)) return next();
  try {
    const [actor, target] = await Promise.all([
      storage.getUserById(actorId),
      storage.getUserById(req.session.userId!),
    ]);
    if (!actor || !target || !(await canImpersonate(actor, target))) {
      // /auth/me сохраняет плашку возврата даже после отзыва права на просмотр.
      if (req.method === "GET" && path === api.auth.me.path) {
        return res.json({ id: req.session.userId, isAdmin: false, impersonation: { actorId, readOnly: true, unavailable: true } });
      }
      return res.status(403).json({ message: "Просмотр больше недоступен. Вернитесь в свой аккаунт." });
    }
    const read = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
    // Magic-link — тоже GET, но меняет аккаунт и сессию.
    if (!read || (path.startsWith("/api/auth/") && path !== api.auth.me.path)
      || path === "/api/wesetup/task-fill-url") {
      return res.status(403).json({ message: readOnlyMessage });
    }
    next();
  } catch (error) {
    next(error);
  }
}

async function switchSession(req: Request, userId: number, impersonatorId?: number) {
  await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = userId;
  req.session.impersonatorId = impersonatorId;
  // Недавний email-вход владельца не даёт сотруднику сбросить PIN.
  await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

export function registerImpersonationRoutes(app: Express) {
  app.post(api.auth.impersonate.path, async (req, res, next) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      if (extractBearerKey(req)) return res.status(403).json({ message: "Вход доступен только из кабинета" });
      if (!req.session.userId) return res.status(401).json({ message: "Требуется авторизация" });
      if (req.session.impersonatorId) return res.status(403).json({ message: readOnlyMessage });
      const input = api.auth.impersonate.input.safeParse(req.body);
      if (!input.success) return res.status(400).json({ message: "Выберите сотрудника" });
      const [actor, target] = await Promise.all([
        storage.getUserById(req.session.userId), storage.getUserById(input.data.userId),
      ]);
      if (!actor) return res.status(401).json({ message: "Требуется авторизация" });
      if (!target || !actor.companyId || target.companyId !== actor.companyId) return res.status(404).json({ message: "Сотрудник не найден" });
      if (!(await canImpersonate(actor, target))) return res.status(403).json({ message: "Просмотр этого аккаунта недоступен" });
      await switchSession(req, target.id, actor.id);
      await recordAudit({ companyId: actor.companyId, actorWorkerId: actor.id, taskId: null, action: "auth.impersonation_started", payload: { userId: target.id } });
      res.json({ success: true });
    } catch (error) { next(error); }
  });

  app.post(api.auth.stopImpersonating.path, async (req, res, next) => {
    try {
      if (extractBearerKey(req)) return res.status(403).json({ message: "Возврат доступен только из кабинета" });
      const actorId = req.session.impersonatorId;
      if (!actorId) return res.status(400).json({ message: "Вы уже в своём аккаунте" });
      const actor = await storage.getUserById(actorId);
      if (!actor) {
        await new Promise<void>((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
        return res.status(401).json({ message: "Аккаунт больше недоступен. Войдите заново." });
      }
      const targetId = req.session.userId;
      await switchSession(req, actor.id);
      await recordAudit({ companyId: actor.companyId, actorWorkerId: actor.id, taskId: null, action: "auth.impersonation_stopped", payload: { userId: targetId } });
      res.json({ success: true });
    } catch (error) { next(error); }
  });
}
