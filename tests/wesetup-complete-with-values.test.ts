/**
 * Тесты POST /api/wesetup/complete-with-values.
 *
 * Самый сложный endpoint: worker с journal-bound task'ой заполняет
 * форму и отправляет → backend (a) звонит в WeSetup, (b) локально
 * атомарно завершает task с balance credit.
 *
 * Critical paths:
 *   • Auth: 401 / 403 (не workerId не admin) / 404 multi-tenant
 *   • Two-stage verification: если verifierWorkerId set + не self →
 *     save submittedValues + submitForVerification, НЕ ЗВОНИМ WeSetup
 *     (заведующая может отклонить)
 *   • Иначе forward: upstream OK → CAS transition + balance credit
 *   • upstream 5xx/408/429 → finishLocally + attemptOrEnqueue (queue)
 *   • upstream 4xx → forward без mirror
 *   • network error → finishLocally + attemptOrEnqueue → 202
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

import type { Company, Task, User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getCompanyById: vi.fn(),
  getTask: vi.fn(),
  transitionTaskToCompleted: vi.fn(),
  transitionTaskToUncompleted: vi.fn(),
  updateUserBalance: vi.fn(),
  submitForVerification: vi.fn(),
};

const attemptOrEnqueueMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: attemptOrEnqueueMock,
}));
// db.update() для сохранения submittedValues — стабим в no-op chain
vi.mock("../server/db", () => ({
  db: {
    update: () => ({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    }),
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

const WORKER: User = { ...ADMIN, id: 7, isAdmin: false };
const STRANGER: User = { ...ADMIN, id: 99, isAdmin: false };

const COMPANY_OK: Company = {
  id: 42,
  name: "Test",
  email: null,
  createdAt: 1,
  wesetupBaseUrl: "https://wesetup.example.com",
  wesetupApiKey: "key",
};

const TASK: Task = {
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
  price: 500,
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

const TASK_FOREIGN: Task = { ...TASK, companyId: 999 };

const TASK_WITH_VERIFIER: Task = { ...TASK, verifierWorkerId: 99 };

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = ORIGINAL_FETCH;
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  attemptOrEnqueueMock.mockReset();
  attemptOrEnqueueMock.mockResolvedValue(undefined);
  storage.transitionTaskToCompleted.mockResolvedValue(true);
  storage.transitionTaskToUncompleted.mockResolvedValue(true);
  storage.submitForVerification.mockResolvedValue(true);
  storage.updateUserBalance.mockResolvedValue(undefined);
});

function mockUpstream(opts: { status: number; body?: unknown }) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    text: async () =>
      opts.body !== undefined ? JSON.stringify(opts.body) : "",
    headers: { get: () => "application/json" },
  } as unknown as Response);
}

describe("POST /api/wesetup/complete-with-values — auth/scope", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {} });
    expect(r.status).toBe(401);
  });

  it("taskId не number → 400", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: "abc", values: {} });
    expect(r.status).toBe(400);
  });

  it("несуществующий task → 404", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 9999, values: {} });
    expect(r.status).toBe(404);
  });

  it("чужая компания → 404 (multi-tenant)", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK_FOREIGN);

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {} });
    expect(r.status).toBe(404);
  });

  it("не workerId и не admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: STRANGER.id });
    storage.getUserById.mockResolvedValue(STRANGER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {} });
    expect(r.status).toBe(403);
  });
});

describe("POST /api/wesetup/complete-with-values — two-stage verification", () => {
  it("verifier set + не self → submitForVerification, НЕ дёргаем WeSetup", async () => {
    // КРИТИЧНО: этот path позволяет заведующей отклонить запись ДО того
    // как она попадёт в WeSetup журнал. Регрессия = «нельзя отозвать»,
    // потому что данные уже там.
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK_WITH_VERIFIER);

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: { foo: "bar" }, isCompleted: true });

    expect(r.status).toBe(200);
    expect(r.body.verificationPending).toBe(true);
    expect(storage.submitForVerification).toHaveBeenCalledWith(100);
    expect(globalThis.fetch).toBe(ORIGINAL_FETCH); // не звонили WeSetup
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
  });

  it("submitForVerification=false (race) → 200 verificationPending=true (idempotent)", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK_WITH_VERIFIER);
    storage.submitForVerification.mockResolvedValue(false);

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {}, isCompleted: true });

    expect(r.status).toBe(200);
    expect(r.body.verificationPending).toBe(true);
  });

  it("verifier=meId (сам себе verifier) → НЕ verification path, обычный complete", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue({
      ...TASK_WITH_VERIFIER,
      verifierWorkerId: WORKER.id,
    } as Task);
    mockUpstream({ status: 200, body: { ok: true } });

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {}, isCompleted: true });

    expect(r.status).toBe(200);
    expect(storage.submitForVerification).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});

describe("POST /api/wesetup/complete-with-values — happy path", () => {
  it("upstream OK → CAS transition + balance credit", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({ status: 200, body: { ok: true } });

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {}, isCompleted: true });

    expect(r.status).toBe(200);
    expect(storage.transitionTaskToCompleted).toHaveBeenCalledWith(100);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(7, 500);
  });

  it("CAS вернул false (already completed) → НЕ начисляем balance", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    storage.transitionTaskToCompleted.mockResolvedValue(false);
    mockUpstream({ status: 200, body: { ok: true } });

    await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {}, isCompleted: true });

    expect(storage.transitionTaskToCompleted).toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });
});

describe("POST /api/wesetup/complete-with-values — upstream errors", () => {
  it("upstream 5xx → finishLocally + attemptOrEnqueue (queue retry)", async () => {
    // КРИТИЧНО: иначе сотрудник видит «не сохранено», тапает повторно,
    // плодя дубли. Локально завершаем чтобы dashboard обновился сразу,
    // queue-worker дотащит позже.
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({ status: 503, body: { message: "Down" } });

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {}, isCompleted: true });

    expect(r.status).toBe(503); // forward upstream status
    expect(storage.transitionTaskToCompleted).toHaveBeenCalled();
    expect(attemptOrEnqueueMock).toHaveBeenCalled();
  });

  it("upstream 4xx (non-retriable) → forward без mirror и без queue", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    mockUpstream({ status: 400, body: { message: "Bad" } });

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {}, isCompleted: true });

    expect(r.status).toBe(400);
    // 4xx — бизнес-ошибка, не ретраим, не локально finish'им
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
    expect(attemptOrEnqueueMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/wesetup/complete-with-values — network error", () => {
  it("network → 202 queued, finishLocally сделан", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getCompanyById.mockResolvedValue(COMPANY_OK);
    storage.getTask.mockResolvedValue(TASK);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const r = await request(app)
      .post(`/api/wesetup/complete-with-values`)
      .send({ taskId: 100, values: {}, isCompleted: true });

    expect(r.status).toBe(202);
    expect(r.body.queued).toBe(true);
    expect(storage.transitionTaskToCompleted).toHaveBeenCalled();
    expect(attemptOrEnqueueMock).toHaveBeenCalled();
  });
});
