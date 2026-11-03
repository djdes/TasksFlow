import express from "express";
import session from "express-session";
import { createServer } from "node:http";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../shared/schema";
import { MANAGER_PRESET, NO_PERMISSIONS } from "../shared/roles";

const { storage, audit } = vi.hoisted(() => ({
  storage: {
    getUserById: vi.fn(), getAllUsers: vi.fn(), getCompanyRole: vi.fn(), getCompanyById: vi.fn(),
  },
  audit: vi.fn(),
}));
vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/audit-log", () => ({ recordAudit: audit }));

const base = { companyId: 42, isAdmin: false, isRoot: false, managedWorkerIds: null, roleId: null, name: "Анна", createdAt: 1 };
let people: User[];
const leadRole = { id: 3, companyId: 42, name: "Руководитель", permissions: MANAGER_PRESET.permissions };
const seniorRole = { id: 4, companyId: 42, name: "Старший", permissions: { ...NO_PERMISSIONS, manageTasks: true } };
const hrRole = { id: 5, companyId: 42, name: "Кадровик", permissions: { ...NO_PERMISSIONS, manageUsers: true } };

beforeEach(() => {
  vi.clearAllMocks();
  people = [
    { ...base, id: 1, isAdmin: true },
    { ...base, id: 2, roleId: 3 },
    { ...base, id: 3, managedWorkerIds: "[7]" },
    { ...base, id: 4, roleId: 5 },
    { ...base, id: 7 }, { ...base, id: 8, roleId: 4 },
    { ...base, id: 9, companyId: 99 },
    { ...base, id: 10, isRoot: true },
    { ...base, id: 11, isAdmin: true },
  ] as User[];
  storage.getUserById.mockImplementation(async (id) => people.find((u) => u.id === id));
  storage.getAllUsers.mockImplementation(async (companyId) => people.filter((u) => u.companyId === companyId));
  storage.getCompanyRole.mockImplementation(async (id) => [leadRole, seniorRole, hrRole].find((r) => r.id === id));
  storage.getCompanyById.mockResolvedValue({ id: 42, accessSettings: null });
});

async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const { apiKeyWithoutSession } = await import("../server/api-key-session");
  const app = express();
  app.use(express.json());
  app.use(apiKeyWithoutSession);
  app.use(session({ secret: "test-only", resave: false, saveUninitialized: false }));
  app.post("/__test/login/:id", (req, res) => {
    req.session.userId = Number(req.params.id);
    req.session.emailAuthAt = Math.floor(Date.now() / 1000);
    res.json({ ok: true });
  });
  await registerRoutes(createServer(app), app);
  app.get("/api/test/who", (req, res) => res.json({ userId: req.session.userId }));
  app.get("/__test/session", (req, res) => res.json({ ...req.session }));
  return app;
}

async function login(app: express.Express, id = 1) {
  const agent = request.agent(app);
  await agent.post(`/__test/login/${id}`).expect(200);
  return agent;
}

describe("просмотр кабинета сотрудника", () => {
  it("меняет сессию, права и список людей; возвращает исходный аккаунт без email-привилегии", async () => {
    const app = await buildApp();
    const agent = request.agent(app);
    const signedIn = await agent.post("/__test/login/1");
    const oldCookie = signedIn.headers["set-cookie"][0].split(";")[0];
    const started = await agent.post("/api/auth/impersonate").send({ userId: 7, impersonatorId: 11 }).expect(200);
    expect(started.headers["set-cookie"][0].split(";")[0]).not.toBe(oldCookie);
    const me = (await agent.get("/api/auth/me").expect(200)).body;
    expect(me).toMatchObject({ id: 7, isAdmin: false, pinResetByEmail: false, impersonation: { actorId: 1, readOnly: true }, access: { kind: "employee", manageUsers: false } });
    expect((await agent.get("/api/users")).body).toEqual([expect.objectContaining({ id: 7, canImpersonate: false })]);
    expect((await request(app).get("/api/auth/me").set("Cookie", oldCookie)).body).toBeNull();
    expect((await agent.get("/__test/session")).body.emailAuthAt).toBeUndefined();
    await agent.post("/api/auth/impersonate/stop").expect(200);
    expect((await agent.get("/api/auth/me")).body).toMatchObject({ id: 1, pinResetByEmail: false });
    expect((await agent.get("/__test/session")).body.impersonatorId).toBeUndefined();
    expect(audit.mock.calls.map(([event]) => [event.action, event.actorWorkerId, event.payload.userId])).toEqual([
      ["auth.impersonation_started", 1, 7], ["auth.impersonation_stopped", 1, 7],
    ]);
  });

  it("руководитель с ролью входит в обычного сотрудника, WeSetup — только в своего", async () => {
    const app = await buildApp();
    await (await login(app, 2)).post("/api/auth/impersonate").send({ userId: 7 }).expect(200);
    const manager = await login(app, 3);
    const listed = (await manager.get("/api/users")).body;
    expect(listed.map((u: User) => u.id).sort()).toEqual([3, 7]);
    expect(listed.find((u: User) => u.id === 7).canImpersonate).toBe(true);
    await manager.post("/api/auth/impersonate").send({ userId: 8 }).expect(403);
    await manager.post("/api/auth/impersonate").send({ userId: 7 }).expect(200);
  });

  it("не повышает права: кадровик не входит в старшего с задачами всей компании", async () => {
    const app = await buildApp();
    const hr = await login(app, 4);
    await hr.post("/api/auth/impersonate").send({ userId: 8 }).expect(403);
    await hr.post("/api/auth/impersonate").send({ userId: 2 }).expect(403);
    await hr.post("/api/auth/impersonate").send({ userId: 3 }).expect(403);
    await hr.post("/api/auth/impersonate").send({ userId: 7 }).expect(200);
  });

  it("администратор видит кнопку у другого администратора, входит и возвращается; записи закрыты", async () => {
    const agent = await login(await buildApp());
    const listed = (await agent.get("/api/users")).body;
    expect(listed.find((u: User) => u.id === 11).canImpersonate).toBe(true);
    expect(listed.find((u: User) => u.id === 1).canImpersonate).toBe(false);
    await agent.post("/api/auth/impersonate").send({ userId: 11 }).expect(200);
    expect((await agent.get("/api/auth/me")).body).toMatchObject({ id: 11, isAdmin: true, impersonation: { actorId: 1, readOnly: true } });
    await agent.put("/api/companies/me").send({ name: "Подмена" }).expect(403);
    await agent.post("/api/auth/impersonate/stop").expect(200);
    expect((await agent.get("/api/auth/me")).body.id).toBe(1);
  });

  it("руководители и сотрудники не могут смотреть администратора даже при ошибке иерархии WeSetup", async () => {
    const app = await buildApp();
    people.find((u) => u.id === 3)!.managedWorkerIds = "[7,11]";
    for (const actorId of [2, 3, 4, 7]) {
      const agent = await login(app, actorId);
      const listed = (await agent.get("/api/users")).body;
      expect(listed.find((u: User) => u.id === 11)?.canImpersonate ?? false).toBe(false);
      await agent.post("/api/auth/impersonate").send({ userId: 11 }).expect(403);
    }
  });

  it("не допускает чужую компанию, root, себя, неверный ID и API-ключ", async () => {
    const app = await buildApp();
    const admin = await login(app);
    for (const [userId, status] of [[9, 404], [10, 403], [1, 403], [999, 404]]) {
      await admin.post("/api/auth/impersonate").send({ userId }).expect(status);
    }
    for (const userId of [0, -1, "7", 1.5, null]) await admin.post("/api/auth/impersonate").send({ userId }).expect(400);
    await request(app).post("/api/auth/impersonate").send({ userId: 7 }).expect(401);
    await (await login(app, 7)).post("/api/auth/impersonate").send({ userId: 8 }).expect(403);
    await admin.post("/api/auth/impersonate").set("Authorization", "Bearer tfk_test").send({ userId: 7 }).expect(403);
    await admin.post("/api/auth/impersonate/stop").expect(400);
  });

  it("блокирует записи, смену аккаунта по GET, WeSetup fill-token и вложенный вход", async () => {
    const agent = await login(await buildApp());
    await agent.post("/api/auth/impersonate").send({ userId: 7 }).expect(200);
    for (const path of ["/api/tasks/1/complete", "/api/users", "/api/account/password", "/api/push/subscribe", "/api/auth/login", "/api/auth/impersonate"]) {
      const r = await agent.post(path).send({ userId: 8 }).expect(403);
      expect(r.type).toBe("application/json");
      expect(r.body.message).toContain("вернитесь");
    }
    await agent.put("/api/auth/me").send({ name: "Подмена" }).expect(403);
    await agent.delete("/api/auth/me").expect(403);
    await agent.get("/api/auth/magic/token").expect(403);
    await agent.get("/API/AUTH/MAGIC/token/").expect(403);
    await agent.get("/api/wesetup/task-fill-url?taskId=1").expect(403);
    expect((await agent.get("/api/test/who")).body.userId).toBe(7);
  });

  it("отзыв прав и удаление сотрудника прекращают просмотр, возврат остаётся доступен", async () => {
    const agent = await login(await buildApp(), 3);
    await agent.post("/api/auth/impersonate").send({ userId: 7 }).expect(200);
    people.find((u) => u.id === 3)!.managedWorkerIds = "[]";
    await agent.get("/api/test/who").expect(403);
    expect((await agent.get("/api/auth/me")).body).toMatchObject({ impersonation: { unavailable: true } });
    people = people.filter((u) => u.id !== 7);
    await agent.post("/api/auth/impersonate/stop").expect(200);
    expect((await agent.get("/api/auth/me")).body.id).toBe(3);
  });

  it("удалённый руководитель не восстанавливает аккаунт; обычный выход уничтожает просмотр", async () => {
    const app = await buildApp();
    const agent = await login(app, 2);
    await agent.post("/api/auth/impersonate").send({ userId: 7 }).expect(200);
    people = people.filter((u) => u.id !== 2);
    await agent.post("/api/auth/impersonate/stop").expect(401);
    expect((await agent.get("/api/auth/me")).body).toBeNull();
    const admin = await login(app);
    await admin.post("/api/auth/impersonate").send({ userId: 7 }).expect(200);
    await admin.post("/api/auth/logout").expect(200);
    expect((await admin.get("/api/auth/me")).body).toBeNull();
  });
});
