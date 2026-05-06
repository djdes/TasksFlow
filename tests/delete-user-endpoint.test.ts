/**
 * Тесты DELETE /api/users/:id (admin removes worker).
 *
 * Multiple safeguards which BREAK ON ALL OF THEM = серьёзный security
 * incident:
 *   • Нельзя удалить самого себя (self-suicide защита)
 *   • Нельзя удалить admin'а (защита от downgrade-attack админа,
 *     hostile co-admin не может удалить дружественного admin'а)
 *   • Multi-tenant scope (admin company A не может удалить worker
 *     company B)
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

const FOREIGN_WORKER: User = {
  ...WORKER,
  id: 99,
  companyId: 999,
};

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.deleteUser.mockResolvedValue(undefined);
});

describe("DELETE /api/users/:id — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).delete(`/api/users/${WORKER.id}`);
    expect(r.status).toBe(401);
    expect(storage.deleteUser).not.toHaveBeenCalled();
  });

  it("non-admin session → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).delete(`/api/users/${WORKER.id}`);
    expect(r.status).toBe(403);
  });
});

describe("DELETE /api/users/:id — anti-suicide", () => {
  it("admin пытается удалить самого себя → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app).delete(`/api/users/${ADMIN.id}`);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/самого себя/i);
    expect(storage.deleteUser).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/users/:id — admin protection", () => {
  it("admin пытается удалить ДРУГОГО admin → 400", async () => {
    // Защита от hostile co-admin: один админ не должен мочь удалить
    // другого. Если действительно нужно — через demote (PUT) сначала.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === SECOND_ADMIN.id) return SECOND_ADMIN;
      return undefined;
    });

    const r = await request(app).delete(`/api/users/${SECOND_ADMIN.id}`);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/администратора/i);
    expect(storage.deleteUser).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/users/:id — multi-tenant scope", () => {
  it("admin company A пытается удалить worker company B → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === FOREIGN_WORKER.id) return FOREIGN_WORKER;
      return undefined;
    });

    const r = await request(app).delete(`/api/users/${FOREIGN_WORKER.id}`);
    expect(r.status).toBe(404);
    expect(storage.deleteUser).not.toHaveBeenCalled();
  });

  it("legacy admin без companyId — может удалить любого (platform-level)", async () => {
    const LEGACY_ADMIN: User = { ...ADMIN, companyId: null };
    const { app } = await buildApp({ sessionUserId: LEGACY_ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === LEGACY_ADMIN.id) return LEGACY_ADMIN;
      if (id === FOREIGN_WORKER.id) return FOREIGN_WORKER;
      return undefined;
    });

    const r = await request(app).delete(`/api/users/${FOREIGN_WORKER.id}`);
    expect(r.status).toBe(200);
    expect(storage.deleteUser).toHaveBeenCalledWith(FOREIGN_WORKER.id);
  });
});

describe("DELETE /api/users/:id — happy path", () => {
  it("admin → свой worker той же компании → success", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === WORKER.id) return WORKER;
      return undefined;
    });

    const r = await request(app).delete(`/api/users/${WORKER.id}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(storage.deleteUser).toHaveBeenCalledWith(WORKER.id);
  });

  it("несуществующий userId → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });

    const r = await request(app).delete(`/api/users/99999`);
    expect(r.status).toBe(404);
    expect(storage.deleteUser).not.toHaveBeenCalled();
  });
});
