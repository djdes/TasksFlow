/**
 * Тесты GET /api/tasks (list endpoint).
 *
 * Filter logic:
 *   • Admin / API key → видит ВСЕ задачи компании
 *   • Manager (managedWorkerIds set) → tasks of managed + own
 *   • Regular worker (managedWorkerIds=null) → только own tasks
 *   • Unassigned (workerId=null) → видны только admin'у
 *
 * Server-side filter критичен — клиентский filter обходим, нужен
 * сервер-side enforcement.
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
  getTasks: vi.fn(),
  getUserById: vi.fn(),
};

// routes.ts использует DatabaseStorage.parseManagedWorkerIds (static)
// напрямую — нужен реальный класс. importOriginal даёт нам только
// статик, instance мы заменяем mock'ом.
vi.mock("../server/storage", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../server/storage");
  return {
    ...actual,
    storage,
  };
});
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

function makeTask(id: number, workerId: number | null): Task {
  return {
    id,
    title: `T${id}`,
    workerId,
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

const MANAGER: User = {
  id: 20,
  phone: "+79990000020",
  name: "Manager",
  isAdmin: false,
  createdAt: 1,
  bonusBalance: 0,
  companyId: 42,
  managedWorkerIds: "[7,8]",
  position: "Шеф-повар",
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

const apiKey = "tfk_test_list_42";
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

describe("GET /api/tasks — auth", () => {
  it("без session/key → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get("/api/tasks");
    expect(r.status).toBe(401);
  });

  it("session со стираным юзером → []", async () => {
    const { app } = await buildApp({ sessionUserId: 999 });
    storage.getUserById.mockResolvedValue(undefined);

    const r = await request(app).get("/api/tasks");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("юзер без companyId → []", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue({ ...WORKER, companyId: null });

    const r = await request(app).get("/api/tasks");
    expect(r.body).toEqual([]);
    expect(storage.getTasks).not.toHaveBeenCalled();
  });
});

describe("GET /api/tasks — admin scope (всё видит)", () => {
  it("admin видит ВСЕ задачи компании", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTasks.mockResolvedValue([
      makeTask(1, 7), // worker 7
      makeTask(2, 99), // другой worker
      makeTask(3, null), // unassigned
    ]);

    const r = await request(app).get("/api/tasks");
    expect(r.body.map((t: Task) => t.id).sort()).toEqual([1, 2, 3]);
  });

  it("API-key видит ВСЕ задачи (machine integration)", async () => {
    const { app } = await buildApp();
    storage.getApiKeyByHash.mockResolvedValue(VALID_API_KEY);
    storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
    storage.getTasks.mockResolvedValue([
      makeTask(1, 7),
      makeTask(2, 99),
      makeTask(3, null),
    ]);

    const r = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${apiKey}`);
    expect(r.body.length).toBe(3);
  });
});

describe("GET /api/tasks — manager scope", () => {
  it("manager видит задачи подчинённых [7,8] + свои", async () => {
    const { app } = await buildApp({ sessionUserId: MANAGER.id });
    storage.getUserById.mockResolvedValue(MANAGER);
    storage.getTasks.mockResolvedValue([
      makeTask(1, 7), // managed
      makeTask(2, 8), // managed
      makeTask(3, 99), // НЕ managed
      makeTask(4, MANAGER.id), // own
      makeTask(5, null), // unassigned — manager НЕ видит
    ]);

    const r = await request(app).get("/api/tasks");
    expect(r.body.map((t: Task) => t.id).sort()).toEqual([1, 2, 4]);
  });

  it("manager с пустым managedWorkerIds=[] видит только свои", async () => {
    const emptyMgr = { ...MANAGER, managedWorkerIds: "[]" };
    const { app } = await buildApp({ sessionUserId: emptyMgr.id });
    storage.getUserById.mockResolvedValue(emptyMgr);
    storage.getTasks.mockResolvedValue([
      makeTask(1, 7), // не managed (no scope)
      makeTask(2, MANAGER.id), // own
    ]);

    const r = await request(app).get("/api/tasks");
    expect(r.body.map((t: Task) => t.id)).toEqual([2]);
  });
});

describe("GET /api/tasks — regular worker scope", () => {
  it("обычный воркер видит только СВОИ задачи", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTasks.mockResolvedValue([
      makeTask(1, WORKER.id),
      makeTask(2, 99), // чужой
      makeTask(3, null), // unassigned
    ]);

    const r = await request(app).get("/api/tasks");
    expect(r.body.map((t: Task) => t.id)).toEqual([1]);
  });

  it("воркер без своих задач → []", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTasks.mockResolvedValue([
      makeTask(1, 99),
      makeTask(2, 88),
    ]);

    const r = await request(app).get("/api/tasks");
    expect(r.body).toEqual([]);
  });
});

describe("GET /api/tasks — unassigned tasks", () => {
  it("unassigned (workerId=null) НЕ видны воркеру", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTasks.mockResolvedValue([makeTask(1, null)]);

    const r = await request(app).get("/api/tasks");
    expect(r.body).toEqual([]);
  });

  it("unassigned НЕ видны manager'у (даже не в managed scope)", async () => {
    const { app } = await buildApp({ sessionUserId: MANAGER.id });
    storage.getUserById.mockResolvedValue(MANAGER);
    storage.getTasks.mockResolvedValue([makeTask(1, null)]);

    const r = await request(app).get("/api/tasks");
    expect(r.body).toEqual([]);
  });

  it("unassigned видны admin'у", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTasks.mockResolvedValue([makeTask(1, null)]);

    const r = await request(app).get("/api/tasks");
    expect(r.body.length).toBe(1);
  });
});

describe("GET /api/tasks — multi-tenant", () => {
  it("storage.getTasks вызван с companyId юзера", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTasks.mockResolvedValue([]);

    await request(app).get("/api/tasks");
    expect(storage.getTasks).toHaveBeenCalledWith(WORKER.companyId);
  });
});
