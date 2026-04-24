import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Company, User } from "../shared/schema";

const storage = {
  getUserById: vi.fn(),
  updateCompany: vi.fn(),
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
    expect(response.body.message).toContain("http://");
    expect(storage.updateCompany).not.toHaveBeenCalled();
  });
});
