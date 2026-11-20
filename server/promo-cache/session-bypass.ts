/**
 * Обход MySQL-хранилища сессий (таблица `sessions`) на публичных промо-страницах
 * и stateless-проверка подписи cookie `connect.sid`.
 *
 * Зачем:
 *   1. Глобальный `express-session` с `rolling: true` иначе на каждый заход
 *      авторизованного пользователя на `/`, `/blog/*`, `/llms.txt` или `/api/banners`
 *      делал `SELECT` + `UPDATE` в таблицу `sessions`.
 *   2. Публичная шапка `<Nav />` раньше на каждом открытии страницы била в
 *      `GET /api/auth/me` (`SELECT` из `sessions` и `users`). Теперь наличие
 *      валидно подписанной cookie проверяется по HMAC-SHA256 прямо в SSR (0 SQL,
 *      0 лишних запросов из браузера, без мигания кнопки «Войти» → «Открыть кабинет»).
 */
import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { statelessSession } from "../api-key-session";
import { isPublicPath } from "../../client/src/public/router";
import { resolveMarkdownTwinPath } from "./markdown";

export interface PromoSessionRequest extends Request {
  hasSignedSession?: boolean;
}

const STATIC_PROMO_PATHS = new Set([
  "/llms.txt",
  "/llms-full.txt",
  "/sitemap.xml",
  "/robots.txt",
  "/api/banners",
  "/api/app/info",
]);

export function isStatelessPromoRequest(req: Pick<Request, "method" | "path">): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const p = req.path || "/";
  if (STATIC_PROMO_PATHS.has(p)) return true;
  if (p.startsWith("/og/") || p.startsWith("/downloads/") || p.startsWith("/.well-known/")) {
    return true;
  }
  if (isPublicPath(p)) return true;
  if (p.endsWith(".md") && resolveMarkdownTwinPath(p) !== null) return true;
  return false;
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key !== name) continue;
    const rawVal = part.slice(eqIdx + 1).trim();
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return null;
}

/**
 * Проверяет подпись cookie `connect.sid` (`s:<sid>.<base64_hmac_sha256>`)
 * тем же алгоритмом, что и `cookie-signature` в `express-session`, без обращения к БД.
 */
export function verifySignedSessionCookie(
  cookieHeader: string | undefined,
  secret: string,
  cookieName = "connect.sid",
): boolean {
  if (!secret) return false;
  const decoded = parseCookieValue(cookieHeader, cookieName);
  if (!decoded || !decoded.startsWith("s:")) return false;
  const raw = decoded.slice(2);
  const dotIdx = raw.lastIndexOf(".");
  if (dotIdx <= 0) return false;

  const sid = raw.slice(0, dotIdx);
  const providedSig = raw.slice(dotIdx + 1);
  if (!sid || !providedSig) return false;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(sid)
    .digest("base64")
    .replace(/=+$/, "");

  const a = Buffer.from(providedSig, "utf-8");
  const b = Buffer.from(expectedSig, "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createPublicPromoSessionBypass(secret: string) {
  return function publicPromoWithoutSession(req: Request, _res: Response, next: NextFunction): void {
    if (!isStatelessPromoRequest(req)) {
      next();
      return;
    }
    (req as PromoSessionRequest).hasSignedSession = verifySignedSessionCookie(
      req.headers.cookie,
      secret,
    );
    (req as unknown as { session: unknown }).session = statelessSession();
    next();
  };
}
