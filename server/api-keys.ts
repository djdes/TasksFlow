import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { storage } from "./storage";

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

export interface ApiKeyContext {
	id: number;
	companyId: number;
	createdByUserId: number;
}

declare global {
	namespace Express {
		interface Request {
			apiKey?: ApiKeyContext;
		}
	}
}

/** Аутентификация ТОЛЬКО через API key. 401 если невалидно. */
export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
	const plaintext = extractBearerKey(req);
	if (!plaintext) {
		res.status(401).json({ message: "API key отсутствует" });
		return;
	}
	const hash = hashApiKey(plaintext);
	const record = await storage.getApiKeyByHash(hash);
	const prefix = plaintext.slice(0, 12);
	if (!record) {
		console.warn(`[api-key] failed: not found prefix=${prefix}`);
		res.status(401).json({ message: "Неверный API key" });
		return;
	}
	if (record.revokedAt && record.revokedAt > 0) {
		console.warn(`[api-key] failed: revoked id=${record.id} prefix=${prefix}`);
		res.status(401).json({ message: "API key отозван" });
		return;
	}
	req.apiKey = { id: record.id, companyId: record.companyId, createdByUserId: record.createdByUserId };
	// fire-and-forget last_used update
	const now = Math.floor(Date.now() / 1000);
	storage.updateApiKeyLastUsed(record.id, now).catch(err => {
		console.error("[api-key] last_used update failed", err);
	});
	next();
}
