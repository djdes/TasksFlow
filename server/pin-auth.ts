/**
 * Вход по PIN: проверка, ступенчатая блокировка, уведомления.
 *
 * 4 цифры — это 10 000 вариантов, поэтому защищает не длина, а блокировка:
 * каждые 5 неверных попыток подряд закрывают вход — на 15 минут, потом на
 * час, потом на сутки. Перебор становится непрактичным, а владелец аккаунта
 * узнаёт о попытках в Telegram (если привязал бота). Руководитель снимает
 * блокировку, задав новый PIN.
 */
import type { User } from "@shared/schema";
import { hashPassword, verifyPassword } from "./crypto-password";
import { getTelegramRuntime } from "./telegram";
import { storage } from "./storage";
import { logger } from "./logger";

// Пороги блокировки (5 попыток → 15 мин, 10 → 1 ч, 15 и дальше → 24 ч)
// живут в одном месте — SQL storage.reservePinAttempt, где они атомарны.
export const PIN_ATTEMPTS_PER_LOCK = 5;

/** Сколько попыток осталось до следующей блокировки. */
export function attemptsLeft(failures: number): number {
  return PIN_ATTEMPTS_PER_LOCK - (failures % PIN_ATTEMPTS_PER_LOCK);
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Секунд до конца блокировки или 0. */
export function lockRemaining(user: Pick<User, "pinLockedUntil">, now = nowSec()): number {
  const until = user.pinLockedUntil ?? 0;
  return until > now ? until - now : 0;
}

export function hashPin(pin: string): string {
  return hashPassword(pin);
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  return verifyPassword(pin, stored);
}

/** «15 минут», «1 час», «24 часа» — для сообщений о блокировке. */
export function formatLock(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} ч`;
}

/**
 * Сообщение владельцу аккаунта в Telegram. Тихо пропускается, если бот не
 * запущен или человек его не привязал: вход не должен зависеть от бота.
 */
export async function notifyPinEvent(user: Pick<User, "id" | "tgChatId" | "tgStartedAt">, text: string): Promise<void> {
  const runtime = getTelegramRuntime();
  if (!runtime || !user.tgChatId || !user.tgStartedAt) return;
  try {
    await runtime.client.sendMessage({ chat_id: user.tgChatId, text });
  } catch (err) {
    logger.warn({ userId: user.id, err: err instanceof Error ? err.message : String(err) }, "[pin] telegram notify failed");
  }
}

export type PinCheck =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 429;
      body: { message: string; field: "pin"; attemptsLeft?: number; retryAfterSec?: number };
    };

export function lockedResult(seconds: number, wrongNow: boolean): PinCheck & { ok: false } {
  return {
    ok: false,
    status: 429,
    body: {
      message: wrongNow
        ? `Неверный PIN. Вход заблокирован на ${formatLock(seconds)}.`
        : `Вход заблокирован на ${formatLock(seconds)} после неверных PIN. Руководитель может задать новый PIN.`,
      field: "pin",
      retryAfterSec: seconds,
    },
  };
}

/**
 * Проверка PIN с учётом блокировки. Попытка резервируется до проверки
 * (см. storage.reservePinAttempt), верный PIN обнуляет счётчик.
 */
export async function checkPin(user: User, pin: string): Promise<PinCheck> {
  const now = nowSec();
  const reserved = await storage.reservePinAttempt(user.id, now);
  if (!reserved) {
    const fresh = await storage.getUserById(user.id);
    return lockedResult(lockRemaining(fresh ?? user, now) || 60, false);
  }
  if (verifyPin(pin, user.pinHash)) {
    await storage.resetPinFailures(user.id);
    return { ok: true };
  }
  const lockSec = reserved.lockedUntil && reserved.lockedUntil > now ? reserved.lockedUntil - now : 0;
  if (lockSec) {
    void notifyPinEvent(
      user,
      `Вход в TasksFlow заблокирован на ${formatLock(lockSec)}: ${PIN_ATTEMPTS_PER_LOCK} раз подряд ввели неверный PIN. Если это были не вы, сообщите руководителю.`,
    );
    return lockedResult(lockSec, true);
  }
  return {
    ok: false,
    status: 401,
    body: { message: "Неверный PIN", field: "pin", attemptsLeft: attemptsLeft(reserved.attempts) },
  };
}
