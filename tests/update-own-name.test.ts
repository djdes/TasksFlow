/**
 * Тесты PUT /api/auth/me (update own name).
 *
 * Endpoint позволяет user'у изменить своё имя. История фиксов:
 *   • TypeError crash на name=number/object — теперь 400
 *   • silent slice(0, 200) на длинных именах — теперь cap=255 чтобы
 *     совпадал с VARCHAR(255) и Zod schema
 *   • с email-веткой (phone стал nullable) endpoint обновляет имя через
 *     storage.setUserName(id, name) — БЕЗ phone, иначе normalizePhone(null)
 *     падал бы на email-юзерах без телефона.
 *
 * Был БЕЗ тестов — регрессия в normalize-логике могла снова
 * вернуть 500 на нестроковом name (UX «программа сломалась»).
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
  setUserName: vi.fn(),
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

const USER: User = {
  id: 7,
  phone: "+79990000007",
  name: "Old Name",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
  email: null,
  passwordHash: null,
  magicToken: null,
  magicTokenExpiresAt: null,
};

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.setUserName.mockImplementation(async (id: number, name: string | null) => ({
    ...USER,
    id,
    name,
  }));
});

describe("PUT /api/auth/me — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).put("/api/auth/me").send({ name: "New" });
    expect(r.status).toBe(401);
  });

  it("user не найден в storage → 404", async () => {
    const { app } = await buildApp({ sessionUserId: 99 });
    storage.getUserById.mockResolvedValue(undefined);
    const r = await request(app).put("/api/auth/me").send({ name: "X" });
    expect(r.status).toBe(404);
  });
});

describe("PUT /api/auth/me — name string", () => {
  it("обычное имя → передаётся в setUserName", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);

    const r = await request(app).put("/api/auth/me").send({ name: "Иван" });
    expect(r.status).toBe(200);
    expect(storage.setUserName).toHaveBeenCalledWith(USER.id, "Иван");
  });

  it("trim лишних пробелов («  Иван  » → «Иван»)", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);

    await request(app).put("/api/auth/me").send({ name: "  Иван  " });
    expect(storage.setUserName).toHaveBeenCalledWith(USER.id, "Иван");
  });

  it("длина 255 → проходит как есть", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);
    const longName = "и".repeat(255);

    await request(app).put("/api/auth/me").send({ name: longName });
    expect(storage.setUserName).toHaveBeenCalledWith(USER.id, longName);
  });

  it("длина 256+ → cap до 255 (VARCHAR(255) sync)", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);
    const tooLong = "и".repeat(500);

    await request(app).put("/api/auth/me").send({ name: tooLong });
    const callArg = storage.setUserName.mock.calls[0][1];
    expect(callArg.length).toBe(255);
    expect(callArg).toBe("и".repeat(255));
  });

  it("только пробелы («   ») → null (treated as empty)", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);

    await request(app).put("/api/auth/me").send({ name: "   " });
    expect(storage.setUserName).toHaveBeenCalledWith(USER.id, null);
  });
});

describe("PUT /api/auth/me — name null/undefined", () => {
  it("name=null → передаётся как null (clear name)", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);

    await request(app).put("/api/auth/me").send({ name: null });
    expect(storage.setUserName).toHaveBeenCalledWith(USER.id, null);
  });

  it("body без name (undefined) → setUserName с null (defensive default)", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);

    await request(app).put("/api/auth/me").send({});
    expect(storage.setUserName).toHaveBeenCalledWith(USER.id, null);
  });
});

describe("PUT /api/auth/me — type validation (anti-crash)", () => {
  it("name=number → 400 (раньше TypeError 500)", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);

    const r = await request(app).put("/api/auth/me").send({ name: 42 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/строкой/i);
    expect(storage.setUserName).not.toHaveBeenCalled();
  });

  it("name=object → 400", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);

    const r = await request(app).put("/api/auth/me").send({ name: { foo: "bar" } });
    expect(r.status).toBe(400);
    expect(storage.setUserName).not.toHaveBeenCalled();
  });

  it("name=array → 400", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);

    const r = await request(app).put("/api/auth/me").send({ name: ["a", "b"] });
    expect(r.status).toBe(400);
  });

  it("name=true (boolean) → 400", async () => {
    const { app } = await buildApp({ sessionUserId: USER.id });
    storage.getUserById.mockResolvedValue(USER);

    const r = await request(app).put("/api/auth/me").send({ name: true });
    expect(r.status).toBe(400);
  });
});
