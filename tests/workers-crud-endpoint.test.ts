/**
 * Тесты POST /api/workers + PUT/DELETE /api/workers/:id.
 *
 * Workers — справочник «человек, на которого можно назначить задачу».
 * Они отдельно от users (users логинятся, workers — справочник имён).
 * Phase: после миграции на User=Worker pivot, workers таблица всё ещё
 * существует для legacy задач без linked-user.
 *
 * Critical:
 *   • Admin-only (requireAdmin)
 *   • Multi-tenant scope: PUT/DELETE на чужого worker'а → 404
 *   • DELETE: 204 на несуществующего (idempotent)
 *   • POST: companyId автоматически из current user'а
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User, Worker } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getWorker: vi.fn(),
  createWorker: vi.fn(),
  updateWorker: vi.fn(),
  deleteWorker: vi.fn(),
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

const WORKER_42: Worker = {
  id: 5,
  name: "Иван",
  companyId: 42,
} as Worker;

const WORKER_FOREIGN: Worker = { ...WORKER_42, id: 99, companyId: 999 };

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.createWorker.mockImplementation(async (input: any) => ({
    id: 5,
    ...input,
  }));
  storage.updateWorker.mockImplementation(async (id: number, patch: any) => ({
    ...WORKER_42,
    id,
    ...patch,
  }));
  storage.deleteWorker.mockResolvedValue(undefined);
});

// ─── POST /api/workers ───────────────────────────────────────────────

describe("POST /api/workers — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(`/api/workers`).send({ name: "X" });
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER_USER.id });
    storage.getUserById.mockResolvedValue(WORKER_USER);
    const r = await request(app).post(`/api/workers`).send({ name: "X" });
    expect(r.status).toBe(403);
  });
});

describe("POST /api/workers — happy path", () => {
  it("admin → 201, companyId из admin'а проброшен в createWorker", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app).post(`/api/workers`).send({ name: "Иван" });
    expect(r.status).toBe(201);
    expect(storage.createWorker).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Иван", companyId: 42 }),
    );
  });
});

describe("POST /api/workers — validation", () => {
  it("без name → 400 Zod", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app).post(`/api/workers`).send({});
    expect(r.status).toBe(400);
    expect(storage.createWorker).not.toHaveBeenCalled();
  });

  it("name не строка → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app).post(`/api/workers`).send({ name: 42 });
    expect(r.status).toBe(400);
  });
});

// ─── PUT /api/workers/:id ────────────────────────────────────────────

describe("PUT /api/workers/:id — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).put(`/api/workers/5`).send({ name: "Y" });
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER_USER.id });
    storage.getUserById.mockResolvedValue(WORKER_USER);
    const r = await request(app).put(`/api/workers/5`).send({ name: "Y" });
    expect(r.status).toBe(403);
  });
});

describe("PUT /api/workers/:id — happy path и multi-tenant", () => {
  it("admin своей компании → 200", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getWorker.mockResolvedValue(WORKER_42);

    const r = await request(app).put(`/api/workers/5`).send({ name: "Renamed" });
    expect(r.status).toBe(200);
    expect(storage.updateWorker).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ name: "Renamed" }),
    );
  });

  it("чужая компания → 404 (multi-tenant защита)", async () => {
    // КРИТИЧНО: admin company A не должен мочь переименовать
    // worker'а company B.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getWorker.mockResolvedValue(WORKER_FOREIGN);

    const r = await request(app)
      .put(`/api/workers/${WORKER_FOREIGN.id}`)
      .send({ name: "Hijack" });
    expect(r.status).toBe(404);
    expect(storage.updateWorker).not.toHaveBeenCalled();
  });

  it("несуществующий → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getWorker.mockResolvedValue(undefined);

    const r = await request(app).put(`/api/workers/999`).send({ name: "Y" });
    expect(r.status).toBe(404);
    expect(storage.updateWorker).not.toHaveBeenCalled();
  });
});

describe("PUT /api/workers/:id — validation", () => {
  it("без name → 400 Zod", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app).put(`/api/workers/5`).send({});
    expect(r.status).toBe(400);
  });
});

// ─── DELETE /api/workers/:id ─────────────────────────────────────────

describe("DELETE /api/workers/:id — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).delete(`/api/workers/5`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER_USER.id });
    storage.getUserById.mockResolvedValue(WORKER_USER);
    const r = await request(app).delete(`/api/workers/5`);
    expect(r.status).toBe(403);
  });
});

describe("DELETE /api/workers/:id — happy path и multi-tenant", () => {
  it("admin своей компании → 204", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getWorker.mockResolvedValue(WORKER_42);

    const r = await request(app).delete(`/api/workers/5`);
    expect(r.status).toBe(204);
    expect(storage.deleteWorker).toHaveBeenCalledWith(5);
  });

  it("несуществующий → 204 idempotent", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getWorker.mockResolvedValue(undefined);

    const r = await request(app).delete(`/api/workers/999`);
    expect(r.status).toBe(204);
    expect(storage.deleteWorker).not.toHaveBeenCalled();
  });

  it("чужая компания → 404 (multi-tenant защита)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getWorker.mockResolvedValue(WORKER_FOREIGN);

    const r = await request(app).delete(`/api/workers/${WORKER_FOREIGN.id}`);
    expect(r.status).toBe(404);
    expect(storage.deleteWorker).not.toHaveBeenCalled();
  });
});
