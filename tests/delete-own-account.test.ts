/**
 * Тесты DELETE /api/auth/me (delete own account).
 *
 * Critical safeguard: единственный admin компании НЕ может удалить
 * себя — иначе компания останется без admin'а, никто не сможет
 * управлять задачами/пользователями. Это unrecoverable state без
 * platform-уровневого вмешательства.
 *
 * Endpoint был БЕЗ тестов до этого коммита.
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
  getAllUsers: vi.fn(),
  deleteUser: vi.fn(),
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
    req.session = opts.sessionUserId
      ? { userId: opts.sessionUserId, destroy: (cb: () => void) => cb() }
      : { destroy: (cb: () => void) => cb() };
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return { app, server };
}

const SOLE_ADMIN: User = {
  id: 10,
  phone: "+79990000010",
  name: "Sole Admin",
  isAdmin: true,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

const SECOND_ADMIN: User = {
  id: 11,
  phone: "+79990000011",
  name: "Second Admin",
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
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.deleteUser.mockResolvedValue(undefined);
});

describe("DELETE /api/auth/me — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).delete("/api/auth/me");
    expect(r.status).toBe(401);
  });
});

describe("DELETE /api/auth/me — sole admin protection", () => {
  it("единственный admin → 400, deleteUser НЕ вызвана", async () => {
    // КРИТИЧНО: иначе компания остаётся orphan без admin'а.
    const { app } = await buildApp({ sessionUserId: SOLE_ADMIN.id });
    storage.getUserById.mockResolvedValue(SOLE_ADMIN);
    storage.getAllUsers.mockResolvedValue([SOLE_ADMIN, WORKER]);

    const r = await request(app).delete("/api/auth/me");
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/единственный администратор/i);
    expect(storage.deleteUser).not.toHaveBeenCalled();
  });

  it("один из НЕСКОЛЬКИХ admin'ов → success", async () => {
    const { app } = await buildApp({ sessionUserId: SOLE_ADMIN.id });
    storage.getUserById.mockResolvedValue(SOLE_ADMIN);
    storage.getAllUsers.mockResolvedValue([SOLE_ADMIN, SECOND_ADMIN, WORKER]);

    const r = await request(app).delete("/api/auth/me");
    expect(r.status).toBe(200);
    expect(storage.deleteUser).toHaveBeenCalledWith(SOLE_ADMIN.id);
  });
});

describe("DELETE /api/auth/me — worker без admin-проверки", () => {
  it("worker (не admin) → success без проверки orphan'а", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    // getAllUsers НЕ должен вызываться для не-admin'а

    const r = await request(app).delete("/api/auth/me");
    expect(r.status).toBe(200);
    expect(storage.deleteUser).toHaveBeenCalledWith(WORKER.id);
    expect(storage.getAllUsers).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/auth/me — edge cases", () => {
  it("admin без companyId (legacy/platform) → success без orphan-проверки", async () => {
    // Если companyId=null, нет компании за которую отвечать. Удаление
    // не оставит orphan'а.
    const PLATFORM_ADMIN: User = { ...SOLE_ADMIN, companyId: null };
    const { app } = await buildApp({ sessionUserId: PLATFORM_ADMIN.id });
    storage.getUserById.mockResolvedValue(PLATFORM_ADMIN);

    const r = await request(app).delete("/api/auth/me");
    expect(r.status).toBe(200);
    expect(storage.deleteUser).toHaveBeenCalledWith(PLATFORM_ADMIN.id);
  });

  it("user не найден в storage → 404", async () => {
    const { app } = await buildApp({ sessionUserId: 99 });
    storage.getUserById.mockResolvedValue(undefined);

    const r = await request(app).delete("/api/auth/me");
    expect(r.status).toBe(404);
    expect(storage.deleteUser).not.toHaveBeenCalled();
  });
});
