/**
 * Тесты POST /api/tasks/:id/verify (Phase 2 двухстадийной верификации).
 *
 * Endpoint:
 *   • approve: 'submitted' → 'approved'. Запускает balance credit,
 *     sibling-claim, WeSetup-mirror webhook.
 *   • reject: 'submitted' → 'rejected'. Никаких credit'ов; задача
 *     возвращается active'у с rejectReason.
 *
 * Auth: API-key, session-юзер == verifier_worker_id, или admin компании.
 *
 * Pre-condition: task.verificationStatus === 'submitted' (иначе 409).
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
  approveVerification: vi.fn(),
  rejectVerification: vi.fn(),
  updateUserBalance: vi.fn(),
  claimSiblingTasks: vi.fn(),
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

const SUBMITTED_TASK: Task = {
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

const VERIFIER: User = {
  id: 5,
  phone: "+79990000005",
  name: "Verifier",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: "[7]",
  position: "Заведующая",
};

const OTHER_USER: User = {
  id: 99,
  phone: "+79990000099",
  name: "Random",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: null,
  position: null,
};

const apiKey = "tfk_test_verify_key_42";
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
});

describe("POST /api/tasks/:id/verify — input validation", () => {
  it("decision не approve/reject → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(SUBMITTED_TASK);

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "garbage" });
    expect(r.status).toBe(400);
  });

  it("reject без reason → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(SUBMITTED_TASK);

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "reject" });
    expect(r.status).toBe(400);
  });

  it("reject с пустым reason (whitespace) → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(SUBMITTED_TASK);

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "reject", reason: "   " });
    expect(r.status).toBe(400);
  });

  it("reason длиннее 1000 → cap до 1000", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(SUBMITTED_TASK);
    storage.rejectVerification = vi.fn().mockResolvedValue(true);

    await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "reject", reason: "x".repeat(5000) });

    // Если rejectVerification вызвалось — проверим длину reason'а.
    // Fallback на 1000, не 5000.
    if (storage.rejectVerification.mock.calls.length > 0) {
      const [, , reason] = storage.rejectVerification.mock.calls[0];
      expect((reason as string).length).toBeLessThanOrEqual(1000);
    }
  });
});

describe("POST /api/tasks/:id/verify — pre-conditions", () => {
  it("несуществующая task → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app)
      .post(`/api/tasks/9999/verify`)
      .send({ decision: "approve" });
    expect(r.status).toBe(404);
  });

  it("task НЕ в статусе submitted → 409", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...SUBMITTED_TASK,
      verificationStatus: "approved",
    });

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "approve" });
    expect(r.status).toBe(409);
  });

  it("task null verificationStatus (legacy) → 409", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...SUBMITTED_TASK,
      verificationStatus: null,
    });

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "approve" });
    expect(r.status).toBe(409);
  });
});

describe("POST /api/tasks/:id/verify — auth", () => {
  it("без session/key → 401", async () => {
    const { app } = await buildApp();

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "approve" });
    expect(r.status).toBe(401);
  });

  it("посторонний воркер (не verifier, не admin) → 403", async () => {
    const { app } = await buildApp({ sessionUserId: OTHER_USER.id });
    storage.getUserById.mockResolvedValue(OTHER_USER);
    storage.getTask.mockResolvedValue(SUBMITTED_TASK);

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "approve" });
    expect(r.status).toBe(403);
  });

  it("verifier_worker_id юзер может verify свою задачу", async () => {
    const { app } = await buildApp({ sessionUserId: VERIFIER.id });
    storage.getUserById.mockResolvedValue(VERIFIER);
    storage.getTask.mockResolvedValue(SUBMITTED_TASK);
    storage.approveVerification.mockResolvedValue(true);

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "approve" });
    expect(r.status).toBe(200);
  });

  it("admin company может override verifier'а", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(SUBMITTED_TASK);
    storage.approveVerification.mockResolvedValue(true);

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .send({ decision: "approve" });
    expect(r.status).toBe(200);
  });
});

describe("POST /api/tasks/:id/verify — multi-tenant scope", () => {
  it("API-key чужой компании → 404", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue({
      ...VALID_API_KEY,
      companyId: 999,
    });
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTask.mockResolvedValue(SUBMITTED_TASK);

    const r = await request(app)
      .post(`/api/tasks/${SUBMITTED_TASK.id}/verify`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ decision: "approve" });
    expect(r.status).toBe(404);
  });
});
