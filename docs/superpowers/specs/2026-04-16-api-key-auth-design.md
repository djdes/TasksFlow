# TasksFlow API Key Auth — Design

**Дата:** 2026-04-16

**Контекст:** TasksFlow сейчас поддерживает только session-based auth (cookies через `express-session`). Для server-to-server интеграций (в частности — `managermagday` будет автоматически создавать задачи сотрудникам при apply-плане) нужен механизм аутентификации без login-flow.

**Цель:** Добавить API key authentication параллельно существующему session auth. Ключ передаётся в заголовке `Authorization: Bearer tfk_...`. Все существующие admin-endpoints начинают принимать оба способа (session OR API key). Добавляется Admin UI для генерации и отзыва ключей.

---

## Scope

**В скоупе:**
- Таблица `api_keys` (drizzle schema + миграция).
- Middleware `requireApiKeyOrAuth` — авторизует либо session, либо API key.
- Admin UI: секция «API ключи» в настройках — создать, список, отозвать.
- Одноразовый показ `plaintext` ключа сразу после создания.
- Применение middleware ко всем endpoints которые сейчас используют `requireAuth + requireAdmin` и должны быть доступны извне: `/api/tasks` (GET/POST/complete/uncomplete), `/api/workers` (GET).
- Company-scoping: при auth через API key все данные фильтруются по `company_id` ключа (так же как через session — по `company_id` пользователя).
- `last_used_at` обновляется на каждый успешный запрос (без блокирующего await — fire-and-forget).

**НЕ в скоупе:**
- Rotation / автопродление ключей (срок жизни бесконечный до revoke).
- Rate limiting per-key (применяется глобальный rate limiter TasksFlow).
- Scopes / permissions (ключ = полные права company admin-а).
- Webhook'и обратно в managermagday — статусы подтянутся через polling со стороны managermagday.
- Смена email через API key — ключ только для tasks/workers.
- UI в managermagday для управления ключами — ключ админ вручную создаёт в TasksFlow и копирует в env.

---

## 1. Модель данных

### Таблица `api_keys`

```typescript
// shared/schema.ts
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),         // человеко-читаемое имя: «magday-backend»
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),  // SHA-256 hex (64 символа)
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),       // первые 12 символов ключа, для UI: «tfk_ab12cd34»
  companyId: int("company_id").notNull(),                    // FK на companies.id, ключ scoped к одной company
  createdByUserId: int("created_by_user_id").notNull(),      // FK на users.id
  createdAt: int("created_at").notNull().default(0),
  lastUsedAt: int("last_used_at").default(0),                // unix seconds, 0 = никогда
  revokedAt: int("revoked_at").default(0),                   // unix seconds, 0 = активен
});
```

### Формат ключа

- Префикс: `tfk_` (TasksFlow Key).
- Тело: 32 случайных байта в base64url-формате (URL-safe), ≈43 символа.
- Полный вид: `tfk_kJ8xQv4nP2wR9mZs7tLyFhBcEgD6uAiNhX1jV3oK` (47 символов).
- Хранится в БД только SHA-256 hash (`keyHash`), plaintext показывается юзеру ОДИН раз.
- `keyPrefix` = первые 12 символов plaintext (`tfk_kJ8xQv4n`) — сохраняется в БД для отображения в списке.

---

## 2. Middleware

### Новое: `requireApiKey`

```typescript
async function requireApiKey(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(tfk_[A-Za-z0-9_-]+)$/);
  if (!match) return res.status(401).json({ message: "API key отсутствует" });

  const plaintext = match[1];
  const hash = sha256hex(plaintext);
  const record = await storage.getApiKeyByHash(hash);
  if (!record) return res.status(401).json({ message: "Неверный API key" });
  if (record.revokedAt && record.revokedAt > 0) {
    return res.status(401).json({ message: "API key отозван" });
  }

  req.apiKey = { id: record.id, companyId: record.companyId, createdByUserId: record.createdByUserId };
  // fire-and-forget update
  storage.updateApiKeyLastUsed(record.id, Math.floor(Date.now() / 1000)).catch(() => {});
  next();
}
```

### Объединяющее: `requireAuthOrApiKey`

```typescript
async function requireAuthOrApiKey(req, res, next) {
  // Если есть Bearer-токен → пытаемся API key.
  if ((req.headers.authorization || "").startsWith("Bearer ")) {
    return requireApiKey(req, res, next);
  }
  // Иначе — классическая session.
  return requireAuth(req, res, next);
}
```

### Admin-уровень: `requireAdminOrApiKey`

Ключ всегда действует «как admin» (scoped к company). Поэтому:

```typescript
async function requireAdminOrApiKey(req, res, next) {
  if ((req.headers.authorization || "").startsWith("Bearer ")) {
    return requireApiKey(req, res, next);  // API key == admin
  }
  return requireAdmin(req, res, next);
}
```

### companyId resolver

Хелпер чтобы в хендлерах не дублировать логику:

```typescript
function getCompanyId(req): number | null {
  if (req.apiKey) return req.apiKey.companyId;
  if (req.session?.userId) {
    // ... текущая логика (storage.getUserById(req.session.userId).companyId)
  }
  return null;
}
```

---

## 3. Применение к endpoints

Заменяем `requireAuth, requireAdmin` на `requireAdminOrApiKey` в:

- `POST /api/tasks` — создание задачи
- `GET /api/tasks` — список задач company
- `GET /api/tasks/:id` — одна задача
- `POST /api/tasks/:id/complete` — пометить выполненной
- `POST /api/tasks/:id/uncomplete`
- `PUT /api/tasks/:id` — редактирование
- `DELETE /api/tasks/:id`
- `GET /api/workers` — список сотрудников company (для маппинга на стороне managermagday)

**Не меняем** (остаются только session, т.к. из API key нелогично):
- `/api/auth/*` — login/logout/me (API key не для аккаунтов)
- `/api/companies/register`, `/api/companies/me` PUT — управление компанией
- `/api/photos/upload` — загрузка пользователями через UI
- Всё что связано с SMS / bonus-balance — только users.

---

## 4. API для управления ключами (admin-only)

Все endpoints требуют session + isAdmin. Scoped к `companyId` админа.

### `POST /api/api-keys` — создать ключ

**Request body:** `{ name: string }` (1-100 символов, unique в пределах company).

**Response:**
```json
{
  "id": 7,
  "name": "magday-backend",
  "keyPrefix": "tfk_kJ8xQv4n",
  "createdAt": 1745... ,
  "secret": "tfk_kJ8xQv4nP2wR9mZs7tLyFhBcEgD6uAiNhX1jV3oK"
}
```

`secret` возвращается **только в этом ответе**. Последующие GET не содержат его.

### `GET /api/api-keys` — список (без секретов)

```json
[
  { "id": 7, "name": "magday-backend", "keyPrefix": "tfk_kJ8xQv4n",
    "createdAt": 1745..., "lastUsedAt": 1745..., "revokedAt": 0 }
]
```

Отсортирован по `createdAt DESC`.

### `DELETE /api/api-keys/:id` — отозвать

Ставит `revokedAt = unix now`. Не удаляет строку (аудит).

Response: `{ ok: true }`.

### Validation rules

- `name`: required, 1..100 символов, trim. Unique per `company_id` (чтобы два ключа «prod» не было).
- `:id`: должен принадлежать company из session, иначе 404.
- Нельзя создать ключ если `revoked_at IS NULL` counter >= **50** (лимит активных ключей на компанию — YAGNI, просто защита от флуда).

---

## 5. Admin UI

### Местоположение

`client/` — React-приложение TasksFlow. В существующей странице настроек компании (или на отдельной «Настройки → Интеграции») добавить секцию.

Точное место найти в код-базе в момент implementation — сейчас не критично.

### UX

**Список ключей:**

```
┌────────────────────────────────────────────────────────────┐
│ API ключи                            [+ Создать ключ]     │
├────────────────────────────────────────────────────────────┤
│ magday-backend        tfk_kJ8xQv4n...                     │
│ создан 12.04.2026  ·  использован 2 мин назад    [Отозвать] │
│                                                            │
│ test-key (отозван)   tfk_xx88aa00...                      │
│ создан 01.04.2026  ·  отозван 05.04.2026                  │
└────────────────────────────────────────────────────────────┘
```

**Создание:**

Модалка с полем «Название» → submit → показывается полный ключ один раз:

```
┌──────────────────────────────────────────────────────┐
│ ⚠  Ключ создан — сохрани его сейчас                 │
│                                                      │
│ Этот ключ показывается ТОЛЬКО ОДИН РАЗ.             │
│ После закрытия окна получить его снова нельзя.      │
│                                                      │
│ ┌──────────────────────────────────────────────┐    │
│ │ tfk_kJ8xQv4nP2wR9mZs7tLyFhBcEgD6uAiNhX1jV3oK │    │
│ └──────────────────────────────────────────────┘    │
│                              [Копировать]  [Готово] │
└──────────────────────────────────────────────────────┘
```

**Отзыв:**

confirm («Отозвать ключ X? Все интеграции использующие его сразу перестанут работать.») → DELETE → refresh list.

---

## 6. Логирование

- **Successful API key auth** — `console.log` в существующий logger: `[api-key] id=7 company=1 path=/api/tasks`. По debug-уровню чтобы не забивать prod.
- **Failed attempts** (неверный ключ / отозван) — warn: `[api-key] failed: {reason} prefix=tfk_xxx`. Ключ prefix (первые 12 символов) в логе, полный ключ НЕ логируется.
- **Создание ключа** — audit log: `[api-key] created id=7 name="magday-backend" by_user=3 company=1`.
- **Revoke** — аналогично.

Вся логика — через существующий `server/logger.ts`.

---

## 7. Edge cases

- **API key и session одновременно** — если есть оба, приоритет у API key (Bearer header проверяется первым).
- **Отозванный ключ используется** — 401 с message «API key отозван». Клиент должен увидеть ошибку и пересоздать ключ.
- **Неверный ключ (не нашли hash)** — 401 «Неверный API key». Не раскрываем «ключ отозван» если записи вообще нет — меньше info leakage.
- **Ключ создан в другой company чем admin** — при создании берём company_id из `req.session.userId → getUserById → companyId`. Нельзя создать ключ в чужую company.
- **Админ удаляется из company пока ключи активны** — ключи продолжают работать (они связаны с company, не с user). Это сознательное решение: если нужно заблокировать — явный revoke.
- **Одновременные запросы с одним и тем же ключом** — OK, middleware идемпотентен. `last_used_at` обновления fire-and-forget.

---

## 8. Тесты

Проект использует vitest. Добавляем `tests/api-keys.test.ts`:

1. **unit** для `hashApiKey(plaintext)` — возвращает 64-hex строку, детерминирован.
2. **unit** для middleware `requireApiKey`:
   - 401 если header отсутствует
   - 401 если header неверного формата (не Bearer)
   - 401 если ключ не найден в БД
   - 401 если ключ отозван
   - next() с `req.apiKey` заполнен если ключ валиден
3. **integration** через supertest: реальный POST /api/api-keys + POST /api/tasks с полученным ключом → 201.
4. **integration**: revoke → повторный POST /api/tasks → 401.

---

## 9. Deployment/migration

- `npm run db:push` автоматически создаст таблицу `api_keys` (drizzle-kit push).
- **Никаких breaking changes** — существующие session-клиенты не затронуты.
- **Env не требуется** (никаких новых переменных, ключи хранятся в БД).

---

## 10. Критерии приёмки

1. Админ TasksFlow открывает настройки → Интеграции → видит пустой список.
2. Клик «Создать» → вводит имя `magday-backend` → получает plaintext ключ, копирует его.
3. В терминале:
   ```
   curl -X POST http://localhost:5001/api/tasks \
     -H "Authorization: Bearer tfk_xxx" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","workerId":1,"category":"Тест","price":100}'
   ```
   → 201 с JSON задачей.
4. `GET /api/tasks` с тем же ключом → список задач этой company.
5. Админ нажимает «Отозвать» → confirm → ключ в списке помечен `(отозван)`. Повторный curl → 401.
6. Запрос без header / с мусорным Bearer → 401 с чётким сообщением.
7. Запрос с ключом на endpoint который не поддерживает API key auth (например `/api/companies/me` PUT) → 401 (требуется session).
8. В TasksFlow логах видны audit-записи создания и отзыва. В success-логах для каждого POST /api/tasks видно `api-key id=N company=M`.
