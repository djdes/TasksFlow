/**
 * Тесты DELETE /api/tasks/:id/example-photo + /api/tasks/:id/photo.
 *
 * /example-photo: admin-only, multi-tenant scope. Удаляет example
 * photo (для recurring task показывает «как должно выглядеть»).
 *
 * /photo: requireAuth (worker | admin). Worker может удалить только
 * свои собственные photos (task.workerId === user.id) ИЛИ admin →
 * любой. Поддерживает 2 режима:
 *   • ?url=<href> → удаляет конкретное фото из массива photoUrls
 *   • без query → удаляет ВСЕ photos
 *
 * Critical:
 *   • Multi-tenant scope (task чужой компании → 404)
 *   • Worker-of-other-task → 403 (anti-vandalism)
 *   • Photo не в массиве → 400 (anti-fuzzing fake URL)
 *   • Empty photos → 400 (нечего удалять)
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
  updateTask: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({
  attemptOrEnqueue: vi.fn().mockResolvedValue(undefined),
}));
// fs/promises unlink будем стабить — иначе route попытается удалить
// реальные файлы (которые не существуют). Errors логируются и не
// валят response, но stub всё равно нужен чтобы не было побочных
// эффектов на CI.
vi.mock("fs/promises", () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
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

const TASK_BASE: Task = {
  id: 100,
  title: "Уборка",
  workerId: 7,
  requiresPhoto: true,
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

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
  storage.updateTask.mockImplementation(async (id: number, patch: any) => ({
    ...TASK_BASE,
    id,
    ...patch,
  }));
});

// ─── DELETE /api/tasks/:id/example-photo ─────────────────────────────

describe("DELETE /api/tasks/:id/example-photo — auth", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).delete(`/api/tasks/100/example-photo`);
    expect(r.status).toBe(401);
  });

  it("non-admin → 403", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    const r = await request(app).delete(`/api/tasks/100/example-photo`);
    expect(r.status).toBe(403);
  });
});

describe("DELETE /api/tasks/:id/example-photo — multi-tenant", () => {
  it("чужая компания → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      companyId: 999,
      examplePhotoUrl: "/uploads/x.jpg",
    } as Task);

    const r = await request(app).delete(`/api/tasks/100/example-photo`);
    expect(r.status).toBe(404);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("несуществующая задача → 404", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app).delete(`/api/tasks/9999/example-photo`);
    expect(r.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id/example-photo — happy / edge", () => {
  it("happy path → 200, examplePhotoUrl=null", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      examplePhotoUrl: "/uploads/example.jpg",
    } as Task);

    const r = await request(app).delete(`/api/tasks/100/example-photo`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(storage.updateTask).toHaveBeenCalledWith(100, {
      examplePhotoUrl: null,
    });
  });

  it("нет examplePhotoUrl → 400", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_BASE);

    const r = await request(app).delete(`/api/tasks/100/example-photo`);
    expect(r.status).toBe(400);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });
});

// ─── DELETE /api/tasks/:id/photo ─────────────────────────────────────

describe("DELETE /api/tasks/:id/photo — auth + tenant", () => {
  it("без session → 401", async () => {
    const { app } = await buildApp();
    const r = await request(app).delete(`/api/tasks/100/photo`);
    expect(r.status).toBe(401);
  });

  it("чужая компания → 404", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      companyId: 999,
    } as Task);

    const r = await request(app).delete(`/api/tasks/100/photo`);
    expect(r.status).toBe(404);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("несуществующая → 404", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue(undefined);

    const r = await request(app).delete(`/api/tasks/9999/photo`);
    expect(r.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id/photo — права (worker scope)", () => {
  it("admin → можно", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      photoUrls: ["/uploads/p1.jpg"],
    } as Task);

    const r = await request(app).delete(`/api/tasks/100/photo`);
    expect(r.status).toBe(200);
  });

  it("worker удаляет своё фото → можно", async () => {
    const { app } = await buildApp({ sessionUserId: WORKER.id });
    storage.getUserById.mockResolvedValue(WORKER);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      workerId: WORKER.id,
      photoUrls: ["/uploads/p1.jpg"],
    } as Task);

    const r = await request(app).delete(`/api/tasks/100/photo`);
    expect(r.status).toBe(200);
  });

  it("чужой worker (не его task) → 403 (anti-vandalism)", async () => {
    // КРИТИЧНО: stranger не должен мочь удалить фото с чужой task'и.
    const { app } = await buildApp({ sessionUserId: STRANGER.id });
    storage.getUserById.mockResolvedValue(STRANGER);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      workerId: WORKER.id, // not STRANGER
      photoUrls: ["/uploads/p1.jpg"],
    } as Task);

    const r = await request(app).delete(`/api/tasks/100/photo`);
    expect(r.status).toBe(403);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tasks/:id/photo — конкретное фото (?url=…)", () => {
  it("?url= с валидным URL → удаление из массива", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      photoUrls: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"],
    } as Task);

    const r = await request(app)
      .delete(`/api/tasks/100/photo`)
      .query({ url: "/uploads/b.jpg" });
    expect(r.status).toBe(200);
    expect(storage.updateTask).toHaveBeenCalledWith(100, {
      photoUrls: ["/uploads/a.jpg", "/uploads/c.jpg"],
      photoUrl: "/uploads/c.jpg", // last в массиве
    });
  });

  it("?url= единственное фото → photoUrls=null, photoUrl=null", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      photoUrls: ["/uploads/lone.jpg"],
    } as Task);

    const r = await request(app)
      .delete(`/api/tasks/100/photo`)
      .query({ url: "/uploads/lone.jpg" });
    expect(r.status).toBe(200);
    expect(storage.updateTask).toHaveBeenCalledWith(100, {
      photoUrls: null,
      photoUrl: null,
    });
  });

  it("?url= с фейковым URL не в массиве → 400 (anti-fuzzing)", async () => {
    // КРИТИЧНО: иначе атакующий мог дёргать удаление с произвольными
    // URL'ами, надеясь повредить filesystem (пусть и через
    // resolveUploadAbs basename — всё равно лишний disk-touch).
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      photoUrls: ["/uploads/real.jpg"],
    } as Task);

    const r = await request(app)
      .delete(`/api/tasks/100/photo`)
      .query({ url: "/uploads/fake.jpg" });
    expect(r.status).toBe(400);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tasks/:id/photo — без url (все фото)", () => {
  it("все photos удаляются → 200, photoUrls=null", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue({
      ...TASK_BASE,
      photoUrls: ["/uploads/a.jpg", "/uploads/b.jpg"],
      photoUrl: "/uploads/legacy.jpg",
    } as Task);

    const r = await request(app).delete(`/api/tasks/100/photo`);
    expect(r.status).toBe(200);
    expect(storage.updateTask).toHaveBeenCalledWith(100, {
      photoUrls: null,
      photoUrl: null,
    });
  });

  it("нет photos вообще → 400 (нечего удалять)", async () => {
    const { app } = await buildApp({ sessionUserId: ADMIN.id });
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getTask.mockResolvedValue(TASK_BASE);

    const r = await request(app).delete(`/api/tasks/100/photo`);
    expect(r.status).toBe(400);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });
});
