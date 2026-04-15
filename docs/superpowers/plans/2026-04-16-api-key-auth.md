# TasksFlow API Key Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API key authentication в TasksFlow. Сторонние сервисы (managermagday) получают возможность POST'ить задачи через `Authorization: Bearer tfk_...` без session-login. Admin UI для создания/отзыва.

**Architecture:** Новая таблица `api_keys` (hash + prefix + company scoping). Middleware `requireAdminOrApiKey` заменяет `requireAuth, requireAdmin` на tasks/workers endpoints. CRUD endpoints `/api/api-keys` доступны только через session. UI — новая страница настроек.

**Tech Stack:** Node + Express + Drizzle ORM (MySQL). Node crypto (sha256 + randomBytes). React client (существующий setup).

Spec: [`docs/superpowers/specs/2026-04-16-api-key-auth-design.md`](../specs/2026-04-16-api-key-auth-design.md).

---

## Файловая структура

**Создаём:**
- `shared/schema.ts` — добавляем `apiKeys` таблицу и типы `ApiKey`, `InsertApiKey`.
- `server/api-keys.ts` — генерация ключа (`generateApiKey`), хеширование (`hashApiKey`), middleware `requireApiKey` + `requireAdminOrApiKey`.
- `server/routes/api-keys-routes.ts` (или секция в routes.ts) — endpoints `/api/api-keys` POST/GET/DELETE.
- `client/src/pages/api-keys.tsx` (или аналог в существующей структуре) — UI-страница.
- `tests/api-keys.test.ts` — vitest.

**Меняем:**
- `server/storage.ts` — добавить методы `createApiKey`, `getApiKeyByHash`, `listApiKeysByCompany`, `revokeApiKey`, `updateApiKeyLastUsed`.
- `server/routes.ts` — заменить `requireAuth, requireAdmin` → `requireAdminOrApiKey` на 7 endpoints (см. Task 7). Добавить маунт new api-keys endpoints.
- `shared/routes.ts` — добавить константы путей для `/api/api-keys`.
- `client/` навигация — пункт меню «API ключи» в настройках.

---

### Task 1: Drizzle schema — таблица api_keys

**Files:**
- Modify: `shared/schema.ts`

- [ ] **Step 1: Добавить таблицу**

Найти конец файла `shared/schema.ts` (после последней `export const X = mysqlTable(...)`). Добавить:

```ts
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  companyId: int("company_id").notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: int("created_at").notNull().default(0),
  lastUsedAt: int("last_used_at").default(0),
  revokedAt: int("revoked_at").default(0),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
```

- [ ] **Step 2: Push migration**

```bash
cd /c/www/TasksFlow && npm run db:push
```

Expected: в выводе есть «Creating table api_keys» или «applied».

- [ ] **Step 3: Verify table**

```bash
cd /c/www/TasksFlow && node -e "
require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  const p = mysql.createPool({
    host: process.env.MYSQL_HOST, user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  const [rows] = await p.query('SHOW COLUMNS FROM api_keys');
  rows.forEach(r => console.log(r.Field + ':' + r.Type));
  process.exit(0);
})();
"
```

Expected: 9 полей (id, name, key_hash, key_prefix, company_id, created_by_user_id, created_at, last_used_at, revoked_at).

- [ ] **Step 4: Commit**

```bash
cd /c/www/TasksFlow && git add shared/schema.ts && git commit -m "feat(db): api_keys таблица для server-to-server auth"
```

---

### Task 2: Storage методы для api_keys

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Расширить IStorage interface**

Найти `// Tasks` секцию в `IStorage interface` в `server/storage.ts`. После неё добавить:

```ts
  // API Keys
  createApiKey(data: Omit<InsertApiKey, 'id' | 'createdAt'>): Promise<ApiKey>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  listApiKeysByCompany(companyId: number): Promise<ApiKey[]>;
  getApiKeyById(id: number): Promise<ApiKey | undefined>;
  revokeApiKey(id: number): Promise<void>;
  updateApiKeyLastUsed(id: number, ts: number): Promise<void>;
  countActiveApiKeysByCompany(companyId: number): Promise<number>;
```

И добавить импорт типа рядом с существующими (найти `import { ... } from "@shared/schema"` и дополнить):

```ts
import { /* existing */, apiKeys, type ApiKey, type InsertApiKey } from "@shared/schema";
```

- [ ] **Step 2: Реализовать методы в DatabaseStorage**

Найти в `server/storage.ts` конец класса `DatabaseStorage` (перед `}` класса и `export const storage = new DatabaseStorage();`). Добавить секцию:

```ts
  // ===================== API KEYS =====================

  async createApiKey(data: Omit<InsertApiKey, 'id' | 'createdAt'>): Promise<ApiKey> {
    const now = Math.floor(Date.now() / 1000);
    const insert = { ...data, createdAt: now };
    const [result] = await db.insert(apiKeys).values(insert);
    const id = (result as any).insertId as number;
    const row = await this.getApiKeyById(id);
    if (!row) throw new Error('api_key not found after insert');
    return row;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
    return rows[0];
  }

  async getApiKeyById(id: number): Promise<ApiKey | undefined> {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return rows[0];
  }

  async listApiKeysByCompany(companyId: number): Promise<ApiKey[]> {
    return db.select().from(apiKeys)
      .where(eq(apiKeys.companyId, companyId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async revokeApiKey(id: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db.update(apiKeys).set({ revokedAt: now }).where(eq(apiKeys.id, id));
  }

  async updateApiKeyLastUsed(id: number, ts: number): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: ts }).where(eq(apiKeys.id, id));
  }

  async countActiveApiKeysByCompany(companyId: number): Promise<number> {
    const rows = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.companyId, companyId), eq(apiKeys.revokedAt, 0)));
    return rows.length;
  }
```

Убедиться что `desc` и `and` импортированы из drizzle-orm в верхней части файла. Если нет — добавить:

```ts
import { eq, and, desc } from "drizzle-orm";
```

- [ ] **Step 3: Typecheck**

```bash
cd /c/www/TasksFlow && npx tsc --noEmit
```

Expected: чисто.

- [ ] **Step 4: Commit**

```bash
cd /c/www/TasksFlow && git add server/storage.ts && git commit -m "feat(storage): CRUD методы для api_keys"
```

---

### Task 3: Crypto helpers и middleware

**Files:**
- Create: `server/api-keys.ts`

- [ ] **Step 1: Создать файл**

`server/api-keys.ts`:

```ts
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { storage } from "./storage";

/** Генерирует новый API ключ: префикс «tfk_» + 32 случайных байта в base64url. */
export function generateApiKey(): string {
  const raw = crypto.randomBytes(32).toString("base64url");
  return `tfk_${raw}`;
}

/** SHA-256 hex (64 символа). */
export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/** Извлекает plaintext из заголовка Authorization, или null. */
export function extractBearerKey(req: Request): string | null {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(tfk_[A-Za-z0-9_-]+)$/.exec(h);
  return m ? m[1] : null;
}

export interface ApiKeyContext {
  id: number;
  companyId: number;
  createdByUserId: number;
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyContext;
    }
  }
}

/** Аутентификация ТОЛЬКО через API key. 401 если невалидно. */
export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const plaintext = extractBearerKey(req);
  if (!plaintext) {
    res.status(401).json({ message: "API key отсутствует" });
    return;
  }
  const hash = hashApiKey(plaintext);
  const record = await storage.getApiKeyByHash(hash);
  const prefix = plaintext.slice(0, 12);
  if (!record) {
    console.warn(`[api-key] failed: not found prefix=${prefix}`);
    res.status(401).json({ message: "Неверный API key" });
    return;
  }
  if (record.revokedAt && record.revokedAt > 0) {
    console.warn(`[api-key] failed: revoked id=${record.id} prefix=${prefix}`);
    res.status(401).json({ message: "API key отозван" });
    return;
  }
  req.apiKey = { id: record.id, companyId: record.companyId, createdByUserId: record.createdByUserId };
  // fire-and-forget
  const now = Math.floor(Date.now() / 1000);
  storage.updateApiKeyLastUsed(record.id, now).catch(err => {
    console.error("[api-key] last_used update failed", err);
  });
  next();
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /c/www/TasksFlow && npx tsc --noEmit
```

Expected: чисто.

- [ ] **Step 3: Commit**

```bash
cd /c/www/TasksFlow && git add server/api-keys.ts && git commit -m "feat(auth): crypto helpers + requireApiKey middleware"
```

---

### Task 4: Middleware `requireAdminOrApiKey`

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Импорт и новый middleware**

В `server/routes.ts` после `import { registerCompanySchema, loginSchema } from "@shared/schema";` добавить:

```ts
import { requireApiKey, extractBearerKey, generateApiKey, hashApiKey } from "./api-keys";
```

Найти функцию `async function requireAdmin` (строка ~48-66). Сразу **после** её закрывающей `}` (до следующей функции или кода) добавить:

```ts
// Аутентификация: либо session admin, либо API key.
async function requireAdminOrApiKey(req: Request, res: Response, next: NextFunction) {
  if (extractBearerKey(req)) {
    return requireApiKey(req, res, next);
  }
  return requireAdmin(req, res, next);
}

// Аутентификация: либо session (любой user), либо API key.
async function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction) {
  if (extractBearerKey(req)) {
    return requireApiKey(req, res, next);
  }
  return requireAuth(req, res, next);
}

/** Хелпер: получить companyId из req либо от API key, либо от session. */
async function getCompanyIdFromReq(req: Request): Promise<number | null> {
  if (req.apiKey) return req.apiKey.companyId;
  if (req.session?.userId) {
    const user = await storage.getUserById(req.session.userId);
    return user?.companyId ?? null;
  }
  return null;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /c/www/TasksFlow && npx tsc --noEmit
```

Expected: чисто.

- [ ] **Step 3: Commit**

```bash
cd /c/www/TasksFlow && git add server/routes.ts && git commit -m "feat(auth): requireAdminOrApiKey + requireAuthOrApiKey хелперы"
```

---

### Task 5: Endpoints `/api/api-keys` (CRUD)

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Добавить endpoints**

Найти в `server/routes.ts` место ДО `return httpServer;` в конце `registerRoutes` (либо после последнего app.delete/app.post). Добавить блок:

```ts
  // ===================== API KEYS =====================

  app.get("/api/api-keys", requireAuth, requireAdmin, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        res.status(400).json({ message: "Company не определена" });
        return;
      }
      const rows = await storage.listApiKeysByCompany(companyId);
      // Не возвращаем keyHash — только prefix и метаданные.
      const sanitized = rows.map(r => ({
        id: r.id,
        name: r.name,
        keyPrefix: r.keyPrefix,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt ?? 0,
        revokedAt: r.revokedAt ?? 0,
      }));
      res.json(sanitized);
    } catch (err) {
      console.error("[api-keys] list failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/api-keys", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({ name: z.string().trim().min(1).max(100) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Название обязательно (1-100 символов)" });
        return;
      }
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId || !req.session?.userId) {
        res.status(400).json({ message: "Company не определена" });
        return;
      }
      const activeCount = await storage.countActiveApiKeysByCompany(companyId);
      if (activeCount >= 50) {
        res.status(400).json({ message: "Достигнут лимит активных ключей (50)" });
        return;
      }
      const plaintext = generateApiKey();
      const keyHash = hashApiKey(plaintext);
      const keyPrefix = plaintext.slice(0, 12);
      const created = await storage.createApiKey({
        name: parsed.data.name,
        keyHash,
        keyPrefix,
        companyId,
        createdByUserId: req.session.userId,
      });
      console.log(`[api-key] created id=${created.id} name="${created.name}" by_user=${req.session.userId} company=${companyId}`);
      res.json({
        id: created.id,
        name: created.name,
        keyPrefix: created.keyPrefix,
        createdAt: created.createdAt,
        secret: plaintext,
      });
    } catch (err) {
      console.error("[api-keys] create failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/api-keys/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ message: "Неверный id" });
        return;
      }
      const companyId = await getCompanyIdFromReq(req);
      const record = await storage.getApiKeyById(id);
      if (!record || record.companyId !== companyId) {
        res.status(404).json({ message: "Ключ не найден" });
        return;
      }
      if (record.revokedAt && record.revokedAt > 0) {
        res.json({ ok: true, already: true });
        return;
      }
      await storage.revokeApiKey(id);
      console.log(`[api-key] revoked id=${id} by_user=${req.session?.userId} company=${companyId}`);
      res.json({ ok: true });
    } catch (err) {
      console.error("[api-keys] revoke failed", err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });
```

- [ ] **Step 2: Typecheck**

```bash
cd /c/www/TasksFlow && npx tsc --noEmit
```

Expected: чисто.

- [ ] **Step 3: Smoke test (local)**

Запустить сервер, залогиниться админом, создать ключ, получить список, отозвать:

```bash
cd /c/www/TasksFlow && (npm run dev > /tmp/tf.log 2>&1 &) && sleep 6
# Login admin (заменить phone на реальный)
curl -c /tmp/cookies.txt -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79999999999"}' 2>&1 | tail -3
# Create key
curl -b /tmp/cookies.txt -X POST http://localhost:5001/api/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke-test"}' 2>&1 | tail -3
# List
curl -b /tmp/cookies.txt http://localhost:5001/api/api-keys 2>&1 | tail -3
pkill -f "npm run dev\|tsx server" 2>/dev/null
```

Expected: в первом вызове — JSON с `secret: tfk_...`. В listing — тот же ключ с `lastUsedAt: 0, revokedAt: 0`.

- [ ] **Step 4: Commit**

```bash
cd /c/www/TasksFlow && git add server/routes.ts && git commit -m "feat(api): CRUD endpoints /api/api-keys"
```

---

### Task 6: Применить `requireAdminOrApiKey` к tasks/workers endpoints

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Заменить middleware на tasks endpoints**

В `server/routes.ts` найти 8 endpoints и заменить `requireAuth, requireAdmin` → `requireAdminOrApiKey`. Для простых `requireAuth` на read-only — заменить на `requireAuthOrApiKey`.

Конкретно:

Найти и заменить (по строкам из исследования):

```ts
  app.get(api.tasks.list.path, requireAuth, async (req, res) => {
```
на:
```ts
  app.get(api.tasks.list.path, requireAuthOrApiKey, async (req, res) => {
```

```ts
  app.get(api.tasks.get.path, requireAuth, async (req, res) => {
```
на:
```ts
  app.get(api.tasks.get.path, requireAuthOrApiKey, async (req, res) => {
```

```ts
  app.post(api.tasks.create.path, requireAuth, requireAdmin, async (req, res) => {
```
на:
```ts
  app.post(api.tasks.create.path, requireAdminOrApiKey, async (req, res) => {
```

```ts
  app.put(api.tasks.update.path, requireAuth, requireAdmin, async (req, res) => {
```
на:
```ts
  app.put(api.tasks.update.path, requireAdminOrApiKey, async (req, res) => {
```

```ts
  app.delete(api.tasks.delete.path, requireAuth, requireAdmin, async (req, res) => {
```
на:
```ts
  app.delete(api.tasks.delete.path, requireAdminOrApiKey, async (req, res) => {
```

```ts
  app.post(api.tasks.complete.path, requireAuth, async (req, res) => {
```
на:
```ts
  app.post(api.tasks.complete.path, requireAuthOrApiKey, async (req, res) => {
```

```ts
  app.post("/api/tasks/:id/uncomplete", requireAuth, async (req, res) => {
```
на:
```ts
  app.post("/api/tasks/:id/uncomplete", requireAuthOrApiKey, async (req, res) => {
```

Для workers list (найти `app.get("/api/workers"` или `api.workers.list.path` с requireAuth) — заменить на `requireAuthOrApiKey`.

- [ ] **Step 2: Заменить source of companyId в handlers**

В изменённых handlers раньше был `const user = await storage.getUserById(req.session.userId!); ... user.companyId`. Теперь source может быть и API key. Заменять на `const companyId = await getCompanyIdFromReq(req);`.

Найти в handlers которые мы затронули блоки типа:
```ts
const user = await storage.getUserById(req.session.userId!);
if (!user?.companyId) { ... }
const tasks = await storage.getTasks(user.companyId);
```

Заменять на:
```ts
const companyId = await getCompanyIdFromReq(req);
if (!companyId) {
  res.status(400).json({ message: "Company не определена" });
  return;
}
const tasks = await storage.getTasks(companyId);
```

Важно: не убирать userId-логику полностью — в некоторых местах нужен именно user для email нотификации / isAdmin check внутри handler. Там где используется `req.session.userId` для получения юзера — оставить as-is, но добавить fallback:

```ts
const userId = req.session?.userId;
const user = userId ? await storage.getUserById(userId) : null;
// Для API key — user = null, это нормально.
```

Просканировать все 8 изменённых handlers и либо переписать на companyId, либо (если userId нужен логике) добавить fallback с проверкой.

- [ ] **Step 3: Typecheck**

```bash
cd /c/www/TasksFlow && npx tsc --noEmit
```

Expected: чисто.

- [ ] **Step 4: Manual smoke**

```bash
pkill -f "npm run dev\|tsx server" 2>/dev/null; sleep 2
cd /c/www/TasksFlow && (npm run dev > /tmp/tf.log 2>&1 &) && sleep 6
# Используя plaintext ключ из Task 5 Step 3:
KEY="tfk_xxx_paste_here"
# GET tasks через API key — должен работать.
curl -H "Authorization: Bearer $KEY" http://localhost:5001/api/tasks 2>&1 | tail -3
# POST task (нужен реальный workerId из БД!).
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"API key test","workerId":1,"category":"Тест","price":100}' \
  http://localhost:5001/api/tasks 2>&1 | tail -5
# Без ключа — должен быть 401.
curl http://localhost:5001/api/tasks 2>&1 | tail -3
pkill -f "npm run dev\|tsx server" 2>/dev/null
```

Expected:
- GET с ключом → 200 с массивом (пусть даже пустым).
- POST с ключом → 200 или 201 с созданной task.
- GET без ключа → 401.

- [ ] **Step 5: Commit**

```bash
cd /c/www/TasksFlow && git add server/routes.ts && git commit -m "feat(api): tasks/workers endpoints принимают API key"
```

---

### Task 7: shared/routes.ts — добавить пути API keys

**Files:**
- Modify: `shared/routes.ts`

Цель — чтобы client использовал типизированные пути.

- [ ] **Step 1: Расширить api-объект**

В `shared/routes.ts` найти экспорт `export const api = { ... }`. Добавить секцию:

```ts
  apiKeys: {
    list: { method: "GET", path: "/api/api-keys" },
    create: { method: "POST", path: "/api/api-keys" },
    revoke: (id: number) => ({ method: "DELETE", path: `/api/api-keys/${id}` }),
  },
```

Exactness зависит от текущего стиля — либо статические объекты, либо фабричные функции. Адаптировать под соседние секции (`api.tasks`, `api.workers`).

- [ ] **Step 2: Typecheck**

```bash
cd /c/www/TasksFlow && npx tsc --noEmit
```

Expected: чисто.

- [ ] **Step 3: Commit**

```bash
cd /c/www/TasksFlow && git add shared/routes.ts && git commit -m "feat(shared): пути /api/api-keys"
```

---

### Task 8: Client UI — страница API ключей

**Files:**
- Create: `client/src/pages/api-keys.tsx` (или по соглашению проекта, определится по аналогии с другими страницами)
- Modify: client/src/App.tsx (или main router file) — добавить роут.
- Modify: меню навигации — добавить пункт «API ключи».

- [ ] **Step 1: Найти паттерны client**

Запустить:

```bash
ls /c/www/TasksFlow/client/src/pages/
cat /c/www/TasksFlow/client/src/App.tsx 2>/dev/null | head -50
```

Посмотреть: какой router (wouter, react-router), как рендерятся страницы settings, стиль API-вызовов (`fetch` напрямую, react-query).

- [ ] **Step 2: Страница api-keys.tsx**

Создать по найденному паттерну. Содержимое (адаптировать импорты к существующему стилю):

```tsx
import { useState, useEffect } from "react";

interface ApiKeyRow {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt: number;
  revokedAt: number;
}

function formatTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("ru-RU");
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [justCreated, setJustCreated] = useState<{ name: string; secret: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/api-keys", { credentials: "include" });
    if (r.ok) setKeys(await r.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const r = await fetch("/api/api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Ошибка" }));
        alert(err.message || "Не удалось создать");
        return;
      }
      const data = await r.json();
      setJustCreated({ name: data.name, secret: data.secret });
      setNewName("");
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: number, name: string) => {
    if (!confirm(`Отозвать ключ «${name}»? Все интеграции с ним сразу перестанут работать.`)) return;
    const r = await fetch(`/api/api-keys/${id}`, { method: "DELETE", credentials: "include" });
    if (!r.ok) { alert("Не удалось отозвать"); return; }
    await load();
  };

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h2 style={{ marginTop: 0 }}>API ключи</h2>
      <p style={{ color: "#666", marginTop: 0 }}>
        Используются сторонними сервисами (например managermagday) чтобы создавать задачи сотрудникам через API.
        Ключ показывается только один раз при создании.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Название (например: magday-backend)"
          style={{ flex: 1, padding: 8 }}
          maxLength={100}
        />
        <button onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? "..." : "Создать"}
        </button>
      </div>

      {loading ? <div>Загрузка...</div> : keys.length === 0 ? (
        <div style={{ color: "#888" }}>Нет ключей.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: 8 }}>Название</th>
              <th style={{ padding: 8 }}>Ключ</th>
              <th style={{ padding: 8 }}>Создан</th>
              <th style={{ padding: 8 }}>Использован</th>
              <th style={{ padding: 8 }}>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map(k => (
              <tr key={k.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: 8, fontWeight: 500 }}>{k.name}</td>
                <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>{k.keyPrefix}...</td>
                <td style={{ padding: 8, fontSize: 12 }}>{formatTs(k.createdAt)}</td>
                <td style={{ padding: 8, fontSize: 12 }}>{formatTs(k.lastUsedAt)}</td>
                <td style={{ padding: 8 }}>
                  {k.revokedAt ? <span style={{ color: "#c00" }}>отозван</span> : <span style={{ color: "#080" }}>активен</span>}
                </td>
                <td style={{ padding: 8 }}>
                  {!k.revokedAt && (
                    <button onClick={() => handleRevoke(k.id, k.name)} style={{ color: "#c00" }}>
                      Отозвать
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {justCreated && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setJustCreated(null)}
        >
          <div style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>⚠ Ключ создан</h3>
            <p>Этот ключ показывается ТОЛЬКО ОДИН РАЗ. Сохрани его сейчас — потом получить снова нельзя.</p>
            <div style={{
              background: "#f5f5f5", padding: 12, borderRadius: 4,
              fontFamily: "monospace", fontSize: 13, wordBreak: "break-all", marginBottom: 12,
            }}>
              {justCreated.secret}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => navigator.clipboard?.writeText(justCreated.secret)}>
                Копировать
              </button>
              <button onClick={() => setJustCreated(null)}>Готово</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Подключить роут в App.tsx (или router-файле)**

Найти где регистрируются routes (`<Route path="/settings" ... />` и т.д.). Добавить:

```tsx
import ApiKeysPage from "./pages/api-keys";
// ...
<Route path="/api-keys" component={ApiKeysPage} />
```

(Точный синтаксис зависит от роутера — wouter использует `component={}`, react-router `element={<X/>}`. Посмотреть соседние роуты.)

- [ ] **Step 4: Пункт меню**

Найти навигацию (NavBar/Sidebar). Добавить ссылку «API ключи» доступную только для admin. Если есть существующая «Настройки» — поместить туда под-пунктом.

- [ ] **Step 5: Build client**

```bash
cd /c/www/TasksFlow && npm run build 2>&1 | tail -10
```

Expected: успешный build без ошибок.

- [ ] **Step 6: Commit**

```bash
cd /c/www/TasksFlow && git add client/ && git commit -m "feat(ui): страница управления API ключами"
```

---

### Task 9: Tests

**Files:**
- Create: `tests/api-keys.test.ts`

- [ ] **Step 1: Unit тест helpers**

`tests/api-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, extractBearerKey } from "../server/api-keys";

describe("api-keys helpers", () => {
  it("generateApiKey возвращает префикс tfk_ и длина ≥ 40", () => {
    const k = generateApiKey();
    expect(k.startsWith("tfk_")).toBe(true);
    expect(k.length).toBeGreaterThanOrEqual(40);
  });

  it("generateApiKey каждый раз разный", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
  });

  it("hashApiKey детерминирован и 64 символа (hex)", () => {
    const k = "tfk_abcdef";
    const h1 = hashApiKey(k);
    const h2 = hashApiKey(k);
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(h1)).toBe(true);
  });

  it("hashApiKey разные входы → разные хэши", () => {
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });

  it("extractBearerKey парсит header", () => {
    const req: any = { headers: { authorization: "Bearer tfk_valid123" } };
    expect(extractBearerKey(req)).toBe("tfk_valid123");
  });

  it("extractBearerKey возвращает null на мусор", () => {
    expect(extractBearerKey({ headers: {} } as any)).toBe(null);
    expect(extractBearerKey({ headers: { authorization: "Basic xxx" } } as any)).toBe(null);
    expect(extractBearerKey({ headers: { authorization: "Bearer wrong_prefix" } } as any)).toBe(null);
  });
});
```

- [ ] **Step 2: Запустить тесты**

```bash
cd /c/www/TasksFlow && npm run test 2>&1 | tail -15
```

Expected: 6 passed tests.

- [ ] **Step 3: Commit**

```bash
cd /c/www/TasksFlow && git add tests/api-keys.test.ts && git commit -m "test(auth): unit тесты для API key helpers"
```

---

### Task 10: E2E smoke + push

- [ ] **Step 1: Полный сценарий локально**

```bash
pkill -f "npm run dev\|tsx server" 2>/dev/null; sleep 2
cd /c/www/TasksFlow && (npm run dev > /tmp/tf.log 2>&1 &) && sleep 6
echo "Открой http://localhost:5001 → войди как admin → Settings → API ключи"
```

Проверить вручную:
1. Страница «API ключи» открывается, показывает пустой список.
2. Создать ключ «test-smoke» → модалка с plaintext → копировать.
3. В списке появился ключ с `keyPrefix`, активен.
4. В новом терминале: `curl -H "Authorization: Bearer tfk_..." http://localhost:5001/api/tasks` → 200.
5. Обновить страницу «API ключи» → `lastUsedAt` обновился.
6. Клик «Отозвать» → confirm → статус стал «отозван».
7. Повторный curl → 401.
8. `curl -X POST .../api/api-keys ... -H "Authorization: Bearer tfk_revoked"` — нет, это только session-endpoint, ожидаем 401 от requireAuth.

Остановить:
```bash
pkill -f "npm run dev\|tsx server" 2>/dev/null
```

- [ ] **Step 2: Push**

```bash
cd /c/www/TasksFlow && git push 2>&1 | tail -3
```

Expected: коммиты улетают в main.

---

## Self-review

**Spec coverage:**
- Модель `api_keys` → Task 1.
- Storage методы → Task 2.
- Crypto + middleware → Task 3, 4.
- CRUD endpoints → Task 5.
- Применение к tasks/workers → Task 6.
- shared/routes пути → Task 7.
- Client UI → Task 8.
- Tests → Task 9.
- E2E → Task 10.

**Placeholder scan:** нет TBD. В Task 6 Step 2 есть фраза «Просканировать все 8 изменённых handlers» — это требует судить по месту; детали не жёстко заданы потому что handlers очень разные. Риск принят: работа мелкая, замена одной переменной.

**Type consistency:**
- `ApiKey` type из schema.ts используется в storage методах и middleware одинаково.
- `req.apiKey: ApiKeyContext` — определён в Task 3, используется в Task 4/5/6.
- `generateApiKey`, `hashApiKey`, `extractBearerKey` — все имена стабильны между задачами.
- Шаги создания ключа (Task 5 Step 1): генерируем plaintext → хешируем → режем prefix → INSERT. Согласовано с UI в Task 8 (читаем `secret` из ответа POST).

**Риски:**
- Task 6 может затронуть нюансы в handlers где сейчас `req.session.userId!` используется не для companyId а для другой логики (например отправка email на кого-то конкретного). Если после замены integration-тест падает — нужно fallback: у API key нет userId, значит некоторые user-specific поля типа «кто пометил как выполненную» становятся null. Это acceptable — API key != человек.
- Drizzle-kit `db:push --force` сейчас в package.json. На проде лучше явная миграция, но это существующий стиль проекта — не трогаю.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-api-key-auth.md`.

Inline execution через executing-plans.
