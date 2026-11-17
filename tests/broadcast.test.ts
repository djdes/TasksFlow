/**
 * «Отправить уведомление» сотрудникам: кому можно писать, что уходит в push
 * и Telegram, кто без связи — и ответы API (400/403/429 — JSON).
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = { getUserById: vi.fn(), getAllUsers: vi.fn() };
const accessOf = vi.fn();
vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/access", () => ({ accessOf: (u: unknown) => accessOf(u) }));

const { broadcast, canNotify, registerBroadcastRoutes, resetBroadcastLimit } = await import("../server/routes/broadcast");

const person = (id: number, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, phone: `+7999000000${id}`, isAdmin: false, companyId: 42, tgChatId: null, tgStartedAt: null, ...extra }) as any;
const acc = (extra: Record<string, unknown>) => ({ userId: 1, isAdmin: false, manageTasks: false, taskScope: [], ...extra }) as any;

const anna = person(10, "Анна", { tgChatId: 555, tgStartedAt: 1 });
const boris = person(11, "Борис");
const vera = person(12, "Вера");
const boss = person(1, "Денис", { isAdmin: true });
const lead = person(2, "Михаил");

function app(deps: any) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.session = { userId: Number(req.headers["x-user"] ?? 1) };
    next();
  });
  registerBroadcastRoutes(a, () => deps);
  return a;
}

describe("broadcast()", () => {
  it("push и Telegram, без связи — отдельно; Telegram с экранированием", async () => {
    const tg = vi.fn(async () => true);
    const push = vi.fn(async (id: number) => id === 11);
    const r = await broadcast(boss, [anna, boris, vera], "Проверьте <задачи>", { push, telegram: tg, dashboardUrl: "https://x/dashboard" });
    expect(r.delivered).toEqual([
      { id: 10, name: "Анна", channels: ["telegram"] },
      { id: 11, name: "Борис", channels: ["push"] },
    ]);
    expect(r.unreachable).toEqual([{ id: 12, name: "Вера", channels: [] }]);
    expect(tg).toHaveBeenCalledWith(555, "📣 <b>Денис</b>\nПроверьте &lt;задачи&gt;", "https://x/dashboard");
    expect(push.mock.calls[0][1]).toMatchObject({ title: "Денис", body: "Проверьте <задачи>", url: "/dashboard" });
  });

  it("упавший канал не роняет рассылку", async () => {
    const r = await broadcast(boss, [anna], "Текст", { push: async () => { throw new Error("x"); }, telegram: async () => { throw new Error("y"); }, dashboardUrl: "" });
    expect(r.unreachable.map((u) => u.id)).toEqual([10]);
  });
});

describe("canNotify", () => {
  it("админ — всем, руководитель — своим, себе — никому", () => {
    expect(canNotify(acc({ isAdmin: true }), boris)).toBe(true);
    expect(canNotify(acc({ manageTasks: true, taskScope: [10] }), anna)).toBe(true);
    expect(canNotify(acc({ manageTasks: true, taskScope: [10] }), boris)).toBe(false);
    expect(canNotify(acc({ manageTasks: true, taskScope: null }), boris)).toBe(true);
    expect(canNotify(acc({ isAdmin: true }), boss)).toBe(false);
  });
});

describe("POST /api/notifications/send", () => {
  const deps = { push: vi.fn(async () => true), telegram: null, dashboardUrl: "" };
  beforeEach(() => {
    resetBroadcastLimit();
    deps.push.mockClear();
    storage.getAllUsers.mockResolvedValue([boss, lead, anna, boris, vera]);
    storage.getUserById.mockImplementation(async (id: number) => [boss, lead, anna].find((u) => u.id === id));
    accessOf.mockImplementation(async (u: any) =>
      u.id === 1 ? acc({ isAdmin: true }) : u.id === 2 ? acc({ userId: 2, manageTasks: true, taskScope: [10] }) : acc({ userId: u.id }),
    );
  });

  it("админ пишет нескольким", async () => {
    const res = await request(app(deps)).post("/api/notifications/send").send({ userIds: [10, 11], text: "Перед уходом проверьте задачи" });
    expect(res.status).toBe(200);
    expect(res.body.delivered.map((u: any) => u.id)).toEqual([10, 11]);
    expect(deps.push).toHaveBeenCalledTimes(2);
  });

  it("руководитель — только своим", async () => {
    const ok = await request(app(deps)).post("/api/notifications/send").set("x-user", "2").send({ userIds: [10], text: "Привет" });
    expect(ok.status).toBe(200);
    const no = await request(app(deps)).post("/api/notifications/send").set("x-user", "2").send({ userIds: [10, 11], text: "Привет" });
    expect(no.status).toBe(403);
    expect(no.body.message).toMatch(/своим/);
  });

  it("сотруднику — 403, чужой компании — 403", async () => {
    const worker = await request(app(deps)).post("/api/notifications/send").set("x-user", "10").send({ userIds: [11], text: "Привет" });
    expect(worker.status).toBe(403);
    const foreign = await request(app(deps)).post("/api/notifications/send").send({ userIds: [999], text: "Привет" });
    expect(foreign.status).toBe(403);
    expect(deps.push).not.toHaveBeenCalled();
  });

  it("пустой текст и пустой список — 400 JSON", async () => {
    for (const body of [{ userIds: [10], text: "   " }, { userIds: [], text: "x" }, { userIds: [10], text: "x".repeat(501) }]) {
      const res = await request(app(deps)).post("/api/notifications/send").send(body);
      expect(res.status).toBe(400);
      expect(res.body.message).toBeTruthy();
    }
  });

  it("21-я рассылка за 10 минут — 429", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await request(app(deps)).post("/api/notifications/send").send({ userIds: [10], text: "x" })).status).toBe(200);
    }
    const res = await request(app(deps)).post("/api/notifications/send").send({ userIds: [10], text: "x" });
    expect(res.status).toBe(429);
  });
});
