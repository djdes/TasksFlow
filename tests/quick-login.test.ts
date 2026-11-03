import express from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../shared/schema";
import { NO_PERMISSIONS } from "../shared/roles";

const { storage } = vi.hoisted(() => ({ storage: {
  getUserById: vi.fn(), getCompanyById: vi.fn(), getCompanyRole: vi.fn(),
  getCompanyLoginLink: vi.fn(), ensureCompanyLoginLink: vi.fn(), getCompanyIdByLoginToken: vi.fn(),
  getAllUsers: vi.fn(), reservePinAttempt: vi.fn(), resetPinFailures: vi.fn(),
} }));
vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/telegram", () => ({ getTelegramRuntime: () => null }));

import { registerQuickLoginRoutes } from "../server/routes/quick-login";
import { apiKeyWithoutSession } from "../server/api-key-session";
import { hashPin } from "../server/pin-auth";

const token = "a".repeat(64);
const base = `/api/quick-login/by-token/${token}`;
const pinHash = hashPin("4826");
const worker = { id: 7, companyId: 42, name: "Анна", position: "Повар", phone: "+79991234567", email: "private@example.com", pinHash, isAdmin: false, isRoot: false } as User;
const owner = { ...worker, id: 1, isAdmin: true };

function app() {
  const app = express();
  app.use(express.json());
  app.use(apiKeyWithoutSession);
  app.use(session({ secret: "quick-login-test", resave: false, saveUninitialized: false }));
  app.post("/test/session/:id", (req, res) => {
    req.session.userId = Number(req.params.id);
    req.session.emailAuthAt = 123;
    res.json({ ok: true });
  });
  app.get("/test/session", (req, res) => res.json({ userId: req.session.userId, emailAuthAt: req.session.emailAuthAt }));
  registerQuickLoginRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.getUserById.mockImplementation(async (id) => id === 1 ? owner : id === 7 ? worker : undefined);
  storage.getCompanyById.mockResolvedValue({ id: 42, name: "Цех" });
  storage.getCompanyIdByLoginToken.mockResolvedValue(42);
  storage.getAllUsers.mockResolvedValue([worker, { ...owner, isRoot: true }]);
  storage.getCompanyLoginLink.mockResolvedValue(token);
  storage.ensureCompanyLoginLink.mockResolvedValue(token);
  storage.reservePinAttempt.mockResolvedValue({ attempts: 1, lockedUntil: null });
});

describe("QR: права на печать и постоянная ссылка", () => {
  it("без сессии 401; сотруднику 403", async () => {
    const agent = request.agent(app());
    expect((await agent.get("/api/quick-login/link")).status).toBe(401);
    await agent.post("/test/session/7");
    expect((await agent.post("/api/quick-login/link")).status).toBe(403);
    expect(storage.ensureCompanyLoginLink).not.toHaveBeenCalled();
  });

  it.each([
    ["владелец", owner],
    ["WeSetup руководитель", { ...worker, managedWorkerIds: "[8]" }],
    ["своя роль", { ...worker, roleId: 5 }],
  ])("%s может получить и повторно напечатать тот же QR", async (_name, manager) => {
    storage.getUserById.mockResolvedValue(manager);
    storage.getCompanyRole.mockResolvedValue({ id: 5, companyId: 42, permissions: { ...NO_PERMISSIONS, manageUsers: true } });
    const agent = request.agent(app());
    await agent.post("/test/session/7");
    const first = await agent.post("/api/quick-login/link").set("Host", "tasksflow.test");
    const second = await agent.get("/api/quick-login/link").set("Host", "tasksflow.test");
    expect(first.status).toBe(200);
    expect(first.body).toEqual(second.body);
    expect(first.body.url).toContain(`/quick-login/${token}`);
    expect(storage.ensureCompanyLoginLink).toHaveBeenCalledWith(42, expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it("чужая роль не даёт права, отсутствующая организация — 404", async () => {
    storage.getUserById.mockResolvedValue({ ...worker, roleId: 5 });
    storage.getCompanyRole.mockResolvedValue({ id: 5, companyId: 99, permissions: { ...NO_PERMISSIONS, manageUsers: true } });
    const agent = request.agent(app());
    await agent.post("/test/session/7");
    expect((await agent.get("/api/quick-login/link")).status).toBe(403);
    storage.getUserById.mockResolvedValue(owner);
    storage.getCompanyById.mockResolvedValue(undefined);
    expect((await agent.get("/api/quick-login/link")).status).toBe(404);
  });
});

describe("QR: публичный список и PIN-вход", () => {
  it("список только своей компании, без телефонов, почты, хешей и root", async () => {
    const result = await request(app()).get(base);
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(storage.getAllUsers).toHaveBeenCalledWith(42);
    expect(result.body).toEqual({ companyName: "Цех", users: [{ id: 7, name: "Анна", position: "Повар", hasPin: true }] });
  });

  it("невалидный и неизвестный токен дают JSON 404", async () => {
    const server = app();
    const invalid = await request(server).get("/api/quick-login/by-token/42");
    expect(invalid.status).toBe(404);
    expect(storage.getCompanyIdByLoginToken).not.toHaveBeenCalled();
    storage.getCompanyIdByLoginToken.mockResolvedValue(undefined);
    expect((await request(server).get(base)).status).toBe(404);
    expect((await request(server).post(`${base}/login`).send({ userId: 7, pin: "4826" })).status).toBe(404);
  });

  it.each([
    ["чужой сотрудник", { ...worker, companyId: 99 }, 401],
    ["удалённый сотрудник", undefined, 401],
    ["root", { ...worker, isRoot: true }, 401],
    ["PIN не задан", { ...worker, pinHash: null }, 403],
  ])("%s не входит", async (_name, target, status) => {
    storage.getUserById.mockResolvedValue(target);
    const agent = request.agent(app());
    expect((await agent.post(`${base}/login`).send({ userId: 7, pin: "4826" })).status).toBe(status);
    expect((await agent.get("/test/session")).body).toEqual({});
    expect(storage.reservePinAttempt).not.toHaveBeenCalled();
  });

  it.each([{ userId: 7 }, { userId: 7, pin: "abc" }, { userId: "7", pin: "4826" }])("валидация %j до проверки PIN", async (input) => {
    expect((await request(app()).post(`${base}/login`).send(input)).status).toBe(400);
    expect(storage.reservePinAttempt).not.toHaveBeenCalled();
  });

  it("неверный PIN тратит общую попытку; блокировка сохраняет Retry-After", async () => {
    const server = app();
    const wrong = await request(server).post(`${base}/login`).send({ userId: 7, pin: "1357" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.attemptsLeft).toBe(4);
    expect(storage.reservePinAttempt).toHaveBeenCalledWith(7, expect.any(Number));
    storage.reservePinAttempt.mockResolvedValue(null);
    storage.getUserById.mockResolvedValue({ ...worker, pinLockedUntil: Math.floor(Date.now() / 1000) + 900 });
    const locked = await request(server).post(`${base}/login`).send({ userId: 7, pin: "4826" });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(890);
  });

  it("верный PIN открывает обычную сессию сотрудника и убирает старый email-вход", async () => {
    const agent = request.agent(app());
    await agent.post("/test/session/1");
    const result = await agent.post(`${base}/login`).send({ userId: 7, pin: "4826" });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true });
    expect((await agent.get("/test/session")).body).toEqual({ userId: 7 });
    expect(storage.resetPinFailures).toHaveBeenCalledWith(7);
  });

  it("API-ключ не открывает сессию по QR", async () => {
    const result = await request(app()).post(`${base}/login`).set("Authorization", "Bearer tfk_test").send({ userId: 7, pin: "4826" });
    expect(result.status).toBe(403);
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect(storage.reservePinAttempt).not.toHaveBeenCalled();
  });

  it("сбой storage — JSON с понятной ошибкой", async () => {
    storage.getAllUsers.mockRejectedValue(new Error("db offline"));
    const result = await request(app()).get(base);
    expect(result.status).toBe(500);
    expect(result.body.message).toContain("Повторите");
    expect(result.text).not.toContain("db offline");
  });
});
