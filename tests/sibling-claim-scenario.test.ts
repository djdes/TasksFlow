/**
 * Integration scenario: race-for-bonus sibling claim.
 *
 * Когда воркер выполняет journal-task с siblingVisibility-flag,
 * сервер должен вызвать storage.claimSiblingTasks(...) — она
 * закрывает другие задачи в том же documentId/journalKind с
 * claimedByWorkerId=workerId, чтобы второй воркер не делал то же
 * самое.
 *
 * Регрессия: если кто-то случайно уберёт claimSiblingTasks вызов из
 * complete-handler, два воркера могут сделать одну shared-задачу,
 * оба получат премию. Compute-cost prod'у плюс UX «обоих наградили
 * за одну работу».
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiKey, Task, User, Company } from "../shared/schema";
import { hashApiKey } from "../server/api-key-crypto";

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

const WORKER_ID = 7;
const TASK_ID = 100;
const DOCUMENT_ID = "doc-2026-05";

const JOURNAL_LINK = JSON.stringify({
  kind: "wesetup-cleaning",
  baseUrl: "https://wesetup.ru",
  documentId: DOCUMENT_ID,
  rowKey: "row-1",
  label: "Уборка кухни",
  siblingVisibility: true,
  // sibling-claim триггерится ТОЛЬКО когда есть бонус — иначе нет
  // экономического смысла «гонки». Без bonus claim просто не зовётся.
  bonusAmountKopecks: 5000,
});

const TASK_PENDING_JOURNAL: Task = {
  id: TASK_ID,
  title: "Уборка кухни",
  workerId: WORKER_ID,
  requiresPhoto: false,
  photoUrl: null,
  photoUrls: null,
  examplePhotoUrl: null,
  isCompleted: false,
  weekDays: null,
  monthDay: null,
  isRecurring: true,
  price: 0,
  category: null,
  description: null,
  companyId: 42,
  journalLink: JOURNAL_LINK,
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

const TASK_PENDING_NO_JOURNAL: Task = {
  ...TASK_PENDING_JOURNAL,
  journalLink: null,
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
  storage.updateUserBalance.mockResolvedValue(undefined);
  storage.claimSiblingTasks.mockResolvedValue(0);
  storage.getCompanyById.mockResolvedValue(COMPANY);
});

describe("Sibling claim — journal task", () => {
  it("complete journal-task → claimSiblingTasks вызвана с правильным documentId/kind", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER_ID });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK_PENDING_JOURNAL);

    const r = await request(app).post(`/api/tasks/${TASK_ID}/complete`);
    expect(r.status).toBe(200);
    expect(storage.claimSiblingTasks).toHaveBeenCalledTimes(1);

    const callArgs = storage.claimSiblingTasks.mock.calls[0][0];
    expect(callArgs.documentId).toBe(DOCUMENT_ID);
    expect(callArgs.journalKind).toBe("wesetup-cleaning");
    expect(callArgs.claimedByWorkerId).toBe(WORKER_ID);
    expect(callArgs.sourceTaskId).toBe(TASK_ID);
    expect(callArgs.companyId).toBe(42);
  });

  it("complete non-journal task → claimSiblingTasks НЕ вызвана", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER_ID });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK_PENDING_NO_JOURNAL);

    const r = await request(app).post(`/api/tasks/${TASK_ID}/complete`);
    expect(r.status).toBe(200);
    // Без journalLink — sibling-claim не имеет смысла, не зовём.
    expect(storage.claimSiblingTasks).not.toHaveBeenCalled();
  });

  it("complete с malformed journalLink → claimSiblingTasks НЕ вызвана (graceful)", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER_ID });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING_JOURNAL,
      journalLink: "not-json-mess",
    });

    const r = await request(app).post(`/api/tasks/${TASK_ID}/complete`);
    expect(r.status).toBe(200);
    expect(storage.claimSiblingTasks).not.toHaveBeenCalled();
  });

  it("transitionTaskToCompleted=false → claimSiblingTasks НЕ вызвана (idempotent guard)", async () => {
    // Если задача уже completed (race-safe transition вернул false),
    // sibling-claim не имеет смысла — баланс не зачисляется, siblings
    // должны остаться нетронутыми.
    const { app } = await buildApp({ sessionUserId: WORKER_ID });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK_PENDING_JOURNAL);
    storage.transitionTaskToCompleted.mockResolvedValue(false);

    await request(app).post(`/api/tasks/${TASK_ID}/complete`);
    expect(storage.claimSiblingTasks).not.toHaveBeenCalled();
  });

  it("claimSiblingTasks throw → /complete всё равно 200 (не critical path)", async () => {
    // Если claimSibling упал по какой-то причине (DB error, etc), это
    // НЕ должно блокировать основной complete-flow. Premия зачислена,
    // task закрыта — sibling-claim это «приятный бонус», recovery
    // на следующем complete или вручную.
    const { app } = await buildApp({ sessionUserId: WORKER_ID });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(TASK_PENDING_JOURNAL);
    storage.claimSiblingTasks.mockRejectedValue(new Error("DB error"));

    const r = await request(app).post(`/api/tasks/${TASK_ID}/complete`);
    expect(r.status).toBe(200);
    // updateUserBalance всё равно должна быть вызвана (не блокируется
    // sibling failure).
  });
});
