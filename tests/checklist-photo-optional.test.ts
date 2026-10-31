/**
 * Фото у пункта чек-листа — по желанию (requiresPhoto: false).
 *
 *   • нет поля или true — пункт закрывается только фото (все старые задачи);
 *   • false — пункт отмечается касанием: POST /api/tasks/:id/checklist/:itemId/done;
 *   • пункт с фото так не закрыть (400), выполненную и отправленную на
 *     проверку задачу не трогаем (409), чужая компания — 404, не исполнитель — 403;
 *   • удаление фото у пункта без фото не снимает отметку;
 *   • задача с пунктами без фото завершается, когда все отмечены;
 *   • PUT задачи меняет только состав пунктов, отметки и фото — из базы;
 *   • полночный сброс сохраняет requiresPhoto.
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChecklistItem, Company, Task, User } from "../shared/schema";
import { checklistItemSchema, insertTaskSchema } from "../shared/schema";
import { allItemsNeedPhoto, itemNeedsPhoto, mergeChecklistProgress } from "../shared/checklist";
import { planDailyReset, type ResetTask } from "../server/services/daily-reset";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getTask: vi.fn(),
  getUserById: vi.fn(),
  updateTask: vi.fn(),
  transitionTaskToCompleted: vi.fn(),
  submitForVerification: vi.fn(),
  updateUserBalance: vi.fn(),
  claimSiblingTasks: vi.fn(),
  getCompanyById: vi.fn(),
  listCompanyRoles: vi.fn(),
  getCompanyRole: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage, DatabaseStorage: { parseManagedWorkerIds: () => null } }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({ attemptOrEnqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/audit-log", () => ({ recordAudit: vi.fn() }));
vi.mock("fs/promises", () => ({ unlink: vi.fn().mockResolvedValue(undefined) }));

async function buildApp(sessionUserId?: number) {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionUserId ? { userId: sessionUserId } : {};
    next();
  });
  await registerRoutes(createServer(app), app);
  return app;
}

const base = { createdAt: 1, bonusBalance: 0, companyId: 42, managedWorkerIds: null, position: null, isRoot: false, roleId: null } as const;
const ADMIN = { ...base, id: 10, phone: "+79990000010", name: "Админ", isAdmin: true } as unknown as User;
const WORKER = { ...base, id: 7, phone: "+79990000007", name: "Лариса", isAdmin: false } as unknown as User;
const STRANGER = { ...base, id: 99, phone: "+79990000099", name: "Фара", isAdmin: false } as unknown as User;
const COMPANY = { id: 42, name: "БФС", email: null, createdAt: 1, wesetupBaseUrl: null, wesetupApiKey: null } as unknown as Company;

const ITEMS: ChecklistItem[] = [
  { id: "look", title: "Внешний вид", done: false, photoUrls: [], requiresPhoto: false },
  { id: "case", title: "Витрина", done: false, photoUrls: [] },
];

function task(extra: Partial<Task> = {}): Task {
  return {
    id: 100,
    title: "Открытие смены",
    workerId: 7,
    requiresPhoto: false,
    photoUrl: null,
    photoUrls: [],
    examplePhotoUrl: null,
    examplePhotoUrls: [],
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
    checklist: ITEMS.map((it) => ({ ...it })),
    dueDate: null,
    remindAt: null,
    ...extra,
  } as Task;
}

const people = [ADMIN, WORKER, STRANGER];

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset());
  storage.getUserById.mockImplementation(async (id: number) => people.find((u) => u.id === id));
  storage.getCompanyById.mockResolvedValue(COMPANY);
  storage.listCompanyRoles.mockResolvedValue([]);
  storage.getCompanyRole.mockResolvedValue(undefined);
  storage.transitionTaskToCompleted.mockResolvedValue(true);
  storage.updateUserBalance.mockResolvedValue(undefined);
  storage.claimSiblingTasks.mockResolvedValue(0);
  storage.updateTask.mockImplementation(async (_id: number, patch: Partial<Task>) => ({ ...task(), ...patch }));
});

describe("модель пункта", () => {
  it("нет поля — фото нужно, как у всех старых задач", () => {
    const item = checklistItemSchema.parse({ id: "a", title: "Пол" });
    expect(item.requiresPhoto).toBeUndefined();
    expect(itemNeedsPhoto(item)).toBe(true);
    expect(itemNeedsPhoto({ requiresPhoto: true })).toBe(true);
    expect(itemNeedsPhoto({ requiresPhoto: false })).toBe(false);
  });

  it("requiresPhoto: false проходит создание задачи и сохраняется", () => {
    const parsed = insertTaskSchema.parse({ title: "Т", workerId: 7, checklist: ITEMS });
    expect(parsed.checklist?.[0].requiresPhoto).toBe(false);
    expect(parsed.checklist?.[1].requiresPhoto).toBeUndefined();
  });

  it("«с фото» в подсказках — только если фото нужно у всех пунктов", () => {
    expect(allItemsNeedPhoto([{}, { requiresPhoto: true }])).toBe(true);
    expect(allItemsNeedPhoto(ITEMS)).toBe(false);
    expect(allItemsNeedPhoto([])).toBe(false);
  });
});

describe("mergeChecklistProgress: правка не трогает отметки исполнителя", () => {
  const existing: ChecklistItem[] = [
    { id: "look", title: "Внешний вид", done: true, photoUrls: [], requiresPhoto: false },
    { id: "case", title: "Витрина", done: true, photoUrls: ["/uploads/c.jpg"] },
  ];

  it("отметки и фото — из базы, состав и «нужно фото» — из запроса", () => {
    const merged = mergeChecklistProgress(existing, [
      { id: "case", title: "Витрина и ценники", done: false, photoUrls: [], requiresPhoto: false },
      { id: "look", title: "Внешний вид", done: false, photoUrls: [], requiresPhoto: false },
    ]);
    expect(merged).toEqual([
      { id: "case", title: "Витрина и ценники", done: true, photoUrls: ["/uploads/c.jpg"], requiresPhoto: false },
      { id: "look", title: "Внешний вид", done: true, photoUrls: [], requiresPhoto: false },
    ]);
  });

  it("новый пункт стартует невыполненным, «готово» без фото через API не подделать", () => {
    const merged = mergeChecklistProgress(existing, [{ id: "new", title: "Микроволновка", done: true, photoUrls: ["/uploads/x.jpg"] }]);
    expect(merged).toEqual([{ id: "new", title: "Микроволновка", done: false, photoUrls: [] }]);
  });

  it("включили фото у отмеченного без фото пункта — он снова ждёт фото", () => {
    const merged = mergeChecklistProgress(existing, [{ id: "look", title: "Внешний вид", done: true, photoUrls: [], requiresPhoto: true }]);
    expect(merged?.[0]).toMatchObject({ done: false, requiresPhoto: true });
  });

  it("пустой список — чек-лист убран", () => {
    expect(mergeChecklistProgress(existing, [])).toBeNull();
    expect(mergeChecklistProgress(existing, null)).toBeNull();
  });
});

describe("POST /api/tasks/:id/checklist/:itemId/done", () => {
  const url = (itemId: string) => `/api/tasks/100/checklist/${itemId}/done`;

  it("исполнитель отмечает пункт без фото и снимает отметку", async () => {
    storage.getTask.mockResolvedValue(task());
    const app = await buildApp(WORKER.id);
    const on = await request(app).post(url("look")).send({ done: true });
    expect(on.status).toBe(200);
    expect(on.headers["content-type"]).toMatch(/json/);
    expect(storage.updateTask).toHaveBeenLastCalledWith(100, {
      checklist: [
        { id: "look", title: "Внешний вид", done: true, photoUrls: [], requiresPhoto: false },
        { id: "case", title: "Витрина", done: false, photoUrls: [] },
      ],
    });
    expect(on.body.task.checklist[0].done).toBe(true);

    storage.getTask.mockResolvedValue(task({ checklist: [{ ...ITEMS[0], done: true }, ITEMS[1]] }));
    const off = await request(app).post(url("look")).send({ done: false });
    expect(off.status).toBe(200);
    expect(storage.updateTask).toHaveBeenLastCalledWith(100, {
      checklist: [{ ...ITEMS[0], done: false }, ITEMS[1]],
    });
  });

  it("админ тоже может отметить", async () => {
    storage.getTask.mockResolvedValue(task());
    const app = await buildApp(ADMIN.id);
    const r = await request(app).post(url("look")).send({ done: true });
    expect(r.status).toBe(200);
  });

  it("пункт с фото касанием не закрыть — 400", async () => {
    storage.getTask.mockResolvedValue(task());
    const app = await buildApp(WORKER.id);
    const r = await request(app).post(url("case")).send({ done: true });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("К этому пункту нужно фото");
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("выполненная задача и задача на проверке — 409", async () => {
    const app = await buildApp(WORKER.id);
    storage.getTask.mockResolvedValue(task({ isCompleted: true }));
    const done = await request(app).post(url("look")).send({ done: false });
    expect(done.status).toBe(409);

    storage.getTask.mockResolvedValue(task({ verificationStatus: "submitted" }));
    const submitted = await request(app).post(url("look")).send({ done: false });
    expect(submitted.status).toBe(409);
    expect(submitted.body.message).toMatch(/на проверке/);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("задача чужой компании — 404, не исполнитель — 403", async () => {
    const app = await buildApp(WORKER.id);
    storage.getTask.mockResolvedValue(task({ companyId: 77 }));
    const foreign = await request(app).post(url("look")).send({ done: true });
    expect(foreign.status).toBe(404);

    const other = await buildApp(STRANGER.id);
    storage.getTask.mockResolvedValue(task());
    const notMine = await request(other).post(url("look")).send({ done: true });
    expect(notMine.status).toBe(403);
    expect(storage.updateTask).not.toHaveBeenCalled();
  });

  it("нет пункта — 404, без done — 400, без входа — 401; всё JSON", async () => {
    storage.getTask.mockResolvedValue(task());
    const app = await buildApp(WORKER.id);
    const missing = await request(app).post(url("nope")).send({ done: true });
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe("Пункт чек-листа не найден");

    const bad = await request(app).post(url("look")).send({ done: "да" });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("done");

    const anon = await buildApp();
    const r = await request(anon).post(url("look")).send({ done: true });
    expect(r.status).toBe(401);
    expect(r.headers["content-type"]).toMatch(/json/);
  });
});

describe("DELETE фото у пункта", () => {
  it("у пункта без фото отметка остаётся, у пункта с фото — снимается", async () => {
    const app = await buildApp(WORKER.id);
    const photo = "/uploads/task-100-x.jpg";
    storage.getTask.mockResolvedValue(
      task({
        checklist: [
          { ...ITEMS[0], done: true, photoUrls: [photo] },
          { ...ITEMS[1], done: true, photoUrls: [photo] },
        ],
      }),
    );
    const a = await request(app).delete(`/api/tasks/100/checklist/look/photo?url=${encodeURIComponent(photo)}`);
    expect(a.status).toBe(200);
    expect(storage.updateTask.mock.calls[0][1].checklist[0]).toMatchObject({ id: "look", done: true, photoUrls: [] });

    const b = await request(app).delete(`/api/tasks/100/checklist/case/photo?url=${encodeURIComponent(photo)}`);
    expect(b.status).toBe(200);
    expect(storage.updateTask.mock.calls[1][1].checklist[1]).toMatchObject({ id: "case", done: false, photoUrls: [] });
  });
});

describe("завершение задачи с пунктами без фото", () => {
  it("все пункты отмечены (один — касанием) — задача закрывается", async () => {
    const app = await buildApp(WORKER.id);
    storage.getTask.mockResolvedValue(
      task({ checklist: [{ ...ITEMS[0], done: true }, { ...ITEMS[1], done: true, photoUrls: ["/uploads/c.jpg"] }] }),
    );
    const r = await request(app).post("/api/tasks/100/complete").send({});
    expect(r.status).toBe(200);
    expect(storage.transitionTaskToCompleted).toHaveBeenCalledWith(100);
  });

  it("пункт без фото не отмечен — 400 без «с фото» в тексте", async () => {
    const app = await buildApp(WORKER.id);
    storage.getTask.mockResolvedValue(task({ checklist: [ITEMS[0], { ...ITEMS[1], done: true, photoUrls: ["/uploads/c.jpg"] }] }));
    const r = await request(app).post("/api/tasks/100/complete").send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("Отметьте все пункты чек-листа (1/2)");
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
  });
});

describe("PUT /api/tasks/:id: чек-лист", () => {
  it("requiresPhoto сохраняется, отметки и фото берутся из базы", async () => {
    const app = await buildApp(ADMIN.id);
    storage.getTask.mockResolvedValue(
      task({ checklist: [{ ...ITEMS[0], done: true }, { ...ITEMS[1], done: true, photoUrls: ["/uploads/c.jpg"] }] }),
    );
    const r = await request(app)
      .put("/api/tasks/100")
      .send({
        checklist: [
          { id: "look", title: "Внешний вид", done: false, photoUrls: [], requiresPhoto: false },
          { id: "case", title: "Витрина", done: false, photoUrls: [], requiresPhoto: false },
          { id: "new", title: "Ценники", requiresPhoto: true },
        ],
      });
    expect(r.status).toBe(200);
    expect(storage.updateTask).toHaveBeenCalledWith(100, {
      checklist: [
        { id: "look", title: "Внешний вид", done: true, photoUrls: [], requiresPhoto: false },
        { id: "case", title: "Витрина", done: true, photoUrls: ["/uploads/c.jpg"], requiresPhoto: false },
        { id: "new", title: "Ценники", done: false, photoUrls: [], requiresPhoto: true },
      ],
    });
  });
});

describe("полночный сброс", () => {
  it("обнуляет отметки и фото, но помнит, где фото не нужно", () => {
    const resetTask = {
      id: 1,
      title: "Открытие смены",
      workerId: 7,
      companyId: 42,
      category: null,
      price: 0,
      isRecurring: true,
      isCompleted: false,
      completedAt: null,
      createdAt: 1,
      photoUrl: null,
      photoUrls: [],
      checklist: [{ ...ITEMS[0], done: true }, { ...ITEMS[1], done: true, photoUrls: ["/uploads/c.jpg"] }],
      claimedByWorkerId: null,
      verificationStatus: null,
      verifiedByUserId: null,
      verifiedAt: null,
      weekDays: null,
      monthDay: null,
      dueDate: null,
    } as ResetTask;
    const now = Date.UTC(2026, 9, 23, 21, 5) / 1000;
    const plan = planDailyReset([resetTask], { tz: "Europe/Moscow", today: "2026-10-24", now });
    expect(plan.checklistResets).toEqual([
      {
        id: 1,
        checklist: [
          { id: "look", title: "Внешний вид", done: false, photoUrls: [], requiresPhoto: false },
          { id: "case", title: "Витрина", done: false, photoUrls: [] },
        ],
      },
    ]);
  });
});

describe("форма: черновик чек-листа", async () => {
  const { checklistDraftFrom, checklistPayload } = await import("../client/src/components/ChecklistEditor");
  const { checklistItemProof } = await import("../client/src/lib/verification-review");

  it("старый пункт без поля — в форме «нужно фото», пустые пункты отбрасываются", () => {
    const draft = checklistDraftFrom([{ id: "a", title: "Пол", done: true, photoUrls: ["/uploads/p.jpg"] }]);
    expect(draft).toEqual([{ id: "a", title: "Пол", requiresPhoto: true, done: true, photoUrls: ["/uploads/p.jpg"] }]);
    expect(checklistPayload([...draft, { id: "b", title: "  ", requiresPhoto: false }])).toEqual([
      { id: "a", title: "Пол", done: true, photoUrls: ["/uploads/p.jpg"], requiresPhoto: true },
    ]);
    expect(checklistPayload([])).toBeNull();
  });

  it("проверяющий видит «фото не нужно», а не пустоту, у пункта без фото", () => {
    expect(checklistItemProof({ done: true, photoUrls: [], requiresPhoto: false })).toEqual({ kind: "no-photo-needed" });
    expect(checklistItemProof({ done: true, photoUrls: ["/a.jpg"] })).toEqual({ kind: "photos", count: 1 });
    expect(checklistItemProof({ done: false, photoUrls: [] })).toEqual({ kind: "none" });
  });
});
