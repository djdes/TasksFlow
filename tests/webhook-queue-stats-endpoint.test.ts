/**
 * Тесты GET /api/admin/webhook-queue/stats.
 *
 * Admin dashboard для очереди webhook доставок. Без него админ не
 * знает «у нас что-то завязло» — данные сотрудников могут лежать
 * пол-дня и никто не заметит.
 *
 * SECURITY: webhookDeliveries не имеет companyId, только taskId.
 * Раньше: возвращали все deliveries → admin компании A видел ошибки
 * доставок company B (включая targetUrl и apiKey-prefix в lastError).
 * Теперь сначала собираем taskIds своей компании, потом фильтруем
 * deliveries.
 *
 * Покрытие:
 *   • Auth: 401 / 403
 *   • adminCompanyId=null (deleted user) → empty stats
 *   • Нет тасков в компании → empty stats
 *   • migrationNeeded ветка (таблица webhook_deliveries отсутствует)
 */

import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "../shared/schema";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
};

// Стабим db с chain — endpoint делает db.select().from().where()
// (для tasks) → результат массив. Если первый возврат [] — endpoint
// short-circuit'нет и второй select не зовёт.
const dbChain = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  groupBy: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
};

function setupChain(taskRows: Array<{ id: number }>) {
  // .select(args).from(table).where(filter) → таски
  // .select(args).from(webhookDeliveries).where(...).groupBy(...) → stats
  // .select().from(webhookDeliveries).where(...).orderBy(...).limit(20) → recentFailed
  const tasksThenable: any = Promise.resolve(taskRows);
  const tasksChain: any = {
    select: () => tasksChain,
    from: () => tasksChain,
    where: () => tasksThenable,
  };
  return tasksChain;
}

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));

let dbModule: any = null;

vi.mock("../server/db", () => ({
  get db() {
    return dbModule;
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

afterEach(() => {
  vi.restoreAllMocks();
  dbModule = null;
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
});

describe("GET /api/admin/webhook-queue/stats — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).get(`/api/admin/webhook-queue/stats`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).get(`/api/admin/webhook-queue/stats`);
    expect(r.status).toBe(403);
  });
});

describe("GET /api/admin/webhook-queue/stats — empty cases", () => {
  it("companyId=null (deleted-user-with-session) → empty stats без db touch", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue({
      ...ADMIN,
      companyId: null as any,
    } as User);

    const r = await request(app).get(`/api/admin/webhook-queue/stats`);
    expect(r.status).toBe(200);
    expect(r.body.stats).toEqual({
      pending: 0,
      delivered: 0,
      failed: 0,
      cancelled: 0,
    });
    expect(r.body.recentFailed).toEqual([]);
  });

  it("нет тасков в компании → empty stats (multi-tenant защита)", async () => {
    // КРИТИЧНО: если бы skip'нули этот guard, второй select по
    // webhookDeliveries без filter'а вернул бы записи ВСЕХ компаний
    // (data leak с targetUrl + apiKey-prefix в lastError).
    dbModule = setupChain([]); // 0 tasks → endpoint short-circuit'нет
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app).get(`/api/admin/webhook-queue/stats`);
    expect(r.status).toBe(200);
    expect(r.body.stats).toEqual({
      pending: 0,
      delivered: 0,
      failed: 0,
      cancelled: 0,
    });
  });
});

describe("GET /api/admin/webhook-queue/stats — migrationNeeded", () => {
  it("таблица webhook_deliveries не существует → migrationNeeded:true", async () => {
    // Friendly UI вместо красного error-стейта. Для свежих deploy'ев,
    // где миграция ещё не прогнана.
    dbModule = {
      select: () => ({
        from: () => ({
          where: () =>
            Promise.reject(
              new Error("Table 'tasksflow.webhook_deliveries' doesn't exist"),
            ),
        }),
      }),
    };
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app).get(`/api/admin/webhook-queue/stats`);
    expect(r.status).toBe(200);
    expect(r.body.migrationNeeded).toBe(true);
    expect(r.body.stats).toEqual({
      pending: 0,
      delivered: 0,
      failed: 0,
      cancelled: 0,
    });
  });

  it("другие db ошибки → 500 (не маскируем generic ошибки)", async () => {
    dbModule = {
      select: () => ({
        from: () => ({
          where: () => Promise.reject(new Error("some unrelated db error")),
        }),
      }),
    };
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);

    const r = await request(app).get(`/api/admin/webhook-queue/stats`);
    expect(r.status).toBe(500);
  });
});
