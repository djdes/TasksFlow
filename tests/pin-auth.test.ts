/**
 * Вход по PIN: POST /api/auth/login (шаги pin/setup, блокировка),
 * смена своего PIN и PIN, заданный руководителем.
 *
 * Раньше одного номера телефона хватало, чтобы войти в чужой аккаунт.
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "../server/crypto-password";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getUserByPhone: vi.fn(),
  setUserPinIfEmpty: vi.fn(),
  reservePinAttempt: vi.fn(),
  resetPinFailures: vi.fn(),
  setUserPin: vi.fn(),
  // /api/auth/me читает настройку проверки у «Сотрудника» (shared/roles.ts).
  getCompanyById: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage, DatabaseStorage: class {} }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));

let sessionStore: Record<string, unknown>;

async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionStore;
    next();
  });
  await registerRoutes(createServer(app), app);
  return app;
}

const PIN_HASH = hashPassword("4826");
const now = () => Math.floor(Date.now() / 1000);

function user(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    phone: "+79991234567",
    name: "Сергей",
    isAdmin: false,
    isRoot: false,
    createdAt: 1,
    bonusBalance: 0,
    companyId: 42,
    managedWorkerIds: null,
    position: null,
    pinHash: PIN_HASH,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    pinUpdatedAt: 1,
    tgChatId: null,
    tgStartedAt: null,
    ...extra,
  };
}

const ADMIN = user({ id: 1, isAdmin: true, phone: "+79990000001" });

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  sessionStore = {};
});

describe("вход: PIN уже задан", () => {
  it("телефон без PIN → step:pin, сессии нет, попытка не тратится", async () => {
    const app = await buildApp();
    storage.getUserByPhone.mockResolvedValue(user());
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ step: "pin" });
    expect(sessionStore.userId).toBeUndefined();
    expect(storage.reservePinAttempt).not.toHaveBeenCalled();
  });

  it("верный PIN → сессия, счётчик ошибок обнулён, хэш не уходит клиенту", async () => {
    const app = await buildApp();
    storage.getUserByPhone.mockResolvedValue(user({ pinFailedAttempts: 2 }));
    storage.reservePinAttempt.mockResolvedValue({ attempts: 3, lockedUntil: null });
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567", pin: "4826" });
    expect(r.status).toBe(200);
    expect(sessionStore.userId).toBe(7);
    expect(storage.resetPinFailures).toHaveBeenCalledWith(7);
    expect(r.body.pinHash).toBeUndefined();
    expect(r.body.pinFailedAttempts).toBeUndefined();
    expect(r.body.hasPin).toBe(true);
    expect(r.body.pinLocked).toBe(false);
  });

  it("неверный PIN → 401 с остатком попыток, сессии нет", async () => {
    const app = await buildApp();
    storage.getUserByPhone.mockResolvedValue(user());
    storage.reservePinAttempt.mockResolvedValue({ attempts: 3, lockedUntil: null });
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567", pin: "1357" });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ field: "pin", attemptsLeft: 2 });
    expect(sessionStore.userId).toBeUndefined();
    expect(storage.resetPinFailures).not.toHaveBeenCalled();
  });

  it("пятая ошибка → 429 с Retry-After и временем блокировки", async () => {
    const app = await buildApp();
    storage.getUserByPhone.mockResolvedValue(user({ pinFailedAttempts: 4 }));
    storage.reservePinAttempt.mockResolvedValue({ attempts: 5, lockedUntil: now() + 900 });
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567", pin: "1357" });
    expect(r.status).toBe(429);
    expect(r.body.message).toMatch(/заблокирован на 15 мин/);
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(800);
    expect(sessionStore.userId).toBeUndefined();
  });

  it("во время блокировки даже верный PIN не пускает", async () => {
    const app = await buildApp();
    const locked = user({ pinFailedAttempts: 5, pinLockedUntil: now() + 600 });
    storage.getUserByPhone.mockResolvedValue(locked);
    storage.getUserById.mockResolvedValue(locked);
    storage.reservePinAttempt.mockResolvedValue(null);
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567", pin: "4826" });
    expect(r.status).toBe(429);
    expect(sessionStore.userId).toBeUndefined();
    expect(storage.resetPinFailures).not.toHaveBeenCalled();
  });

  it("блокировку видно сразу после номера, до ввода PIN", async () => {
    const app = await buildApp();
    storage.getUserByPhone.mockResolvedValue(user({ pinLockedUntil: now() + 3600 }));
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567" });
    expect(r.status).toBe(429);
    expect(r.body.message).toMatch(/1 ч/);
    expect(storage.reservePinAttempt).not.toHaveBeenCalled();
  });

  it("PIN не из 4 цифр → 400 без траты попытки", async () => {
    const app = await buildApp();
    storage.getUserByPhone.mockResolvedValue(user());
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567", pin: "12" });
    expect(r.status).toBe(400);
    expect(storage.reservePinAttempt).not.toHaveBeenCalled();
  });
});

describe("вход: PIN ещё не задан (первый вход)", () => {
  it("телефон без PIN → step:setup", async () => {
    const app = await buildApp();
    storage.getUserByPhone.mockResolvedValue(user({ pinHash: null }));
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567" });
    expect(r.body).toEqual({ step: "setup" });
    expect(sessionStore.userId).toBeUndefined();
  });

  it("простой PIN → 400 с причиной, PIN не сохраняется", async () => {
    const app = await buildApp();
    storage.getUserByPhone.mockResolvedValue(user({ pinHash: null }));
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567", pin: "1234" });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/подряд/);
    expect(storage.setUserPinIfEmpty).not.toHaveBeenCalled();
  });

  it("хороший PIN → сохраняется хэшем и открывается сессия", async () => {
    const app = await buildApp();
    const fresh = user({ pinHash: null });
    storage.getUserByPhone.mockResolvedValue(fresh);
    storage.setUserPinIfEmpty.mockResolvedValue(true);
    storage.getUserById.mockResolvedValue(user());
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567", pin: "4826" });
    expect(r.status).toBe(200);
    expect(sessionStore.userId).toBe(7);
    const [id, hash] = storage.setUserPinIfEmpty.mock.calls[0];
    expect(id).toBe(7);
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("4826");
  });

  it("гонка: PIN успели задать раньше → 409 step:pin, без сессии", async () => {
    const app = await buildApp();
    storage.getUserByPhone.mockResolvedValue(user({ pinHash: null }));
    storage.setUserPinIfEmpty.mockResolvedValue(false);
    const r = await request(app).post("/api/auth/login").send({ phone: "+79991234567", pin: "4826" });
    expect(r.status).toBe(409);
    expect(r.body.step).toBe("pin");
    expect(sessionStore.userId).toBeUndefined();
  });
});

describe("PIN задаёт руководитель", () => {
  it("админ задаёт PIN сотруднику своей компании", async () => {
    const app = await buildApp();
    sessionStore.userId = ADMIN.id;
    storage.getUserById.mockImplementation(async (id: number) => (id === ADMIN.id ? ADMIN : user()));
    storage.setUserPin.mockResolvedValue(user());
    const r = await request(app).post("/api/users/7/pin").send({ pin: "4826" });
    expect(r.status).toBe(200);
    expect(storage.setUserPin).toHaveBeenCalledWith(7, expect.stringMatching(/^scrypt\$/));
    expect(r.body.pinHash).toBeUndefined();
  });

  it("сотрудник чужой компании → 404", async () => {
    const app = await buildApp();
    sessionStore.userId = ADMIN.id;
    storage.getUserById.mockImplementation(async (id: number) => (id === ADMIN.id ? ADMIN : user({ companyId: 99 })));
    const r = await request(app).post("/api/users/7/pin").send({ pin: "4826" });
    expect(r.status).toBe(404);
    expect(storage.setUserPin).not.toHaveBeenCalled();
  });

  it("простой PIN → 400", async () => {
    const app = await buildApp();
    sessionStore.userId = ADMIN.id;
    storage.getUserById.mockImplementation(async (id: number) => (id === ADMIN.id ? ADMIN : user()));
    const r = await request(app).post("/api/users/7/pin").send({ pin: "0000" });
    expect(r.status).toBe(400);
    expect(storage.setUserPin).not.toHaveBeenCalled();
  });

  it("не-админ не может задавать PIN другим", async () => {
    const app = await buildApp();
    sessionStore.userId = 7;
    storage.getUserById.mockResolvedValue(user());
    const r = await request(app).post("/api/users/8/pin").send({ pin: "4826" });
    expect(r.status).toBe(403);
    expect(storage.setUserPin).not.toHaveBeenCalled();
  });

  it("PIN администратора чужими руками не меняется → 403", async () => {
    const app = await buildApp();
    sessionStore.userId = ADMIN.id;
    const otherAdmin = user({ id: 2, isAdmin: true });
    storage.getUserById.mockImplementation(async (id: number) => (id === ADMIN.id ? ADMIN : otherAdmin));
    const set = await request(app).post("/api/users/2/pin").send({ pin: "4826" });
    const clear = await request(app).delete("/api/users/2/pin");
    expect(set.status).toBe(403);
    expect(clear.status).toBe(403);
    expect(storage.setUserPin).not.toHaveBeenCalled();
  });

  it("сброс PIN: сотрудник придумает новый при входе", async () => {
    const app = await buildApp();
    sessionStore.userId = ADMIN.id;
    storage.getUserById.mockImplementation(async (id: number) => (id === ADMIN.id ? ADMIN : user()));
    storage.setUserPin.mockResolvedValue(user({ pinHash: null }));
    const r = await request(app).delete("/api/users/7/pin");
    expect(r.status).toBe(200);
    expect(storage.setUserPin).toHaveBeenCalledWith(7, null);
    expect(r.body.hasPin).toBe(false);
  });
});

describe("смена своего PIN", () => {
  it("нужен текущий PIN", async () => {
    const app = await buildApp();
    sessionStore.userId = 7;
    storage.getUserById.mockResolvedValue(user());
    const r = await request(app).post("/api/auth/pin").send({ newPin: "3917" });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("currentPin");
  });

  it("неверный текущий PIN → 401, новый не сохраняется", async () => {
    const app = await buildApp();
    sessionStore.userId = 7;
    storage.getUserById.mockResolvedValue(user());
    storage.reservePinAttempt.mockResolvedValue({ attempts: 1, lockedUntil: null });
    const r = await request(app).post("/api/auth/pin").send({ currentPin: "1357", newPin: "3917" });
    expect(r.status).toBe(401);
    expect(r.body.field).toBe("currentPin");
    expect(storage.setUserPin).not.toHaveBeenCalled();
  });

  it("верный текущий PIN → новый сохранён", async () => {
    const app = await buildApp();
    sessionStore.userId = 7;
    storage.getUserById.mockResolvedValue(user());
    storage.reservePinAttempt.mockResolvedValue({ attempts: 1, lockedUntil: null });
    storage.setUserPin.mockResolvedValue(user());
    const r = await request(app).post("/api/auth/pin").send({ currentPin: "4826", newPin: "3917" });
    expect(r.status).toBe(200);
    expect(storage.setUserPin).toHaveBeenCalledWith(7, expect.stringMatching(/^scrypt\$/));
  });

  it("после входа по email PIN меняется без текущего", async () => {
    const app = await buildApp();
    sessionStore.userId = 7;
    sessionStore.emailAuthAt = now() - 60;
    storage.getUserById.mockResolvedValue(user());
    storage.setUserPin.mockResolvedValue(user());
    const me = await request(app).get("/api/auth/me");
    expect(me.body.pinResetByEmail).toBe(true);
    const r = await request(app).post("/api/auth/pin").send({ newPin: "3917" });
    expect(r.status).toBe(200);
    expect(storage.reservePinAttempt).not.toHaveBeenCalled();
  });

  it("вход по email давно → снова нужен текущий PIN", async () => {
    const app = await buildApp();
    sessionStore.userId = 7;
    sessionStore.emailAuthAt = now() - 2 * 3600;
    storage.getUserById.mockResolvedValue(user());
    const r = await request(app).post("/api/auth/pin").send({ newPin: "3917" });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("currentPin");
  });

  it("без PIN (вход по email) можно задать сразу", async () => {
    const app = await buildApp();
    sessionStore.userId = 7;
    storage.getUserById.mockResolvedValue(user({ pinHash: null }));
    storage.setUserPin.mockResolvedValue(user());
    const r = await request(app).post("/api/auth/pin").send({ newPin: "3917" });
    expect(r.status).toBe(200);
    expect(storage.reservePinAttempt).not.toHaveBeenCalled();
  });
});
