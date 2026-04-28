import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { hashApiKey } from "../server/api-key-crypto";
import type { ApiKey, User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserByPhone: vi.fn(),
  createUser: vi.fn(),
  setUserAdmin: vi.fn(),
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
    req.session = {};
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
  storage.getApiKeyByHash.mockReset();
  storage.updateApiKeyLastUsed.mockReset();
  storage.getUserByPhone.mockReset();
  storage.createUser.mockReset();
  storage.setUserAdmin.mockReset();
});

describe("POST /api/users with API key", () => {
  it(
    "creates a non-admin user inside the key company",
    async () => {
      const apiKey = "tfk_test_create_user_key";
      const { app } = await buildApp();

    storage.getApiKeyByHash.mockResolvedValue({
      id: 5,
      name: "WeSetup",
      keyHash: hashApiKey(apiKey),
      keyPrefix: apiKey.slice(0, 12),
      companyId: 42,
      createdByUserId: 1,
      createdAt: 1,
      lastUsedAt: 0,
      revokedAt: 0,
    } satisfies ApiKey);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserByPhone.mockResolvedValue(undefined);
    storage.createUser.mockResolvedValue({
      id: 77,
      phone: "+79990001122",
      name: "Иван",
      isAdmin: false,
      createdAt: 1,
      bonusBalance: 0,
      companyId: 42,
    } satisfies User);

    const response = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        phone: "+79990001122",
        name: "Иван",
      });

      expect(response.status).toBe(201);
      expect(storage.createUser).toHaveBeenCalledWith({
        phone: "+79990001122",
        name: "Иван",
        isAdmin: false,
        companyId: 42,
        position: null,
      });
      expect(response.body).toMatchObject({
        id: 77,
        phone: "+79990001122",
        name: "Иван",
        isAdmin: false,
        companyId: 42,
      });
    },
    15000
  );

  it("creates a manager as an admin user when requested by integration", async () => {
    const apiKey = "tfk_test_create_manager_key";
    const { app } = await buildApp();

    storage.getApiKeyByHash.mockResolvedValue({
      id: 6,
      name: "WeSetup",
      keyHash: hashApiKey(apiKey),
      keyPrefix: apiKey.slice(0, 12),
      companyId: 42,
      createdByUserId: 1,
      createdAt: 1,
      lastUsedAt: 0,
      revokedAt: 0,
    } satisfies ApiKey);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserByPhone.mockResolvedValue(undefined);
    storage.createUser.mockResolvedValue({
      id: 78,
      phone: "+79990001123",
      name: "Менеджер",
      isAdmin: true,
      createdAt: 1,
      bonusBalance: 0,
      companyId: 42,
    } satisfies User);

    const response = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        phone: "+79990001123",
        name: "Менеджер",
        role: "manager",
      });

    expect(response.status).toBe(201);
    expect(storage.createUser).toHaveBeenCalledWith({
      phone: "+79990001123",
      name: "Менеджер",
      isAdmin: true,
      companyId: 42,
      position: null,
    });
    expect(response.body).toMatchObject({
      id: 78,
      isAdmin: true,
      companyId: 42,
    });
  });

  it("promotes an existing company user when integration later marks them as manager", async () => {
    const apiKey = "tfk_test_promote_manager_key";
    const { app } = await buildApp();
    const existing = {
      id: 79,
      phone: "+79990001124",
      name: "Менеджер",
      isAdmin: false,
      createdAt: 1,
      bonusBalance: 0,
      companyId: 42,
    } satisfies User;

    storage.getApiKeyByHash.mockResolvedValue({
      id: 7,
      name: "WeSetup",
      keyHash: hashApiKey(apiKey),
      keyPrefix: apiKey.slice(0, 12),
      companyId: 42,
      createdByUserId: 1,
      createdAt: 1,
      lastUsedAt: 0,
      revokedAt: 0,
    } satisfies ApiKey);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getUserByPhone.mockResolvedValue(existing);
    storage.setUserAdmin.mockResolvedValue({
      ...existing,
      isAdmin: true,
    } satisfies User);

    const response = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        phone: "+79990001124",
        name: "Менеджер",
        isAdmin: true,
      });

    expect(response.status).toBe(200);
    expect(storage.setUserAdmin).toHaveBeenCalledWith(79, true);
    expect(response.body).toMatchObject({
      id: 79,
      isAdmin: true,
      companyId: 42,
    });
  });
});
