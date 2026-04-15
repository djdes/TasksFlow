/**
 * Тесты для API key helpers (server/api-keys.ts).
 * Чистые unit-тесты — без БД, чтобы запускались в любой среде.
 */

import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, extractBearerKey } from "../server/api-key-crypto";

describe("generateApiKey", () => {
	it("возвращает строку с префиксом tfk_", () => {
		const k = generateApiKey();
		expect(k.startsWith("tfk_")).toBe(true);
	});

	it("возвращает строку длины >= 40", () => {
		const k = generateApiKey();
		expect(k.length).toBeGreaterThanOrEqual(40);
	});

	it("каждый вызов возвращает уникальный ключ", () => {
		const a = generateApiKey();
		const b = generateApiKey();
		const c = generateApiKey();
		expect(a).not.toBe(b);
		expect(b).not.toBe(c);
		expect(a).not.toBe(c);
	});

	it("содержит только URL-safe base64 символы после префикса", () => {
		const k = generateApiKey();
		const body = k.slice(4);
		expect(/^[A-Za-z0-9_-]+$/.test(body)).toBe(true);
	});
});

describe("hashApiKey", () => {
	it("детерминирован — одна и та же входная строка даёт одинаковый хэш", () => {
		const k = "tfk_test123";
		expect(hashApiKey(k)).toBe(hashApiKey(k));
	});

	it("возвращает 64-символьную hex-строку", () => {
		const h = hashApiKey("tfk_anything");
		expect(h.length).toBe(64);
		expect(/^[0-9a-f]+$/.test(h)).toBe(true);
	});

	it("разные входы дают разные хэши", () => {
		expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
		expect(hashApiKey("tfk_xxx")).not.toBe(hashApiKey("tfk_yyy"));
	});

	it("известный SHA-256 hash для известного входа", () => {
		// echo -n "test" | sha256sum
		expect(hashApiKey("test")).toBe(
			"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
		);
	});
});

describe("extractBearerKey", () => {
	it("парсит валидный header с tfk_ префиксом", () => {
		const req: any = { headers: { authorization: "Bearer tfk_validKey123" } };
		expect(extractBearerKey(req)).toBe("tfk_validKey123");
	});

	it("работает с base64url-символами", () => {
		const req: any = { headers: { authorization: "Bearer tfk_abc-DEF_xyz_123" } };
		expect(extractBearerKey(req)).toBe("tfk_abc-DEF_xyz_123");
	});

	it("возвращает null если header отсутствует", () => {
		expect(extractBearerKey({ headers: {} } as any)).toBe(null);
	});

	it("возвращает null если authorization не Bearer", () => {
		const req: any = { headers: { authorization: "Basic xxx" } };
		expect(extractBearerKey(req)).toBe(null);
	});

	it("возвращает null если ключ без префикса tfk_", () => {
		const req: any = { headers: { authorization: "Bearer wrongprefix123" } };
		expect(extractBearerKey(req)).toBe(null);
	});

	it("возвращает null если authorization пустой", () => {
		const req: any = { headers: { authorization: "" } };
		expect(extractBearerKey(req)).toBe(null);
	});
});
