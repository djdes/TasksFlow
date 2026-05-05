/**
 * Тесты POST /api/tasks/:id/mark-returned (recent commit bafc6bd
 * + security cap'ы dcbf298/20d2835).
 *
 * Endpoint позволяет verifier-zerkalu в WeSetup отмечать TF-задачу
 * как «возвращённую сотруднику» (rejected verification status). Auth:
 * API-key или session admin. Простой воркер не может вернуть чужую
 * задачу.
 */

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
import type { ApiKey, Task, User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  getUserById: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));

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

const TASK: Task = {
  id: 100,
  title: "Уборка зала",
  workerId: 7,
  requiresPhoto: false,
  photoUrl: null,
  photoUrls: null,
  examplePhotoUrl: null,
  isCompleted: false,
  weekDays: null,
  monthDay: null,
  isRecurring: true,
  price: 50,
  category: null,
  description: null,
  companyId: 42,
  journalLink: null,
  createdAt: 0,
  completedAt: null,
  claimedByWorkerId: null,
  verificationStatus: "submitted",
  verifierWorkerId: 5,
  verifiedByUserId: null,
  verifiedAt: null,
  rejectReason: null,
  submittedValues: null,
} as Task;

const ADMIN: User = {
  id: 10,
  phone: "+79990000010",
  name: "Admin",
  isAdmin: true,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

const WORKER: User = {
  ...ADMIN,
  id: 7,
  isAdmin: false,
  name: "Worker",
};

const apiKey = "tfk_test_mark_returned_42";

const VALID_API_KEY: ApiKey = {
  id: 1,
  name: "WeSetup",
  keyHash: hashApiKey(apiKey),
  keyPrefix: apiKey.slice(0, 12),
  companyId: 42,
  createdByUserId: 1,
  createdAt: 1,
  lastUsedAt: 0,
  revokedAt: 0,
} as ApiKey;

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
});

describe("POST /api/tasks/:id/mark-returned — happy path", () => {
  it("API-key + valid reason → 200, updateTask вызван с rejected статусом", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue(TASK);
    storage.updateTask.mockResolvedValue(TASK);

    const response = await request(app)
      .post(`/api/tasks/${TASK.id}/mark-returned`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ reason: "Не та форма заполнена" });

    expect(response.status).toBe(200);
    expect(storage.updateTask).toHaveBeenCalledWith(
      TASK.id,
      expect.objectContaining({
        verificationStatus: "rejected",
        rejectReason: "Не та форма заполнена",
      }),
    );
  });

  it("admin session + reason → 200", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK);
    storage.updateTask.mockResolvedValue(TASK);

    const response = await request(app)
      .post(`/api/tasks/${TASK.id}/mark-returned`)
      .send({ reason: "Уточните детали" });

    expect(response.status).toBe(200);
  });
});

describe("POST /api/tasks/:id/mark-returned — auth", () => {
  it("без auth (нет session, нет API key) → 401", async () => {
    const { app } = await buildApp();

    const response = await request(app)
      .post(`/api/tasks/${TASK.id}/mark-returned`)
      .send({ reason: "test" });

    expect(response.status).toBe(401);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("worker session (не admin) → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK);

    const response = await request(app)
      .post(`/api/tasks/${TASK.id}/mark-returned`)
      .send({ reason: "test" });

    expect(response.status).toBe(403);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks/:id/mark-returned — multi-tenant scope", () => {
  it("API-key компании ≠ company задачи → 404", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue({
      ...VALID_API_KEY,
      companyId: 999,
    });
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue(TASK);

    const response = await request(app)
      .post(`/api/tasks/${TASK.id}/mark-returned`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ reason: "test" });

    expect(response.status).toBe(404);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks/:id/mark-returned — input validation", () => {
  it("без reason → 400", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);

    const response = await request(app)
      .post(`/api/tasks/${TASK.id}/mark-returned`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({});

    expect(response.status).toBe(400);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("reason типа number (не string) → 400 (typeof guard)", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);

    const response = await request(app)
      .post(`/api/tasks/${TASK.id}/mark-returned`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ reason: 123 });

    expect(response.status).toBe(400);
  });

  it("reason длиннее 1000 → cap до 1000 (security commit dcbf298)", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue(TASK);
    storage.updateTask.mockResolvedValue(TASK);

    const longReason = "x".repeat(5000);

    await request(app)
      .post(`/api/tasks/${TASK.id}/mark-returned`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ reason: longReason });

    expect(storage.updateTask).toHaveBeenCalledWith(
      TASK.id,
      expect.objectContaining({
        rejectReason: "x".repeat(1000),
      }),
    );
  });

  it("несуществующая task → 404", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue(undefined);

    const response = await request(app)
      .post(`/api/tasks/9999/mark-returned`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ reason: "test" });

    expect(response.status).toBe(404);
  });
});

describe("POST /api/tasks/:id/mark-returned — completed task", () => {
  it("уже завершённую задачу переоткрывает (isCompleted: false)", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue({ ...TASK, isCompleted: true });
    storage.updateTask.mockResolvedValue(TASK);

    await request(app)
      .post(`/api/tasks/${TASK.id}/mark-returned`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ reason: "Переделать" });

    expect(storage.updateTask).toHaveBeenCalledWith(
      TASK.id,
      expect.objectContaining({
        isCompleted: false,
        verificationStatus: "rejected",
      }),
    );
  });
});
