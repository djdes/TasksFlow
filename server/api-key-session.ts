/**
 * API-ключ = права администратора своей компании, как в кабинете.
 *
 * Запрос с `Authorization: Bearer tfk_…` идёт без cookie-сессии: заглушка
 * ставится ДО express-session, и тот такой запрос пропускает — ничего не
 * пишет в таблицу sessions и не ставит cookie. На маршрутах кабинета
 * (`requireAuth`, `requireAdmin` и т.д. в server/routes.ts) ключ действует
 * от имени своего создателя, пока тот админ компании ключа.
 *
 * Через ключ закрыто: вход и личный аккаунт, устройства и Telegram,
 * сами ключи, оплата и root — это остаётся только в кабинете.
 */

import type { NextFunction, Request, Response } from "express";
import { extractBearerKey } from "./api-key-crypto";

const KEY_DENIED = [
  "/api/auth", // вход, выход, свой профиль и удаление аккаунта
  "/api/quick-login/by-token", // вход по QR — только cookie-сессия
  "/api/user-login", // личный QR входа — только cookie-сессия
  "/api/account", // свои email, пароль, уведомления
  "/api/me", // свой Telegram
  "/api/push", // подписки устройства
  "/api/events", // живые обновления вкладки
  "/api/api-keys", // ключ не выпускает и не показывает другие ключи
  "/api/billing", // оплата и возвраты
  "/api/root", // владелец сайта
  "/api/admin/banners", // владелец сайта
];

export function isDeniedForApiKey(path: string): boolean {
  return KEY_DENIED.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

const STATELESS = Symbol("stateless-session");

/** Сессия-заглушка: живёт один запрос, ничего не сохраняет. */
function statelessSession(): Record<string | symbol, unknown> {
  const session: Record<string | symbol, unknown> = { [STATELESS]: true };
  const done = (cb?: (err?: unknown) => void) => {
    cb?.();
    return session;
  };
  Object.assign(session, {
    regenerate: done,
    destroy: done,
    save: done,
    reload: done,
    touch: () => session,
    resetMaxAge: () => session,
  });
  return session;
}

export function isStatelessSession(session: unknown): boolean {
  return Boolean(session && (session as Record<symbol, unknown>)[STATELESS]);
}

/** Ставится до express-session (server/index.ts). */
export function apiKeyWithoutSession(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/") || !extractBearerKey(req)) return next();
  if (isDeniedForApiKey(req.path)) {
    return res.status(403).json({ message: "Через API-ключ это недоступно — только в кабинете" });
  }
  (req as unknown as { session: unknown }).session = statelessSession();
  next();
}
