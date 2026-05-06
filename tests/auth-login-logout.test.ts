/**
 * Тесты POST /api/auth/login + /logout.
 *
 * Critical path: login — единственная точка входа в систему.
 * Phone-only auth, без пароля. Bug в normalize'е телефона = воркер
 * не сможет войти со своего номера.
 *
 * Эти endpoints не тестировались вообще.
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
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));

let sessionStore: Record<string, unknown>;
let sessionDestroyed: boolean;

async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    sessionStore = sessionStore ?? {};
    req.session = sessionStore;
    req.session.destroy = (cb: () => void) => {
      sessionDestroyed = true;
      cb();
    };
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return { app, server };
}

const USER: User = {
  id: 7,
  phone: "+79991234567",
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
  sessionStore = {};
  sessionDestroyed = false;
});

describe("POST /api/auth/login — happy path", () => {
  it("валидный phone существующего user → 200, session.userId=user.id", async () => {
    const { app } = await buildApp();
    storage.getUserByPhone.mockResolvedValue(USER);

    const r = await request(app)
      .post("/api/auth/login")
      .send({ phone: "+79991234567" });

    expect(r.status).toBe(200);
    expect(r.body.id).toBe(USER.id);
    expect(sessionStore.userId).toBe(USER.id);
  });
});

describe("POST /api/auth/login — phone normalization", () => {
  it("phone с пробелами и дефисами нормализуется", async () => {
    const { app } = await buildApp();
    storage.getUserByPhone.mockResolvedValue(USER);

    await request(app)
      .post("/api/auth/login")
      .send({ phone: "+7 999 123-45-67" });

    // Storage получает нормализованную форму без пробелов/дефисов
    const lookupArg = storage.getUserByPhone.mock.calls[0][0];
    expect(lookupArg).toMatch(/^\+\d+$/);
    expect(lookupArg).not.toContain(" ");
    expect(lookupArg).not.toContain("-");
  });
});

describe("POST /api/auth/login — user not found", () => {
  it("неизвестный phone → 401", async () => {
    const { app } = await buildApp();
    storage.getUserByPhone.mockResolvedValue(undefined);

    const r = await request(app)
      .post("/api/auth/login")
      .send({ phone: "+79990000000" });

    expect(r.status).toBe(401);
    expect(sessionStore.userId).toBeUndefined();
  });
});

describe("POST /api/auth/login — validation", () => {
  it("phone не строка → 400", async () => {
    const { app } = await buildApp();

    const r = await request(app)
      .post("/api/auth/login")
      .send({ phone: 79991234567 });

    expect(r.status).toBe(400);
    expect(storage.getUserByPhone).not.toHaveBeenCalled();
  });

  it("phone не валиден → 400", async () => {
    const { app } = await buildApp();

    const r = await request(app)
      .post("/api/auth/login")
      .send({ phone: "abc" });

    expect(r.status).toBe(400);
    expect(storage.getUserByPhone).not.toHaveBeenCalled();
  });

  it("без phone → 400", async () => {
    const { app } = await buildApp();

    const r = await request(app).post("/api/auth/login").send({});

    expect(r.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("уничтожает session", async () => {
    const { app } = await buildApp();
    sessionStore.userId = USER.id;

    const r = await request(app).post("/api/auth/logout");
    expect(r.status).toBe(200);
    expect(sessionDestroyed).toBe(true);
  });

  it("без session тоже работает (idempotent)", async () => {
    const { app } = await buildApp();
    // sessionStore пустой = нет userId

    const r = await request(app).post("/api/auth/logout");
    expect(r.status).toBe(200);
  });
});
