/**
 * Тесты POST /api/tasks (create) + PUT /api/tasks/:id (update).
 *
 * Critical security/integrity properties:
 *   • Multi-tenant: workerId должен быть в той же компании, иначе
 *     админ A создаёт задачу для воркера B (broken state).
 *   • Manager scope: руководитель может назначать только своим
 *     подчинённым (canAssignToWorker).
 *   • FINANCIAL SAFETY на PUT:
 *     - isCompleted нельзя менять через PUT (нужен /complete)
 *     - price на completed задаче неизменна (баланс уже начислен)
 *     - workerId на completed задаче неизменен
 *   • Auth: 401 без session/api-key.
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
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
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

const MANAGER: User = {
  ...ADMIN,
  id: 20,
  isAdmin: false,
  managedWorkerIds: JSON.stringify([7]),
  position: "Менеджер",
};

const WORKER_OWN: User = {
  ...ADMIN,
  id: 7,
  isAdmin: false,
  managedWorkerIds: null,
};

const WORKER_OTHER_COMPANY: User = {
  ...ADMIN,
  id: 999,
  isAdmin: false,
  managedWorkerIds: null,
  companyId: 9999,
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

const TASK_COMPLETED: Task = {
  ...TASK,
  isCompleted: true,
  completedAt: 1700000000,
  price: 500,
};

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.createTask.mockImplementation(async (input: any) => ({
    ...TASK,
    ...input,
    id: 200,
  }));
  storage.updateTask.mockImplementation(async (id: number, patch: any) => ({
    ...TASK,
    id,
    ...patch,
  }));
});

// ─── POST /api/tasks ─────────────────────────────────────────────────

describe("POST /api/tasks — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app)
      .post(`/api/tasks`)
      .send({ title: "T", workerId: 7, requiresPhoto: false });
    expect(r.status).toBe(401);
  });
});

describe("POST /api/tasks — happy path", () => {
  it("admin создаёт task → 201, companyId выставлен из admin'а", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === WORKER_OWN.id) return WORKER_OWN;
      return undefined;
    });

    const r = await request(app)
      .post(`/api/tasks`)
      .send({ title: "Уборка", workerId: WORKER_OWN.id, requiresPhoto: false });

    expect(r.status).toBe(201);
    expect(storage.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Уборка",
        workerId: WORKER_OWN.id,
        companyId: 42,
      }),
    );
  });
});

describe("POST /api/tasks — multi-tenant scope", () => {
  it("workerId чужой компании → 404 (anti-cross-tenant)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === WORKER_OTHER_COMPANY.id) return WORKER_OTHER_COMPANY;
      return undefined;
    });

    const r = await request(app)
      .post(`/api/tasks`)
      .send({
        title: "T",
        workerId: WORKER_OTHER_COMPANY.id,
        requiresPhoto: false,
      });

    expect(r.status).toBe(404);
    expect(storage.createTask).not.toHaveBeenCalled();
  });

  it("несуществующий workerId → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      return undefined;
    });

    const r = await request(app)
      .post(`/api/tasks`)
      .send({ title: "T", workerId: 9999, requiresPhoto: false });
    expect(r.status).toBe(404);
  });
});

describe("POST /api/tasks — manager scope", () => {
  it("manager своего worker'а → 201", async () => {
    const { app } = await buildApp({ sessionUserId: MANAGER.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === MANAGER.id) return MANAGER;
      if (id === WORKER_OWN.id) return WORKER_OWN;
      return undefined;
    });

    const r = await request(app)
      .post(`/api/tasks`)
      .send({ title: "T", workerId: WORKER_OWN.id, requiresPhoto: false });
    expect(r.status).toBe(201);
  });

  it("manager не своего worker'а → 403", async () => {
    const { app } = await buildApp({ sessionUserId: MANAGER.id });
    const STRANGER: User = { ...WORKER_OWN, id: 8 };
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === MANAGER.id) return MANAGER;
      if (id === STRANGER.id) return STRANGER;
      return undefined;
    });

    const r = await request(app)
      .post(`/api/tasks`)
      .send({ title: "T", workerId: STRANGER.id, requiresPhoto: false });
    expect(r.status).toBe(403);
    expect(storage.createTask).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks — validation", () => {
  it("без title → 400 Zod", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app)
      .post(`/api/tasks`)
      .send({ workerId: 7, requiresPhoto: false });
    expect(r.status).toBe(400);
  });

  it("description >5000 → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app)
      .post(`/api/tasks`)
      .send({
        title: "T",
        workerId: 7,
        requiresPhoto: false,
        description: "x".repeat(5001),
      });
    expect(r.status).toBe(400);
  });
});

// ─── PUT /api/tasks/:id ──────────────────────────────────────────────

describe("PUT /api/tasks/:id — auth + tenant", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).put(`/api/tasks/100`).send({ title: "X" });
    expect(r.status).toBe(401);
  });

  it("чужая компания → 404 (multi-tenant)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({ ...TASK, companyId: 999 } as Task);

    const r = await request(app)
      .put(`/api/tasks/100`)
      .send({ title: "X" });
    expect(r.status).toBe(404);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("несуществующая → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app)
      .put(`/api/tasks/9999`)
      .send({ title: "X" });
    expect(r.status).toBe(404);
  });
});

describe("PUT /api/tasks/:id — FINANCIAL SAFETY", () => {
  it("isCompleted в body → 400 (нельзя менять через PUT)", async () => {
    // Раньше: PUT { isCompleted: true } флипал статус БЕЗ начисления
    // баланса — admin'ы скрывали задачу, сотрудник терял зарплату.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .put(`/api/tasks/100`)
      .send({ isCompleted: true });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/isCompleted/i);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("price на completed task → 400", async () => {
    // Раньше: PUT { price: 9999 } на completed task — старая цена в
    // balance, новая в task. Расхождение.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_COMPLETED);

    const r = await request(app)
      .put(`/api/tasks/100`)
      .send({ price: 9999 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/цен/i);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("price = текущая на completed task → проходит (no-op для price)", async () => {
    // Идемпотентность: PUT с тем же price не должен валиться, иначе
    // UI может случайно отправить unchanged-форму.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_COMPLETED);

    const r = await request(app)
      .put(`/api/tasks/100`)
      .send({ price: TASK_COMPLETED.price, title: "Renamed" });
    expect(r.status).toBe(200);
  });

  it("workerId на completed task → 400", async () => {
    // Раньше: PUT { workerId: B } перевешивал task на B, balance
    // оставался у A. Бэкап-сценарий «у меня украли деньги».
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      return { ...WORKER_OWN, id } as User;
    });
    storage.getTask.mockResolvedValue(TASK_COMPLETED);

    const r = await request(app)
      .put(`/api/tasks/100`)
      .send({ workerId: 999 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/исполнител/i);
  });
});

describe("PUT /api/tasks/:id — happy path", () => {
  it("admin меняет title → 200, updateTask вызвана", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .put(`/api/tasks/100`)
      .send({ title: "Renamed" });
    expect(r.status).toBe(200);
    expect(storage.updateTask).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ title: "Renamed" }),
    );
  });

  it("admin меняет workerId на пользователя своей компании → 200", async () => {
    const NEW_WORKER: User = { ...WORKER_OWN, id: 8 };
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === NEW_WORKER.id) return NEW_WORKER;
      return undefined;
    });
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .put(`/api/tasks/100`)
      .send({ workerId: NEW_WORKER.id });
    expect(r.status).toBe(200);
  });

  it("admin меняет workerId на чужую компанию → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === ADMIN.id) return ADMIN;
      if (id === WORKER_OTHER_COMPANY.id) return WORKER_OTHER_COMPANY;
      return undefined;
    });
    storage.getTask.mockResolvedValue(TASK);

    const r = await request(app)
      .put(`/api/tasks/100`)
      .send({ workerId: WORKER_OTHER_COMPANY.id });
    expect(r.status).toBe(404);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });
});

describe("PUT /api/tasks/:id — manager scope", () => {
  it("manager редактирует чужого worker'а task → 403", async () => {
    const { app } = await buildApp({ sessionUserId: MANAGER.id });
    storage.getUserById.mockImplementation(async (id: number) => {
      if (id === MANAGER.id) return MANAGER;
      return { ...WORKER_OWN, id } as User;
    });
    // task назначена воркеру 999, не в managedWorkerIds=[7]
    storage.getTask.mockResolvedValue({ ...TASK, workerId: 999 } as Task);

    const r = await request(app)
      .put(`/api/tasks/100`)
      .send({ title: "X" });
    expect(r.status).toBe(403);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });
});
