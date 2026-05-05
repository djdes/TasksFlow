/**
 * Тесты middleware requireApiKey.
 *
 * Critical auth path для всех API-key endpoints. Если middleware
 * сломается:
 *   • Любая mutation через API key упадёт (WeSetup integration сдохнет)
 *   • ИЛИ хуже: пропустит invalid key → unauthorized access
 *
 * Существующий tests/api-keys.test.ts покрывает только helpers
 * (generateApiKey, hashApiKey, extractBearerKey), не сам middleware.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import { hashApiKey } from "../server/api-key-crypto";
import type { ApiKey } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../server/storage", () => ({ storage }));

const { requireApiKey } = await import("../server/api-keys");

const apiKey = "tfk_test_middleware_42";
const VALID_RECORD: ApiKey = {
  id: 5,
  name: "WeSetup",
  keyHash: hashApiKey(apiKey),
  keyPrefix: apiKey.slice(0, 12),
  companyId: 42,
  createdByUserId: 1,
  createdAt: 1,
  lastUsedAt: 0,
  revokedAt: 0,
} as ApiKey;

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res as Response & {
    statusCode: number;
    body: unknown;
  };
}

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
});

describe("requireApiKey — bearer extraction", () => {
  it("без Authorization header → 401 «API key отсутствует»", async () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ message: "API key отсутствует" });
    expect(next).not.toHaveBeenCalled();
  });

  it("Authorization без Bearer prefix → 401", async () => {
    const req = makeReq({ authorization: apiKey });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("Authorization Basic вместо Bearer → 401", async () => {
    const req = makeReq({ authorization: `Basic ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("Bearer с не-tfk-форматом → 401 (regex /^Bearer\\s+(tfk_...)$/)", async () => {
    const req = makeReq({ authorization: "Bearer not_a_tfk_key" });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
  });
});

describe("requireApiKey — DB lookup", () => {
  it("не найден в БД → 401 «Неверный API key»", async () => {
    storage.getApiKeyByHash.mockResolvedValue(undefined);
    const req = makeReq({ authorization: `Bearer ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ message: "Неверный API key" });
    expect(next).not.toHaveBeenCalled();
  });

  it("revokedAt > 0 → 401 «API key отозван»", async () => {
    storage.getApiKeyByHash.mockResolvedValue({
      ...VALID_RECORD,
      revokedAt: 1000,
    });
    const req = makeReq({ authorization: `Bearer ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ message: "API key отозван" });
    expect(next).not.toHaveBeenCalled();
  });

  it("revokedAt = 0 → пропускает (active key)", async () => {
    storage.getApiKeyByHash.mockResolvedValue({
      ...VALID_RECORD,
      revokedAt: 0,
    });
    const req = makeReq({ authorization: `Bearer ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("revokedAt = null → пропускает", async () => {
    storage.getApiKeyByHash.mockResolvedValue({
      ...VALID_RECORD,
      revokedAt: null,
    });
    const req = makeReq({ authorization: `Bearer ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("requireApiKey — req.apiKey context attachment", () => {
  it("успех → req.apiKey содержит id/companyId/createdByUserId", async () => {
    storage.getApiKeyByHash.mockResolvedValue(VALID_RECORD);
    const req = makeReq({ authorization: `Bearer ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.apiKey).toEqual({
      id: 5,
      companyId: 42,
      createdByUserId: 1,
    });
  });

  it("updateApiKeyLastUsed вызван fire-and-forget (не блокирует next)", async () => {
    storage.getApiKeyByHash.mockResolvedValue(VALID_RECORD);
    const req = makeReq({ authorization: `Bearer ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(storage.updateApiKeyLastUsed).toHaveBeenCalledWith(
      5,
      expect.any(Number),
    );
    expect(next).toHaveBeenCalled(); // next вызван НЕ после await на updateLastUsed
  });

  it("updateApiKeyLastUsed может бросить — middleware не падает", async () => {
    storage.getApiKeyByHash.mockResolvedValue(VALID_RECORD);
    storage.updateApiKeyLastUsed.mockRejectedValue(new Error("DB down"));
    const req = makeReq({ authorization: `Bearer ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    // Не должно бросать unhandled rejection
    await requireApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("requireApiKey — case-sensitive Bearer", () => {
  it("Bearer (правильный case) → работает", async () => {
    storage.getApiKeyByHash.mockResolvedValue(VALID_RECORD);
    const req = makeReq({ authorization: `Bearer ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  // Note: extractBearerKey regex /^Bearer\s+(tfk_...)$/ — case-sensitive.
  // bearer (lowercase) НЕ матчит, что соответствует HTTP RFC.
  it("bearer (lowercase) → 401", async () => {
    const req = makeReq({ authorization: `bearer ${apiKey}` });
    const res = makeRes();
    const next = vi.fn();

    await requireApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
  });
});
