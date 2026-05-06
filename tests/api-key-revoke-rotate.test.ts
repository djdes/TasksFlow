/**
 * Тесты DELETE /api/api-keys/:id (revoke) + POST /api/api-keys/:id/rotate.
 *
 * Critical security operations:
 *   • revoke — отзывает API ключ, integration перестаёт работать
 *     (предполагается compromise / migration)
 *   • rotate — atomically revoke старый + create новый с тем же
 *     name (zero-downtime ротация для production integrations)
 *
 * Auth-bug = посторонний может revoke'нуть чужие интеграции (DoS)
 * или rotate (новый plaintext не у legit owner'а).
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User, ApiKey } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getApiKeyById: vi.fn(),
  revokeApiKey: vi.fn(),
  createApiKey: vi.fn(),
  countActiveApiKeysByCompany: vi.fn(),
  listApiKeysByCompany: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));

async function buildApp(opts: { sessionUserId?: number } = {}) {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = opts.sessionUserId ? { userId: opts.sessionUserId } : {};
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return { app, server };
}

const ADMIN: User = {
  id: 10,
  phone: "+79990000010",
  name: "Admin",
  isAdmin: true,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

const WORKER: User = { ...ADMIN, id: 7, isAdmin: false };

const KEY_42: ApiKey = {
  id: 5,
  name: "WeSetup",
  keyHash: "hash",
  keyPrefix: "tfk_test_",
  companyId: 42,
  createdByUserId: 10,
  createdAt: 1,
  lastUsedAt: 0,
  revokedAt: 0,
} as ApiKey;

const KEY_FOREIGN: ApiKey = { ...KEY_42, id: 99, companyId: 999 };

const KEY_REVOKED: ApiKey = { ...KEY_42, revokedAt: 1700000000 };

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.revokeApiKey.mockResolvedValue(undefined);
  storage.createApiKey.mockResolvedValue({ ...KEY_42, id: 6 });
  storage.countActiveApiKeysByCompany.mockResolvedValue(5);
  storage.listApiKeysByCompany.mockResolvedValue([]);
});

describe("DELETE /api/api-keys/:id — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).delete(`/api/api-keys/5`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).delete(`/api/api-keys/5`);
    expect(r.status).toBe(403);
  });
});

describe("DELETE /api/api-keys/:id — validation", () => {
  it("invalid id (NaN) → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app).delete(`/api/api-keys/abc`);
    expect(r.status).toBe(400);
  });

  it("id ≤ 0 → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app).delete(`/api/api-keys/0`);
    expect(r.status).toBe(400);
  });
});

describe("DELETE /api/api-keys/:id — multi-tenant", () => {
  it("ключ другой компании → 404 (КРИТИЧНО)", async () => {
    // Защита: admin company A не должен мочь revoke'нуть ключ
    // company B (DoS-attack на чужую integration).
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(KEY_FOREIGN);

    const r = await request(app).delete(`/api/api-keys/${KEY_FOREIGN.id}`);
    expect(r.status).toBe(404);
    expect(storage.revokeApiKey).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/api-keys/:id — happy path", () => {
  it("active ключ → revoke вызвана", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(KEY_42);

    const r = await request(app).delete(`/api/api-keys/${KEY_42.id}`);
    expect(r.status).toBe(200);
    expect(storage.revokeApiKey).toHaveBeenCalledWith(KEY_42.id);
  });

  it("уже revoked ключ → 200 idempotent (already=true)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(KEY_REVOKED);

    const r = await request(app).delete(`/api/api-keys/${KEY_REVOKED.id}`);
    expect(r.status).toBe(200);
    expect(r.body.already).toBe(true);
    expect(storage.revokeApiKey).not.toHaveBeenCalled();
  });

  it("несуществующий id → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(undefined);

    const r = await request(app).delete(`/api/api-keys/999`);
    expect(r.status).toBe(404);
  });
});

describe("POST /api/api-keys/:id/rotate", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(`/api/api-keys/5/rotate`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).post(`/api/api-keys/5/rotate`);
    expect(r.status).toBe(403);
  });

  it("ключ другой компании → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(KEY_FOREIGN);
    const r = await request(app).post(`/api/api-keys/${KEY_FOREIGN.id}/rotate`);
    expect(r.status).toBe(404);
    expect(storage.revokeApiKey).not.toHaveBeenCalled();
    expect(storage.createApiKey).not.toHaveBeenCalled();
  });

  it("active ключ → revoke + create с тем же name", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(KEY_42);

    const r = await request(app).post(`/api/api-keys/${KEY_42.id}/rotate`);
    expect(r.status).toBe(200);
    expect(storage.revokeApiKey).toHaveBeenCalledWith(KEY_42.id);
    // Новый ключ создан с тем же name (zero-downtime ротация)
    expect(storage.createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ name: KEY_42.name, companyId: 42 }),
    );
    expect(r.body.secret).toMatch(/^tfk_/);
  });

  it("уже revoked ключ → НЕ revoke снова, но create нового (rotate-from-revoked)", async () => {
    // Рабочая ситуация: integration давно отозвана, теперь хотим
    // создать новый ключ с тем же name. Don't revoke twice.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(KEY_REVOKED);

    const r = await request(app).post(
      `/api/api-keys/${KEY_REVOKED.id}/rotate`,
    );
    expect(r.status).toBe(200);
    expect(storage.revokeApiKey).not.toHaveBeenCalled();
    expect(storage.createApiKey).toHaveBeenCalled();
  });

  it("invalid id (NaN) → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app).post(`/api/api-keys/abc/rotate`);
    expect(r.status).toBe(400);
  });

  it("response содержит rotatedFromId (старый ключ trace для UI)", async () => {
    // UI показывает «ключ #5 ротирован → новый ключ #6». rotatedFromId
    // позволяет связать listing-row с уведомлением «вы только что
    // перевыпустили этот ключ» (highlight в admin-panel).
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getApiKeyById.mockResolvedValue(KEY_42);

    const r = await request(app).post(`/api/api-keys/${KEY_42.id}/rotate`);
    expect(r.status).toBe(200);
    expect(r.body.rotatedFromId).toBe(KEY_42.id);
    expect(r.body.id).not.toBe(KEY_42.id); // новый ключ — другой id
  });

  it("encryption: REVEAL_SECRET задан → keyEncrypted сохраняется в новом ключе", async () => {
    const original = process.env.API_KEY_REVEAL_SECRET;
    process.env.API_KEY_REVEAL_SECRET = "rotate-test-secret-1234567890-abc";
    try {
      const { app } = await buildApp({ sessionUserId: ADMIN.id });
      storage.getUserById.mockResolvedValue(ADMIN);
      storage.getApiKeyById.mockResolvedValue(KEY_42);

      await request(app).post(`/api/api-keys/${KEY_42.id}/rotate`);

      const callArg = storage.createApiKey.mock.calls[0][0];
      expect(callArg.keyEncrypted).toBeTruthy();
      expect(String(callArg.keyEncrypted).split(".")).toHaveLength(3);
    } finally {
      if (original === undefined) delete process.env.API_KEY_REVEAL_SECRET;
      else process.env.API_KEY_REVEAL_SECRET = original;
    }
  });
});
