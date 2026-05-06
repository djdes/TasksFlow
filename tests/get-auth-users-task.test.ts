/**
 * Тесты простых GET-endpoints без покрытия:
 *   • GET /api/auth/me — current user из session
 *   • GET /api/users — list with manager-scope filter
 *   • GET /api/tasks/:id — single task с multi-tenant scope
 *
 * users-list — самый сложный из них: фильтр по manager scope.
 * Регрессия = руководитель видит всех воркеров (data leak) или
 * наоборот, не видит своих подчинённых (UX).
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Task, User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getAllUsers: vi.fn(),
  getTask: vi.fn(),
};

const DatabaseStorage = {
  parseManagedWorkerIds(raw: string | null | undefined): number[] | null {
    if (raw === null || raw === undefined || raw === "") return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter(
        (n) => typeof n === "number" && Number.isInteger(n),
      );
    } catch {
      return null;
    }
  },
};

vi.mock("../server/storage", () => ({ storage, DatabaseStorage }));
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
const MANAGER: User = {
  ...ADMIN,
  id: 20,
  isAdmin: false,
  managedWorkerIds: JSON.stringify([7, 8]),
  position: "Менеджер",
};

const ALL_COMPANY_USERS: User[] = [
  ADMIN,
  MANAGER,
  WORKER,
  { ...WORKER, id: 8, name: "W8" },
  { ...WORKER, id: 9, name: "W9 (не подчинённый)" },
];

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

const TASK_FOREIGN: Task = { ...TASK, id: 200, companyId: 999 };

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
});

// ─── GET /api/auth/me ────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("без session → null", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/auth/me`);
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
  });

  it("happy path → объект user'а", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);

    const r = await request(app).get(`/api/auth/me`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(WORKER.id);
    expect(r.body.phone).toBe(WORKER.phone);
  });

  it("session.userId есть, но user удалён → null (graceful)", async () => {
    // Edge case: после delete-user сессия активна, но user в БД нет.
    // Не должно валить 500.
    const { app } = await buildApp({ sessionUserId: 9999 });
    storage.getUserById.mockResolvedValue(undefined);

    const r = await request(app).get(`/api/auth/me`);
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
  });
});

// ─── GET /api/users — manager-scope filter ───────────────────────────

describe("GET /api/users — manager-scope filter", () => {
  it("без auth → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/users`);
    expect(r.status).toBe(401);
  });

  it("companyId не определён (deleted user) → []", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue({
      ...ADMIN,
      companyId: null as any,
    } as User);

    const r = await request(app).get(`/api/users`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("admin → весь список своей компании", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getAllUsers.mockResolvedValue(ALL_COMPANY_USERS);

    const r = await request(app).get(`/api/users`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(ALL_COMPANY_USERS.length);
  });

  it("manager → подчинённые + сам он", async () => {
    // КРИТИЧНО: manager не должен видеть полный список (data leak в
    // worker-dropdown). Только своих + себя.
    const { app } = await buildApp({ sessionUserId: MANAGER.id });
    storage.getUserById.mockResolvedValue(MANAGER);
    storage.getAllUsers.mockResolvedValue(ALL_COMPANY_USERS);

    const r = await request(app).get(`/api/users`);
    expect(r.status).toBe(200);
    const ids: number[] = r.body.map((u: User) => u.id);
    expect(ids).toContain(MANAGER.id); // сам он
    expect(ids).toContain(7); // подчинённый
    expect(ids).toContain(8); // подчинённый
    expect(ids).not.toContain(9); // НЕ подчинённый
    expect(ids).not.toContain(ADMIN.id); // admin не должен быть видим
  });

  it("обычный worker (managedWorkerIds=null) → только себя", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getAllUsers.mockResolvedValue(ALL_COMPANY_USERS);

    const r = await request(app).get(`/api/users`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].id).toBe(WORKER.id);
  });
});

// ─── GET /api/tasks/:id — single task ────────────────────────────────

describe("GET /api/tasks/:id", () => {
  it("без auth → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/tasks/100`);
    expect(r.status).toBe(401);
  });

  it("happy path → task объект", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app).get(`/api/tasks/100`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(100);
    expect(r.body.title).toBe("Уборка");
  });

  it("несуществующая → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app).get(`/api/tasks/9999`);
    expect(r.status).toBe(404);
  });

  it("чужая компания → 404 (multi-tenant)", async () => {
    // КРИТИЧНО: иначе worker A может прочитать чужую task'у по id.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_FOREIGN);

    const r = await request(app).get(`/api/tasks/200`);
    expect(r.status).toBe(404);
    expect(r.body.id).toBeUndefined(); // не утечка
  });
});
