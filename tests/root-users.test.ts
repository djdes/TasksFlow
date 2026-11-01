/**
 * Root правит людей любой компании (server/root-users.ts): имя, телефон,
 * почта, роль, PIN, блокировка, Telegram, сессии, удаление. Root-аккаунты
 * не трогаются, компания не остаётся без администратора.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LAST_ADMIN_MESSAGE,
  ROOT_TARGET_MESSAGE,
  registerRootUserRoutes,
  toRootRow,
  type RootUsersStore,
} from "../server/root-users";

type U = Record<string, any>;
const base = {
  email: null, position: null, isRoot: false, roleId: null, pinHash: "h", pinFailedAttempts: 0, pinLockedUntil: null,
  pinUpdatedAt: 100, tgChatId: null, telegramUsername: null, createdAt: 1,
};
let people: U[];
const companies = [
  { id: 1, name: "Кафе" },
  { id: 2, name: "ООО БФС" },
];
const roles = [{ id: 5, companyId: 2, name: "Руководитель" }];
const calls: string[] = [];
const audit = vi.fn(async () => {});
const notifyPin = vi.fn(async () => {});

const find = (id: number) => people.find((u) => u.id === id);
const row = (u: U) => toRootRow(u as any, companies.find((c) => c.id === u.companyId)?.name ?? null, roles.find((r) => r.id === u.roleId)?.name ?? null);

const store: RootUsersStore = {
  search: async (q) => people.filter((u) => (u.name ?? "").includes(q) || (u.phone ?? "").includes(q)).map(row),
  listByCompany: async (id) => people.filter((u) => u.companyId === id).map(row),
  row: async (id) => (find(id) ? row(find(id)!) : null),
  getUser: async (id) => find(id) as any,
  company: async (id) => companies.find((c) => c.id === id) ?? null,
  roles: async (id) => roles.filter((r) => r.companyId === id).map(({ id: rid, name }) => ({ id: rid, name })),
  adminCount: async (id) => people.filter((u) => u.companyId === id && u.isAdmin).length,
  phoneOwner: async (phone) => {
    const u = people.find((p) => p.phone === phone);
    return u ? { id: u.id, name: u.name, companyName: companies.find((c) => c.id === u.companyId)?.name ?? null } : null;
  },
  emailOwner: async (email) => {
    const u = people.find((p) => p.email === email);
    return u ? { id: u.id, name: u.name, companyName: null } : null;
  },
  patch: async (id, fields) => {
    calls.push(`patch:${id}:${Object.keys(fields).join(",")}`);
    Object.assign(find(id)!, fields);
  },
  setRole: async (id, role) => {
    calls.push(`role:${id}`);
    Object.assign(find(id)!, { isAdmin: role.isAdmin, roleId: role.isAdmin ? null : role.roleId });
  },
  setPin: async (id, hash) => {
    calls.push(`pin:${id}:${hash ? "set" : "clear"}`);
    Object.assign(find(id)!, { pinHash: hash, pinFailedAttempts: 0, pinLockedUntil: null });
  },
  unlock: async (id) => {
    calls.push(`unlock:${id}`);
    Object.assign(find(id)!, { pinFailedAttempts: 0, pinLockedUntil: null });
  },
  unlinkTelegram: async (id) => {
    calls.push(`tg:${id}`);
    Object.assign(find(id)!, { tgChatId: null, telegramUsername: null });
  },
  endSessions: async (id) => {
    calls.push(`logout:${id}`);
    return 2;
  },
  deleteUser: async (id) => {
    calls.push(`delete:${id}`);
    people = people.filter((u) => u.id !== id);
  },
};

function app(asRoot = true) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.session = { userId: 99 };
    next();
  });
  const requireRoot = (_req: any, res: any, next: any) => (asRoot ? next() : res.status(403).json({ message: "Доступ только для root" }));
  registerRootUserRoutes(a, { requireRoot, store, hashPin: (pin) => `hash:${pin}`, notifyPin, audit });
  return a;
}

beforeEach(() => {
  calls.length = 0;
  audit.mockClear();
  notifyPin.mockClear();
  people = [
    { ...base, id: 185, name: "Денис", phone: "+79990000185", companyId: 2, isAdmin: true },
    { ...base, id: 208, name: "Михаил", phone: "+79990000208", companyId: 2, isAdmin: false, roleId: 5, tgChatId: 777, telegramUsername: "misha" },
    { ...base, id: 209, name: "Лариса", phone: "+79991001101", companyId: 2, isAdmin: false, pinFailedAttempts: 5, pinLockedUntil: 4_000_000_000 },
    { ...base, id: 10, name: "Ирина", phone: "+79990000010", companyId: 1, isAdmin: true, email: "irina@cafe.ru" },
    { ...base, id: 99, name: "Root", phone: "+79990000099", companyId: null, isAdmin: false, isRoot: true },
  ];
});

describe("root: люди компаний", () => {
  it("не root — 403 на всё", async () => {
    const a = app(false);
    expect((await request(a).get("/api/root/users?q=Лар")).status).toBe(403);
    expect((await request(a).patch("/api/root/users/209").send({ name: "X" })).status).toBe(403);
    expect((await request(a).delete("/api/root/users/209")).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("люди компании с ролями; блокировка и Telegram видны, хэш PIN — нет", async () => {
    const r = await request(app()).get("/api/root/companies/2/users");
    expect(r.status).toBe(200);
    expect(r.body.company).toEqual({ id: 2, name: "ООО БФС" });
    expect(r.body.roles).toEqual([{ id: 5, name: "Руководитель" }]);
    const misha = r.body.users.find((u: U) => u.id === 208);
    expect(misha).toMatchObject({ roleName: "Руководитель", telegramLinked: true, telegramUsername: "misha", hasPin: true, companyName: "ООО БФС" });
    const larisa = r.body.users.find((u: U) => u.id === 209);
    expect(larisa).toMatchObject({ lockedUntil: 4_000_000_000, failedAttempts: 5 });
    expect(JSON.stringify(r.body)).not.toContain("pinHash");
    expect((await request(app()).get("/api/root/companies/404/users")).status).toBe(404);
  });

  it("поиск: короче двух символов — пусто, иначе по всем компаниям", async () => {
    expect((await request(app()).get("/api/root/users?q=Л")).body.users).toEqual([]);
    const r = await request(app()).get("/api/root/users?q=Лар");
    expect(r.body.users.map((u: U) => u.id)).toEqual([209]);
  });

  it("правит имя, телефон, должность и почту; пишет в журнал", async () => {
    const r = await request(app()).patch("/api/root/users/209").send({ name: " Лариса Петрова ", phone: "+7 999 100-11-99", position: "Продавец", email: "LARISA@Mail.ru" });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ name: "Лариса Петрова", phone: "+79991001199", position: "Продавец", email: "larisa@mail.ru" });
    expect(r.body.changed).toEqual(["name", "position", "phone", "email"]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ companyId: 2, actorWorkerId: 99, action: "root.user_updated" }));
  });

  it("пустая почта и должность стираются; без изменений — ничего не пишет", async () => {
    let r = await request(app()).patch("/api/root/users/10").send({ email: "", position: "" });
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBeNull();
    expect(r.body.changed).toEqual(["email"]);
    audit.mockClear();
    r = await request(app()).patch("/api/root/users/10").send({ name: "Ирина" });
    expect(r.body.changed).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("занятый телефон или почта — 400 с тем, у кого они", async () => {
    let r = await request(app()).patch("/api/root/users/209").send({ phone: "+79990000010" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ field: "phone" });
    expect(r.body.message).toContain("Ирина, «Кафе»");
    r = await request(app()).patch("/api/root/users/209").send({ email: "irina@cafe.ru" });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("email");
    r = await request(app()).patch("/api/root/users/209").send({ phone: "12345" });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("phone");
    expect(calls).toEqual([]);
  });

  it("роль: администратор, своя роль компании, сотрудник; чужая роль — 400", async () => {
    let r = await request(app()).patch("/api/root/users/209").send({ role: "admin" });
    expect(r.body.user).toMatchObject({ isAdmin: true, roleId: null });
    r = await request(app()).patch("/api/root/users/209").send({ role: 5 });
    expect(r.body.user).toMatchObject({ isAdmin: false, roleId: 5, roleName: "Руководитель" });
    r = await request(app()).patch("/api/root/users/209").send({ role: null });
    expect(r.body.user).toMatchObject({ isAdmin: false, roleId: null });
    r = await request(app()).patch("/api/root/users/10").send({ role: 5 });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe("Такой роли в компании нет");
  });

  it("последнего администратора не разжаловать и не удалить", async () => {
    let r = await request(app()).patch("/api/root/users/185").send({ role: null });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe(LAST_ADMIN_MESSAGE);
    r = await request(app()).delete("/api/root/users/185");
    expect(r.status).toBe(400);
    // Второй админ появился — теперь можно.
    await request(app()).patch("/api/root/users/208").send({ role: "admin" });
    r = await request(app()).patch("/api/root/users/185").send({ role: null });
    expect(r.status).toBe(200);
  });

  it("root-аккаунт не трогается", async () => {
    for (const req of [
      request(app()).patch("/api/root/users/99").send({ name: "X" }),
      request(app()).post("/api/root/users/99/pin").send({ pin: "6083" }),
      request(app()).delete("/api/root/users/99"),
      request(app()).post("/api/root/users/99/logout"),
    ]) {
      const r = await req;
      expect(r.status).toBe(403);
      expect(r.body.message).toBe(ROOT_TARGET_MESSAGE);
    }
    expect(calls).toEqual([]);
  });

  it("PIN: задать администратору, простой — 400, сбросить; снять блокировку", async () => {
    let r = await request(app()).post("/api/root/users/185/pin").send({ pin: "1234" });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe("pin");
    r = await request(app()).post("/api/root/users/185/pin").send({ pin: "6083" });
    expect(r.status).toBe(200);
    expect(find(185)!.pinHash).toBe("hash:6083");
    expect(notifyPin).toHaveBeenCalledTimes(1);
    r = await request(app()).delete("/api/root/users/185/pin");
    expect(r.body.user.hasPin).toBe(false);
    r = await request(app()).post("/api/root/users/209/unlock");
    expect(r.body.user).toMatchObject({ lockedUntil: null, failedAttempts: 0 });
    expect(audit.mock.calls.map((c: any[]) => c[0].action)).toEqual(["root.user_pin_set", "root.user_pin_cleared", "root.user_unlocked"]);
  });

  it("Telegram отвязать, выйти на всех устройствах, удалить", async () => {
    let r = await request(app()).post("/api/root/users/208/telegram/unlink");
    expect(r.body.user.telegramLinked).toBe(false);
    r = await request(app()).post("/api/root/users/208/logout");
    expect(r.body.ended).toBe(2);
    r = await request(app()).delete("/api/root/users/209");
    expect(r.body).toEqual({ ok: true });
    expect(calls).toEqual(["tg:208", "logout:208", "logout:209", "delete:209"]);
    expect(find(209)).toBeUndefined();
    expect((await request(app()).delete("/api/root/users/209")).status).toBe(404);
  });

  it("лишние поля — 400", async () => {
    const r = await request(app()).patch("/api/root/users/209").send({ isRoot: true });
    expect(r.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
