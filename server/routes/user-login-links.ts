import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { accessOf, roleOf } from "../access";
import { getPublicTasksflowBaseUrl } from "../public-urls";
import { recordAudit } from "../audit-log";
import { requireAuth } from "./common";
import {
  canIssueLoginLink,
  USER_LOGIN_PAGE,
  USER_LOGIN_PATH,
  userLoginTokenSchema,
  type UserLoginLink,
} from "@shared/user-login-link";

const INVALID = "QR-код больше не действует. Попросите у руководителя новый или войдите по телефону и PIN.";

/**
 * Личный QR входа сотрудника. Выдаёт и отключает тот, кто вправе менять
 * этого человека (canIssueLoginLink); вход по QR — без телефона и PIN.
 */
export function registerUserLoginLinkRoutes(app: Express): void {
  const linkUrl = (req: Request, token: string) => `${getPublicTasksflowBaseUrl(req)}${USER_LOGIN_PAGE}/${token}`;

  /** Кто просит и про кого: null — ответ уже отправлен. */
  const resolve = async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (req.session.impersonatorId) {
      res.status(403).json({ message: "В режиме просмотра QR-код не выдаётся" });
      return null;
    }
    const [actor, target] = await Promise.all([
      storage.getUserById(req.session.userId!),
      storage.getUserById(Number(req.params.id)),
    ]);
    if (!actor) {
      res.status(401).json({ message: "Требуется авторизация" });
      return null;
    }
    if (!target || target.companyId !== actor.companyId) {
      res.status(404).json({ message: "Сотрудник не найден" });
      return null;
    }
    const access = await accessOf(actor);
    const role = await roleOf(target);
    if (!canIssueLoginLink(access, target, role?.companyId === target.companyId ? role : null, actor.companyId)) {
      res.status(403).json({ message: target.isAdmin ? "QR-вход для администратора не выдаётся" : "Нет прав выдавать QR-вход этому сотруднику" });
      return null;
    }
    return { actor, target };
  };

  app.get(`/api/users/:id/login-link`, requireAuth, async (req, res) => {
    try {
      const who = await resolve(req, res);
      if (!who) return;
      const link = await storage.getUserLoginLink(who.target.id);
      const body: UserLoginLink = { url: link ? linkUrl(req, link.token) : null, createdAt: link?.createdAt ?? null };
      res.json(body);
    } catch {
      res.status(500).json({ message: "Не удалось загрузить QR-код. Повторите попытку." });
    }
  });

  // Создать или заменить: { renew: true } делает новый, старый перестаёт работать.
  app.post(`/api/users/:id/login-link`, requireAuth, async (req, res) => {
    try {
      const who = await resolve(req, res);
      if (!who) return;
      const existing = await storage.getUserLoginLink(who.target.id);
      const renew = req.body?.renew === true;
      if (!existing || renew) {
        await storage.setUserLoginLink(who.target.id, randomBytes(32).toString("hex"), who.actor.id);
        await recordAudit({
          companyId: who.actor.companyId, actorWorkerId: who.actor.id, taskId: null,
          action: existing ? "user.login_link_renewed" : "user.login_link_created", payload: { userId: who.target.id },
        });
      }
      const link = await storage.getUserLoginLink(who.target.id);
      const body: UserLoginLink = { url: link ? linkUrl(req, link.token) : null, createdAt: link?.createdAt ?? null };
      res.json(body);
    } catch {
      res.status(500).json({ message: "Не удалось сделать QR-код. Повторите попытку." });
    }
  });

  app.delete(`/api/users/:id/login-link`, requireAuth, async (req, res) => {
    try {
      const who = await resolve(req, res);
      if (!who) return;
      await storage.deleteUserLoginLink(who.target.id);
      await recordAudit({
        companyId: who.actor.companyId, actorWorkerId: who.actor.id, taskId: null,
        action: "user.login_link_revoked", payload: { userId: who.target.id },
      });
      const body: UserLoginLink = { url: null, createdAt: null };
      res.json(body);
    } catch {
      res.status(500).json({ message: "Не удалось отключить QR-код. Повторите попытку." });
    }
  });

  const loginLimiter = rateLimit({
    windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { message: "Слишком много попыток. Повторите через минуту." },
  });

  // Вход по QR. POST, а не GET: превью ссылок в мессенджерах не должно входить.
  app.post(`${USER_LOGIN_PATH}/:token`, loginLimiter, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const token = userLoginTokenSchema.safeParse(req.params.token);
      const userId = token.success ? await storage.getUserIdByLoginLinkToken(token.data) : undefined;
      const user = userId ? await storage.getUserById(userId) : undefined;
      // Пока QR лежал, человека могли сделать администратором — такой вход закрыт.
      if (!user || user.isAdmin || user.isRoot || !user.companyId) return res.status(404).json({ message: INVALID });
      // Новая сессия: на общем планшете прежний аккаунт и просмотр от чужого имени не остаются.
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ message: "Не удалось войти. Повторите попытку." });
        req.session.userId = user.id;
        req.session.save((saveError) => {
          if (saveError) return res.status(500).json({ message: "Не удалось сохранить вход. Повторите попытку." });
          void recordAudit({ companyId: user.companyId, actorWorkerId: user.id, taskId: null, action: "auth.login_link_used", payload: { userId: user.id } }).catch(() => {});
          res.json({ success: true, name: user.name?.trim() || null });
        });
      });
    } catch {
      res.status(500).json({ message: "Не удалось войти. Повторите попытку." });
    }
  });
}
