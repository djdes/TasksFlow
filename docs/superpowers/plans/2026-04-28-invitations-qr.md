# Приглашения сотрудников через QR-код — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать админу компании одну кнопку «Сгенерировать QR» в кабинете, которая создаёт одноразовую ссылку-приглашение. Сотрудник сканирует QR, попадает на публичную форму, вводит имя+телефон и автоматически попадает в кабинет TasksFlow в нужной компании с уже выставленной должностью/ролью.

**Architecture:** Новая таблица `invitations` (Drizzle/MySQL) + 5 эндпоинтов (3 админских с `requireAdmin`, 2 публичных `by-token`). Фронт: страница `/admin/invitations` (модалка с QR + список + история) и публичная `/join/:token` (превью + форма с авто-логином). Все детали — в спецификации.

**Tech Stack:** TypeScript, Drizzle (mysql), Express + express-session, express-rate-limit (уже подключён), React + Wouter + React Query + shadcn/ui, vitest + supertest, новая npm-зависимость `qrcode`.

**Spec:** [docs/superpowers/specs/2026-04-28-invitations-qr-design.md](../specs/2026-04-28-invitations-qr-design.md)

---

## Файловая структура

**Backend (новое и правки):**
- `shared/schema.ts` — добавить таблицу `invitations`, типы `Invitation`, `InsertInvitation`.
- `shared/routes.ts` — секция `api.invitations.*` со всеми контрактами.
- `server/storage.ts` — методы `createInvitation`, `getInvitationByToken`, `getInvitationById`, `getInvitationsByCompany`, `markInvitationUsed` (атомарно), `revokeInvitation`, `deleteUser` (уже есть, понадобится для отката).
- `server/routes.ts` — 5 новых ручек, инстанс `inviteAcceptLimiter` (rate limit для публичных).
- `script/setup-db.ts` или ручной `npm run db:push` — миграция.

**Frontend (новое и правки):**
- `client/src/components/PhoneInput.tsx` (новый) — вынести inline-логику телефона из `Login.tsx`/`AdminUsers.tsx` в общий компонент. Используется в Login, RegisterUser, JoinByInvite.
- `client/src/pages/Login.tsx` — заменить inline-`<Input>` на `<PhoneInput>`.
- `client/src/pages/Invitations.tsx` (новый) — кабинет админа.
- `client/src/pages/JoinByInvite.tsx` (новый) — публичная страница.
- `client/src/App.tsx` — добавить два роута.
- `client/src/pages/Dashboard.tsx` — добавить пункт «Приглашения» в admin-dropdown.

**Тесты:**
- `tests/invitations.test.ts` — server-тесты (по образцу `tests/api-user-provision.test.ts`).
- `tests/invitations-token.test.ts` — отдельный файл для публичных by-token ручек.

**Зависимости:**
- npm: `qrcode` + `@types/qrcode`.

---

## Task 1: npm-зависимость `qrcode`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Установить пакеты**

```bash
npm install qrcode
npm install -D @types/qrcode
```

- [ ] **Step 2: Убедиться, что `npm run check` проходит**

```bash
npm run check
```
Expected: PASS (TypeScript видит типы `qrcode`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: добавить qrcode для генерации QR-кодов приглашений"
```

---

## Task 2: Drizzle-схема `invitations`

**Files:**
- Modify: `shared/schema.ts` — добавить таблицу + zod-схему + типы.

- [ ] **Step 1: Дописать таблицу в `shared/schema.ts`**

В конец файла добавить:

```ts
export const invitations = mysqlTable("invitations", {
  id: int("id").primaryKey().autoincrement(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  companyId: int("company_id").notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  position: varchar("position", { length: 120 }),
  isAdmin: boolean("is_admin").notNull().default(false),
  usedAt: int("used_at"),
  usedByUserId: int("used_by_user_id"),
  revokedAt: int("revoked_at"),
  createdAt: int("created_at").notNull().default(0),
});

export const insertInvitationSchema = createInsertSchema(invitations).pick({
  position: true,
  isAdmin: true,
});

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;
```

- [ ] **Step 2: `npm run check`**

```bash
npm run check
```
Expected: PASS.

- [ ] **Step 3: Применить миграцию**

```bash
npm run db:push
```
Expected: drizzle-kit создаёт таблицу `invitations`. На вопросы о существующих таблицах ответить «нет, ничего не менять».

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(schema): таблица invitations для QR-приглашений"
```

---

## Task 3: API-контракты в `shared/routes.ts`

**Files:**
- Modify: `shared/routes.ts` — добавить `api.invitations.*`.

- [ ] **Step 1: Дописать в `shared/routes.ts` после `users` блока**

```ts
// (импорт сверху, если ещё нет)
import { invitations, type Invitation } from "./schema";

// внутри объекта api, после блока users:
invitations: {
  list: {
    method: 'GET' as const,
    path: '/api/invitations',
    responses: {
      200: z.array(z.custom<Invitation>()),
    },
  },
  create: {
    method: 'POST' as const,
    path: '/api/invitations',
    input: z.object({
      position: z.string().trim().min(1).max(120).nullable().optional(),
      role: z.enum(['admin', 'manager', 'employee']).optional(),
    }),
    responses: {
      201: z.object({
        id: z.number(),
        token: z.string(),
        url: z.string(),
        position: z.string().nullable(),
        isAdmin: z.boolean(),
        createdAt: z.number(),
      }),
      400: errorSchemas.validation,
    },
  },
  revoke: {
    method: 'POST' as const,
    path: '/api/invitations/:id/revoke',
    responses: {
      200: z.custom<Invitation>(),
      400: errorSchemas.validation,
      404: errorSchemas.notFound,
    },
  },
  preview: {
    method: 'GET' as const,
    path: '/api/invitations/by-token/:token',
    responses: {
      200: z.union([
        z.object({ valid: z.literal(false), reason: z.enum(['not_found', 'used', 'revoked']) }),
        z.object({ valid: z.literal(true), companyName: z.string(), position: z.string().nullable() }),
      ]),
    },
  },
  accept: {
    method: 'POST' as const,
    path: '/api/invitations/by-token/:token/accept',
    input: z.object({
      phone: z.string().min(1),
      name: z.string().trim().min(1),
    }),
    responses: {
      201: z.object({
        user: z.custom<typeof users.$inferSelect>(),
        company: z.object({ id: z.number(), name: z.string() }),
      }),
      400: errorSchemas.validation,
    },
  },
},
```

- [ ] **Step 2: `npm run check`**

```bash
npm run check
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add shared/routes.ts
git commit -m "feat(routes): API-контракты приглашений"
```

---

## Task 4: storage-методы для приглашений (TDD)

**Files:**
- Modify: `server/storage.ts` — добавить методы в interface и реализацию.
- Test: `tests/invitations-storage.test.ts` (новый, опционально — сложно мокать БД, поэтому ограничимся unit-тестом на одну чистую функцию).

В этом таске тесты не пишем — методы — тонкие обёртки над Drizzle, мокать `db` смысла мало (как и в существующих storage-методах, для которых тестов нет). Покрытие будет через интеграционные тесты эндпоинтов в Task 7-9.

- [ ] **Step 1: Добавить в interface `IStorage` (`server/storage.ts`)**

После блока `// Users` или в новой секции:

```ts
// Invitations
createInvitation(data: { token: string; companyId: number; createdByUserId: number; position: string | null; isAdmin: boolean }): Promise<Invitation>;
getInvitationById(id: number): Promise<Invitation | undefined>;
getInvitationByToken(token: string): Promise<Invitation | undefined>;
getInvitationsByCompany(companyId: number, includeAll: boolean): Promise<Invitation[]>;
markInvitationUsed(id: number, usedByUserId: number): Promise<boolean>;
revokeInvitation(id: number): Promise<Invitation | undefined>;
```

- [ ] **Step 2: Дописать импорты сверху**

```ts
import { invitations, type Invitation } from "@shared/schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
```

(Часть импортов уже есть — добавить только то, чего нет.)

- [ ] **Step 3: Реализация методов в классе**

```ts
async createInvitation(data: {
  token: string;
  companyId: number;
  createdByUserId: number;
  position: string | null;
  isAdmin: boolean;
}): Promise<Invitation> {
  const now = Math.floor(Date.now() / 1000);
  const [result] = await db.insert(invitations).values({
    token: data.token,
    companyId: data.companyId,
    createdByUserId: data.createdByUserId,
    position: data.position,
    isAdmin: data.isAdmin,
    createdAt: now,
  });
  const insertId = (result as any).insertId;
  const [row] = await db.select().from(invitations).where(eq(invitations.id, insertId));
  if (!row) throw new Error("Failed to create invitation");
  return row;
}

async getInvitationById(id: number): Promise<Invitation | undefined> {
  const [row] = await db.select().from(invitations).where(eq(invitations.id, id));
  return row || undefined;
}

async getInvitationByToken(token: string): Promise<Invitation | undefined> {
  const [row] = await db.select().from(invitations).where(eq(invitations.token, token));
  return row || undefined;
}

async getInvitationsByCompany(companyId: number, includeAll: boolean): Promise<Invitation[]> {
  if (includeAll) {
    return await db
      .select()
      .from(invitations)
      .where(eq(invitations.companyId, companyId))
      .orderBy(desc(invitations.createdAt));
  }
  return await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.companyId, companyId),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

/**
 * Атомарно помечает приглашение как использованное.
 * Возвращает true если получилось, false — если кто-то уже использовал
 * или приглашение отозвано.
 */
async markInvitationUsed(id: number, usedByUserId: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .update(invitations)
    .set({ usedAt: now, usedByUserId })
    .where(
      and(
        eq(invitations.id, id),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
      ),
    );
  const affected = (result as any).affectedRows ?? (result as any)[0]?.affectedRows ?? 0;
  return affected > 0;
}

async revokeInvitation(id: number): Promise<Invitation | undefined> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(and(eq(invitations.id, id), isNull(invitations.revokedAt), isNull(invitations.usedAt)));
  return await this.getInvitationById(id);
}
```

- [ ] **Step 4: `npm run check`**

```bash
npm run check
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "feat(storage): методы для invitations с атомарным markInvitationUsed"
```

---

## Task 5: Тесты для `POST /api/invitations` (создание)

**Files:**
- Test: `tests/invitations.test.ts` (новый).

- [ ] **Step 1: Создать `tests/invitations.test.ts` с заголовком и моками**

```ts
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Invitation, User, Company } from "../shared/schema";

const storage = {
  // users
  getUserById: vi.fn(),
  getUserByPhone: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  // companies
  getCompanyById: vi.fn(),
  // invitations
  createInvitation: vi.fn(),
  getInvitationById: vi.fn(),
  getInvitationByToken: vi.fn(),
  getInvitationsByCompany: vi.fn(),
  markInvitationUsed: vi.fn(),
  revokeInvitation: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));

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

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.values(storage).forEach((m) => m.mockReset?.());
});
```

- [ ] **Step 2: Тест happy path для POST /api/invitations**

Дописать в файл:

```ts
describe("POST /api/invitations", () => {
  it("создаёт приглашение для админа компании", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.createInvitation.mockResolvedValue({
      id: 1,
      token: "abc123",
      companyId: 42,
      createdByUserId: 10,
      position: "Кассир",
      isAdmin: false,
      usedAt: null,
      usedByUserId: null,
      revokedAt: null,
      createdAt: 1700000000,
    } satisfies Invitation);

    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app)
      .post("/api/invitations")
      .send({ position: "Кассир" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(res.body.token).toBe("abc123");
    expect(res.body.url).toMatch(/\/join\/abc123$/);
    expect(res.body.isAdmin).toBe(false);
    expect(storage.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 42, createdByUserId: 10, position: "Кассир", isAdmin: false }),
    );
  });
});
```

- [ ] **Step 3: Запустить — должен упасть (роут ещё не написан)**

```bash
npm run test -- tests/invitations.test.ts
```
Expected: FAIL (404 или route not registered).

- [ ] **Step 4: Дописать ещё тесты в этот же `describe`**

```ts
  it("role=manager делает isAdmin=true", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.createInvitation.mockResolvedValue({
      id: 2, token: "tok2", companyId: 42, createdByUserId: 10,
      position: null, isAdmin: true,
      usedAt: null, usedByUserId: null, revokedAt: null, createdAt: 1,
    } satisfies Invitation);

    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app).post("/api/invitations").send({ role: "manager" });

    expect(res.status).toBe(201);
    expect(storage.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: true }),
    );
  });

  it("без сессии → 401", async () => {
    const { app } = await buildApp();
    const res = await request(app).post("/api/invitations").send({});
    expect(res.status).toBe(401);
  });

  it("не-админ → 403", async () => {
    storage.getUserById.mockResolvedValue({ ...ADMIN, isAdmin: false });
    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app).post("/api/invitations").send({});
    expect(res.status).toBe(403);
  });
```

- [ ] **Step 5: Запустить тесты — все должны падать**

```bash
npm run test -- tests/invitations.test.ts
```
Expected: 4 теста падают.

- [ ] **Step 6: Commit**

```bash
git add tests/invitations.test.ts
git commit -m "test(invitations): тесты POST /api/invitations (red)"
```

---

## Task 6: Реализация `POST /api/invitations`

**Files:**
- Modify: `server/routes.ts` — добавить ручку и crypto-импорт.

- [ ] **Step 1: Импорты в `server/routes.ts`**

В верхнюю секцию импортов добавить (если ещё нет):

```ts
import crypto from "node:crypto";
```

- [ ] **Step 2: Реализация ручки**

Найти секцию `app.post(api.users.create.path, ...)` (~строка 1136) и сразу после неё (или в любом разумном месте после `requireAdmin`) добавить:

```ts
  // ============================================================
  // Invitations: QR-приглашения сотрудников
  // ============================================================

  app.post(api.invitations.create.path, requireAdmin, async (req, res) => {
    try {
      const input = api.invitations.create.input.parse(req.body);
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const adminId = req.session.userId;
      if (!adminId) {
        return res.status(401).json({ message: "Нет сессии" });
      }

      const isAdmin = input.role === "admin" || input.role === "manager";
      const token = crypto.randomBytes(32).toString("base64url");

      const inv = await storage.createInvitation({
        token,
        companyId,
        createdByUserId: adminId,
        position: input.position ?? null,
        isAdmin,
      });

      const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
        `${req.protocol}://${req.get("host")}`;
      const url = `${baseUrl}/join/${token}`;

      res.status(201).json({
        id: inv.id,
        token: inv.token,
        url,
        position: inv.position,
        isAdmin: inv.isAdmin,
        createdAt: inv.createdAt,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("Error creating invitation:", err);
      res.status(500).json({ message: "Ошибка создания приглашения", error: err.message });
    }
  });
```

- [ ] **Step 3: Прогнать тесты**

```bash
npm run test -- tests/invitations.test.ts
```
Expected: 4 теста проходят.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(api): POST /api/invitations создаёт QR-приглашение"
```

---

## Task 7: Тесты + реализация `GET /api/invitations` и `POST /api/invitations/:id/revoke`

**Files:**
- Modify: `tests/invitations.test.ts`, `server/routes.ts`.

- [ ] **Step 1: Дописать тесты в `tests/invitations.test.ts`**

```ts
describe("GET /api/invitations", () => {
  it("возвращает только активные по умолчанию", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getInvitationsByCompany.mockResolvedValue([
      { id: 1, token: "t1", companyId: 42, createdByUserId: 10, position: null, isAdmin: false, usedAt: null, usedByUserId: null, revokedAt: null, createdAt: 2 },
    ] satisfies Invitation[]);

    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app).get("/api/invitations");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(storage.getInvitationsByCompany).toHaveBeenCalledWith(42, false);
  });

  it("?includeAll=true прокидывается в storage", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getInvitationsByCompany.mockResolvedValue([]);
    const { app } = await buildApp({ sessionUserId: 10 });
    await request(app).get("/api/invitations?includeAll=true");
    expect(storage.getInvitationsByCompany).toHaveBeenCalledWith(42, true);
  });
});

describe("POST /api/invitations/:id/revoke", () => {
  const ACTIVE: Invitation = {
    id: 5, token: "x", companyId: 42, createdByUserId: 10,
    position: null, isAdmin: false,
    usedAt: null, usedByUserId: null, revokedAt: null, createdAt: 1,
  };

  it("отзывает собственное активное приглашение", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getInvitationById.mockResolvedValue(ACTIVE);
    storage.revokeInvitation.mockResolvedValue({ ...ACTIVE, revokedAt: 999 });

    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app).post("/api/invitations/5/revoke");

    expect(res.status).toBe(200);
    expect(res.body.revokedAt).toBe(999);
  });

  it("чужой компании → 404", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getInvitationById.mockResolvedValue({ ...ACTIVE, companyId: 999 });
    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app).post("/api/invitations/5/revoke");
    expect(res.status).toBe(404);
  });

  it("уже использованное → 400", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getInvitationById.mockResolvedValue({ ...ACTIVE, usedAt: 100, usedByUserId: 7 });
    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app).post("/api/invitations/5/revoke");
    expect(res.status).toBe(400);
  });

  it("уже отозванное → 400", async () => {
    storage.getUserById.mockResolvedValue(ADMIN);
    storage.getInvitationById.mockResolvedValue({ ...ACTIVE, revokedAt: 50 });
    const { app } = await buildApp({ sessionUserId: 10 });
    const res = await request(app).post("/api/invitations/5/revoke");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Прогнать — должны падать**

```bash
npm run test -- tests/invitations.test.ts
```
Expected: 6 новых тестов FAIL.

- [ ] **Step 3: Реализовать обе ручки в `server/routes.ts`**

Сразу после `POST /api/invitations`:

```ts
  app.get(api.invitations.list.path, requireAdmin, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) return res.json([]);
      const includeAll = req.query.includeAll === "true";
      const list = await storage.getInvitationsByCompany(companyId, includeAll);
      res.json(list);
    } catch (err: any) {
      console.error("Error listing invitations:", err);
      res.status(500).json({ message: "Ошибка загрузки приглашений", error: err.message });
    }
  });

  app.post("/api/invitations/:id/revoke", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Некорректный id" });
      }
      const adminCompanyId = await getCompanyIdFromReq(req);
      const inv = await storage.getInvitationById(id);
      if (!inv || inv.companyId !== adminCompanyId) {
        return res.status(404).json({ message: "Приглашение не найдено" });
      }
      if (inv.usedAt || inv.revokedAt) {
        return res.status(400).json({ message: "Приглашение уже неактивно" });
      }
      const updated = await storage.revokeInvitation(id);
      res.json(updated);
    } catch (err: any) {
      console.error("Error revoking invitation:", err);
      res.status(500).json({ message: "Ошибка отзыва приглашения", error: err.message });
    }
  });
```

- [ ] **Step 4: Тесты должны пройти**

```bash
npm run test -- tests/invitations.test.ts
```
Expected: PASS (10 тестов всего в этом файле).

- [ ] **Step 5: Commit**

```bash
git add tests/invitations.test.ts server/routes.ts
git commit -m "feat(api): GET /api/invitations и POST /api/invitations/:id/revoke"
```

---

## Task 8: Тесты + реализация `GET /api/invitations/by-token/:token` (публичное превью)

**Files:**
- Test: `tests/invitations-token.test.ts` (новый).
- Modify: `server/routes.ts`.

- [ ] **Step 1: Создать `tests/invitations-token.test.ts`**

```ts
import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Invitation, User, Company } from "../shared/schema";

const storage = {
  getUserById: vi.fn(),
  getUserByPhone: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  getCompanyById: vi.fn(),
  getInvitationByToken: vi.fn(),
  getInvitationById: vi.fn(),
  markInvitationUsed: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/mail", () => ({ sendTaskCompletedEmail: vi.fn() }));

const COMPANY: Company = {
  id: 42, name: "ООО Ромашка", email: null, createdAt: 1,
  wesetupBaseUrl: null, wesetupApiKey: null,
};

const ACTIVE: Invitation = {
  id: 1, token: "good-token", companyId: 42, createdByUserId: 10,
  position: "Курьер", isAdmin: false,
  usedAt: null, usedByUserId: null, revokedAt: null, createdAt: 1,
};

async function buildApp() {
  const { registerRoutes } = await import("../server/routes");
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.session = {}; next(); });
  const server = createServer(app);
  await registerRoutes(server, app);
  return { app, server };
}

afterEach(() => vi.restoreAllMocks());
beforeEach(() => Object.values(storage).forEach((m) => m.mockReset?.()));
```

- [ ] **Step 2: Тесты на превью**

Дописать:

```ts
describe("GET /api/invitations/by-token/:token", () => {
  it("активное → valid:true с companyName и position", async () => {
    storage.getInvitationByToken.mockResolvedValue(ACTIVE);
    storage.getCompanyById.mockResolvedValue(COMPANY);
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/good-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true, companyName: "ООО Ромашка", position: "Курьер" });
  });

  it("несуществующий токен → valid:false reason:not_found", async () => {
    storage.getInvitationByToken.mockResolvedValue(undefined);
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/nope");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: "not_found" });
  });

  it("уже использованное → valid:false reason:used", async () => {
    storage.getInvitationByToken.mockResolvedValue({ ...ACTIVE, usedAt: 100, usedByUserId: 7 });
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/good-token");
    expect(res.body).toEqual({ valid: false, reason: "used" });
  });

  it("отозванное → valid:false reason:revoked", async () => {
    storage.getInvitationByToken.mockResolvedValue({ ...ACTIVE, revokedAt: 50 });
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/good-token");
    expect(res.body).toEqual({ valid: false, reason: "revoked" });
  });

  it("не отдаёт companyId/createdByUserId/isAdmin/id", async () => {
    storage.getInvitationByToken.mockResolvedValue(ACTIVE);
    storage.getCompanyById.mockResolvedValue(COMPANY);
    const { app } = await buildApp();
    const res = await request(app).get("/api/invitations/by-token/good-token");
    expect(res.body.companyId).toBeUndefined();
    expect(res.body.createdByUserId).toBeUndefined();
    expect(res.body.isAdmin).toBeUndefined();
    expect(res.body.id).toBeUndefined();
  });
});
```

- [ ] **Step 3: Прогнать — должны падать**

```bash
npm run test -- tests/invitations-token.test.ts
```
Expected: FAIL.

- [ ] **Step 4: Реализация в `server/routes.ts`**

После revoke-ручки:

```ts
  app.get("/api/invitations/by-token/:token", async (req, res) => {
    try {
      const inv = await storage.getInvitationByToken(req.params.token);
      if (!inv) return res.json({ valid: false, reason: "not_found" });
      if (inv.revokedAt) return res.json({ valid: false, reason: "revoked" });
      if (inv.usedAt) return res.json({ valid: false, reason: "used" });
      const company = await storage.getCompanyById(inv.companyId);
      if (!company) return res.json({ valid: false, reason: "not_found" });
      res.json({ valid: true, companyName: company.name, position: inv.position });
    } catch (err: any) {
      console.error("Error reading invitation:", err);
      res.status(500).json({ message: "Ошибка чтения приглашения" });
    }
  });
```

- [ ] **Step 5: Тесты PASS**

```bash
npm run test -- tests/invitations-token.test.ts
```
Expected: PASS (5 тестов).

- [ ] **Step 6: Commit**

```bash
git add tests/invitations-token.test.ts server/routes.ts
git commit -m "feat(api): публичное превью GET /api/invitations/by-token/:token"
```

---

## Task 9: Тесты + реализация `POST /api/invitations/by-token/:token/accept`

**Files:**
- Modify: `tests/invitations-token.test.ts`, `server/routes.ts`.

- [ ] **Step 1: Дописать тесты в `tests/invitations-token.test.ts`**

```ts
describe("POST /api/invitations/by-token/:token/accept", () => {
  const NEW_USER: User = {
    id: 77, phone: "+79990001122", name: "Иван",
    isAdmin: false, createdAt: 1, bonusBalance: 0,
    companyId: 42, managedWorkerIds: null, position: "Курьер",
  };

  it("happy path: создаёт юзера, метит приглашение, авто-логин", async () => {
    storage.getInvitationByToken.mockResolvedValue(ACTIVE);
    storage.getUserByPhone.mockResolvedValue(undefined);
    storage.createUser.mockResolvedValue(NEW_USER);
    storage.markInvitationUsed.mockResolvedValue(true);
    storage.getCompanyById.mockResolvedValue(COMPANY);

    const { app } = await buildApp();
    const res = await request(app)
      .post("/api/invitations/by-token/good-token/accept")
      .send({ phone: "+79990001122", name: "Иван" });

    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(77);
    expect(res.body.company).toEqual({ id: 42, name: "ООО Ромашка" });
    expect(storage.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+79990001122", name: "Иван",
        companyId: 42, isAdmin: false, position: "Курьер",
      }),
    );
    expect(storage.markInvitationUsed).toHaveBeenCalledWith(1, 77);
  });

  it("isAdmin приглашения копируется в createUser", async () => {
    storage.getInvitationByToken.mockResolvedValue({ ...ACTIVE, isAdmin: true, position: null });
    storage.getUserByPhone.mockResolvedValue(undefined);
    storage.createUser.mockResolvedValue({ ...NEW_USER, isAdmin: true, position: null });
    storage.markInvitationUsed.mockResolvedValue(true);
    storage.getCompanyById.mockResolvedValue(COMPANY);
    const { app } = await buildApp();
    await request(app).post("/api/invitations/by-token/good-token/accept")
      .send({ phone: "+79990001122", name: "Иван" });
    expect(storage.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: true, position: null }),
    );
  });

  it("несуществующий токен → 400 reason:not_found", async () => {
    storage.getInvitationByToken.mockResolvedValue(undefined);
    const { app } = await buildApp();
    const res = await request(app)
      .post("/api/invitations/by-token/nope/accept")
      .send({ phone: "+79990001122", name: "Иван" });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("not_found");
  });

  it("отозванное → 400 reason:revoked", async () => {
    storage.getInvitationByToken.mockResolvedValue({ ...ACTIVE, revokedAt: 5 });
    const { app } = await buildApp();
    const res = await request(app).post("/api/invitations/by-token/good-token/accept")
      .send({ phone: "+79990001122", name: "Иван" });
    expect(res.body.reason).toBe("revoked");
  });

  it("телефон занят → 400 phone, приглашение НЕ помечается used", async () => {
    storage.getInvitationByToken.mockResolvedValue(ACTIVE);
    storage.getUserByPhone.mockResolvedValue({ ...NEW_USER });
    const { app } = await buildApp();
    const res = await request(app).post("/api/invitations/by-token/good-token/accept")
      .send({ phone: "+79990001122", name: "Иван" });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("phone");
    expect(storage.markInvitationUsed).not.toHaveBeenCalled();
    expect(storage.createUser).not.toHaveBeenCalled();
  });

  it("race: markInvitationUsed=false → откат createUser, 400 reason:used", async () => {
    storage.getInvitationByToken
      .mockResolvedValueOnce(ACTIVE)               // первый раз — активно
      .mockResolvedValueOnce({ ...ACTIVE, usedAt: 100, usedByUserId: 999 }); // повторное чтение для определения reason
    storage.getUserByPhone.mockResolvedValue(undefined);
    storage.createUser.mockResolvedValue(NEW_USER);
    storage.markInvitationUsed.mockResolvedValue(false);
    storage.deleteUser.mockResolvedValue(undefined);

    const { app } = await buildApp();
    const res = await request(app).post("/api/invitations/by-token/good-token/accept")
      .send({ phone: "+79990001122", name: "Иван" });

    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("used");
    expect(storage.deleteUser).toHaveBeenCalledWith(77);
  });

  it("нормализует телефон с пробелами и дефисами", async () => {
    storage.getInvitationByToken.mockResolvedValue(ACTIVE);
    storage.getUserByPhone.mockResolvedValue(undefined);
    storage.createUser.mockResolvedValue(NEW_USER);
    storage.markInvitationUsed.mockResolvedValue(true);
    storage.getCompanyById.mockResolvedValue(COMPANY);

    const { app } = await buildApp();
    await request(app).post("/api/invitations/by-token/good-token/accept")
      .send({ phone: "+7 999 000-11-22", name: "Иван" });

    expect(storage.getUserByPhone).toHaveBeenCalledWith("+79990001122");
    expect(storage.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "+79990001122" }),
    );
  });
});
```

- [ ] **Step 2: Прогнать — должны падать**

```bash
npm run test -- tests/invitations-token.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Реализация accept-ручки в `server/routes.ts`**

После публичного превью:

```ts
  app.post("/api/invitations/by-token/:token/accept", async (req, res) => {
    try {
      const acceptSchema = api.invitations.accept.input;
      const input = acceptSchema.parse(req.body);

      const inv = await storage.getInvitationByToken(req.params.token);
      if (!inv) return res.status(400).json({ reason: "not_found", message: "Ссылка не найдена" });
      if (inv.revokedAt) return res.status(400).json({ reason: "revoked", message: "Приглашение отозвано" });
      if (inv.usedAt) return res.status(400).json({ reason: "used", message: "Приглашение уже использовано" });

      const normalizedPhone = input.phone.replace(/\s+/g, "").replace(/-/g, "");
      const existing = await storage.getUserByPhone(normalizedPhone);
      if (existing) {
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      const user = await storage.createUser({
        phone: normalizedPhone,
        name: input.name,
        isAdmin: inv.isAdmin,
        companyId: inv.companyId,
        position: inv.position,
      });

      const ok = await storage.markInvitationUsed(inv.id, user.id);
      if (!ok) {
        // Race: кто-то опередил или приглашение отозвано прямо сейчас.
        // Откатываем созданного юзера и определяем причину повторным чтением.
        await storage.deleteUser(user.id);
        const refreshed = await storage.getInvitationByToken(req.params.token);
        const reason = refreshed?.revokedAt ? "revoked" : "used";
        return res.status(400).json({ reason, message: reason === "used" ? "Приглашение уже использовано" : "Приглашение отозвано" });
      }

      const company = await storage.getCompanyById(inv.companyId);
      req.session.userId = user.id;

      res.status(201).json({
        user,
        company: company ? { id: company.id, name: company.name } : { id: inv.companyId, name: "" },
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      console.error("Error accepting invitation:", err);
      res.status(500).json({ message: "Ошибка регистрации", error: err.message });
    }
  });
```

- [ ] **Step 4: Тесты PASS**

```bash
npm run test -- tests/invitations-token.test.ts
```
Expected: PASS (12 тестов в файле).

- [ ] **Step 5: Запустить полный тестовый прогон, убедиться, что ничего не сломали**

```bash
npm run test
```
Expected: все существующие тесты + новые проходят.

- [ ] **Step 6: Commit**

```bash
git add tests/invitations-token.test.ts server/routes.ts
git commit -m "feat(api): POST /api/invitations/by-token/:token/accept с авто-логином"
```

---

## Task 10: Rate-limit на публичные ручки

**Files:**
- Modify: `server/routes.ts`.

- [ ] **Step 1: Импорт rate-limit**

В верхнюю секцию `server/routes.ts` добавить (если ещё не используется):

```ts
import rateLimit from "express-rate-limit";
```

- [ ] **Step 2: Создать лимитер прямо перед регистрацией публичных ручек**

Над блоком публичных `by-token` ручек:

```ts
  // Публичные ручки приглашений: 30 запросов/минуту с IP. Защита от
  // перебора токенов (чисто символическая — энтропия 256 бит и так
  // делает перебор нереальным, но это бесплатно).
  const inviteAcceptLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Слишком много запросов, попробуйте через минуту" },
  });

  app.use("/api/invitations/by-token", inviteAcceptLimiter);
```

- [ ] **Step 3: Прогнать тесты — должны проходить**

```bash
npm run test
```
Expected: PASS. (Лимит 30/мин не должен мешать тестам, в которых 1-2 запроса.)

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(api): rate-limit 30/min на публичные by-token ручки"
```

---

## Task 11: Вынести `PhoneInput` в общий компонент

**Files:**
- Create: `client/src/components/PhoneInput.tsx`.
- Modify: `client/src/pages/Login.tsx`.

- [ ] **Step 1: Создать `client/src/components/PhoneInput.tsx`**

```tsx
import { Input } from "@/components/ui/input";
import { forwardRef } from "react";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Контролируемый инпут российского телефона. Всегда хранит значение
 * вида "+7XXXXXXXXXX" (12 символов). Запрещает удаление "+7" и режет
 * лишние цифры на 10 после кода. Извлечён из Login.tsx, чтобы можно
 * было использовать в JoinByInvite и других местах.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, placeholder = "xxx xxx xx xx", className, autoFocus }, ref) => {
    return (
      <Input
        ref={ref}
        type="tel"
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={
          className ??
          "h-16 text-2xl font-semibold tracking-wider border-2 border-border rounded-2xl px-6 focus:border-primary focus:ring-primary focus:ring-2 transition-all bg-card shadow-sm"
        }
        value={value}
        onChange={(e) => {
          let v = e.target.value;
          let cleaned = v.replace(/^\+?7?/, "");
          let digits = cleaned.replace(/\D/g, "");
          if (digits.startsWith("7") && digits.length > 1) {
            digits = digits.slice(1);
          }
          const limited = digits.slice(0, 10);
          onChange("+7" + limited);
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace") {
            const cursor = (e.target as HTMLInputElement).selectionStart ?? 0;
            if (cursor <= 2) e.preventDefault();
          }
          if (e.key === "Delete") {
            const cursor = (e.target as HTMLInputElement).selectionStart ?? 0;
            if (cursor < 2) e.preventDefault();
          }
        }}
        onFocus={(e) => {
          if (value === "+7" || value === "") {
            setTimeout(() => e.currentTarget.setSelectionRange(2, 2), 0);
          }
        }}
      />
    );
  },
);
PhoneInput.displayName = "PhoneInput";
```

- [ ] **Step 2: Заменить inline-инпут в `Login.tsx`**

Найти блок `<Input type="tel" ...>` (~строки 189-231) и заменить на:

```tsx
                  <FormControl>
                    <PhoneInput value={field.value} onChange={field.onChange} />
                  </FormControl>
```

Добавить импорт сверху:

```tsx
import { PhoneInput } from "@/components/PhoneInput";
```

- [ ] **Step 3: `npm run check` и проверить логин руками**

```bash
npm run check
npm run dev
```

В браузере открыть `/`, ввести телефон, убедиться что:
- "+7" не стирается;
- ввод цифр работает;
- логин по существующему пользователю проходит.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/PhoneInput.tsx client/src/pages/Login.tsx
git commit -m "refactor(client): вынести PhoneInput в общий компонент"
```

---

## Task 12: Страница `/admin/invitations`

**Files:**
- Create: `client/src/pages/Invitations.tsx`.
- Modify: `client/src/App.tsx`, `client/src/pages/Dashboard.tsx`.

- [ ] **Step 1: Создать `client/src/pages/Invitations.tsx`**

```tsx
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, QrCode, Copy, Trash2, Share2, Download } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import QRCode from "qrcode";
import type { Invitation } from "@shared/schema";

type CreatedInvite = {
  id: number; token: string; url: string;
  position: string | null; isAdmin: boolean; createdAt: number;
};

export default function Invitations() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [showQrFor, setShowQrFor] = useState<{ url: string; token: string } | null>(null);
  const [position, setPosition] = useState("");
  const [role, setRole] = useState<"employee" | "manager" | "admin">("employee");

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) setLocation("/dashboard");
  }, [user, authLoading, setLocation]);

  const activeQuery = useQuery<Invitation[]>({
    queryKey: ["invitations", "active"],
    queryFn: async () => {
      const r = await fetch("/api/invitations", { credentials: "include" });
      if (!r.ok) throw new Error("Не удалось загрузить");
      return r.json();
    },
    enabled: !!user?.isAdmin,
  });

  const allQuery = useQuery<Invitation[]>({
    queryKey: ["invitations", "all"],
    queryFn: async () => {
      const r = await fetch("/api/invitations?includeAll=true", { credentials: "include" });
      if (!r.ok) throw new Error("Не удалось загрузить");
      return r.json();
    },
    enabled: false,
  });

  const createMutation = useMutation<CreatedInvite, Error, void>({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (position.trim()) body.position = position.trim();
      if (role !== "employee") body.role = role;
      const r = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).message || "Ошибка");
      return r.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      setShowCreate(false);
      setPosition("");
      setRole("employee");
      setShowQrFor({ url: created.url, token: created.token });
    },
    onError: (e) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const r = await fetch(`/api/invitations/${id}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error((await r.json()).message || "Ошибка");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast({ title: "Приглашение отозвано" });
    },
    onError: (e) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  if (authLoading || !user?.isAdmin) return null;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Скопировано" });
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/dashboard")} aria-label="Назад">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold">Приглашения</h1>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-6">
        <p className="text-sm text-muted-foreground">
          Сгенерируйте QR-код или ссылку и отправьте сотруднику. Он сам введёт
          имя и телефон, после чего попадёт в кабинет вашей компании.
        </p>

        <Button onClick={() => setShowCreate(true)} className="w-full h-14 text-base">
          <QrCode className="w-5 h-5 mr-2" />
          Сгенерировать QR
        </Button>

        <section className="space-y-2">
          <h2 className="font-semibold">Активные приглашения</h2>
          {activeQuery.isLoading && <p className="text-sm text-muted-foreground">Загрузка...</p>}
          {activeQuery.data && activeQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Пока нет активных приглашений.</p>
          )}
          {activeQuery.data?.map((inv) => (
            <div key={inv.id} className="p-3 border border-border rounded-xl flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  {inv.position || "Без должности"} · {inv.isAdmin ? "Админ/менеджер" : "Сотрудник"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Создано: {new Date(inv.createdAt * 1000).toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => {
                  const url = `${window.location.origin}/join/${inv.token}`;
                  setShowQrFor({ url, token: inv.token });
                }}>
                  <QrCode className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(`${window.location.origin}/join/${inv.token}`)}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  if (confirm("Отозвать приглашение?")) revokeMutation.mutate(inv.id);
                }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </section>

        <Accordion type="single" collapsible>
          <AccordionItem value="history">
            <AccordionTrigger onClick={() => allQuery.refetch()}>
              Показать историю
            </AccordionTrigger>
            <AccordionContent>
              {allQuery.isFetching && <p className="text-sm text-muted-foreground">Загрузка...</p>}
              {allQuery.data?.filter((i) => i.usedAt || i.revokedAt).map((inv) => (
                <div key={inv.id} className="p-2 text-sm text-muted-foreground border-b border-border last:border-0">
                  {inv.usedAt ? "✓ Принято" : "✗ Отозвано"} · {inv.position || "без должности"} ·{" "}
                  {new Date((inv.usedAt || inv.revokedAt || 0) * 1000).toLocaleString("ru-RU")}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>

      {/* Модалка создания */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новое приглашение</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Должность (необязательно)</Label>
              <Input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Например, Кассир"
              />
            </div>
            <div>
              <Label>Роль</Label>
              <RadioGroup value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <div className="flex items-center gap-2"><RadioGroupItem value="employee" id="r-emp" /><Label htmlFor="r-emp">Сотрудник</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="manager" id="r-mgr" /><Label htmlFor="r-mgr">Менеджер</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="admin" id="r-adm" /><Label htmlFor="r-adm">Админ</Label></div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Отмена</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Модалка с QR */}
      <Dialog open={!!showQrFor} onOpenChange={(open) => !open && setShowQrFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR-код приглашения</DialogTitle>
          </DialogHeader>
          {showQrFor && <QrPanel url={showQrFor.url} onCopy={copyToClipboard} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QrPanel({ url, onCopy }: { url: string; onCopy: (s: string) => void }) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setDataUrl);
  }, [url]);

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ url, title: "Приглашение в TasksFlow" }); } catch {}
    } else {
      onCopy(url);
    }
  };

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "invitation-qr.png";
    a.click();
  };

  return (
    <div className="space-y-3 flex flex-col items-center">
      {dataUrl
        ? <img src={dataUrl} alt="QR" className="w-64 h-64" />
        : <div className="w-64 h-64 bg-muted animate-pulse rounded" />}
      <div className="text-xs font-mono break-all text-center px-2">{url}</div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onCopy(url)}><Copy className="w-4 h-4 mr-1" />Скопировать</Button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <Button size="sm" variant="outline" onClick={share}><Share2 className="w-4 h-4 mr-1" />Поделиться</Button>
        )}
        <Button size="sm" variant="outline" onClick={download}><Download className="w-4 h-4 mr-1" />Скачать</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Зарегистрировать роут в `client/src/App.tsx`**

В `Switch` после `<Route path="/admin/api-keys" component={ApiKeysPage} />` добавить:

```tsx
          <Route path="/admin/invitations" component={Invitations} />
```

И импорт сверху:

```tsx
import Invitations from "@/pages/Invitations";
```

- [ ] **Step 3: Добавить пункт «Приглашения» в admin-dropdown `Dashboard.tsx`**

Найти блок `{user.isAdmin && (` (~строка 519) с двумя кнопками «Сотрудники» и «Настройки». Сразу после кнопки «Сотрудники» добавить:

```tsx
                <button
                  type="button"
                  className="dropdown-item w-full"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setLocation("/admin/invitations");
                  }}
                >
                  <QrCode className="w-5 h-5 text-primary" />
                  <span className="font-medium">Приглашения</span>
                </button>
```

В импортах из `lucide-react` добавить `QrCode` (если его там ещё нет).

- [ ] **Step 4: `npm run check`**

```bash
npm run check
```
Expected: PASS.

- [ ] **Step 5: Проверить руками в браузере**

```bash
npm run dev
```

Под админом: открыть Dashboard → меню → «Приглашения» → нажать «Сгенерировать QR» → создать → убедиться, что появляется QR и ссылка → копирование, отзыв работают.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Invitations.tsx client/src/App.tsx client/src/pages/Dashboard.tsx
git commit -m "feat(client): страница /admin/invitations с QR-генерацией и списком"
```

---

## Task 13: Публичная страница `/join/:token`

**Files:**
- Create: `client/src/pages/JoinByInvite.tsx`.
- Modify: `client/src/App.tsx`.

- [ ] **Step 1: Создать `client/src/pages/JoinByInvite.tsx`**

```tsx
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/PhoneInput";
import { useToast } from "@/hooks/use-toast";

type Preview =
  | { valid: true; companyName: string; position: string | null }
  | { valid: false; reason: "not_found" | "used" | "revoked" };

const REASON_TEXT: Record<"not_found" | "used" | "revoked", string> = {
  not_found: "Ссылка не найдена. Уточните её у администратора.",
  used: "Эта ссылка уже использована.",
  revoked: "Администратор отозвал это приглашение.",
};

export default function JoinByInvite() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+7");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; field?: string; reason?: string } | null>(null);

  useEffect(() => {
    fetch(`/api/invitations/by-token/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setPreview)
      .catch(() => setPreview({ valid: false, reason: "not_found" }));
  }, [token]);

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!preview.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-2xl font-bold">Ссылка недействительна</h1>
          <p className="text-muted-foreground">{REASON_TEXT[preview.reason]}</p>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/invitations/by-token/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone, name }),
      });
      const body = await r.json();
      if (!r.ok) {
        setSubmitError(body);
        if (body.reason && ["not_found", "used", "revoked"].includes(body.reason)) {
          // ссылка стала невалидной — перерисуем экран
          setPreview({ valid: false, reason: body.reason });
        }
        return;
      }
      toast({ title: `Добро пожаловать в ${body.company.name}` });
      window.location.href = "/dashboard";
    } catch (err: any) {
      setSubmitError({ message: err.message || "Ошибка регистрации" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Регистрация в компании</h1>
          <div className="text-2xl font-extrabold">{preview.companyName}</div>
          {preview.position && (
            <div className="text-sm text-muted-foreground">Должность: {preview.position}</div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Ваше имя</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={1} />
          {submitError?.field === "name" && (
            <p className="text-sm text-destructive">{submitError.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Телефон</Label>
          <PhoneInput value={phone} onChange={setPhone} />
          {submitError?.field === "phone" && (
            <p className="text-sm text-destructive">{submitError.message}</p>
          )}
        </div>

        {submitError && !submitError.field && (
          <p className="text-sm text-destructive text-center">{submitError.message}</p>
        )}

        <Button type="submit" className="w-full h-14" disabled={submitting || !name.trim() || phone.length < 12}>
          {submitting ? "Регистрация..." : "Зарегистрироваться"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Зарегистрировать роут в `client/src/App.tsx`**

В `Switch` (раньше `<Route component={NotFound} />`):

```tsx
          <Route path="/join/:token" component={JoinByInvite} />
```

И импорт:

```tsx
import JoinByInvite from "@/pages/JoinByInvite";
```

- [ ] **Step 3: `npm run check`**

```bash
npm run check
```
Expected: PASS.

- [ ] **Step 4: Smoke-тест в браузере**

```bash
npm run dev
```

Сценарий:
1. Под админом создать приглашение в `/admin/invitations`, скопировать ссылку.
2. Открыть ссылку в **другом** браузере / приватной вкладке (без сессии).
3. Убедиться: видно «Регистрация в компании <имя>», поле имени и телефона.
4. Отправить форму с новым телефоном → должен произойти редирект на `/dashboard` с залогиненным новым юзером.
5. Открыть ту же ссылку ещё раз → «Эта ссылка уже использована».
6. Создать ещё одно приглашение, отозвать его в админке, открыть ссылку → «Администратор отозвал это приглашение».

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/JoinByInvite.tsx client/src/App.tsx
git commit -m "feat(client): публичная страница /join/:token"
```

---

## Task 14: Финальный прогон и documentation polish

**Files:**
- Modify: `.env.example` (если есть) или README — упомянуть `PUBLIC_BASE_URL`.

- [ ] **Step 1: Проверить наличие `.env.example`**

```bash
ls c:/www/TasksFlow/.env.example 2>/dev/null
```

Если файл есть — добавить строку:

```
# Базовый URL приложения для генерации ссылок-приглашений.
# Если не задан — берётся из заголовков запроса.
PUBLIC_BASE_URL=https://tasksflow.example.com
```

Если файла нет — пропустить шаг.

- [ ] **Step 2: Финальный прогон**

```bash
npm run check
npm run test
```
Expected: PASS оба.

- [ ] **Step 3: Сборка**

```bash
npm run build
```
Expected: успешная сборка.

- [ ] **Step 4: Commit (если что-то менялось в шагах 1-3)**

```bash
git add .env.example
git commit -m "docs: PUBLIC_BASE_URL для генерации invitation-ссылок"
```

Если ничего не менялось — пропустить.

---

## Self-review

После завершения всех тасков пройтись по чек-листу:

1. **Spec coverage:**
   - Таблица `invitations` — Task 2 ✓
   - 5 эндпоинтов — Tasks 6, 7, 8, 9 ✓
   - Race condition — Task 9 (markInvitationUsed=false → откат) ✓
   - Rate limit — Task 10 ✓
   - UI админа — Task 12 ✓
   - Публичный `/join/:token` — Task 13 ✓
   - Тесты server (8 кейсов) — Tasks 5, 7, 8, 9 ✓
   - Smoke client — ручная проверка в Tasks 12, 13 ✓
   - PUBLIC_BASE_URL — Task 6 (фолбек) + Task 14 (.env.example) ✓
   - YAGNI: TTL/SMS/bulk/email — не делаем ✓

2. **Placeholder scan:** В плане нет TBD/TODO, все code-блоки полные.

3. **Type consistency:** Метод называется `markInvitationUsed` во всех тасках. `Invitation` импортируется из `@shared/schema` единообразно.
