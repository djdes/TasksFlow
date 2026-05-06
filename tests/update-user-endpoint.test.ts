/**
 * Тесты PUT /api/users/:id — admin update user.
 *
 * Critical security:
 *   • Admin-only (requireAdmin)
 *   • Multi-tenant scope: 404 на пользователя чужой компании, не 403
 *     — иначе утечка существования (admin company A узнаёт «есть user
 *     id=N в company B»)
 *   • Phone uniqueness: phone не должен пересекаться с другим user'ом
 *   • Phone normalization: пробелы/дефисы strip, чтобы phone-uniqueness
 *     сравнение работало корректно
 *
 * История: endpoint обновляет phone+name+position, но НЕ роли/баланс.
 * Demote/promote — через POST /api/users (idempotent re-create).
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
  getUserByPhone: vi.fn(),
  updateUser: vi.fn(),
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

const TARGET: User = {
  id: 7,
  phone: "+79990000007",
  name: "Worker",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: "Курьер",
};

const TARGET_FOREIGN: User = { ...TARGET, id: 999, companyId: 9999 };
const NON_ADMIN: User = { ...ADMIN, id: 5, isAdmin: false };

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.updateUser.mockImplementation(async (id: number, patch: any) => ({
    ...TARGET,
    id,
    ...patch,
  }));
});

describe("PUT /api/users/:id — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app)
      .put(`/api/users/7`)
      .send({ phone: "+79990000777", name: "X" });
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: NON_ADMIN.id });
    storage.getUserById.mockResolvedValue(NON_ADMIN);
    const r = await request(app)
      .put(`/api/users/7`)
      .send({ phone: "+79990000777", name: "X" });
    expect(r.status).toBe(403);
  });
});

describe("PUT /api/users/:id — multi-tenant защита", () => {
  it("чужая компания → 404 (не 403, чтобы не утечка existence)", async () => {
    // КРИТИЧНО: admin company A не должен узнавать что user id=N
    // существует в company B. 403 был бы leak; 404 = «не найден».
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === TARGET_FOREIGN.id) return TARGET_FOREIGN;
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });

    const r = await request(app)
      .put(`/api/users/${TARGET_FOREIGN.id}`)
      .send({ phone: "+79990000777", name: "X" });
    expect(r.status).toBe(404);
    expect(storage.updateUser).not.toHaveBeenCalled();
  });

  it("несуществующий → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });

    const r = await request(app)
      .put(`/api/users/9999`)
      .send({ phone: "+79990000777", name: "X" });
    expect(r.status).toBe(404);
  });
});

describe("PUT /api/users/:id — phone uniqueness", () => {
  it("phone занят другим user'ом → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === TARGET.id) return TARGET;
      return undefined;
    });
    // Другой существующий user с этим phone
    const OTHER: User = { ...TARGET, id: 8, phone: "+79990000888" };
    storage.getUserByPhone.mockResolvedValue(OTHER);

    const r = await request(app)
      .put(`/api/users/${TARGET.id}`)
      .send({ phone: "+79990000888", name: "X" });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("phone");
    expect(storage.updateUser).not.toHaveBeenCalled();
  });

  it("phone тот же что у самого target user'а → 200 (own phone не конфликт)", async () => {
    // Идемпотентность: PUT с тем же phone что уже есть не должен валиться.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === TARGET.id) return TARGET;
      return undefined;
    });
    // getUserByPhone вернёт самого target — это OK
    storage.getUserByPhone.mockResolvedValue(TARGET);

    const r = await request(app)
      .put(`/api/users/${TARGET.id}`)
      .send({ phone: TARGET.phone, name: "Renamed" });
    expect(r.status).toBe(200);
    expect(storage.updateUser).toHaveBeenCalled();
  });

  it("phone нормализуется (пробелы/дефисы strip) перед uniqueness-check", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === TARGET.id) return TARGET;
      return undefined;
    });
    storage.getUserByPhone.mockResolvedValue(undefined);

    await request(app)
      .put(`/api/users/${TARGET.id}`)
      .send({ phone: "+7 999 000-77-77", name: "X" });

    const lookupArg = storage.getUserByPhone.mock.calls[0][0];
    expect(lookupArg).not.toContain(" ");
    expect(lookupArg).not.toContain("-");
  });
});

describe("PUT /api/users/:id — happy path", () => {
  it("admin своей компании обновляет name → 200", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === TARGET.id) return TARGET;
      return undefined;
    });
    storage.getUserByPhone.mockResolvedValue(undefined);

    const r = await request(app)
      .put(`/api/users/${TARGET.id}`)
      .send({ phone: TARGET.phone, name: "Renamed", position: "Менеджер" });
    expect(r.status).toBe(200);
    expect(storage.updateUser).toHaveBeenCalledWith(
      TARGET.id,
      expect.objectContaining({
        name: "Renamed",
        position: "Менеджер",
      }),
    );
  });
});

describe("PUT /api/users/:id — validation", () => {
  it("без phone → 400 Zod", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app).put(`/api/users/7`).send({ name: "X" });
    expect(r.status).toBe(400);
  });

  it("invalid phone format → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app)
      .put(`/api/users/7`)
      .send({ phone: "8(800)555-3535", name: "X" });
    expect(r.status).toBe(400);
  });

  it("name >255 → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app)
      .put(`/api/users/7`)
      .send({ phone: "+79990000777", name: "x".repeat(256) });
    expect(r.status).toBe(400);
  });

  it("position >120 → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app)
      .put(`/api/users/7`)
      .send({
        phone: "+79990000777",
        name: "X",
        position: "x".repeat(121),
      });
    expect(r.status).toBe(400);
  });
});
