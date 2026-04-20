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
});
