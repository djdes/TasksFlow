/**
 * Integration scenario: полный двухстадийный flow.
 *
 *   1. Worker (filler) /complete  →  task → "submitted" (NO balance)
 *   2. Verifier /verify approve   →  balance + sibling-claim
 *
 * Существующие тесты проверяют каждый endpoint отдельно. Этот тест
 * документирует полный пользовательский путь.
 *
 * Регрессия: если кто-то изменит когда balance зачисляется (например,
 * случайно положит updateUserBalance в /complete handler даже для
 * verifier-required-задач), worker получит премию ДО проверки —
 * руководитель reject'нет за плохую работу но премия уже выплачена.
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Task, User, Company } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getTask: vi.fn(),
  getUserById: vi.fn(),
  transitionTaskToCompleted: vi.fn(),
  submitForVerification: vi.fn(),
  approveVerification: vi.fn(),
  rejectVerification: vi.fn(),
  updateUserBalance: vi.fn(),
  claimSiblingTasks: vi.fn(),
  getCompanyById: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../server/db", () => ({
  db: {
    update: () => ({ set: () => ({ where: () => ({ catch: () => null }) }) }),
  },
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

const FILLER_ID = 7;
const VERIFIER_ID = 5;
const TASK_ID = 100;
const TASK_PRICE = 50;

const TASK_PENDING_VERIFIER: Task = {
  id: TASK_ID,
  title: "Уборка",
  workerId: FILLER_ID,
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
  verifierWorkerId: VERIFIER_ID,
  verifiedByUserId: null,
  verifiedAt: null,
  rejectReason: null,
  submittedValues: null,
} as Task;

const TASK_SUBMITTED: Task = {
  ...TASK_PENDING_VERIFIER,
  verificationStatus: "submitted",
};

const FILLER: User = {
  id: FILLER_ID,
  phone: "+79990000007",
  name: "Filler Worker",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

const VERIFIER: User = {
  id: VERIFIER_ID,
  phone: "+79990000005",
  name: "Verifier",
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

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.transitionTaskToCompleted.mockResolvedValue(true);
  storage.submitForVerification.mockResolvedValue(true);
  storage.approveVerification.mockResolvedValue(true);
  storage.rejectVerification.mockResolvedValue(true);
  storage.updateUserBalance.mockResolvedValue(undefined);
  storage.claimSiblingTasks.mockResolvedValue(0);
  storage.getCompanyById.mockResolvedValue(COMPANY);
});

describe("Two-stage flow: filler complete → verifier approve", () => {
  it("filler /complete → submitForVerification, balance НЕ зачислена", async () => {
    const { app } = await buildApp({ sessionUserId: FILLER_ID });
    storage.getUserById.mockResolvedValue(FILLER);
    storage.getTask.mockResolvedValue(TASK_PENDING_VERIFIER);

    const r = await request(app).post(`/api/tasks/${TASK_ID}/complete`);
    expect(r.status).toBe(200);

    expect(storage.submitForVerification).toHaveBeenCalledWith(TASK_ID);
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
    // КРИТИЧНО: balance НЕ зачислена до approve.
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
    expect(storage.claimSiblingTasks).not.toHaveBeenCalled();
  });

  it("verifier /verify approve → balance НАКОНЕЦ зачислена", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER_ID });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue(TASK_SUBMITTED);

    const r = await request(app)
      .post(`/api/tasks/${TASK_ID}/verify`)
      .send({ decision: "approve" });
    expect(r.status).toBe(200);

    expect(storage.approveVerification).toHaveBeenCalledWith(
      TASK_ID,
      VERIFIER_ID,
    );
    // Balance зачислена ИМЕННО на approve.
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      FILLER_ID,
      TASK_PRICE,
    );
  });

  it("verifier /verify reject → balance НЕ зачислена", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER_ID });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue(TASK_SUBMITTED);

    await request(app)
      .post(`/api/tasks/${TASK_ID}/verify`)
      .send({ decision: "reject", reason: "плохо" });

    expect(storage.rejectVerification).toHaveBeenCalledWith(
      TASK_ID,
      VERIFIER_ID,
      "плохо",
    );
    // Balance не зачислена (reject ≠ approve).
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("filler == verifier (один воркер за обе роли) → /complete обычный flow, balance сразу", async () => {
    // Edge case: руководитель сам в смене, и filler и verifier == он.
    // В этом случае Phase 1 не нужна — старое поведение, transition+balance.
    const TASK_SELF_VERIFY: Task = {
      ...TASK_PENDING_VERIFIER,
      verifierWorkerId: FILLER_ID, // verifier == filler
    };
    const { app } = await buildApp({ sessionUserId: FILLER_ID });
    storage.getUserById.mockResolvedValue(FILLER);
    storage.getTask.mockResolvedValue(TASK_SELF_VERIFY);

    await request(app).post(`/api/tasks/${TASK_ID}/complete`);

    // Не submit, не verify — обычный complete-flow:
    expect(storage.submitForVerification).not.toHaveBeenCalled();
    expect(storage.transitionTaskToCompleted).toHaveBeenCalledWith(TASK_ID);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      FILLER_ID,
      TASK_PRICE,
    );
  });

  it("API-key всегда bypass verification (WeSetup автоматизация)", async () => {
    // WeSetup integration apruvят на своей стороне, у нас должен быть
    // прямой complete без Phase 1.
    const { app } = await buildApp();
    const apiKey = "tfk_two_stage_bypass";
    const { hashApiKey } = await import("../server/api-key-crypto");
    storage.getApiKeyByHash.mockResolvedValue({
      id: 1,
      keyHash: hashApiKey(apiKey),
      keyPrefix: apiKey.slice(0, 12),
      companyId: 42,
      createdByUserId: 1,
      createdAt: 1,
      lastUsedAt: 0,
      revokedAt: 0,
    });
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue(TASK_PENDING_VERIFIER);

    await request(app)
      .post(`/api/tasks/${TASK_ID}/complete`)
      .set("Authorization", `Bearer ${apiKey}`);

    // API-key пропускает Phase 1.
    expect(storage.submitForVerification).not.toHaveBeenCalled();
    expect(storage.transitionTaskToCompleted).toHaveBeenCalledWith(TASK_ID);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      FILLER_ID,
      TASK_PRICE,
    );
  });
});
