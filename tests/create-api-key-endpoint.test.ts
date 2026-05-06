/**
 * Тесты POST /api/api-keys (admin creates new API key).
 *
 * Был БЕЗ тестов. api-keys.test.ts покрывает только helpers
 * (generateApiKey, hashApiKey), но не endpoint.
 *
 * Critical: API key даёт machine-доступ ко всем company-данным.
 * Ошибка в auth = posторонний может создавать ключи и сливать
 * данные клиентов.
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
  countActiveApiKeysByCompany: vi.fn(),
  createApiKey: vi.fn(),
  getCompanyById: vi.fn(),
  updateCompanyWesetupBridge: vi.fn(),
  getApiKeyById: vi.fn(),
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

const WORKER: User = {
  ...ADMIN,
  id: 7,
  isAdmin: false,
};

const CREATED_KEY: ApiKey = {
  id: 1,
  name: "WeSetup",
  keyHash: "hash",
  keyPrefix: "tfk_test_",
  companyId: 42,
  createdByUserId: 10,
  createdAt: 1,
  lastUsedAt: 0,
  revokedAt: 0,
} as ApiKey;

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.countActiveApiKeysByCompany.mockResolvedValue(5);
  storage.createApiKey.mockResolvedValue(CREATED_KEY);
  storage.listApiKeysByCompany.mockResolvedValue([]);
});

describe("POST /api/api-keys — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: "Test" });
    expect(r.status).toBe(401);
    expect(storage.createApiKey).not.toHaveBeenCalled();
  });

  it("non-admin session → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: "Test" });
    expect(r.status).toBe(403);
    expect(storage.createApiKey).not.toHaveBeenCalled();
  });
});

describe("POST /api/api-keys — name validation", () => {
  it("без name → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app).post("/api/api-keys").send({});
    expect(r.status).toBe(400);
    expect(storage.createApiKey).not.toHaveBeenCalled();
  });

  it("name='' (пустая) → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: "" });
    expect(r.status).toBe(400);
  });

  it("name='   ' (только пробелы) → 400 после trim", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: "   " });
    expect(r.status).toBe(400);
  });

  it("name >100 символов → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: "x".repeat(101) });
    expect(r.status).toBe(400);
  });

  it("name=number → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: 42 });
    expect(r.status).toBe(400);
  });
});

describe("POST /api/api-keys — limits", () => {
  it("активных ключей ≥ 50 → 400 (anti-DoS)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.countActiveApiKeysByCompany.mockResolvedValue(50);
    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: "Test" });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/лимит/i);
    expect(storage.createApiKey).not.toHaveBeenCalled();
  });

  it("активных = 49 → success (граница)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.countActiveApiKeysByCompany.mockResolvedValue(49);
    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: "Test" });
    expect(r.status).toBe(200);
    expect(storage.createApiKey).toHaveBeenCalled();
  });
});

describe("POST /api/api-keys — happy path", () => {
  it("admin → создаёт ключ + возвращает plaintext", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: "WeSetup integration" });

    expect(r.status).toBe(200);
    // Plaintext возвращается ТОЛЬКО на create — backend хранит hash.
    // Без plaintext юзер не сможет настроить integration.
    expect(r.body.secret).toMatch(/^tfk_/);
    expect(storage.createApiKey).toHaveBeenCalledTimes(1);
    const callArg = storage.createApiKey.mock.calls[0][0];
    expect(callArg.name).toBe("WeSetup integration");
    expect(callArg.companyId).toBe(ADMIN.companyId);
    expect(callArg.createdByUserId).toBe(ADMIN.id);
  });

  it("name trim'ится перед сохранением", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    await request(app)
      .post("/api/api-keys")
      .send({ name: "  WeSetup  " });

    expect(storage.createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ name: "WeSetup" }),
    );
  });

  it("keyHash ≠ plaintext (hash используется в storage)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app)
      .post("/api/api-keys")
      .send({ name: "Test" });

    const callArg = storage.createApiKey.mock.calls[0][0];
    expect(callArg.keyHash).not.toContain("tfk_"); // hash не содержит plaintext
    expect(r.body.secret.startsWith("tfk_")).toBe(true);
  });
});
