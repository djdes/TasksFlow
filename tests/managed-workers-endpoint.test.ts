/**
 * Тесты PUT /api/admin/users/:id/managed-workers.
 *
 * API-key-only endpoint для WeSetup ↔ TasksFlow sync иерархии воркеров.
 * Сессионные админы намеренно не пускаются (иерархия живёт в WeSetup).
 *
 * Содержит:
 *   • Auth: только API key
 *   • Multi-tenant scope (API key одной компании не должен трогать
 *     юзеров другой)
 *   • Type filtering на workerIds
 *   • Cross-company filtering — workerIds фильтруются по той же
 *     компании что target user
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { hashApiKey } from "../server/api-key-crypto";
import type { ApiKey, User, Worker } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getWorkers: vi.fn(),
  setManagedWorkers: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));

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

const TARGET: User = {
  id: 50,
  phone: "+79990000050",
  name: "Manager",
  isAdmin: true,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: "Управляющий",
};

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

const apiKey = "tfk_test_managed_42";
const VALID_API_KEY: ApiKey = {
  id: 1,
  name: "WeSetup",
  keyHash: hashApiKey(apiKey),
  keyPrefix: apiKey.slice(0, 12),
  companyId: 42,
  createdByUserId: 1,
  createdAt: 1,
  lastUsedAt: 0,
  revokedAt: 0,
} as ApiKey;

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.setManagedWorkers.mockResolvedValue(TARGET);
});

describe("PUT /api/admin/users/:id/managed-workers — auth", () => {
  it("без API-key (только session admin) → 401", async () => {
    // Намеренно не пускаем session-юзеров. Иерархия живёт в WeSetup,
    // sync-only через API key.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app)
      .put(`/api/admin/users/${TARGET.id}/managed-workers`)
      .send({ workerIds: [1, 2, 3] });

    expect(r.status).toBe(401);
    expect(storage.setManagedWorkers).not.toHaveBeenCalled();
  });

  it("API-key чужой компании → 404", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue({
      ...VALID_API_KEY,
      companyId: 999,
    });
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserById.mockResolvedValue(TARGET);

    const r = await request(app)
      .put(`/api/admin/users/${TARGET.id}/managed-workers`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ workerIds: [] });

    expect(r.status).toBe(404);
    expect(storage.setManagedWorkers).not.toHaveBeenCalled();
  });

  it("API-key своей компании, target из той же → 200", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserById.mockResolvedValue(TARGET);
    storage.getWorkers.mockResolvedValue([
      { id: 1, name: "W1", companyId: 42 } as Worker,
      { id: 2, name: "W2", companyId: 42 } as Worker,
    ]);

    const r = await request(app)
      .put(`/api/admin/users/${TARGET.id}/managed-workers`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ workerIds: [1, 2] });

    expect(r.status).toBe(200);
    expect(storage.setManagedWorkers).toHaveBeenCalledWith(TARGET.id, [1, 2]);
  });
});

describe("PUT /api/admin/users/:id/managed-workers — input validation", () => {
  it("workerIds не массив → 400", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserById.mockResolvedValue(TARGET);

    const r = await request(app)
      .put(`/api/admin/users/${TARGET.id}/managed-workers`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ workerIds: "not array" });

    expect(r.status).toBe(400);
  });

  it("invalid userId (NaN) → 400", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);

    const r = await request(app)
      .put("/api/admin/users/abc/managed-workers")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ workerIds: [] });

    expect(r.status).toBe(400);
  });

  it("негативный userId → 400", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);

    const r = await request(app)
      .put("/api/admin/users/-1/managed-workers")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ workerIds: [] });

    expect(r.status).toBe(400);
  });

  it("несуществующий target → 404", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserById.mockResolvedValue(undefined);

    const r = await request(app)
      .put("/api/admin/users/9999/managed-workers")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ workerIds: [] });

    expect(r.status).toBe(404);
  });
});

describe("PUT /api/admin/users/:id/managed-workers — type filtering", () => {
  it("string IDs отфильтровываются (typeof number filter)", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserById.mockResolvedValue(TARGET);
    storage.getWorkers.mockResolvedValue([]);

    await request(app)
      .put(`/api/admin/users/${TARGET.id}/managed-workers`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ workerIds: ["1", "2", 3] });

    expect(storage.setManagedWorkers).toHaveBeenCalledWith(TARGET.id, []);
  });

  it("негативные числа отфильтровываются (n > 0 filter)", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserById.mockResolvedValue(TARGET);
    storage.getWorkers.mockResolvedValue([
      { id: 1, name: "W1", companyId: 42 } as Worker,
    ]);

    await request(app)
      .put(`/api/admin/users/${TARGET.id}/managed-workers`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ workerIds: [-1, 0, 1] });

    expect(storage.setManagedWorkers).toHaveBeenCalledWith(TARGET.id, [1]);
  });
});

describe("PUT /api/admin/users/:id/managed-workers — cross-company filter", () => {
  it("workerIds чужой компании отфильтровываются (тихо)", async () => {
    // Защита: API key одной компании не должен дать сделать managed
    // ссылку на worker'а другой компании. WeSetup может ошибиться,
    // но мы не пишем мусор в БД.
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserById.mockResolvedValue(TARGET);
    // company 42 has only worker 1; worker 99 это другой company
    storage.getWorkers.mockResolvedValue([
      { id: 1, name: "W1", companyId: 42 } as Worker,
    ]);

    await request(app)
      .put(`/api/admin/users/${TARGET.id}/managed-workers`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ workerIds: [1, 99] }); // 99 — чужой

    // Мусорный workerId 99 отбрасывается тихо
    expect(storage.setManagedWorkers).toHaveBeenCalledWith(TARGET.id, [1]);
  });
});
