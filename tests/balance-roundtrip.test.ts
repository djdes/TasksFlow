/**
 * Integration scenario: balance round-trip через
 * complete → uncomplete → complete снова.
 *
 * Существующие тесты (complete-endpoint.test.ts, uncomplete-endpoint.
 * test.ts) проверяют отдельные операции. Этот тест документирует что
 * последовательность работает корректно — каждая операция вызывает
 * updateUserBalance с правильным delta.
 *
 * Регрессия: если кто-то введёт side-effect (например, идемпотентный
 * флаг «balance уже зачислен» который не сбрасывается при uncomplete),
 * complete после uncomplete не зачислит снова — UX-баг, воркер сделал
 * заново но премии нет.
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

import type { ApiKey, Task, User, Company } from "../shared/schema";
import { hashApiKey } from "../server/api-key-crypto";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getTask: vi.fn(),
  getUserById: vi.fn(),
  transitionTaskToCompleted: vi.fn(),
  transitionTaskToUncompleted: vi.fn(),
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

const TASK_ID = 100;
const WORKER_ID = 7;
const TASK_PRICE = 50;

const TASK_PENDING: Task = {
  id: TASK_ID,
  title: "Уборка",
  workerId: WORKER_ID,
  requiresPhoto: false,
  photoUrl: null,
  photoUrls: null,
  examplePhotoUrl: null,
  isCompleted: false,
  weekDays: null,
  monthDay: null,
  isRecurring: true,
  price: TASK_PRICE,
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

const TASK_COMPLETED: Task = {
  ...TASK_PENDING,
  isCompleted: true,
  completedAt: 1000,
};

const WORKER: User = {
  id: WORKER_ID,
  phone: "+79990000007",
  name: "Worker",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

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

const COMPANY: Company = {
  id: 42,
  name: "Test Co",
  email: "test@example.com",
  createdAt: 1,
  wesetupBaseUrl: null,
  wesetupApiKey: null,
};

const apiKey = "tfk_balance_roundtrip_42";
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
  storage.transitionTaskToCompleted.mockResolvedValue(true);
  storage.transitionTaskToUncompleted.mockResolvedValue(true);
  storage.updateUserBalance.mockResolvedValue(undefined);
  storage.claimSiblingTasks.mockResolvedValue(0);
  storage.getCompanyById.mockResolvedValue(COMPANY);
});

describe("Balance round-trip: complete → uncomplete → complete", () => {
  it("каждая операция начисляет/дебетует баланс отдельно", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    // ═══════════════ Step 1: complete (price=50, +50) ═══════════════
    storage.getTask.mockResolvedValue(TASK_PENDING);
    const r1 = await request(app).post(`/api/tasks/${TASK_ID}/complete`);
    expect(r1.status).toBe(200);
    expect(storage.transitionTaskToCompleted).toHaveBeenCalledWith(TASK_ID);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      WORKER_ID,
      TASK_PRICE,
    );

    // ═══════════════ Step 2: uncomplete (-50) ═══════════════
    storage.getTask.mockResolvedValue(TASK_COMPLETED);
    storage.updateUserBalance.mockClear();
    const r2 = await request(app).post(`/api/tasks/${TASK_ID}/uncomplete`);
    expect(r2.status).toBe(200);
    expect(storage.transitionTaskToUncompleted).toHaveBeenCalledWith(TASK_ID);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      WORKER_ID,
      -TASK_PRICE,
    );

    // ═══════════════ Step 3: complete снова (+50) ═══════════════
    // Защита от регрессии: воркер сделал заново — премия должна
    // зачислиться. Нет idempotency-флага «уже один раз был completed».
    storage.getTask.mockResolvedValue(TASK_PENDING);
    storage.updateUserBalance.mockClear();
    storage.transitionTaskToCompleted.mockClear();
    storage.transitionTaskToCompleted.mockResolvedValue(true);
    const r3 = await request(app).post(`/api/tasks/${TASK_ID}/complete`);
    expect(r3.status).toBe(200);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      WORKER_ID,
      TASK_PRICE,
    );
  });

  it("complete (transition=true=НЕ был) → updateBalance вызвана", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_PENDING);
    storage.transitionTaskToCompleted.mockResolvedValue(true);

    await request(app).post(`/api/tasks/${TASK_ID}/complete`);

    expect(storage.updateUserBalance).toHaveBeenCalledTimes(1);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      WORKER_ID,
      TASK_PRICE,
    );
  });

  it("complete idempotent (transition=false=уже был) → updateBalance НЕ вызвана", async () => {
    // Race-safe защита: если параллельно два POST /complete пришли на
    // ту же задачу, transitionTaskToCompleted=true вернётся ТОЛЬКО
    // первому. Второй получит false → updateUserBalance НЕ вызывается.
    // Без этого был бы double-credit.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_PENDING);
    storage.transitionTaskToCompleted.mockResolvedValue(false);

    await request(app).post(`/api/tasks/${TASK_ID}/complete`);

    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("uncomplete idempotent → updateBalance НЕ вызвана если уже не completed", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_COMPLETED);
    storage.transitionTaskToUncompleted.mockResolvedValue(false);

    await request(app).post(`/api/tasks/${TASK_ID}/uncomplete`);

    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("price=0 → balance не дебетуется/начисляется", async () => {
    const TASK_FREE: Task = { ...TASK_PENDING, price: 0 };
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_FREE);

    await request(app).post(`/api/tasks/${TASK_ID}/complete`);

    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });
});
