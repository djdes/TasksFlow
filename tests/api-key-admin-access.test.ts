/**
 * API-ключ = права администратора своей компании, как в кабинете:
 *   • роли, настройка проверки, смена роли сотрудника — по ключу;
 *   • ключ действует, пока его создатель — админ компании ключа;
 *   • root, оплата, ключи, вход и личный аккаунт — не по ключу;
 *   • запрос с ключом не создаёт cookie-сессию;
 *   • прежние интеграционные маршруты работают как раньше.
 */
import express from "express";
import session from "express-session";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../shared/schema";
import { MANAGER_PRESET, NO_PERMISSIONS, type CompanyRole } from "../shared/roles";
import { hashApiKey } from "../server/api-key-crypto";
import { apiKeyWithoutSession, isDeniedForApiKey } from "../server/api-key-session";

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
  listCompanyRoles: vi.fn(),
  getCompanyRole: vi.fn(),
  createCompanyRole: vi.fn(),
  updateCompanyRole: vi.fn(),
  deleteCompanyRole: vi.fn(),
  listCompanies: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage, DatabaseStorage: { parseManagedWorkerIds: () => null } }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({ attemptOrEnqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../server/audit-log", () => ({ recordAudit: vi.fn() }));

const KEY = "tfk_admin_access_test_key";
const auth = { Authorization: `Bearer ${KEY}` };

const base = { createdAt: 1, bonusBalance: 0, companyId: 42, managedWorkerIds: null, position: null, isRoot: false } as const;
const ADMIN = { ...base, id: 1, phone: "+79990000001", name: "Денис", isAdmin: true, roleId: null } as unknown as User;
const WORKER = { ...base, id: 7, phone: "+79990000007", name: "Михаил", isAdmin: false, roleId: null } as unknown as User;
const ROOT = { ...base, id: 5, phone: "+79990000005", name: "Root", isAdmin: true, isRoot: true, roleId: null } as unknown as User;
const FOREIGN_ADMIN = { ...base, id: 9, companyId: 99, phone: "+79990000009", name: "Чужой", isAdmin: true, roleId: null } as unknown as User;
const people = [ADMIN, WORKER, ROOT, FOREIGN_ADMIN];

const ROLE_LEAD: CompanyRole = { id: 3, companyId: 42, name: "Руководитель", permissions: MANAGER_PRESET.permissions, createdAt: 1, updatedAt: 1 };

function keyRecord(extra: Record<string, unknown> = {}) {
  return {
    id: 15, name: "Claude", keyHash: hashApiKey(KEY), keyPrefix: KEY.slice(0, 12), keyEncrypted: null,
    companyId: 42, createdByUserId: ADMIN.id, createdAt: 1, lastUsedAt: 0, revokedAt: 0, ...extra,
  };
}

/** Как в тестах роутов: сессия — простой объект. */
async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = {};
    next();
  });
  await registerRoutes(createServer(app), app);
  return app;
}

/** Как в server/index.ts: заглушка до настоящей express-session. */
async function buildAppWithRealSession(withBypass = true) {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  if (withBypass) app.use(apiKeyWithoutSession);
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use(express.json());
  await registerRoutes(createServer(app), app);
  return app;
}

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset());
  storage.getApiKeyByHash.mockResolvedValue(keyRecord());
  storage.updateApiKeyLastUsed.mockResolvedValue(undefined);
  storage.getUserById.mockImplementation(async (id: number) => people.find((u) => u.id === id));
  storage.getAllUsers.mockResolvedValue([ADMIN, WORKER]);
  storage.getCompanyRole.mockImplementation(async (id: number) => (id === ROLE_LEAD.id ? ROLE_LEAD : undefined));
  storage.listCompanyRoles.mockResolvedValue([ROLE_LEAD]);
  storage.getCompanyById.mockResolvedValue({ id: 42, name: "ООО БФС", accessSettings: null });
  storage.countCompanyUsers.mockResolvedValue(2);
  storage.getUserByPhone.mockResolvedValue(undefined);
  storage.createUser.mockImplementation(async (u: any) => ({ ...base, id: 50, ...u }));
  storage.setUserRole.mockImplementation(async (id: number, r: any) => ({ ...people.find((p) => p.id === id), ...r }));
  storage.createCompanyRole.mockImplementation(async (companyId: number, input: any) => ({ id: 11, companyId, ...input, createdAt: 1, updatedAt: 1 }));
});

describe("API-ключ действует как админ компании", () => {
  it("роли: список, создание, настройка проверки", async () => {
    const app = await buildApp();
    const list = await request(app).get("/api/roles").set(auth);
    expect(list.status).toBe(200);
    expect(list.body.roles).toEqual([ROLE_LEAD]);

    const created = await request(app).post("/api/roles").set(auth).send({ name: "Кассир", permissions: { verifyTasks: true } });
    expect(created.status).toBe(201);
    expect(storage.createCompanyRole).toHaveBeenCalledWith(42, { name: "Кассир", permissions: { ...NO_PERMISSIONS, verifyTasks: true } });

    const settings = await request(app).put("/api/roles/settings").set(auth).send({ employeeApproval: true });
    expect(settings.status).toBe(200);
    expect(storage.updateCompany).toHaveBeenCalledWith(42, { accessSettings: '{"employeeApproval":true}' });
  });

  it("выдаёт сотруднику роль «Руководитель»", async () => {
    const r = await request(await buildApp()).put("/api/users/7").set(auth).send({ phone: WORKER.phone, role: ROLE_LEAD.id });
    expect(r.status).toBe(200);
    expect(storage.setUserRole).toHaveBeenCalledWith(7, { isAdmin: false, roleId: ROLE_LEAD.id });
  });

  it("создатель ключа больше не админ — кабинетные маршруты закрыты, интеграция работает", async () => {
    storage.getApiKeyByHash.mockResolvedValue(keyRecord({ createdByUserId: WORKER.id }));
    const app = await buildApp();
    const roles = await request(app).get("/api/roles").set(auth);
    expect(roles.status).toBe(403);
    expect(roles.body.message).toMatch(/выпустите новый ключ/);
    // Добавление сотрудника по ключу было и раньше — оно от создателя не зависит.
    const created = await request(app).post("/api/users").set(auth).send({ phone: "+79991112233", name: "Лариса" });
    expect(created.status).toBe(201);
  });

  it("создатель — админ другой компании → 403", async () => {
    storage.getApiKeyByHash.mockResolvedValue(keyRecord({ createdByUserId: FOREIGN_ADMIN.id }));
    expect((await request(await buildApp()).get("/api/roles").set(auth)).status).toBe(403);
  });

  it("неверный или отозванный ключ → 401 JSON", async () => {
    storage.getApiKeyByHash.mockResolvedValue(undefined);
    const app = await buildApp();
    const bad = await request(app).get("/api/roles").set(auth);
    expect(bad.status).toBe(401);
    expect(bad.headers["content-type"]).toMatch(/json/);
    storage.getApiKeyByHash.mockResolvedValue(keyRecord({ revokedAt: 100 }));
    expect((await request(app).put("/api/roles/settings").set(auth).send({ employeeApproval: true })).status).toBe(401);
    expect(storage.updateCompany).not.toHaveBeenCalled();
  });

  it("root по ключу недоступен, даже если ключ выпустил root", async () => {
    storage.getApiKeyByHash.mockResolvedValue(keyRecord({ createdByUserId: ROOT.id }));
    const r = await request(await buildApp()).get("/api/root/companies").set(auth);
    expect(r.status).toBe(403);
    expect(storage.listCompanies).not.toHaveBeenCalled();
  });
});

describe("запрос с ключом идёт без cookie-сессии", () => {
  it("права админа есть, cookie нет", async () => {
    const r = await request(await buildAppWithRealSession()).put("/api/roles/settings").set(auth).send({ employeeApproval: true });
    expect(r.status).toBe(200);
    expect(r.headers["set-cookie"]).toBeUndefined();
  });

  it.each([
    ["get", "/api/auth/me"],
    ["put", "/api/account/password"],
    ["delete", "/api/auth/me"],
    ["post", "/api/api-keys"],
    ["post", "/api/billing/checkout"],
    ["post", "/api/push/subscriptions"],
    ["get", "/api/root/companies"],
  ] as const)("%s %s → 403", async (method, path) => {
    const r = await request(await buildAppWithRealSession())[method](path).set(auth);
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/только в кабинете/);
  });

  it("без заглушки ключ не пишет userId в настоящую сессию", async () => {
    const r = await request(await buildAppWithRealSession(false)).put("/api/roles/settings").set(auth).send({ employeeApproval: true });
    expect(r.status).toBe(401);
    expect(r.headers["set-cookie"]).toBeUndefined();
    expect(storage.updateCompany).not.toHaveBeenCalled();
  });

  it("без ключа сессия работает как раньше", async () => {
    expect((await request(await buildAppWithRealSession()).get("/api/roles")).status).toBe(401);
  });

  it("список закрытых разделов не задевает соседние адреса", () => {
    expect(isDeniedForApiKey("/api/auth")).toBe(true);
    expect(isDeniedForApiKey("/api/billing/orders/1")).toBe(true);
    expect(isDeniedForApiKey("/api/authors")).toBe(false);
    expect(isDeniedForApiKey("/api/roles")).toBe(false);
    expect(isDeniedForApiKey("/api/users/7")).toBe(false);
  });
});
