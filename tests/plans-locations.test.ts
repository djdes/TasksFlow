/**
 * Тарифы и точки: лимит людей включается только PLAN_LIMITS=on, платный
 * тариф кончается по plan_until, точки — по компании, root ставит тариф.
 */
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectivePlan, PLANS, seatsLeft } from "../shared/plans";

const storage = {
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn(),
  getUserById: vi.fn(),
  getUserByPhone: vi.fn(),
  getCompanyById: vi.fn(),
  countCompanyUsers: vi.fn(),
  createUser: vi.fn(),
  getAllUsers: vi.fn(),
};
const dbState = { updates: [] as Array<{ table: string; values: unknown }>, rows: [] as unknown[], affected: 1 };
const chain = (result: unknown) => {
  const c: any = {
    from: () => c, where: () => c, orderBy: () => c, limit: () => c,
    set: (values: unknown) => { dbState.updates.push({ table: "?", values }); return c; },
    values: () => c,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return c;
};
vi.mock("../server/db", () => ({
  db: {
    select: () => chain(dbState.rows),
    update: () => chain([{ affectedRows: dbState.affected }]),
    insert: () => chain([{ insertId: 5 }]),
    execute: vi.fn(async () => [[{ id: 1, name: "Кафе", email: null, createdAt: 1, plan: "team", planUntil: null, usersCount: 7, tasksCount: 40, lastCompletedAt: 100 }]]),
  },
}));
vi.mock("../server/storage", () => ({ storage, DatabaseStorage: { parseManagedWorkerIds: () => null } }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));
vi.mock("../server/webhook-queue", () => ({ attemptOrEnqueue: vi.fn().mockResolvedValue(undefined) }));

let sessionStore: Record<string, unknown>;
async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionStore;
    next();
  });
  await registerRoutes(createServer(app), app);
  return app;
}

const admin = { id: 1, name: "Ирина", phone: "+79990000001", isAdmin: true, isRoot: false, companyId: 1 };
const root = { ...admin, id: 99, isRoot: true, companyId: 9 };
const worker = { id: 10, name: "Анна", phone: "+79990000010", isAdmin: false, isRoot: false, companyId: 1, locationId: null };
const company = { id: 1, name: "Кафе", plan: null, planUntil: null, timezone: "Europe/Moscow" };

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset());
  dbState.updates = [];
  dbState.rows = [];
  dbState.affected = 1;
  sessionStore = {};
  storage.getUserById.mockImplementation(async (id: number) => [admin, root, worker].find((u) => u.id === id));
  storage.getCompanyById.mockResolvedValue(company);
});
afterEach(() => {
  delete process.env.PLAN_LIMITS;
  vi.restoreAllMocks();
});

describe("тарифы", () => {
  it("платный до plan_until, потом «Старт»; мусор — «Старт»", () => {
    expect(effectivePlan("team", null).id).toBe("team");
    expect(effectivePlan("team", 100, 200).id).toBe("start");
    expect(effectivePlan("team", 300, 200).id).toBe("team");
    expect(effectivePlan("gold", null).id).toBe("start");
    expect(seatsLeft(PLANS.start, 4)).toBe(1);
    expect(seatsLeft(PLANS.start, 9)).toBe(0);
    expect(seatsLeft(PLANS.business, 999)).toBeNull();
  });

  it("без PLAN_LIMITS=on шестой человек добавляется", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    storage.countCompanyUsers.mockResolvedValue(5);
    storage.getUserByPhone.mockResolvedValue(undefined);
    storage.createUser.mockResolvedValue({ ...worker, id: 11 });
    const r = await request(app).post("/api/users").send({ phone: "+79990000011", name: "Борис", pin: "5830" });
    expect(r.status).toBe(201);
  });

  it("с PLAN_LIMITS=on на «Старте» шестой — 402 с понятным текстом", async () => {
    process.env.PLAN_LIMITS = "on";
    const app = await buildApp();
    sessionStore.userId = admin.id;
    storage.countCompanyUsers.mockResolvedValue(5);
    storage.getUserByPhone.mockResolvedValue(undefined);
    const r = await request(app).post("/api/users").send({ phone: "+79990000011", name: "Борис", pin: "5830" });
    expect(r.status).toBe(402);
    expect(r.body.code).toBe("plan_limit");
    expect(r.body.message).toContain("«Старт» — до 5 человек");
    expect(r.body.message).toContain("«Команда»");
    expect(storage.createUser).not.toHaveBeenCalled();
  });

  it("тариф и лимит видны в companies/me", async () => {
    process.env.PLAN_LIMITS = "on";
    const app = await buildApp();
    sessionStore.userId = worker.id;
    storage.getCompanyById.mockResolvedValue({ ...company, plan: "team" });
    const r = await request(app).get("/api/companies/me");
    expect(r.body.planInfo).toMatchObject({ id: "team", name: "Команда", maxUsers: 30, enforced: true });
  });

  it("root видит компании и меняет тариф, админ компании — нет", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    expect((await request(app).get("/api/root/companies")).status).toBe(403);
    expect((await request(app).put("/api/root/companies/1/plan").send({ plan: "team", until: null })).status).toBe(403);
    sessionStore.userId = root.id;
    const list = await request(app).get("/api/root/companies");
    expect(list.status).toBe(200);
    expect(list.body.companies[0]).toMatchObject({ id: 1, usersCount: 7, effectivePlan: "team" });
    const set = await request(app).put("/api/root/companies/1/plan").send({ plan: "business", until: 2_000_000_000 });
    expect(set.status).toBe(200);
    expect(dbState.updates.find((u) => "plan" in (u.values as object))?.values).toEqual({ plan: "business", planUntil: 2_000_000_000 });
    // Ручная смена тарифа выключает автопродление (иначе карта спишется по старому тарифу).
    expect(dbState.updates.some((u) => (u.values as { recurringActive?: boolean }).recurringActive === false)).toBe(true);
    const bad = await request(app).put("/api/root/companies/1/plan").send({ plan: "gold", until: null });
    expect(bad.status).toBe(400);
  });
});

describe("точки", () => {
  it("сотрудник не может создавать точки", async () => {
    const app = await buildApp();
    sessionStore.userId = worker.id;
    expect((await request(app).post("/api/locations").send({ name: "Центр" })).status).toBe(403);
  });

  it("на «Старте» с PLAN_LIMITS=on точки закрыты — 402", async () => {
    process.env.PLAN_LIMITS = "on";
    const app = await buildApp();
    sessionStore.userId = admin.id;
    const r = await request(app).post("/api/locations").send({ name: "Центр" });
    expect(r.status).toBe(402);
    expect(r.body.message).toContain("«Бизнес»");
  });

  it("админ создаёт точку; пустое название — 400", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    dbState.rows = [{ id: 5, companyId: 1, name: "Центр", address: null, createdAt: 1, archivedAt: null }];
    const ok = await request(app).post("/api/locations").send({ name: "  Центр  " });
    expect(ok.status).toBe(201);
    expect(ok.body.name).toBe("Центр");
    const bad = await request(app).post("/api/locations").send({ name: "  " });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("name");
  });

  it("сотрудника чужой компании к точке не привязать", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    storage.getUserById.mockImplementation(async (id: number) => (id === admin.id ? admin : { ...worker, companyId: 2 }));
    const r = await request(app).put("/api/users/10/location").send({ locationId: 5 });
    expect(r.status).toBe(404);
  });

  it("несуществующая точка — 400, снять с точки — можно", async () => {
    const app = await buildApp();
    sessionStore.userId = admin.id;
    dbState.rows = [];
    const missing = await request(app).put("/api/users/10/location").send({ locationId: 5 });
    expect(missing.status).toBe(400);
    const cleared = await request(app).put("/api/users/10/location").send({ locationId: null });
    expect(cleared.status).toBe(200);
    expect(dbState.updates.at(-1)?.values).toEqual({ locationId: null });
  });
});
