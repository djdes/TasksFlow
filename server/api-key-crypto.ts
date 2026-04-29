import type { Request } from "express";
import crypto from "crypto";

/** Генерирует новый API ключ: префикс «tfk_» + 32 случайных байта в base64url. */
export function generateApiKey(): string {
	const raw = crypto.randomBytes(32).toString("base64url");
	return `tfk_${raw}`;
}

/** SHA-256 hex (64 символа). */
export function hashApiKey(plaintext: string): string {
	return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/** Извлекает plaintext из заголовка Authorization, или null. */
export function extractBearerKey(req: Request): string | null {
	const h = (req.headers.authorization || "") as string;
	const m = /^Bearer\s+(tfk_[A-Za-z0-9_-]+)$/.exec(h);
	return m ? m[1] : null;
}

/**
 * AES-256-GCM шифрование plaintext API-ключа для хранения в БД.
 * Формат: `iv(base64).tag(base64).ciphertext(base64)`. Ключ AES =
 * sha256(API_KEY_REVEAL_SECRET). Если env не задан — бросаем, чтобы
 * нельзя было случайно зашифровать с дефолтом и потом не расшифровать.
 *
 * SECURITY: см. shared/schema.ts комментарий к keyEncrypted.
 */
function getRevealKey(): Buffer {
	const secret = process.env.API_KEY_REVEAL_SECRET;
	if (!secret || secret.length < 16) {
		throw new Error(
			"API_KEY_REVEAL_SECRET env var обязателен (минимум 16 символов) для шифрования API ключей",
		);
	}
	return crypto.createHash("sha256").update(secret).digest();
}

export function encryptApiKey(plaintext: string): string {
	const key = getRevealKey();
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptApiKey(encrypted: string): string {
	const parts = encrypted.split(".");
	if (parts.length !== 3) {
		throw new Error("malformed encrypted key");
	}
	const [ivB64, tagB64, ctB64] = parts;
	const key = getRevealKey();
	const iv = Buffer.from(ivB64, "base64");
	const tag = Buffer.from(tagB64, "base64");
	const ciphertext = Buffer.from(ctB64, "base64");
	const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return plaintext.toString("utf8");
}

/** Доступно ли шифрование (env задан) — для UI feature-flag. */
export function isApiKeyRevealEnabled(): boolean {
	const secret = process.env.API_KEY_REVEAL_SECRET;
	return Boolean(secret && secret.length >= 16);
}
