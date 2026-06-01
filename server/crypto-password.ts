/**
 * Парольная криптография для email-авторизации (лендинг).
 *
 * Телефонный вход в TasksFlow беспарольный, но новая email-ветка
 * (как в ordersflow) требует пароля: при авторегистрации мы генерим
 * пароль, хэшируем scrypt'ом и кладём в users.password_hash, а сам
 * пароль отправляем письмом через PHP-реле.
 *
 * Формат хранения: `scrypt$<logN>$<saltHex>$<hashHex>`. Совместим с
 * подходом ordersflow (scrypt + timingSafeEqual), без внешних зависимостей.
 */
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const LOG_N = 14; // N = 2^14 = 16384 — баланс «безопасно/быстро» для веб-входа
const KEYLEN = 64;
const SALTLEN = 16;

/** Хэширует пароль в формат `scrypt$14$salt$hash`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALTLEN);
  const hash = scryptSync(password, salt, KEYLEN, { N: 2 ** LOG_N });
  return `scrypt$${LOG_N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Проверяет пароль против хранимого хэша. timingSafeEqual против тайминг-атак. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [scheme, logNStr, saltHex, hashHex] = parts;
  if (scheme !== "scrypt") return false;
  const logN = Number(logNStr);
  if (!Number.isInteger(logN) || logN < 1 || logN > 20) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, { N: 2 ** logN });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Алфавит без визуально неоднозначных символов (0/O/1/l/I) — пароль из
// письма пользователь иногда вводит руками, не путаем «ноль» и «O».
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Генерит читаемый пароль заданной длины (по умолчанию 12). */
export function generatePassword(len = 12): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Magic-токен для одноразовой ссылки входа (32 hex-символа = 16 байт). */
export function generateMagicToken(): string {
  return randomBytes(16).toString("hex");
}
