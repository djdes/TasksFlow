import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { generateApiKey, hashApiKey, extractBearerKey } from "./api-key-crypto";

export { generateApiKey, hashApiKey, extractBearerKey };

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
	const now = Math.floor(Date.now() / 1000);
	storage.updateApiKeyLastUsed(record.id, now).catch(err => {
		console.error("[api-key] last_used update failed", err);
	});
	next();
}
