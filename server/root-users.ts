import type { Express, Request, RequestHandler, Response } from "express";
import { eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { newPinSchema } from "@shared/pin";
import { companies, companyRoles, pushSubscriptions, users, type User } from "@shared/schema";
import type { RecordAuditArgs } from "./audit-log";

/**
 * Root: люди всех компаний — поиск по телефону, имени, почте или id и правка
 * без ограничений «руководитель — только своих». Root меняет имя, телефон,
 * должность, почту и роль (в том числе назначает администратора), задаёт и
 * сбрасывает PIN (и администраторам), снимает блокировку входа, отвязывает
 * Telegram, завершает сессии и удаляет человека.
 *
 * Чего нельзя и здесь: трогать root-аккаунты (свой — в «Моём аккаунте») и
 * оставлять компанию без администратора. Каждое действие — в audit_log.
 */

export type RootUserRow = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  companyId: number | null;
  companyName: string | null;
  isAdmin: boolean;
  isRoot: boolean;
  roleId: number | null;
  roleName: string | null;
  hasPin: boolean;
  pinUpdatedAt: number | null;
  /** Вход по PIN закрыт до этого момента (unix sec); null — не закрыт. */
  lockedUntil: number | null;
  /** Неверных PIN подряд. Имя поля не pinFailedAttempts: тот ключ вырезает общий фильтр ответов. */
  failedAttempts: number;
  telegramLinked: boolean;
  telegramUsername: string | null;
  createdAt: number;
};

export type PhoneOwner = { id: number; name: string | null; companyName: string | null };

export interface RootUsersStore {
  search(q: string, limit: number): Promise<RootUserRow[]>;
  listByCompany(companyId: number): Promise<RootUserRow[]>;
  row(id: number): Promise<RootUserRow | null>;
  getUser(id: number): Promise<User | undefined>;
  company(id: number): Promise<{ id: number; name: string } | null>;
  roles(companyId: number): Promise<Array<{ id: number; name: string }>>;
  adminCount(companyId: number): Promise<number>;
  phoneOwner(phone: string): Promise<PhoneOwner | null>;
  emailOwner(email: string): Promise<PhoneOwner | null>;
  patch(id: number, fields: Partial<Pick<User, "name" | "phone" | "position" | "email">>): Promise<void>;
  setRole(id: number, role: { isAdmin: boolean; roleId: number | null }): Promise<void>;
  setPin(id: number, pinHash: string | null): Promise<void>;
  unlock(id: number): Promise<void>;
  unlinkTelegram(id: number): Promise<void>;
  /** Удаляет сессии и подписки push. Возвращает число завершённых сессий. */
  endSessions(id: number): Promise<number>;
  deleteUser(id: number): Promise<void>;
}

type Deps = {
  requireRoot: RequestHandler;
  store: RootUsersStore;
  hashPin: (pin: string) => string;
  notifyPin: (user: User, text: string) => Promise<void>;
  audit: (args: RecordAuditArgs) => Promise<void>;
};

export const ROOT_TARGET_MESSAGE = "Root-аккаунт здесь не меняется — свой аккаунт правьте в «Моём аккаунте»";
export const LAST_ADMIN_MESSAGE = "В компании должен остаться хотя бы один администратор";
export const SEARCH_LIMIT = 50;

const phoneField = z
  .string()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => /^\+7\d{10}$/.test(v), "Телефон — +7 и 10 цифр");

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(255, "Почта — до 255 символов")
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Проверьте адрес почты")
  .transform((v) => (v === "" ? null : v));

export const rootUserPatchSchema = z
  .object({
    name: z.string().trim().min(1, "Введите имя").max(255, "Имя — до 255 символов").optional(),
    phone: phoneField.optional(),
    position: z
      .string()
      .trim()
      .max(120, "Должность — до 120 символов")
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    email: emailField.nullable().optional(),
    // "admin" — администратор, число — своя роль компании, null — «Сотрудник».
    role: z.union([z.literal("admin"), z.number().int().positive(), z.null()]).optional(),
  })
  .strict();

function zodReply(res: Response, err: z.ZodError) {
  const issue = err.errors[0];
  return res.status(400).json({ message: issue?.message ?? "Проверьте данные", field: issue?.path.join(".") || undefined });
}

const ownerText = (o: PhoneOwner) => `${o.name || `id ${o.id}`}${o.companyName ? `, «${o.companyName}»` : ""}`;

export function registerRootUserRoutes(app: Express, deps: Deps): void {
  const { store } = deps;
  const actorOf = (req: Request) => (req.session.userId as number | undefined) ?? null;

  /** Человек для правки: есть и не root. Иначе ответ уже отправлен. */
  async function target(req: Request, res: Response): Promise<User | null> {
    const id = Number(req.params.id);
    const user = Number.isInteger(id) && id > 0 ? await store.getUser(id) : undefined;
    if (!user) {
      res.status(404).json({ message: "Человек не найден" });
      return null;
    }
    if (user.isRoot) {
      res.status(403).json({ message: ROOT_TARGET_MESSAGE });
      return null;
    }
    return user;
  }

  const audit = (req: Request, user: User, action: RecordAuditArgs["action"], payload: Record<string, unknown> = {}) =>
    deps.audit({ companyId: user.companyId ?? null, actorWorkerId: actorOf(req), taskId: null, action, payload: { userId: user.id, ...payload } });

  const lastAdmin = async (user: User) => user.isAdmin && user.companyId != null && (await store.adminCount(user.companyId)) <= 1;

  app.get("/api/root/users", deps.requireRoot, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim().slice(0, 100);
      if (q.replace(/^#/, "").length < 2) return res.json({ users: [] });
      res.json({ users: await store.search(q, SEARCH_LIMIT) });
    } catch (err) {
      console.error("[root] users search", err);
      res.status(500).json({ message: "Не удалось найти людей" });
    }
  });

  app.get("/api/root/companies/:id/users", deps.requireRoot, async (req, res) => {
    try {
      const company = await store.company(Number(req.params.id));
      if (!company) return res.status(404).json({ message: "Компания не найдена" });
      const [list, roles] = await Promise.all([store.listByCompany(company.id), store.roles(company.id)]);
      res.json({ company, users: list, roles });
    } catch (err) {
      console.error("[root] company users", err);
      res.status(500).json({ message: "Не удалось загрузить людей компании" });
    }
  });

  app.patch("/api/root/users/:id", deps.requireRoot, async (req, res) => {
    try {
      const user = await target(req, res);
      if (!user) return;
      const input = rootUserPatchSchema.parse(req.body ?? {});

      const fields: Partial<Pick<User, "name" | "phone" | "position" | "email">> = {};
      if (input.name !== undefined && input.name !== user.name) fields.name = input.name;
      if (input.position !== undefined && input.position !== (user.position ?? null)) fields.position = input.position;
      if (input.phone !== undefined && input.phone !== user.phone) {
        const owner = await store.phoneOwner(input.phone);
        if (owner && owner.id !== user.id) {
          return res.status(400).json({ message: `Этот номер уже у другого человека: ${ownerText(owner)}`, field: "phone" });
        }
        fields.phone = input.phone;
      }
      if (input.email !== undefined && input.email !== (user.email ?? null)) {
        if (input.email) {
          const owner = await store.emailOwner(input.email);
          if (owner && owner.id !== user.id) {
            return res.status(400).json({ message: `Эта почта уже у другого человека: ${ownerText(owner)}`, field: "email" });
          }
        }
        fields.email = input.email;
      }

      let role: { isAdmin: boolean; roleId: number | null } | null = null;
      if (input.role !== undefined) {
        if (user.companyId == null) {
          return res.status(400).json({ message: "Человек без компании — роль не назначить", field: "role" });
        }
        if (input.role === "admin") role = { isAdmin: true, roleId: null };
        else if (input.role === null) role = { isAdmin: false, roleId: null };
        else {
          const own = (await store.roles(user.companyId)).find((r) => r.id === input.role);
          if (!own) return res.status(400).json({ message: "Такой роли в компании нет", field: "role" });
          role = { isAdmin: false, roleId: own.id };
        }
        if (role.isAdmin === user.isAdmin && role.roleId === (user.isAdmin ? null : user.roleId ?? null)) role = null;
        else if (!role.isAdmin && (await lastAdmin(user))) {
          return res.status(400).json({ message: LAST_ADMIN_MESSAGE, field: "role" });
        }
      }

      const changed = Object.keys(fields);
      if (changed.length) await store.patch(user.id, fields);
      if (role) {
        await store.setRole(user.id, role);
        changed.push("role");
      }
      if (changed.length) await audit(req, user, "root.user_updated", { fields: changed, ...(role ? { role } : {}) });
      res.json({ user: await store.row(user.id), changed });
    } catch (err) {
      if (err instanceof z.ZodError) return zodReply(res, err);
      console.error("[root] user update", err);
      res.status(500).json({ message: "Не удалось сохранить" });
    }
  });

  app.post("/api/root/users/:id/pin", deps.requireRoot, async (req, res) => {
    try {
      const user = await target(req, res);
      if (!user) return;
      const { pin } = z.object({ pin: newPinSchema }).parse(req.body ?? {});
      await store.setPin(user.id, deps.hashPin(pin));
      void deps.notifyPin(user, "Поддержка TasksFlow задала вам новый PIN для входа. Если вы об этом не просили — напишите на support@tasksflow.ru.");
      await audit(req, user, "root.user_pin_set");
      res.json({ user: await store.row(user.id) });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message ?? "Проверьте PIN", field: "pin" });
      console.error("[root] user pin", err);
      res.status(500).json({ message: "Не удалось задать PIN" });
    }
  });

  app.delete("/api/root/users/:id/pin", deps.requireRoot, async (req, res) => {
    try {
      const user = await target(req, res);
      if (!user) return;
      await store.setPin(user.id, null);
      await audit(req, user, "root.user_pin_cleared");
      res.json({ user: await store.row(user.id) });
    } catch (err) {
      console.error("[root] user pin clear", err);
      res.status(500).json({ message: "Не удалось сбросить PIN" });
    }
  });

  app.post("/api/root/users/:id/unlock", deps.requireRoot, async (req, res) => {
    try {
      const user = await target(req, res);
      if (!user) return;
      await store.unlock(user.id);
      await audit(req, user, "root.user_unlocked");
      res.json({ user: await store.row(user.id) });
    } catch (err) {
      console.error("[root] user unlock", err);
      res.status(500).json({ message: "Не удалось снять блокировку" });
    }
  });

  app.post("/api/root/users/:id/telegram/unlink", deps.requireRoot, async (req, res) => {
    try {
      const user = await target(req, res);
      if (!user) return;
      await store.unlinkTelegram(user.id);
      await audit(req, user, "root.user_telegram_unlinked");
      res.json({ user: await store.row(user.id) });
    } catch (err) {
      console.error("[root] user telegram unlink", err);
      res.status(500).json({ message: "Не удалось отвязать Telegram" });
    }
  });

  app.post("/api/root/users/:id/logout", deps.requireRoot, async (req, res) => {
    try {
      const user = await target(req, res);
      if (!user) return;
      const ended = await store.endSessions(user.id);
      await audit(req, user, "root.user_logged_out", { sessions: ended });
      res.json({ user: await store.row(user.id), ended });
    } catch (err) {
      console.error("[root] user logout", err);
      res.status(500).json({ message: "Не удалось завершить сессии" });
    }
  });

  app.delete("/api/root/users/:id", deps.requireRoot, async (req, res) => {
    try {
      const user = await target(req, res);
      if (!user) return;
      if (await lastAdmin(user)) return res.status(400).json({ message: LAST_ADMIN_MESSAGE });
      await store.endSessions(user.id);
      await store.deleteUser(user.id);
      await audit(req, user, "root.user_deleted", { name: user.name, phone: user.phone });
      res.json({ ok: true });
    } catch (err) {
      console.error("[root] user delete", err);
      res.status(500).json({ message: "Не удалось удалить" });
    }
  });
}

// --- Хранилище на базе ----------------------------------------------------------

type DbLike = typeof import("./db").db;
type StorageLike = {
  getUserById(id: number): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  setUserRole(id: number, role: { isAdmin: boolean; roleId: number | null }): Promise<unknown>;
  setUserPin(id: number, pinHash: string | null): Promise<unknown>;
  resetPinFailures(id: number): Promise<void>;
  clearTelegramLink(id: number): Promise<unknown>;
  deleteUser(id: number): Promise<void>;
};

const nowSec = () => Math.floor(Date.now() / 1000);
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return header && typeof header === "object" && "affectedRows" in header ? Number((header as { affectedRows: number }).affectedRows) : 0;
}

export function toRootRow(user: User, companyName: string | null, roleName: string | null, now = nowSec()): RootUserRow {
  const locked = user.pinLockedUntil != null && user.pinLockedUntil > now ? user.pinLockedUntil : null;
  return {
    id: user.id,
    name: user.name ?? null,
    phone: user.phone ?? null,
    email: user.email ?? null,
    position: user.position ?? null,
    companyId: user.companyId ?? null,
    companyName,
    isAdmin: user.isAdmin,
    isRoot: user.isRoot,
    roleId: user.isAdmin ? null : user.roleId ?? null,
    roleName: user.isAdmin ? null : roleName,
    hasPin: Boolean(user.pinHash),
    pinUpdatedAt: user.pinUpdatedAt ?? null,
    lockedUntil: locked,
    failedAttempts: user.pinFailedAttempts ?? 0,
    telegramLinked: user.tgChatId != null,
    telegramUsername: user.telegramUsername ?? null,
    createdAt: user.createdAt ?? 0,
  };
}

/**
 * Условия поиска: «#213» или короткое число — id; от 3 цифр — телефон
 * (8 в начале как 7); иначе имя и почта.
 */
export function searchConditions(q: string): SQL[] {
  const text = q.trim();
  const conditions: SQL[] = [];
  const idMatch = text.match(/^#?(\d{1,7})$/);
  if (idMatch) conditions.push(eq(users.id, Number(idMatch[1])));
  let digits = text.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length >= 3 && /^[\d\s()+#-]+$/.test(text)) conditions.push(like(users.phone, `%${escapeLike(digits)}%`));
  if (!/^[\d\s()+#-]+$/.test(text)) {
    const pattern = `%${escapeLike(text)}%`;
    conditions.push(like(users.name, pattern), like(users.email, pattern.toLowerCase()));
  }
  return conditions;
}

export function dbRootUsersStore(db: DbLike, storage: StorageLike): RootUsersStore {
  async function decorate(list: User[]): Promise<RootUserRow[]> {
    const companyIds = Array.from(new Set(list.map((u) => u.companyId).filter((id): id is number => id != null)));
    const roleIds = Array.from(new Set(list.map((u) => u.roleId).filter((id): id is number => id != null)));
    const [companyRows, roleRows] = await Promise.all([
      companyIds.length ? db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds)) : [],
      roleIds.length ? db.select({ id: companyRoles.id, name: companyRoles.name }).from(companyRoles).where(inArray(companyRoles.id, roleIds)) : [],
    ]);
    const companyName = new Map(companyRows.map((c) => [c.id, c.name]));
    const roleName = new Map(roleRows.map((r) => [r.id, r.name]));
    const now = nowSec();
    return list.map((u) =>
      toRootRow(u, u.companyId != null ? companyName.get(u.companyId) ?? null : null, u.roleId != null ? roleName.get(u.roleId) ?? null : null, now),
    );
  }

  const ownerOf = async (user: User | undefined): Promise<PhoneOwner | null> => {
    if (!user) return null;
    const [row] = await decorate([user]);
    return { id: row.id, name: row.name, companyName: row.companyName };
  };

  // Сортировка в JS: админы первыми, потом по имени — как в «Сотрудниках».
  const byRole = (a: RootUserRow, b: RootUserRow) =>
    Number(b.isAdmin) - Number(a.isAdmin) || (a.name ?? "").localeCompare(b.name ?? "", "ru") || a.id - b.id;

  return {
    async search(q, limit) {
      const conditions = searchConditions(q);
      if (!conditions.length) return [];
      const list = await db.select().from(users).where(or(...conditions)).limit(limit);
      return (await decorate(list)).sort(byRole);
    },
    async listByCompany(companyId) {
      const list = await db.select().from(users).where(eq(users.companyId, companyId)).limit(1000);
      return (await decorate(list)).sort(byRole);
    },
    async row(id) {
      const user = await storage.getUserById(id);
      return user ? (await decorate([user]))[0] : null;
    },
    getUser: (id) => storage.getUserById(id),
    async company(id) {
      if (!Number.isInteger(id) || id <= 0) return null;
      const [row] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, id));
      return row ?? null;
    },
    async roles(companyId) {
      return db.select({ id: companyRoles.id, name: companyRoles.name }).from(companyRoles).where(eq(companyRoles.companyId, companyId));
    },
    async adminCount(companyId) {
      const [row] = await db
        .select({ n: sql<number>`COUNT(*)` })
        .from(users)
        .where(sql`${users.companyId} = ${companyId} AND ${users.isAdmin} = 1`);
      return Number(row?.n ?? 0);
    },
    phoneOwner: async (phone) => ownerOf(await storage.getUserByPhone(phone)),
    async emailOwner(email) {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return ownerOf(user);
    },
    async patch(id, fields) {
      if (Object.keys(fields).length) await db.update(users).set(fields).where(eq(users.id, id));
    },
    async setRole(id, role) {
      await storage.setUserRole(id, role);
    },
    async setPin(id, pinHash) {
      await storage.setUserPin(id, pinHash);
    },
    unlock: (id) => storage.resetPinFailures(id),
    async unlinkTelegram(id) {
      await storage.clearTelegramLink(id);
    },
    async endSessions(id) {
      // express-session хранит JSON.stringify(session) без пробелов: "userId":213 , или }.
      const result = await db.execute(
        sql`DELETE FROM sessions WHERE data LIKE ${`%"userId":${id},%`} OR data LIKE ${`%"userId":${id}}%`}`,
      );
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, id));
      return affected(result);
    },
    deleteUser: (id) => storage.deleteUser(id),
  };
}
