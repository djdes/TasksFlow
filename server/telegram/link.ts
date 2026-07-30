/**
 * Привязка Telegram-аккаунта к сотруднику через Telegram Login Widget.
 *
 * Алгоритм проверки — из документации Telegram:
 *   data_check_string = отсортированные по ключу `key=value`, склеенные \n
 *   secret            = sha256(botToken)
 *   ожидаемый hash    = HMAC-SHA256(secret, data_check_string) в hex
 *
 * Три вещи, которые нельзя упрощать:
 *   • сравнение хэшей — timingSafeEqual, иначе утечка по времени;
 *   • свежесть auth_date — иначе перехваченный payload работает вечно;
 *   • UNIQUE на telegram_user_id в БД — иначе один Telegram привяжется
 *     к двум сотрудникам, и непонятно, от чьего имени бот ставит задачи.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { storage } from "../storage";
import type { User } from "@shared/schema";

/** Максимальный возраст auth_date — 24 часа, как рекомендует Telegram. */
const MAX_AUTH_AGE_SEC = 24 * 60 * 60;
/** Допуск на рассинхрон часов: payload «из будущего» дальше этого — отказ. */
const MAX_CLOCK_SKEW_SEC = 300;

export const telegramLoginPayloadSchema = z.object({
  id: z.coerce.number().int().positive(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.coerce.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/i, "invalid hash"),
});

export type TelegramLoginPayload = z.infer<typeof telegramLoginPayloadSchema>;

export type TelegramLinkErrorCode =
  | "invalid_hash"
  | "auth_expired"
  | "tg_already_linked";

export class TelegramLinkError extends Error {
  readonly code: TelegramLinkErrorCode;
  readonly status: number;

  constructor(code: TelegramLinkErrorCode, status: number, message: string) {
    super(message);
    this.name = "TelegramLinkError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Проверка подписи. Обрати внимание: в data_check_string попадают уже
 * приведённые zod'ом значения — id и auth_date как числа превращаются
 * обратно в те же строки, что прислал Telegram, поэтому подпись сходится.
 */
export function verifyTelegramLoginHash(
  payload: TelegramLoginPayload,
  botToken: string,
): void {
  const { hash, ...rest } = payload;
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${(rest as Record<string, unknown>)[k]}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  // Разная длина — гарантированный mismatch, и timingSafeEqual на буферах
  // разной длины бросает исключение, поэтому проверяем заранее.
  if (hash.length !== expected.length) {
    throw new TelegramLinkError("invalid_hash", 400, "Подпись Telegram неверна");
  }
  const ok = timingSafeEqual(
    Buffer.from(hash.toLowerCase(), "hex"),
    Buffer.from(expected, "hex"),
  );
  if (!ok) {
    throw new TelegramLinkError("invalid_hash", 400, "Подпись Telegram неверна");
  }
}

export function verifyTelegramAuthFreshness(
  authDateSec: number,
  nowMs: number = Date.now(),
): void {
  const ageSec = nowMs / 1000 - authDateSec;
  if (ageSec > MAX_AUTH_AGE_SEC || ageSec < -MAX_CLOCK_SKEW_SEC) {
    throw new TelegramLinkError(
      "auth_expired",
      400,
      "Данные Telegram устарели — нажмите «Привязать» ещё раз",
    );
  }
}

/**
 * Полный флоу привязки: подпись → свежесть → уникальность → запись.
 * Порядок важен: не проверяем БД, пока подпись не подтверждена, иначе
 * по разнице ответов можно перебирать, какие telegram_user_id заняты.
 */
export async function connectTelegramAccount(params: {
  userId: number;
  payload: TelegramLoginPayload;
  botToken: string;
}): Promise<User | undefined> {
  const { userId, payload, botToken } = params;

  verifyTelegramLoginHash(payload, botToken);
  verifyTelegramAuthFreshness(payload.auth_date);

  const existing = await storage.findUserByTelegramUserId(payload.id);
  if (existing && existing.id !== userId) {
    throw new TelegramLinkError(
      "tg_already_linked",
      409,
      "Этот Telegram уже привязан к другому аккаунту",
    );
  }

  return storage.saveTelegramLink(userId, {
    telegramUserId: payload.id,
    telegramUsername: payload.username ?? null,
    telegramFirstName: payload.first_name ?? null,
    telegramPhotoUrl: payload.photo_url ?? null,
  });
}

export function isTelegramLinkError(err: unknown): err is TelegramLinkError {
  return err instanceof TelegramLinkError;
}

// ===== Привязка через бота одноразовым кодом =====
//
// Основной путь, потому что Login Widget требует сразу трёх условий:
// домен прописан в BotFather, telegram.org доступен из браузера и попап
// не заблокирован. Код-ссылка не требует ничего — открывается сам бот.

/** 10 минут: успеть открыть бота, но не оставлять код валидным надолго. */
const LINK_CODE_TTL_SEC = 10 * 60;

/** Код в ссылке t.me/bot?start=<code> — только [A-Za-z0-9_-], до 64 символов. */
export function generateLinkCode(): string {
  return randomBytes(12).toString("hex");
}

export async function issueTelegramLinkCode(userId: number): Promise<{
  code: string;
  expiresAt: number;
}> {
  const code = generateLinkCode();
  const expiresAt = Math.floor(Date.now() / 1000) + LINK_CODE_TTL_SEC;
  await storage.setTelegramLinkCode(userId, code, expiresAt);
  return { code, expiresAt };
}

export type LinkByCodeResult =
  | { ok: true; user: User }
  | { ok: false; reason: "unknown_code" | "already_linked_other" };

/**
 * Привязка по коду из /start. Код одноразовый: гасим его сразу, чтобы
 * пересланная кому-то ссылка не привязала чужой Telegram к аккаунту.
 */
export async function linkTelegramByCode(params: {
  code: string;
  telegramUserId: number;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  chatId: number;
}): Promise<LinkByCodeResult> {
  const owner = await storage.findUserByTelegramLinkCode(params.code);
  if (!owner) return { ok: false, reason: "unknown_code" };

  const existing = await storage.findUserByTelegramUserId(params.telegramUserId);
  if (existing && existing.id !== owner.id) {
    return { ok: false, reason: "already_linked_other" };
  }

  await storage.saveTelegramLink(owner.id, {
    telegramUserId: params.telegramUserId,
    telegramUsername: params.telegramUsername ?? null,
    telegramFirstName: params.telegramFirstName ?? null,
  });
  // Код сгорел — повторное использование ссылки ничего не даст.
  await storage.setTelegramLinkCode(owner.id, "", 0);
  await storage.markTelegramStarted(owner.id, params.chatId);

  const fresh = await storage.getUserById(owner.id);
  return { ok: true, user: fresh ?? owner };
}
