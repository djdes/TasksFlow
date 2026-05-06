/**
 * Integration scenario для двухстадийной верификации.
 *
 * Существующие verify-endpoint тесты проверяют auth, status checks,
 * reason validation. Этот тест документирует side-effects:
 *   • approve  → balance credit + sibling-claim для journal-bonus
 *   • reject   → НЕ balance, НЕ sibling-claim (асимметрия)
 *
 * Регрессия защищена: если кто-то скопирует side-effects из approve
 * в reject (потеряв симметрию), worker'ы получат премию за
 * отклонённую работу.
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Task, User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getTask: vi.fn(),
  getUserById: vi.fn(),
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
// db нужен в reject-flow для очистки submittedValues. Mock на no-op.
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

const VERIFIER_ID = 5;
const WORKER_ID = 7;
const TASK_ID = 100;

const TASK_SUBMITTED_PLAIN: Task = {
  id: TASK_ID,
  title: "Тест",
  workerId: WORKER_ID,
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
  verifierWorkerId: VERIFIER_ID,
  verifiedByUserId: null,
  verifiedAt: null,
  rejectReason: null,
  submittedValues: null,
} as Task;

const TASK_SUBMITTED_JOURNAL_BONUS: Task = {
  ...TASK_SUBMITTED_PLAIN,
  price: 0, // bonus в journalLink, не в price
  journalLink: JSON.stringify({
    kind: "wesetup-cleaning",
    baseUrl: "https://wesetup.ru",
    documentId: "doc-1",
    rowKey: "row-1",
    bonusAmountKopecks: 5000,
  }),
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

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.approveVerification.mockResolvedValue(true);
  storage.rejectVerification.mockResolvedValue(true);
  storage.updateUserBalance.mockResolvedValue(undefined);
  storage.claimSiblingTasks.mockResolvedValue(0);
});

describe("Verify approve — side effects", () => {
  it("approve plain task (price>0) → updateUserBalance(+price) вызвана", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER_ID });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue(TASK_SUBMITTED_PLAIN);

    const r = await request(app)
      .post(`/api/tasks/${TASK_ID}/verify`)
      .send({ decision: "approve" });
    expect(r.status).toBe(200);
    expect(storage.approveVerification).toHaveBeenCalledWith(
      TASK_ID,
      VERIFIER_ID,
    );
    expect(storage.updateUserBalance).toHaveBeenCalledWith(WORKER_ID, 50);
  });

  it("approve journal-task с bonus → claimSiblingTasks вызвана", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER_ID });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue(TASK_SUBMITTED_JOURNAL_BONUS);

    await request(app)
      .post(`/api/tasks/${TASK_ID}/verify`)
      .send({ decision: "approve" });
    expect(storage.claimSiblingTasks).toHaveBeenCalledTimes(1);
    const args = storage.claimSiblingTasks.mock.calls[0][0];
    expect(args.documentId).toBe("doc-1");
    expect(args.journalKind).toBe("wesetup-cleaning");
    expect(args.claimedByWorkerId).toBe(WORKER_ID);
  });

  it("approveVerification=false (idempotent / уже approved) → updateBalance НЕ вызвана", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER_ID });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue(TASK_SUBMITTED_PLAIN);
    storage.approveVerification.mockResolvedValue(false);

    await request(app)
      .post(`/api/tasks/${TASK_ID}/verify`)
      .send({ decision: "approve" });
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
    expect(storage.claimSiblingTasks).not.toHaveBeenCalled();
  });

  it("price=0, нет journalBonus → balance НЕ зачислена", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER_ID });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue({
      ...TASK_SUBMITTED_PLAIN,
      price: 0,
    });

    await request(app)
      .post(`/api/tasks/${TASK_ID}/verify`)
      .send({ decision: "approve" });
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });
});

describe("Verify reject — НЕТ side effects (асимметрия с approve)", () => {
  it("reject plain task с price>0 → balance НЕ зачислена", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER_ID });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue(TASK_SUBMITTED_PLAIN);

    const r = await request(app)
      .post(`/api/tasks/${TASK_ID}/verify`)
      .send({ decision: "reject", reason: "не сделано" });
    expect(r.status).toBe(200);
    expect(storage.rejectVerification).toHaveBeenCalledWith(
      TASK_ID,
      VERIFIER_ID,
      "не сделано",
    );
    // КРИТИЧНО: НЕ зачислять премию за отклонённую работу.
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("reject journal-task с bonus → claimSiblingTasks НЕ вызвана", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER_ID });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue(TASK_SUBMITTED_JOURNAL_BONUS);

    await request(app)
      .post(`/api/tasks/${TASK_ID}/verify`)
      .send({ decision: "reject", reason: "плохое фото" });
    expect(storage.claimSiblingTasks).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("reject reason = trim'ится перед сохранением", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER_ID });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue(TASK_SUBMITTED_PLAIN);

    await request(app)
      .post(`/api/tasks/${TASK_ID}/verify`)
      .send({ decision: "reject", reason: "   плохое   " });
    // routes.ts должен trim'нуть, иначе rejectReason в БД = "   плохое   "
    // и уродливо отображается воркеру.
    expect(storage.rejectVerification).toHaveBeenCalledWith(
      TASK_ID,
      VERIFIER_ID,
      "плохое",
    );
  });
});
