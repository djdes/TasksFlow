import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Company, User } from "../shared/schema";

const storage = {
  getUserById: vi.fn(),
  updateCompany: vi.fn(),
  getCompanyById: vi.fn(),
};

vi.mock("../server/storage", () => ({
  storage,
}));

vi.mock("../server/mail", () => ({
  sendTaskCompletedEmail: vi.fn(),
}));

async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = { userId: 1 };
    next();
  });
  const server = createServer(app);
  await registerRoutes(server, app);
  return { app, server };
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  storage.getUserById.mockReset();
  storage.updateCompany.mockReset();
  storage.getCompanyById.mockReset();
});

describe("PUT /api/companies/me", () => {
  const admin = {
    id: 1,
    phone: "+79990000001",
    name: "Админ",
    isAdmin: true,
    createdAt: 1,
    bonusBalance: 0,
    companyId: 42,
  } satisfies User;

  it("saves WeSetup integration settings for the admin company", async () => {
    const { app } = await buildApp();
    storage.getUserById.mockResolvedValue(admin);
    storage.updateCompany.mockResolvedValue({
      id: 42,
      name: "Кафе",
      email: "admin@example.com",
      createdAt: 1,
      wesetupBaseUrl: "https://wesetup.ru",
      wesetupApiKey: "wsk_test",
    } satisfies Company);

    const response = await request(app)
      .put("/api/companies/me")
      .send({
        name: "Кафе",
        email: "admin@example.com",
        wesetupBaseUrl: "https://wesetup.ru/",
        wesetupApiKey: "wsk_test",
      });

    expect(response.status).toBe(200);
    expect(storage.updateCompany).toHaveBeenCalledWith(42, {
      name: "Кафе",
      email: "admin@example.com",
      wesetupBaseUrl: "https://wesetup.ru",
      wesetupApiKey: "wsk_test",
    });
    expect(response.body).toMatchObject({
      wesetupBaseUrl: "https://wesetup.ru",
      wesetupApiKey: "wsk_test",
    });
  });

  it("rejects invalid WeSetup base URL as JSON", async () => {
    const { app } = await buildApp();
    storage.getUserById.mockResolvedValue(admin);

    const response = await request(app)
      .put("/api/companies/me")
      .send({
        name: "Кафе",
        email: "",
        wesetupBaseUrl: "wesetup.ru",
        wesetupApiKey: "wsk_test",
      });

    expect(response.status).toBe(400);
    expect(response.type).toContain("json");
    // Текущее сообщение в Zod refine: "...должен быть публичным
    // http(s) — internal/localhost адреса запрещены". Раньше тест
    // ожидал точно "http://" — устарел после изменения формулировки.
    expect(response.body.message).toMatch(/http/i);
    expect(storage.updateCompany).not.toHaveBeenCalled();
  });

  it("расписание: дни и «ночь», которых нет в запросе (старый кабинет), не стираются", async () => {
    const { app } = await buildApp();
    storage.getUserById.mockResolvedValue(admin);
    storage.getCompanyById.mockResolvedValue({
      id: 42,
      name: "Кафе",
      notifySettings: JSON.stringify({ morning: "08:30", evening: "16:30", digest: "16:30", days: [1, 2, 3, 4, 5], quietFrom: "21:00" }),
    });
    storage.updateCompany.mockResolvedValue({ id: 42, name: "Кафе", createdAt: 1 });

    const response = await request(app)
      .put("/api/companies/me")
      .send({ name: "Кафе", notify: { morning: "09:00", evening: "16:30", digest: null } });

    expect(response.status).toBe(200);
    expect(JSON.parse(storage.updateCompany.mock.calls[0][1].notifySettings)).toEqual({
      morning: "09:00",
      evening: "16:30",
      digest: null,
      days: [1, 2, 3, 4, 5],
      quietFrom: "21:00",
    });
  });

  it("расписание: ночь длиннее 14 часов после слияния — 400 JSON, ничего не сохраняем", async () => {
    const { app } = await buildApp();
    storage.getUserById.mockResolvedValue(admin);
    storage.getCompanyById.mockResolvedValue({ id: 42, name: "Кафе", notifySettings: JSON.stringify({ morning: "07:00", evening: null, digest: null, quietFrom: "18:00" }) });

    const response = await request(app)
      .put("/api/companies/me")
      .send({ name: "Кафе", notify: { morning: "10:00", evening: null, digest: null } });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe("notify.quietFrom");
    expect(storage.updateCompany).not.toHaveBeenCalled();
  });
});
