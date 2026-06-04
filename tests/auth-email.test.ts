/**
 * Тесты email-ветки авторизации (лендинг, как в ordersflow):
 *   POST /api/auth/start         — авторегистрация / magic-login
 *   POST /api/auth/login-email   — вход по паролю
 *   POST /api/auth/recover       — сброс пароля (анти-энумерация)
 *   GET  /api/auth/magic/:token  — одноразовый вход
 *
 * storage и mailer мокаются; email-validate мокается чтобы не дёргать
 * реальный DNS. crypto-password — настоящий (проверяем scrypt-верификацию).
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Company, User } from "../shared/schema";
import { hashPassword } from "../server/crypto-password";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  createCompany: vi.fn(),
  createEmailUser: vi.fn(),
  setMagicToken: vi.fn(),
  clearMagicToken: vi.fn(),
  findUserByMagicToken: vi.fn(),
  updateUserPassword: vi.fn(),
  updateUserEmail: vi.fn(),
};

const sendMail = vi.fn().mockResolvedValue(undefined);

vi.mock("../server/storage", () => ({ storage, DatabaseStorage: class {} }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/mailer", () => ({ sendMail }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../server/email-validate", () => ({
  validateEmailForAuth: vi.fn(async (e: string) => ({
    ok: true,
    normalized: e.trim().toLowerCase(),
  })),
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
  isEmailFormat: (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim().toLowerCase()),
}));

import { validateEmailForAuth } from "../server/email-validate";
const validateMock = vi.mocked(validateEmailForAuth);

let sessionStore: Record<string, unknown>;

async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    sessionStore = sessionStore ?? {};
    req.session = sessionStore;
    req.session.destroy = (cb: any) => cb?.();
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return { app };
}

const COMPANY: Company = {
  id: 77,
  name: "Компания ivan",
  email: null,
  createdAt: 1,
  wesetupBaseUrl: null,
  wesetupApiKey: null,
};

const EMAIL_USER: User = {
  id: 500,
  phone: null,
  name: "ivan",
  isAdmin: true,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 77,
  managedWorkerIds: null,
  position: null,
  email: "ivan@firma.ru",
  passwordHash: hashPassword("secret123"),
  magicToken: null,
  magicTokenExpiresAt: null,
};

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  sendMail.mockClear();
  validateMock.mockReset();
  validateMock.mockImplementation(async (e: string) => ({
    ok: true,
    normalized: e.trim().toLowerCase(),
  }));
  sessionStore = {};
  storage.createCompany.mockResolvedValue(COMPANY);
  storage.createEmailUser.mockResolvedValue(EMAIL_USER);
  storage.setMagicToken.mockResolvedValue(undefined);
  storage.clearMagicToken.mockResolvedValue(undefined);
  storage.updateUserPassword.mockResolvedValue(EMAIL_USER);
});

describe("POST /api/auth/start", () => {
  it("новый email → 201 exists:false, сессия, welcome-письмо, создана компания+юзер", async () => {
    const { app } = await buildApp();
    storage.getUserByEmail.mockResolvedValue(undefined);

    const r = await request(app).post("/api/auth/start").send({ email: "ivan@firma.ru" });

    expect(r.status).toBe(201);
    expect(r.body.exists).toBe(false);
    expect(storage.createCompany).toHaveBeenCalled();
    expect(storage.createEmailUser).toHaveBeenCalled();
    expect(sessionStore.userId).toBe(500); // мгновенный автологин
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "welcome", to: "ivan@firma.ru" }),
    );
  });

  it("существующий email → 200 exists:true, magic-login письмо, БЕЗ сессии", async () => {
    const { app } = await buildApp();
    storage.getUserByEmail.mockResolvedValue(EMAIL_USER);

    const r = await request(app).post("/api/auth/start").send({ email: "ivan@firma.ru" });

    expect(r.status).toBe(200);
    expect(r.body.exists).toBe(true);
    expect(storage.setMagicToken).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "login-link", to: "ivan@firma.ru" }),
    );
    expect(storage.createEmailUser).not.toHaveBeenCalled();
    expect(sessionStore.userId).toBeUndefined();
  });

  it("невалидный email (validate ok:false) → 400 с подсказкой", async () => {
    const { app } = await buildApp();
    validateMock.mockResolvedValueOnce({
      ok: false,
      normalized: "x@gmail.ru",
      suggestion: "x@gmail.com",
      error: "Возможно, вы имели в виду x@gmail.com?",
    });

    const r = await request(app).post("/api/auth/start").send({ email: "x@gmail.ru" });

    expect(r.status).toBe(400);
    expect(r.body.field).toBe("email");
    expect(r.body.suggestion).toBe("x@gmail.com");
    // Новый email с опечаткой/без MX не регистрируется и не логинит.
    // (getUserByEmail теперь вызывается — существующий аккаунт имеет право
    // войти даже если у его домена нет MX, напр. admin@tasksflow.ru.)
    expect(storage.createEmailUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login-email", () => {
  it("верный пароль → 200 + сессия", async () => {
    const { app } = await buildApp();
    storage.getUserByEmail.mockResolvedValue(EMAIL_USER);

    const r = await request(app)
      .post("/api/auth/login-email")
      .send({ email: "ivan@firma.ru", password: "secret123" });

    expect(r.status).toBe(200);
    expect(sessionStore.userId).toBe(500);
    // sanitizer: хэш пароля и magic-токен НЕ должны утекать клиенту
    expect(r.body.passwordHash).toBeUndefined();
    expect(r.body.magicToken).toBeUndefined();
    expect(r.body.email).toBe("ivan@firma.ru");
  });

  it("неверный пароль → 401, без сессии", async () => {
    const { app } = await buildApp();
    storage.getUserByEmail.mockResolvedValue(EMAIL_USER);

    const r = await request(app)
      .post("/api/auth/login-email")
      .send({ email: "ivan@firma.ru", password: "wrong" });

    expect(r.status).toBe(401);
    expect(sessionStore.userId).toBeUndefined();
  });

  it("нет такого email → 401", async () => {
    const { app } = await buildApp();
    storage.getUserByEmail.mockResolvedValue(undefined);

    const r = await request(app)
      .post("/api/auth/login-email")
      .send({ email: "nobody@firma.ru", password: "secret123" });

    expect(r.status).toBe(401);
  });
});

describe("POST /api/auth/recover — анти-энумерация", () => {
  it("существующий email → 200, новый пароль + письмо recovery", async () => {
    const { app } = await buildApp();
    storage.getUserByEmail.mockResolvedValue(EMAIL_USER);

    const r = await request(app).post("/api/auth/recover").send({ email: "ivan@firma.ru" });

    expect(r.status).toBe(200);
    expect(storage.updateUserPassword).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "recovery" }),
    );
  });

  it("несуществующий email → тоже 200, но без письма", async () => {
    const { app } = await buildApp();
    storage.getUserByEmail.mockResolvedValue(undefined);

    const r = await request(app).post("/api/auth/recover").send({ email: "ghost@firma.ru" });

    expect(r.status).toBe(200);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/magic/:token", () => {
  it("валидный токен → 302 /dashboard + сессия + clearMagicToken", async () => {
    const { app } = await buildApp();
    storage.findUserByMagicToken.mockResolvedValue(EMAIL_USER);

    const token = "a".repeat(32);
    const r = await request(app).get(`/api/auth/magic/${token}`);

    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("/dashboard");
    expect(storage.clearMagicToken).toHaveBeenCalledWith(500);
    expect(sessionStore.userId).toBe(500);
  });

  it("кривой формат токена → 302 /login?magic=invalid", async () => {
    const { app } = await buildApp();
    const r = await request(app).get("/api/auth/magic/not-a-valid-token");
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("/login?magic=invalid");
    expect(storage.findUserByMagicToken).not.toHaveBeenCalled();
  });

  it("просроченный/неизвестный токен → 302 /login?magic=expired", async () => {
    const { app } = await buildApp();
    storage.findUserByMagicToken.mockResolvedValue(undefined);
    const token = "b".repeat(32);
    const r = await request(app).get(`/api/auth/magic/${token}`);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("/login?magic=expired");
  });
});
