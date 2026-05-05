/**
 * Тесты POST /api/tasks/:id/complete (core verification flow).
 *
 * Это самый critical endpoint в системе. Логика:
 *   1. Get task → 404 если нет
 *   2. Multi-tenant scope (companyId)
 *   3. Auth: API-key, worker (= task.workerId), session admin
 *   4. Idempotent: уже isCompleted → 200, current state
 *   5. Phase 1: уже submitted → 200 без изменений (защита от double-submit)
 *   6. Photo requirement: requiresPhoto=true, нет photoUrl/photoUrls → 400
 *   7. Verification path: verifierWorkerId set + caller≠verifier →
 *      submitForVerification (без credit!)
 *   8. Иначе: atomic transitionTaskToCompleted → balance credit →
 *      sibling claim → email → WeSetup mirror webhook
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
import type { ApiKey, Task, User, Company } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getTask: vi.fn(),
  getUserById: vi.fn(),
  transitionTaskToCompleted: vi.fn(),
  submitForVerification: vi.fn(),
  updateUserBalance: vi.fn(),
  claimSiblingTasks: vi.fn(),
  getCompanyById: vi.fn(),
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

const TASK_PENDING: Task = {
  id: 100,
  title: "Уборка",
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
  bonusBalance: 0,
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

const COMPANY: Company = {
  id: 42,
  name: "Test Co",
  email: "test@example.com",
  createdAt: 1,
  wesetupBaseUrl: null,
  wesetupApiKey: null,
};

const apiKey = "tfk_test_complete_42";
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
  // Default returns
  storage.transitionTaskToCompleted.mockResolvedValue(true);
  storage.updateUserBalance.mockResolvedValue(undefined);
  storage.claimSiblingTasks.mockResolvedValue(0);
  storage.getCompanyById.mockResolvedValue(COMPANY);
});

describe("POST /api/tasks/:id/complete — auth", () => {
  it("без session/key → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).post(`/api/tasks/${TASK_PENDING.id}/complete`);
    expect(r.status).toBe(401);
  });

  it("API-key компании ≠ task.companyId → 404 (multi-tenant)", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue({
      ...VALID_API_KEY,
      companyId: 999,
    });
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue(TASK_PENDING);

    const r = await request(app)
      .post(`/api/tasks/${TASK_PENDING.id}/complete`)
      .set("Authorization", `Bearer ${apiKey}`);
    expect(r.status).toBe(404);
  });

  it("посторонний воркер (не workerId, не admin) → 403", async () => {
    const { app } = await buildApp({ sessionUserId: STRANGER.id });
    storage.getUserById.mockResolvedValue(STRANGER);
    storage.getTask.mockResolvedValue(TASK_PENDING);

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(403);
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
  });

  it("worker == task.workerId → success", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK_PENDING);

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(200);
    expect(storage.transitionTaskToCompleted).toHaveBeenCalledWith(
      TASK_PENDING.id,
    );
  });

  it("admin может complete чужую задачу", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_PENDING);

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(200);
  });
});

describe("POST /api/tasks/:id/complete — idempotent paths", () => {
  it("уже completed → 200, БЕЗ повторного credit'а", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING,
      isCompleted: true,
    });

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(200);
    // Critical: повторный credit balance = двойная оплата = баг
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("уже submitted (Phase 1) от не-API-key → 200, без changes", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING,
      verificationStatus: "submitted",
      verifierWorkerId: 5,
    });

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(200);
    expect(storage.submitForVerification).not.toHaveBeenCalled();
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks/:id/complete — photo requirement", () => {
  it("requiresPhoto=true, нет фото → 400", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING,
      requiresPhoto: true,
      photoUrl: null,
      photoUrls: null,
    });

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(400);
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
  });

  it("requiresPhoto=true, photoUrl задан → success", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING,
      requiresPhoto: true,
      photoUrl: "/uploads/x.jpg",
    });

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(200);
  });

  it("requiresPhoto=true, photoUrls массив непустой → success", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING,
      requiresPhoto: true,
      photoUrls: ["/uploads/a.jpg", "/uploads/b.jpg"] as any,
    });

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(200);
  });
});

describe("POST /api/tasks/:id/complete — verification flow", () => {
  it("verifier_worker_id set + caller≠verifier → submitForVerification (БЕЗ credit'а)", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING,
      verifierWorkerId: 5,
    });
    storage.submitForVerification.mockResolvedValue(true);

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(200);
    expect(storage.submitForVerification).toHaveBeenCalledWith(
      TASK_PENDING.id,
    );
    // Critical: balance НЕ credit'ится до verifier approve
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("verifier == caller (сам себе verifier) → нормальный complete-path", async () => {
    const { app } = await buildApp({ sessionUserId: 5 });
    storage.getUserById.mockResolvedValue({ ...WORKER, id: 5 });
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING,
      workerId: 5,
      verifierWorkerId: 5,
    });

    const r = await request(app).post(
      `/api/tasks/${TASK_PENDING.id}/complete`,
    );
    expect(r.status).toBe(200);
    // Сам себе verifier → не submit, обычный complete
    expect(storage.submitForVerification).not.toHaveBeenCalled();
    expect(storage.transitionTaskToCompleted).toHaveBeenCalled();
  });

  it("API-key обходит verification path (machine integration)", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING,
      verifierWorkerId: 5,
    });

    const r = await request(app)
      .post(`/api/tasks/${TASK_PENDING.id}/complete`)
      .set("Authorization", `Bearer ${apiKey}`);
    expect(r.status).toBe(200);
    // API-key игнорирует verification, делает прямой complete
    expect(storage.submitForVerification).not.toHaveBeenCalled();
    expect(storage.transitionTaskToCompleted).toHaveBeenCalled();
  });
});

describe("POST /api/tasks/:id/complete — balance credit", () => {
  it("price > 0 и transition success → updateUserBalance(workerId, +price)", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK_PENDING);
    storage.transitionTaskToCompleted.mockResolvedValue(true);

    await request(app).post(`/api/tasks/${TASK_PENDING.id}/complete`);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      WORKER.id,
      TASK_PENDING.price,
    );
  });

  it("transition вернул false (race-loser) → НЕ credit'им", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK_PENDING);
    // Race scenario: someone else won
    storage.transitionTaskToCompleted.mockResolvedValue(false);

    await request(app).post(`/api/tasks/${TASK_PENDING.id}/complete`);
    // Critical: race-loser не должен начислять баланс
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("price = 0 → НЕ credit'им (нет смысла updateBalance(0))", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({ ...TASK_PENDING, price: 0 });

    await request(app).post(`/api/tasks/${TASK_PENDING.id}/complete`);
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("price > 0, workerId=null → НЕ credit'им (некому)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({ ...TASK_PENDING, workerId: null });

    await request(app).post(`/api/tasks/${TASK_PENDING.id}/complete`);
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks/:id/complete — task not found", () => {
  it("несуществующая task → 404", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app).post(`/api/tasks/9999/complete`);
    expect(r.status).toBe(404);
  });
});
