/**
 * Тесты POST /api/users/:id/reset-balance.
 *
 * Critical admin operation: «выплачены зарплата, обнуляем балансы».
 * Ошибка в auth/scope = админ компании A может обнулить баланс
 * воркера компании B → потерянная премия = реальные деньги для
 * сотрудника.
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  resetUserBalance: vi.fn(),
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
  id: 7,
  phone: "+79990000007",
  name: "Worker",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 5000,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

const FOREIGN_WORKER: User = {
  id: 99,
  phone: "+79990000099",
  name: "Foreign",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 5000,
  companyId: 999, // другая компания
  managedWorkerIds: null,
  position: null,
};

const RESET_RESULT: User = { ...WORKER, bonusBalance: 0 };

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.resetUserBalance.mockResolvedValue(RESET_RESULT);
});

describe("POST /api/users/:id/reset-balance — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(`/api/users/${WORKER.id}/reset-balance`);
    expect(r.status).toBe(401);
    expect(storage.resetUserBalance).not.toHaveBeenCalled();
  });

  it("session-юзер не admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).post(`/api/users/${WORKER.id}/reset-balance`);
    expect(r.status).toBe(403);
    expect(storage.resetUserBalance).not.toHaveBeenCalled();
  });
});

describe("POST /api/users/:id/reset-balance — multi-tenant scope", () => {
  it("admin company A → reset воркера company B → 404", async () => {
    // КРИТИЧНО: admin компании A не должен ресетить баланс чужого
    // воркера. Иначе hostile admin может обнулять чужие премии.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === FOREIGN_WORKER.id) return FOREIGN_WORKER;
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });

    const r = await request(app).post(
      `/api/users/${FOREIGN_WORKER.id}/reset-balance`,
    );
    expect(r.status).toBe(404);
    expect(storage.resetUserBalance).not.toHaveBeenCalled();
  });

  it("admin → свой воркер из той же компании → success", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === WORKER.id) return WORKER;
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });

    const r = await request(app).post(`/api/users/${WORKER.id}/reset-balance`);
    expect(r.status).toBe(200);
    expect(storage.resetUserBalance).toHaveBeenCalledWith(WORKER.id);
    expect(r.body.bonusBalance).toBe(0);
  });
});

describe("POST /api/users/:id/reset-balance — not found", () => {
  it("несуществующий userId → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });

    const r = await request(app).post(`/api/users/99999/reset-balance`);
    expect(r.status).toBe(404);
    expect(storage.resetUserBalance).not.toHaveBeenCalled();
  });

  it("resetUserBalance возвращает undefined → 404", async () => {
    // Race: пользователь удалён между getUserById и resetUserBalance.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === WORKER.id) return WORKER;
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });
    storage.resetUserBalance.mockResolvedValue(undefined);

    const r = await request(app).post(`/api/users/${WORKER.id}/reset-balance`);
    expect(r.status).toBe(404);
  });
});

describe("POST /api/users/:id/reset-balance — happy path", () => {
  it("успех → возвращает обновлённого user с balance=0", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === WORKER.id) return WORKER;
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });

    const r = await request(app).post(`/api/users/${WORKER.id}/reset-balance`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(WORKER.id);
    expect(r.body.bonusBalance).toBe(0);
  });

  it("invalid userId (NaN) → 404 или 403 (auth-middleware first)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });

    const r = await request(app).post(`/api/users/abc/reset-balance`);
    // Number("abc") = NaN, getUserById(NaN) → undefined → 404.
    // Если admin-check не пройдёт по какой-то причине — 403, тоже OK.
    expect([403, 404]).toContain(r.status);
  });
});
