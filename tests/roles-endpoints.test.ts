/**
 * Роли в API:
 *   • /api/roles — только админ меняет, руководитель видит список;
 *   • руководитель с ролью добавляет и меняет обычных людей, но не админов,
 *     не других руководителей и не выдаёт права на людей;
 *   • руководитель с ролью ставит задачи любому и видит все задачи;
 *   • «Готово» сотрудника в компании с проверкой → задача на проверке,
 *     премии нет; принимает руководитель с ролью;
 *   • личные уведомления сохраняются.
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, User } from "../shared/schema";
import { MANAGER_PRESET, NO_PERMISSIONS, type CompanyRole } from "../shared/roles";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getUserByPhone: vi.fn(),
  getAllUsers: vi.fn(),
  getCompanyById: vi.fn(),
  updateCompany: vi.fn(),
  countCompanyUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserRole: vi.fn(),
  setUserPin: vi.fn(),
  deleteUser: vi.fn(),
  setUserNotifyPrefs: vi.fn(),
  listCompanyRoles: vi.fn(),
  getCompanyRole: vi.fn(),
  createCompanyRole: vi.fn(),
  updateCompanyRole: vi.fn(),
  deleteCompanyRole: vi.fn(),
  getTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  submitForVerification: vi.fn(),
  transitionTaskToCompleted: vi.fn(),
  approveVerification: vi.fn(),
  updateUserBalance: vi.fn(),
  claimSiblingTasks: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage, DatabaseStorage: { parseManagedWorkerIds: () => null } }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({ attemptOrEnqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/audit-log", () => ({ recordAudit: vi.fn() }));

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

const base = { createdAt: 1, bonusBalance: 0, companyId: 42, managedWorkerIds: null, position: null, isRoot: false } as const;
const ADMIN = { ...base, id: 1, phone: "+79990000001", name: "Денис", isAdmin: true, roleId: null } as unknown as User;
const LEAD = { ...base, id: 2, phone: "+79990000002", name: "Михаил", isAdmin: false, roleId: 3 } as unknown as User;
const LEAD2 = { ...base, id: 3, phone: "+79990000003", name: "Ольга", isAdmin: false, roleId: 3 } as unknown as User;
const WORKER = { ...base, id: 7, phone: "+79990000007", name: "Анна", isAdmin: false, roleId: null } as unknown as User;
const SENIOR = { ...base, id: 8, phone: "+79990000008", name: "Пётр", isAdmin: false, roleId: 4 } as unknown as User;

const ROLE_LEAD: CompanyRole = { id: 3, companyId: 42, name: "Руководитель", permissions: MANAGER_PRESET.permissions, createdAt: 1, updatedAt: 1 };
const ROLE_SENIOR: CompanyRole = { id: 4, companyId: 42, name: "Старший смены", permissions: { ...NO_PERMISSIONS, manageTasks: true }, createdAt: 1, updatedAt: 1 };
const ROLE_FOREIGN: CompanyRole = { ...ROLE_SENIOR, id: 9, companyId: 99 };

const people = [ADMIN, LEAD, LEAD2, WORKER, SENIOR];
const roles = [ROLE_LEAD, ROLE_SENIOR, ROLE_FOREIGN];

function task(extra: Partial<Task> = {}): Task {
  return {
    id: 100, title: "Уборка", workerId: 7, requiresPhoto: false, photoUrl: null, photoUrls: [], examplePhotoUrl: null,
    isCompleted: false, weekDays: null, monthDay: null, isRecurring: true, price: 50, category: null, description: null,
    companyId: 42, journalLink: null, createdAt: 0, completedAt: null, claimedByWorkerId: null, verificationStatus: null,
    verifierWorkerId: null, verifiedByUserId: null, verifiedAt: null, rejectReason: null, submittedValues: null,
    checklist: [], dueDate: null, examplePhotoUrls: [], remindAt: null, remindSentDay: null, ...extra,
  } as Task;
}

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset());
  storage.getUserById.mockImplementation(async (id: number) => people.find((u) => u.id === id));
  storage.getAllUsers.mockResolvedValue(people);
  storage.getCompanyRole.mockImplementation(async (id: number) => roles.find((r) => r.id === id));
  storage.listCompanyRoles.mockResolvedValue([ROLE_LEAD, ROLE_SENIOR]);
  storage.getCompanyById.mockResolvedValue({ id: 42, name: "ООО БФС", accessSettings: null });
  storage.countCompanyUsers.mockResolvedValue(5);
  storage.getUserByPhone.mockResolvedValue(undefined);
  storage.createUser.mockImplementation(async (u: any) => ({ ...base, id: 50, ...u }));
  storage.updateUser.mockImplementation(async (id: number, u: any) => ({ ...people.find((p) => p.id === id), ...u }));
  storage.setUserRole.mockImplementation(async (id: number, r: any) => ({ ...people.find((p) => p.id === id), ...r }));
});

describe("/api/roles", () => {
  it("список видят админ и руководитель с ролью, сотрудник — нет", async () => {
    expect((await request(await buildApp(ADMIN.id)).get("/api/roles")).body).toEqual({
      roles: [ROLE_LEAD, ROLE_SENIOR],
      employeeApproval: false,
    });
    expect((await request(await buildApp(LEAD.id)).get("/api/roles")).status).toBe(200);
    expect((await request(await buildApp(WORKER.id)).get("/api/roles")).status).toBe(403);
  });

  it("создаёт и меняет роли только админ; одинаковые названия не пускаем", async () => {
    storage.createCompanyRole.mockImplementation(async (companyId: number, input: any) => ({ id: 11, companyId, ...input, createdAt: 1, updatedAt: 1 }));
    const admin = await buildApp(ADMIN.id);
    const ok = await request(admin).post("/api/roles").send({ name: "Кассир", permissions: { verifyTasks: true } });
    expect(ok.status).toBe(201);
    expect(storage.createCompanyRole).toHaveBeenCalledWith(42, { name: "Кассир", permissions: { ...NO_PERMISSIONS, verifyTasks: true } });
    const dup = await request(admin).post("/api/roles").send({ name: "руководитель", permissions: {} });
    expect(dup.status).toBe(400);
    expect((await request(await buildApp(LEAD.id)).post("/api/roles").send({ name: "Кассир", permissions: {} })).status).toBe(403);
  });

  it("роль чужой компании — 404", async () => {
    const r = await request(await buildApp(ADMIN.id)).put("/api/roles/9").send({ name: "X", permissions: {} });
    expect(r.status).toBe(404);
    expect(storage.updateCompanyRole).not.toHaveBeenCalled();
  });

  it("настройка «выполненное — на проверку» пишется в компанию", async () => {
    const r = await request(await buildApp(ADMIN.id)).put("/api/roles/settings").send({ employeeApproval: true });
    expect(r.status).toBe(200);
    expect(storage.updateCompany).toHaveBeenCalledWith(42, { accessSettings: '{"employeeApproval":true}' });
    expect((await request(await buildApp(LEAD.id)).put("/api/roles/settings").send({ employeeApproval: false })).status).toBe(403);
  });
});

describe("руководитель с ролью и сотрудники", () => {
  const newbie = { phone: "+79991112233", name: "Новый", pin: "4826" };

  it("добавляет сотрудника с должностью и ролью без права на людей", async () => {
    const r = await request(await buildApp(LEAD.id)).post("/api/users").send({ ...newbie, position: "Повар", roleId: 4 });
    expect(r.status).toBe(201);
    expect(storage.createUser).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: false, roleId: 4, position: "Повар", companyId: 42 }));
  });

  it("не назначает админа и роль с правом на людей; чужую роль — 400", async () => {
    const app = await buildApp(LEAD.id);
    expect((await request(app).post("/api/users").send({ ...newbie, role: "admin" })).status).toBe(403);
    expect((await request(app).post("/api/users").send({ ...newbie, roleId: 3 })).status).toBe(403);
    expect((await request(app).post("/api/users").send({ ...newbie, roleId: 9 })).status).toBe(400);
    expect(storage.createUser).not.toHaveBeenCalled();
  });

  it("сотрудник без роли людей не добавляет", async () => {
    expect((await request(await buildApp(WORKER.id)).post("/api/users").send(newbie)).status).toBe(403);
  });

  it("меняет обычного человека, но не админа и не другого руководителя", async () => {
    const app = await buildApp(LEAD.id);
    const ok = await request(app).put("/api/users/7").send({ phone: WORKER.phone, name: "Анна П.", position: "Кассир", role: 4 });
    expect(ok.status).toBe(200);
    expect(storage.setUserRole).toHaveBeenCalledWith(7, { isAdmin: false, roleId: 4 });
    expect((await request(app).put("/api/users/1").send({ phone: ADMIN.phone, name: "X" })).status).toBe(403);
    expect((await request(app).put("/api/users/3").send({ phone: LEAD2.phone, name: "X" })).status).toBe(403);
    expect((await request(app).post("/api/users/3/pin").send({ pin: "4826" })).status).toBe(403);
    expect((await request(app).delete("/api/users/3")).status).toBe(403);
    expect(storage.deleteUser).not.toHaveBeenCalled();
  });

  it("админ назначает администратора и руководителя; свою роль не меняет никто", async () => {
    const app = await buildApp(ADMIN.id);
    expect((await request(app).put("/api/users/7").send({ phone: WORKER.phone, role: "admin" })).status).toBe(200);
    expect(storage.setUserRole).toHaveBeenCalledWith(7, { isAdmin: true, roleId: null });
    expect((await request(app).put("/api/users/1").send({ phone: ADMIN.phone, role: null })).status).toBe(400);
  });
});

describe("руководитель с ролью и задачи", () => {
  it("видит задачи всей компании и ставит их любому", async () => {
    storage.getTasks.mockResolvedValue([task({ id: 1, workerId: 7 }), task({ id: 2, workerId: 8 }), task({ id: 3, workerId: null })]);
    const app = await buildApp(LEAD.id);
    expect((await request(app).get("/api/tasks")).body.map((t: Task) => t.id)).toEqual([1, 2, 3]);
    storage.createTask.mockImplementation(async (t: any) => task({ ...t, id: 5 }));
    const r = await request(app).post("/api/tasks").send({ title: "Принять поставку", workerId: 8 });
    expect(r.status).toBe(201);
  });

  it("сотрудник видит только свои", async () => {
    storage.getTasks.mockResolvedValue([task({ id: 1, workerId: 7 }), task({ id: 2, workerId: 8 })]);
    expect((await request(await buildApp(WORKER.id)).get("/api/tasks")).body.map((t: Task) => t.id)).toEqual([1]);
  });
});

describe("выполненное сотрудником — на проверку", () => {
  it("компания с проверкой: «Готово» → submitted, премии нет", async () => {
    storage.getCompanyById.mockResolvedValue({ id: 42, accessSettings: '{"employeeApproval":true}' });
    storage.getTask.mockResolvedValueOnce(task()).mockResolvedValue(task({ verificationStatus: "submitted" }));
    storage.submitForVerification.mockResolvedValue(true);
    const r = await request(await buildApp(WORKER.id)).post("/api/tasks/100/complete");
    expect(r.status).toBe(200);
    expect(r.body.verificationStatus).toBe("submitted");
    expect(storage.submitForVerification).toHaveBeenCalledWith(100, { byRole: true });
    expect(storage.transitionTaskToCompleted).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });

  it("компания без проверки — закрывается сразу, как раньше", async () => {
    storage.getTask.mockResolvedValue(task());
    storage.transitionTaskToCompleted.mockResolvedValue(true);
    const r = await request(await buildApp(WORKER.id)).post("/api/tasks/100/complete");
    expect(r.status).toBe(200);
    expect(storage.submitForVerification).not.toHaveBeenCalled();
    expect(storage.updateUserBalance).toHaveBeenCalledWith(7, 50);
  });

  it("руководитель с ролью принимает работу — премия начисляется", async () => {
    storage.getTask.mockResolvedValue(task({ verificationStatus: "submitted" }));
    storage.approveVerification.mockResolvedValue(true);
    const r = await request(await buildApp(LEAD.id)).post("/api/tasks/100/verify").send({ decision: "approve" });
    expect(r.status).toBe(200);
    expect(storage.approveVerification).toHaveBeenCalledWith(100, LEAD.id);
    expect(storage.updateUserBalance).toHaveBeenCalledWith(7, 50);
  });

  it("сотрудник чужую работу не принимает; в очереди проверки руководителя — задачи компании", async () => {
    storage.getTask.mockResolvedValue(task({ workerId: 8, verificationStatus: "submitted" }));
    expect((await request(await buildApp(WORKER.id)).post("/api/tasks/100/verify").send({ decision: "approve" })).status).toBe(403);
    storage.getTasks.mockResolvedValue([task({ id: 1, verificationStatus: "submitted" }), task({ id: 2, workerId: 2, verificationStatus: "submitted" })]);
    const queue = await request(await buildApp(LEAD.id)).get("/api/tasks/awaiting-verification");
    expect(queue.body.map((t: Task) => t.id)).toEqual([1]); // свою работу не принимает
  });
});

describe("личные уведомления", () => {
  it("сохраняются полным набором; неполный — 400", async () => {
    storage.setUserNotifyPrefs.mockImplementation(async (_id: number, prefs: string) => ({ ...WORKER, notifyPrefs: prefs }));
    const app = await buildApp(WORKER.id);
    const prefs = { newTask: true, reminders: false, review: true, verdict: true, digest: true, emailNewTask: false };
    const r = await request(app).put("/api/account/notify-prefs").send(prefs);
    expect(r.status).toBe(200);
    expect(r.body.notify).toEqual(prefs);
    expect((await request(app).put("/api/account/notify-prefs").send({ newTask: true })).status).toBe(400);
  });
});

describe("исправления ревью", () => {
  it("исполнитель сам назначен проверяющим — закрывает сразу, даже в компании с проверкой", async () => {
    storage.getCompanyById.mockResolvedValue({ id: 42, accessSettings: '{"employeeApproval":true}' });
    storage.getTask.mockResolvedValue(task({ verifierWorkerId: 7 }));
    storage.transitionTaskToCompleted.mockResolvedValue(true);
    const r = await request(await buildApp(WORKER.id)).post("/api/tasks/100/complete");
    expect(r.status).toBe(200);
    expect(storage.submitForVerification).not.toHaveBeenCalled();
    expect(storage.transitionTaskToCompleted).toHaveBeenCalledWith(100);
  });

  it("руководитель с ролью не меняет руководителя из WeSetup", async () => {
    const wesetupChef = { ...WORKER, id: 12, phone: "+79990000012", managedWorkerIds: "[7]" } as unknown as User;
    storage.getUserById.mockImplementation(async (id: number) => [...people, wesetupChef].find((u) => u.id === id));
    const app = await buildApp(LEAD.id);
    expect((await request(app).put("/api/users/12").send({ phone: wesetupChef.phone, name: "X" })).status).toBe(403);
    expect((await request(app).delete("/api/users/12")).status).toBe(403);
    expect(storage.deleteUser).not.toHaveBeenCalled();
  });

  it("«Принять» журнальную задачу без премии забирает её у коллег, как /complete", async () => {
    const journalLink = JSON.stringify({ kind: "wesetup-cleaning", baseUrl: "https://wesetup.ru", documentId: "doc-1", rowKey: "room-1" });
    storage.getTask.mockResolvedValue(task({ price: 0, journalLink, verificationStatus: "submitted" }));
    storage.approveVerification.mockResolvedValue(true);
    storage.claimSiblingTasks.mockResolvedValue(1);
    const r = await request(await buildApp(ADMIN.id)).post("/api/tasks/100/verify").send({ decision: "approve" });
    expect(r.status).toBe(200);
    expect(storage.claimSiblingTasks).toHaveBeenCalledWith(expect.objectContaining({ sourceTaskId: 100, documentId: "doc-1", claimedByWorkerId: 7 }));
    expect(storage.updateUserBalance).not.toHaveBeenCalled();
  });
});
