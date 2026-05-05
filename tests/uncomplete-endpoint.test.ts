/**
 * Тесты POST /api/tasks/:id/uncomplete.
 *
 * Endpoint откатывает completed-задачу обратно в active с дебитом
 * баланса. Auth должен быть строгий — иначе любой авторизованный
 * может списать деньги с чужого баланса.
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
  getUserById: vi.fn(),
  transitionTaskToUncompleted: vi.fn(),
  updateUserBalance: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));

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

const COMPLETED_TASK: Task = {
  id: 100,
  title: "Уборка",
  workerId: 7,
  requiresPhoto: false,
  photoUrl: null,
  photoUrls: null,
  examplePhotoUrl: null,
  isCompleted: true,
  weekDays: null,
  monthDay: null,
  isRecurring: true,
  price: 50,
  category: null,
  description: null,
  companyId: 42,
  journalLink: null,
  createdAt: 0,
  completedAt: 100,
  claimedByWorkerId: null,
  verificationStatus: null,
  verifierWorkerId: null,
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
  id: 7,
  phone: "+79990000007",
  name: "Worker",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 50,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

const STRANGER: User = {
  id: 99,
  phone: "+79990000099",
  name: "Stranger",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

const apiKey = "tfk_test_uncomplete_42";
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

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.transitionTaskToUncompleted.mockResolvedValue(true);
  storage.updateUserBalance.mockResolvedValue(undefined);
});

describe("POST /api/tasks/:id/uncomplete — auth", () => {
  it("без session/key → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(
      `/api/tasks/${COMPLETED_TASK.id}/uncomplete`,
    );
    expect(r.status).toBe(401);
  });

  it("API-key чужой компании → 404", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue({
      ...VALID_API_KEY,
      companyId: 999,
    });
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue(COMPLETED_TASK);

    const r = await request(app)
      .post(`/api/tasks/${COMPLETED_TASK.id}/uncomplete`)
      .set("Authorization", `Bearer ${apiKey}`);
    expect(r.status).toBe(404);
    expect(storage.transitionTaskToUncompleted).not.toHaveBeenCalled();
  });

  it("admin может uncomplete", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(COMPLETED_TASK);

    const r = await request(app).post(
      `/api/tasks/${COMPLETED_TASK.id}/uncomplete`,
    );
    expect(r.status).toBe(200);
    expect(storage.transitionTaskToUncompleted).toHaveBeenCalledWith(
      COMPLETED_TASK.id,
    );
  });

  it("worker == task.workerId может uncomplete свою задачу", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(COMPLETED_TASK);

    const r = await request(app).post(
      `/api/tasks/${COMPLETED_TASK.id}/uncomplete`,
    );
    expect(r.status).toBe(200);
  });

  it("API-key (machine integration) может uncomplete", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue(COMPLETED_TASK);

    const r = await request(app)
      .post(`/api/tasks/${COMPLETED_TASK.id}/uncomplete`)
      .set("Authorization", `Bearer ${apiKey}`);
    expect(r.status).toBe(200);
  });

  // *** SECURITY-критичный test ***
  it("посторонний воркер (не workerId, не admin) → 403", async () => {
    // Регрессия: до фикса любой авторизованный юзер из той же компании
    // мог uncomplete чужую задачу и вычесть деньги с чужого баланса.
    // Worker A может /uncomplete на task worker'а B → balance B -= price.
    const { app } = await buildApp({ sessionUserId: STRANGER.id });
    storage.getUserById.mockResolvedValue(STRANGER);
    storage.getTask.mockResolvedValue(COMPLETED_TASK);

    const r = await request(app).post(
      `/api/tasks/${COMPLETED_TASK.id}/uncomplete`,
    );
    expect(r.status).toBe(403);
    expect(storage.transitionTaskToUncompleted).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks/:id/uncomplete — balance debit", () => {
  it("transition true + price>0 → updateUserBalance(workerId, -price)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(COMPLETED_TASK);

    await request(app).post(`/api/tasks/${COMPLETED_TASK.id}/uncomplete`);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      COMPLETED_TASK.workerId,
      -COMPLETED_TASK.price!,
    );
  });

  it("transition false (race-loser) → НЕ debit (двойной debit prev)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(COMPLETED_TASK);
    storage.transitionTaskToUncompleted.mockResolvedValue(false);

    await request(app).post(`/api/tasks/${COMPLETED_TASK.id}/uncomplete`);
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("task.isCompleted=false уже → НЕ дебит (idempotent)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({ ...COMPLETED_TASK, isCompleted: false });

    await request(app).post(`/api/tasks/${COMPLETED_TASK.id}/uncomplete`);
    expect(storage.transitionTaskToUncompleted).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks/:id/uncomplete — task not found", () => {
  it("несуществующая task → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app).post(`/api/tasks/9999/uncomplete`);
    expect(r.status).toBe(404);
  });
});
