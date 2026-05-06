/**
 * Тесты GET-endpoints: /api/api-keys, /api/companies/me, /api/workers.
 *
 * Не были покрыты — listApiKeysByCompany sanitization особенно
 * security-критичен:
 *   • keyHash и keyEncrypted в отдаваемом JSON быть не должны
 *   • revealable=true только когда (revealEnabled && keyEncrypted)
 *
 * Регрессия в sanitization = leak hash'а или encrypted-ключа админу
 * UI'а; даже свой админ видеть hash не должен (чтобы не утекало в
 * скриншоты / clipboard).
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiKey, Company, User, Worker } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getCompanyById: vi.fn(),
  listApiKeysByCompany: vi.fn(),
  getWorkers: vi.fn(),
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

const WORKER_USER: User = { ...ADMIN, id: 7, isAdmin: false };

const COMPANY: Company = {
  id: 42,
  name: "ООО Ромашка",
  email: "owner@romashka.ru",
  createdAt: 1,
  wesetupBaseUrl: null,
  wesetupApiKey: null,
};

const ORIGINAL_REVEAL = process.env.API_KEY_REVEAL_SECRET;
const ORIGINAL_SESSION = process.env.SESSION_SECRET;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_REVEAL === undefined) delete process.env.API_KEY_REVEAL_SECRET;
  else process.env.API_KEY_REVEAL_SECRET = ORIGINAL_REVEAL;
  if (ORIGINAL_SESSION === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL_SESSION;
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  process.env.API_KEY_REVEAL_SECRET = "test-secret-1234567890-abcdef";
  delete process.env.SESSION_SECRET;
});

// ─── GET /api/api-keys ───────────────────────────────────────────────

describe("GET /api/api-keys — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/api-keys`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER_USER.id });
    storage.getUserById.mockResolvedValue(WORKER_USER);
    const r = await request(app).get(`/api/api-keys`);
    expect(r.status).toBe(403);
  });
});

describe("GET /api/api-keys — sanitization (SECURITY)", () => {
  it("keyHash и keyEncrypted НЕ должны быть в response", async () => {
    // КРИТИЧНО: эти поля не должны утекать в UI. Регрессия = leak
    // в скриншоты, clipboard, browser history.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.listApiKeysByCompany.mockResolvedValue([
      {
        id: 1,
        name: "WeSetup",
        keyHash: "DEADBEEF" + "0".repeat(56),
        keyPrefix: "tfk_test_",
        keyEncrypted: "iv.tag.ct",
        companyId: 42,
        createdByUserId: 10,
        createdAt: 1700000000,
        lastUsedAt: 1700000100,
        revokedAt: 0,
      } as ApiKey,
    ]);

    const r = await request(app).get(`/api/api-keys`);
    expect(r.status).toBe(200);
    const item = r.body[0];
    expect(item.keyHash).toBeUndefined();
    expect(item.keyEncrypted).toBeUndefined();
    expect(item.id).toBe(1);
    expect(item.keyPrefix).toBe("tfk_test_");
  });

  it("revealable=true для key с keyEncrypted при включённом feature", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.listApiKeysByCompany.mockResolvedValue([
      {
        id: 1,
        name: "K",
        keyHash: "h",
        keyPrefix: "tfk_test_",
        keyEncrypted: "ok",
        companyId: 42,
        createdByUserId: 10,
        createdAt: 1,
        lastUsedAt: 0,
        revokedAt: 0,
      } as ApiKey,
    ]);

    const r = await request(app).get(`/api/api-keys`);
    expect(r.body[0].revealable).toBe(true);
  });

  it("revealable=false для legacy key (keyEncrypted=null)", async () => {
    // Pre-migration: ключи без keyEncrypted нельзя реверсировать.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.listApiKeysByCompany.mockResolvedValue([
      {
        id: 1,
        name: "K",
        keyHash: "h",
        keyPrefix: "tfk_test_",
        keyEncrypted: null,
        companyId: 42,
        createdByUserId: 10,
        createdAt: 1,
        lastUsedAt: 0,
        revokedAt: 0,
      } as ApiKey,
    ]);

    const r = await request(app).get(`/api/api-keys`);
    expect(r.body[0].revealable).toBe(false);
  });

  it("revealable=false когда reveal-feature off (no env)", async () => {
    delete process.env.API_KEY_REVEAL_SECRET;
    delete process.env.SESSION_SECRET;
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.listApiKeysByCompany.mockResolvedValue([
      {
        id: 1,
        name: "K",
        keyHash: "h",
        keyPrefix: "tfk_test_",
        keyEncrypted: "ok",
        companyId: 42,
        createdByUserId: 10,
        createdAt: 1,
        lastUsedAt: 0,
        revokedAt: 0,
      } as ApiKey,
    ]);

    const r = await request(app).get(`/api/api-keys`);
    expect(r.body[0].revealable).toBe(false);
  });

  it("multi-tenant scope: listApiKeysByCompany вызвана с companyId admin'а", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.listApiKeysByCompany.mockResolvedValue([]);

    await request(app).get(`/api/api-keys`);
    expect(storage.listApiKeysByCompany).toHaveBeenCalledWith(42);
  });
});

// ─── GET /api/companies/me ───────────────────────────────────────────

describe("GET /api/companies/me", () => {
  it("без session/key → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/companies/me`);
    expect(r.status).toBe(401);
  });

  it("session-user без companyId → null", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue({
      ...ADMIN,
      companyId: null as any,
    } as User);

    const r = await request(app).get(`/api/companies/me`);
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
  });

  it("happy path → company объект", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(COMPANY);

    const r = await request(app).get(`/api/companies/me`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(42);
    expect(r.body.name).toBe(COMPANY.name);
  });

  it("companyId есть, но getCompanyById вернул undefined → null (graceful)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getCompanyById.mockResolvedValue(undefined);

    const r = await request(app).get(`/api/companies/me`);
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
  });
});

// ─── GET /api/workers ────────────────────────────────────────────────

describe("GET /api/workers", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/workers`);
    expect(r.status).toBe(401);
  });

  it("happy path → list workers", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getWorkers.mockResolvedValue([
      { id: 1, name: "Иван", companyId: 42 } as Worker,
      { id: 2, name: "Пётр", companyId: 42 } as Worker,
    ]);

    const r = await request(app).get(`/api/workers`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
  });
});
