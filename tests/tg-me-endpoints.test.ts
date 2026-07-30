/**
 * Тесты /api/me/telegram — привязка Telegram со страницы «Аккаунт».
 *
 * Это единственный путь, которым сотрудник связывает свой Telegram с
 * аккаунтом. Дыра здесь = чужие задачи в чужом боте, поэтому проверяем
 * и подпись, и то, что botToken наружу не утекает.
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../shared/schema";

const BOT_TOKEN = "8810015596:AAtest_token_for_unit_tests_only";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  findUserByTelegramUserId: vi.fn(),
  saveTelegramLink: vi.fn(),
  clearTelegramLink: vi.fn(),
};

vi.mock("../server/storage", () => ({
  storage,
  DatabaseStorage: { parseManagedWorkerIds: () => null },
}));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));

// Рантайм бота подменяем: поднимать поллер в тестах незачем.
const runtime = {
  config: {
    botToken: BOT_TOKEN,
    botId: "8810015596",
    botUsername: "thetasksflowbot",
    botDeepLink: "https://t.me/thetasksflowbot?start=ready",
  },
};
let runtimeAvailable = true;
vi.mock("../server/telegram", () => ({
  getTelegramRuntime: () => (runtimeAvailable ? runtime : null),
}));

async function buildApp(sessionUserId?: number) {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionUserId
      ? { userId: sessionUserId, destroy: (cb: () => void) => cb() }
      : { destroy: (cb: () => void) => cb() };
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return app;
}

const USER: User = {
  id: 183,
  phone: null,
  name: "bugdenes",
  isAdmin: true,
  isRoot: false,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 18,
  managedWorkerIds: null,
  position: null,
  email: "bugdenes@gmail.com",
  passwordHash: null,
  magicToken: null,
  magicTokenExpiresAt: null,
  telegramUserId: null,
  telegramUsername: null,
  telegramFirstName: null,
  telegramPhotoUrl: null,
  tgChatId: null,
  tgLinkedAt: null,
  tgStartedAt: null,
} as User;

function signedPayload(overrides: Record<string, unknown> = {}) {
  const base: Record<string, string | number> = {
    id: 2133993638,
    first_name: "Ярослав",
    username: "YaroslavEmpty",
    auth_date: Math.floor(Date.now() / 1000),
    ...(overrides as Record<string, string | number>),
  };
  const dcs = Object.keys(base).sort().map((k) => `${k}=${base[k]}`).join("\n");
  const secret = createHash("sha256").update(BOT_TOKEN).digest();
  return { ...base, hash: createHmac("sha256", secret).update(dcs).digest("hex") };
}

beforeEach(() => {
  runtimeAvailable = true;
  storage.getUserById.mockResolvedValue(USER);
  storage.findUserByTelegramUserId.mockResolvedValue(undefined);
  storage.saveTelegramLink.mockResolvedValue(USER);
  storage.clearTelegramLink.mockResolvedValue(USER);
});

afterEach(() => vi.clearAllMocks());

describe("GET /api/me/telegram", () => {
  it("без сессии → 401", async () => {
    const app = await buildApp();
    await request(app).get("/api/me/telegram").expect(401);
  });

  it("отдаёт botId и статус, но НЕ токен бота", async () => {
    const app = await buildApp(183);
    const res = await request(app).get("/api/me/telegram").expect(200);
    expect(res.body).toMatchObject({
      connected: false,
      botConfigured: true,
      botId: "8810015596",
      botUsername: "thetasksflowbot",
    });
    expect(JSON.stringify(res.body)).not.toContain("AAtest_token");
  });

  it("привязанный аккаунт помечен connected", async () => {
    storage.getUserById.mockResolvedValue({
      ...USER, telegramUserId: 2133993638, telegramUsername: "YaroslavEmpty", tgStartedAt: 5,
    });
    const app = await buildApp(183);
    const res = await request(app).get("/api/me/telegram").expect(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.tgStarted).toBe(true);
  });

  it("бот не настроен → botConfigured false, кнопка не покажется", async () => {
    runtimeAvailable = false;
    const app = await buildApp(183);
    const res = await request(app).get("/api/me/telegram").expect(200);
    expect(res.body.botConfigured).toBe(false);
    expect(res.body.botId).toBeNull();
  });
});

describe("POST /api/me/telegram/connect", () => {
  it("валидная подпись → привязка сохранена", async () => {
    const app = await buildApp(183);
    const res = await request(app)
      .post("/api/me/telegram/connect")
      .send(signedPayload())
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(storage.saveTelegramLink).toHaveBeenCalledWith(
      183,
      expect.objectContaining({ telegramUserId: 2133993638 }),
    );
  });

  it("подделанный id → 400, привязки нет", async () => {
    const app = await buildApp(183);
    const bad = { ...signedPayload(), id: 999 };
    const res = await request(app).post("/api/me/telegram/connect").send(bad).expect(400);
    expect(res.body.code).toBe("invalid_hash");
    expect(storage.saveTelegramLink).not.toHaveBeenCalled();
  });

  it("протухший auth_date → 400 auth_expired", async () => {
    const app = await buildApp(183);
    const old = signedPayload({ auth_date: Math.floor(Date.now() / 1000) - 48 * 3600 });
    const res = await request(app).post("/api/me/telegram/connect").send(old).expect(400);
    expect(res.body.code).toBe("auth_expired");
  });

  it("этот Telegram уже у другого сотрудника → 409", async () => {
    storage.findUserByTelegramUserId.mockResolvedValue({ ...USER, id: 999 });
    const app = await buildApp(183);
    const res = await request(app)
      .post("/api/me/telegram/connect")
      .send(signedPayload())
      .expect(409);
    expect(res.body.code).toBe("tg_already_linked");
    expect(storage.saveTelegramLink).not.toHaveBeenCalled();
  });

  it("повторная привязка того же Telegram к себе же проходит", async () => {
    storage.findUserByTelegramUserId.mockResolvedValue(USER);
    const app = await buildApp(183);
    await request(app).post("/api/me/telegram/connect").send(signedPayload()).expect(200);
  });

  it("мусорное тело → 400 от валидации", async () => {
    const app = await buildApp(183);
    await request(app).post("/api/me/telegram/connect").send({ id: "x" }).expect(400);
  });

  it("бот не настроен → 503", async () => {
    runtimeAvailable = false;
    const app = await buildApp(183);
    await request(app).post("/api/me/telegram/connect").send(signedPayload()).expect(503);
  });

  it("без сессии → 401", async () => {
    const app = await buildApp();
    await request(app).post("/api/me/telegram/connect").send(signedPayload()).expect(401);
  });
});

describe("DELETE /api/me/telegram", () => {
  it("отвязывает и отдаёт 204", async () => {
    const app = await buildApp(183);
    await request(app).delete("/api/me/telegram").expect(204);
    expect(storage.clearTelegramLink).toHaveBeenCalledWith(183);
  });

  it("без сессии → 401", async () => {
    const app = await buildApp();
    await request(app).delete("/api/me/telegram").expect(401);
    expect(storage.clearTelegramLink).not.toHaveBeenCalled();
  });
});
