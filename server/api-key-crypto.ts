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
 * sha256(secret). В качестве secret предпочитаем API_KEY_REVEAL_SECRET,
 * а если его нет — берём SESSION_SECRET (он всегда задан в проде, иначе
 * sessions ломаются). Это как fallback INTEGRATION_KEY_SECRET →
 * NEXTAUTH_SECRET в WeSetup: «Показать ключ» работает out-of-the-box,
 * без отдельной env-настройки. Минимум 16 символов — иначе шифрование
 * выключено (вернётся к старому поведению «plaintext одноразово»).
 *
 * SECURITY: см. shared/schema.ts комментарий к keyEncrypted. Если
 * SESSION_SECRET ротируется, encrypted ключи становятся нечитаемы —
 * используем «Перевыпустить» для миграции.
 */
function resolveRevealSecret(): string | null {
	const candidates = [
		process.env.API_KEY_REVEAL_SECRET,
		process.env.SESSION_SECRET,
	];
	for (const s of candidates) {
		if (s && s.length >= 16) return s;
	}
	return null;
}

function getRevealKey(): Buffer {
	const secret = resolveRevealSecret();
	if (!secret) {
		throw new Error(
			"Ни API_KEY_REVEAL_SECRET, ни SESSION_SECRET (≥16 символов) не заданы — шифрование API ключей невозможно",
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

/** Доступно ли шифрование (есть подходящий secret) — для UI feature-flag. */
export function isApiKeyRevealEnabled(): boolean {
	return resolveRevealSecret() !== null;
}
