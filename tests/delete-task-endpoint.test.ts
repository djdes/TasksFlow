/**
 * Тесты DELETE /api/tasks/:id.
 *
 * FINANCIAL SAFETY: при удалении completed task с positive price
 * должен быть atomic вычет из баланса исполнителя через
 * `transitionTaskToUncompleted` (CAS). Без CAS два concurrent DELETE
 * могли оба прочитать isCompleted=true → двойной дебет → balance
 * становился отрицательным. Регрессия = phantom-зарплата или двойной
 * вычет.
 *
 * Multi-tenant: задача чужой компании → 404 (не утечка).
 * Role-check: non-admin может удалять только своих подчинённых.
 * Cleanup: orphan-файлы (photoUrl/photoUrls/examplePhotoUrl) убираются
 * из /uploads/. Эти проверки покрываются на уровне call'а unlink.
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
  deleteTask: vi.fn(),
  transitionTaskToUncompleted: vi.fn(),
  updateUserBalance: vi.fn(),
};

// requireAdminOrManagerOrApiKey middleware вызывает
// DatabaseStorage.parseManagedWorkerIds — стабим её в мок-объекте.
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
  // managedWorkerIds — JSON-строка списка id (см. parseManagedWorkerIds)
  managedWorkerIds: JSON.stringify([7]),
  position: "Менеджер",
};

const WORKER: User = { ...ADMIN, id: 7, isAdmin: false, managedWorkerIds: null };

const TASK_COMPLETED: Task = {
  id: 100,
  title: "Уборка",
  workerId: 7,
  requiresPhoto: false,
  photoUrl: null,
  photoUrls: null,
  examplePhotoUrl: null,
  isCompleted: true,
  weekDays: null,
  monthDay: null,
  isRecurring: false,
  price: 500, // 500 копеек = 5₽
  category: null,
  description: null,
  companyId: 42,
  journalLink: null,
  createdAt: 0,
  completedAt: 1700000000,
  claimedByWorkerId: null,
  verificationStatus: null,
  verifierWorkerId: null,
  verifiedByUserId: null,
  verifiedAt: null,
  rejectReason: null,
  submittedValues: null,
} as Task;

const TASK_PENDING: Task = {
  ...TASK_COMPLETED,
  isCompleted: false,
  completedAt: null,
};

const TASK_FOREIGN: Task = { ...TASK_COMPLETED, id: 999, companyId: 999 };

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.deleteTask.mockResolvedValue(undefined);
  storage.transitionTaskToUncompleted.mockResolvedValue(true);
  storage.updateUserBalance.mockResolvedValue(undefined);
});

describe("DELETE /api/tasks/:id — auth и multi-tenant", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).delete(`/api/tasks/100`);
    expect(r.status).toBe(401);
  });

  it("чужая компания → 404 (multi-tenant защита)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_FOREIGN);

    const r = await request(app).delete(`/api/tasks/${TASK_FOREIGN.id}`);
    expect(r.status).toBe(404);
    expect(storage.deleteTask).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("несуществующая задача → 204 (idempotent)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app).delete(`/api/tasks/9999`);
    expect(r.status).toBe(204);
    expect(storage.deleteTask).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tasks/:id — role-check (non-admin)", () => {
  it("manager своих подчинённых → 204", async () => {
    const { app } = await buildApp({ sessionUserId: MANAGER.id });
    storage.getUserById.mockResolvedValue(MANAGER);
    storage.getTask.mockResolvedValue(TASK_PENDING); // workerId=7 в managedWorkerIds

    const r = await request(app).delete(`/api/tasks/100`);
    expect(r.status).toBe(204);
    expect(storage.deleteTask).toHaveBeenCalledWith(100);
  });

  it("manager не своего worker'а → 403", async () => {
    const { app } = await buildApp({ sessionUserId: MANAGER.id });
    storage.getUserById.mockResolvedValue(MANAGER);
    storage.getTask.mockResolvedValue({
      ...TASK_PENDING,
      workerId: 999, // чужой worker
    } as Task);

    const r = await request(app).delete(`/api/tasks/100`);
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/подчинённых|подчиненных/i);
    expect(storage.deleteTask).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tasks/:id — financial safety (FYI critical)", () => {
  it("completed + positive price → atomic transitionToUncompleted + balance дебет", async () => {
    // КРИТИЧЕСКАЯ ПРОВЕРКА: если эта логика регресснет, удаление
    // completed task оставит phantom-зарплату ИЛИ сделает двойной
    // вычет (если concurrent).
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_COMPLETED);

    const r = await request(app).delete(`/api/tasks/${TASK_COMPLETED.id}`);
    expect(r.status).toBe(204);
    // Atomic guard через CAS — обязателен
    expect(storage.transitionTaskToUncompleted).toHaveBeenCalledWith(
      TASK_COMPLETED.id,
    );
    // Дебет на full price (отрицательная дельта = вычет)
    expect(storage.updateUserBalance).toHaveBeenCalledWith(
      TASK_COMPLETED.workerId,
      -TASK_COMPLETED.price!,
    );
    expect(storage.deleteTask).toHaveBeenCalledWith(TASK_COMPLETED.id);
  });

  it("CAS вернул false (concurrent уже ревёрснул) → no double-debit", async () => {
    // Race-сценарий: два параллельных DELETE. Первый → transition=true,
    // делает дебет. Второй → transition=false, MUST NOT дебитовать
    // снова. Без CAS-guard'а у worker'а balance уходит в -price.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_COMPLETED);
    storage.transitionTaskToUncompleted.mockResolvedValue(false);

    const r = await request(app).delete(`/api/tasks/${TASK_COMPLETED.id}`);
    expect(r.status).toBe(204);
    expect(storage.transitionTaskToUncompleted).toHaveBeenCalled();
    // КРИТИЧНО: дебет НЕ должен был случиться
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
    // Удаление всё равно происходит
    expect(storage.deleteTask).toHaveBeenCalledWith(TASK_COMPLETED.id);
  });

  it("pending task → CAS вернёт false, balance не трогается", async () => {
    // Routes полагается на CAS (transitionTaskToUncompleted) без явной
    // проверки isCompleted — race-окно короче. Для pending CAS вернёт
    // false → дебет НЕ произойдёт. Имитируем это поведение.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_PENDING);
    storage.transitionTaskToUncompleted.mockResolvedValue(false);

    const r = await request(app).delete(`/api/tasks/${TASK_PENDING.id}`);
    expect(r.status).toBe(204);
    expect(storage.transitionTaskToUncompleted).toHaveBeenCalled();
    // КРИТИЧНО: дебета не должно быть
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
    expect(storage.deleteTask).toHaveBeenCalled();
  });

  it("completed но price=0 → нет балансных операций", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({ ...TASK_COMPLETED, price: 0 } as Task);

    const r = await request(app).delete(`/api/tasks/${TASK_COMPLETED.id}`);
    expect(r.status).toBe(204);
    expect(storage.transitionTaskToUncompleted).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("completed но workerId=null → нет балансных операций", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...TASK_COMPLETED,
      workerId: null,
    } as Task);

    const r = await request(app).delete(`/api/tasks/${TASK_COMPLETED.id}`);
    expect(r.status).toBe(204);
    expect(storage.transitionTaskToUncompleted).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("balance reversal упал → 500, deleteTask НЕ вызвана (atomicity)", async () => {
    // Если updateUserBalance бросает, мы НЕ должны успеть удалить
    // задачу — иначе у worker'а phantom-зарплата без way-back.
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_COMPLETED);
    storage.updateUserBalance.mockRejectedValue(new Error("DB down"));

    const r = await request(app).delete(`/api/tasks/${TASK_COMPLETED.id}`);
    expect(r.status).toBe(500);
    expect(storage.deleteTask).not.toHaveBeenCalled();
  });
});
