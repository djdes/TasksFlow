/**
 * Тесты POST /api/companies/register + POST /api/users/register.
 *
 * Critical onboarding paths: единственные публичные endpoint'ы создания
 * учёток (без приглашения). Регрессия в нормализации телефона / Zod
 * валидации = клиент не сможет зарегистрироваться.
 *
 * SECURITY-важно: /users/register имеет anti-enumeration логику —
 * 3 ветки (admin не найден / не админ / без companyId) объединены в
 * одно generic-сообщение, чтобы атакующий через rate-limit'нутый бот
 * не строил реестр админов компаний.
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Company, User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserByPhone: vi.fn(),
  createUser: vi.fn(),
  createCompany: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
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
    sessionStore = sessionStore ?? {};
    req.session = sessionStore;
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return { app, server };
}

const COMPANY: Company = {
  id: 42,
  name: "ООО Ромашка",
  email: "owner@romashka.ru",
  createdAt: 1,
  wesetupBaseUrl: null,
  wesetupApiKey: null,
};

const ADMIN: User = {
  id: 10,
  phone: "+79991234567",
  name: "Owner",
  isAdmin: true,
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
  storage.createCompany.mockResolvedValue(COMPANY);
  storage.createUser.mockImplementation(async (input: any) => ({
    ...ADMIN,
    ...input,
    id: input.isAdmin ? 10 : 7,
  }));
});

describe("POST /api/companies/register — happy path", () => {
  it("валидный input → 201, создан Company + User-admin, session set", async () => {
    const { app } = await buildApp();
    storage.getUserByPhone.mockResolvedValue(undefined);

    const r = await request(app).post("/api/companies/register").send({
      phone: "+79991234567",
      companyName: "ООО Ромашка",
      adminName: "Иван",
      email: "owner@romashka.ru",
    });

    expect(r.status).toBe(201);
    expect(r.body.company).toBeDefined();
    expect(r.body.user).toBeDefined();
    expect(storage.createCompany).toHaveBeenCalledWith({
      name: "ООО Ромашка",
      email: "owner@romashka.ru",
    });
    // Auto-login после регистрации
    expect(sessionStore.userId).toBeDefined();
  });

  it("phone нормализуется (пробелы/дефисы strip)", async () => {
    const { app } = await buildApp();
    storage.getUserByPhone.mockResolvedValue(undefined);

    await request(app).post("/api/companies/register").send({
      phone: "+7 999 123-45-67",
      companyName: "Test",
      adminName: "A",
      email: "a@b.ru",
    });

    const lookup = storage.getUserByPhone.mock.calls[0][0];
    expect(lookup).not.toContain(" ");
    expect(lookup).not.toContain("-");
  });
});

describe("POST /api/companies/register — конфликты и validation", () => {
  it("phone уже занят → 400", async () => {
    const { app } = await buildApp();
    storage.getUserByPhone.mockResolvedValue(ADMIN);

    const r = await request(app).post("/api/companies/register").send({
      phone: "+79991234567",
      companyName: "X",
      adminName: "Y",
      email: "z@a.ru",
    });

    expect(r.status).toBe(400);
    expect(r.body.field).toBe("phone");
    expect(storage.createCompany).not.toHaveBeenCalled();
  });

  it("invalid phone (не +7…) → 400 Zod", async () => {
    const { app } = await buildApp();

    const r = await request(app).post("/api/companies/register").send({
      phone: "8005553535",
      companyName: "X",
      adminName: "Y",
      email: "z@a.ru",
    });

    expect(r.status).toBe(400);
    expect(storage.getUserByPhone).not.toHaveBeenCalled();
  });

  it("companyName пустой → 400", async () => {
    const { app } = await buildApp();

    const r = await request(app).post("/api/companies/register").send({
      phone: "+79991234567",
      companyName: "",
      adminName: "Y",
      email: "z@a.ru",
    });

    expect(r.status).toBe(400);
  });

  it("companyName > 255 → 400 (MySQL VARCHAR sync)", async () => {
    const { app } = await buildApp();

    const r = await request(app).post("/api/companies/register").send({
      phone: "+79991234567",
      companyName: "X".repeat(256),
      adminName: "Y",
      email: "z@a.ru",
    });

    expect(r.status).toBe(400);
  });

  it("invalid email → 400", async () => {
    const { app } = await buildApp();

    const r = await request(app).post("/api/companies/register").send({
      phone: "+79991234567",
      companyName: "X",
      adminName: "Y",
      email: "not-an-email",
    });

    expect(r.status).toBe(400);
  });
});

describe("POST /api/users/register — happy path", () => {
  it("user привязывается к компании по phone админа → 201", async () => {
    const { app } = await buildApp();
    // 1-й вызов — проверка существующего user'а (нет)
    // 2-й вызов — поиск админа (есть)
    storage.getUserByPhone.mockResolvedValueOnce(undefined);
    storage.getUserByPhone.mockResolvedValueOnce(ADMIN);

    const r = await request(app).post("/api/users/register").send({
      phone: "+79990000777",
      name: "Worker",
      adminPhone: "+79991234567",
    });

    expect(r.status).toBe(201);
    expect(storage.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+79990000777",
        name: "Worker",
        isAdmin: false,
        companyId: 42,
      }),
    );
    expect(sessionStore.userId).toBeDefined();
  });
});

describe("POST /api/users/register — anti-enumeration (security)", () => {
  // Все три ветки (нет user / не isAdmin / нет companyId) должны
  // вернуть ОДИНАКОВОЕ generic-сообщение. Иначе атакующий через rate-
  // limit'нутый бот строит реестр админов.
  const samples = [
    { case: "admin не найден", admin: undefined },
    {
      case: "найденный user не админ",
      admin: { ...ADMIN, isAdmin: false } as User,
    },
    {
      case: "admin без companyId",
      admin: { ...ADMIN, companyId: null as any } as User,
    },
  ];

  for (const sample of samples) {
    it(`${sample.case} → 400 с одинаковым generic-message`, async () => {
      const { app } = await buildApp();
      storage.getUserByPhone.mockResolvedValueOnce(undefined);
      storage.getUserByPhone.mockResolvedValueOnce(sample.admin);

      const r = await request(app).post("/api/users/register").send({
        phone: "+79990000777",
        name: "W",
        adminPhone: "+79990000999",
      });

      expect(r.status).toBe(400);
      expect(r.body.field).toBe("adminPhone");
      // Generic-message: «не получилось привязаться … уточните у админа»
      expect(r.body.message).toMatch(/не получилось/i);
      expect(r.body.message).toMatch(/админ/i);
      expect(storage.createUser).not.toHaveBeenCalled();
    });
  }

  it("все три ветки возвращают идентичный message", async () => {
    const messages: string[] = [];
    for (const sample of samples) {
      const { app } = await buildApp();
      storage.getUserByPhone.mockReset();
      storage.getUserByPhone.mockResolvedValueOnce(undefined);
      storage.getUserByPhone.mockResolvedValueOnce(sample.admin);
      const r = await request(app).post("/api/users/register").send({
        phone: "+79990000777",
        name: "W",
        adminPhone: "+79990000999",
      });
      messages.push(r.body.message);
    }
    // КРИТИЧНО: anti-enumeration → все 3 message строго равны
    expect(new Set(messages).size).toBe(1);
  });
});

describe("POST /api/users/register — validation", () => {
  it("phone уже зарегистрирован → 400", async () => {
    const { app } = await buildApp();
    storage.getUserByPhone.mockResolvedValueOnce(ADMIN);

    const r = await request(app).post("/api/users/register").send({
      phone: "+79991234567",
      name: "W",
      adminPhone: "+79990000999",
    });

    expect(r.status).toBe(400);
    expect(r.body.field).toBe("phone");
    expect(storage.createUser).not.toHaveBeenCalled();
  });

  it("name пустой → 400", async () => {
    const { app } = await buildApp();

    const r = await request(app).post("/api/users/register").send({
      phone: "+79990000777",
      name: "",
      adminPhone: "+79991234567",
    });

    expect(r.status).toBe(400);
    expect(storage.getUserByPhone).not.toHaveBeenCalled();
  });

  it("invalid adminPhone → 400 Zod", async () => {
    const { app } = await buildApp();

    const r = await request(app).post("/api/users/register").send({
      phone: "+79990000777",
      name: "W",
      adminPhone: "not-a-phone",
    });

    expect(r.status).toBe(400);
  });
});
