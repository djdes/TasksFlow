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
