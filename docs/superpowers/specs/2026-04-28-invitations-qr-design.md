# Приглашения сотрудников через QR-код — design

**Дата:** 2026-04-28
**Статус:** утверждён к реализации
**Автор:** Claude (по задаче от Хозяина)

## 1. Цель

Убрать рутину при добавлении сотрудника в компанию. Сейчас админ обязан вручную создать `User` через UI или знать заранее телефон сотрудника. Хотим: админ нажимает «Сгенерировать QR» → получает QR-код / ссылку → отправляет сотруднику → сотрудник сам вводит имя и телефон и попадает в кабинет той же компании.

Не цель: массовая авторегистрация через общий QR компании, SMS-подтверждение, email-рассылка приглашений.

## 2. Решения, принятые в брейншторме

| Вопрос | Решение |
|---|---|
| Сценарий | Персональный QR на одного человека, инициирует админ. Сотрудник сам вводит свои данные. |
| Срок жизни ссылки | Без TTL, одноразовая. Используется один раз или отзывается админом. |
| Поля в форме сотрудника | Минимум — имя + телефон. Админ при генерации может опционально предзадать `position` и `role`. |
| После регистрации | Авто-логин (выставляется `req.session.userId`), редирект в `/dashboard`. |
| UI в кабинете админа | Кнопка «Сгенерировать QR» + модалка с QR + список активных приглашений с возможностью отозвать. История использованных/отозванных — под аккордеоном «Показать историю». |

## 3. Архитектура

### 3.1. Новая таблица `invitations`

В `shared/schema.ts`, MySQL + Drizzle:

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
```

Миграция применяется через `drizzle-kit push` (как остальная схема в проекте — отдельной папки `migrations/` нет).

«Активным» считается `usedAt IS NULL AND revokedAt IS NULL`.

### 3.2. Инварианты

- Токен генерится **только сервером**: `crypto.randomBytes(32).toString('base64url')` — 256 бит энтропии, длина строки ~43 символа. Колонка `varchar(64)` оставлена с запасом.
- `companyId` приглашения берётся из `getCompanyIdFromReq(req)` админа-создателя. Клиент `companyId` не передаёт.
- Приглашение никогда не модифицирует существующих `users`. Если телефон занят — accept возвращает 400, приглашение остаётся активным (юзер может попробовать другой телефон по той же ссылке).
- Приглашение помечается `used` атомарно — `UPDATE ... WHERE id = :id AND usedAt IS NULL` — для защиты от race conditions.

## 4. API

Все ручки добавляются в `server/routes.ts`. Контракты — в `shared/routes.ts` под `api.invitations.*` (по образцу `api.users.*`).

### 4.1. `POST /api/invitations` — создать

- **Auth:** `requireAdmin` (только session-админ; через API key не разрешаем — это UI-функция).
- **Body:** `{ position?: string | null, role?: 'admin' | 'manager' | 'employee' }`. Все поля опциональны.
- **Логика:**
  1. `companyId = await getCompanyIdFromReq(req)` → если `null` → 400 «Company не определена».
  2. `token = crypto.randomBytes(32).toString('base64url')`.
  3. `isAdmin = role === 'admin' || role === 'manager'` (та же логика, что в `POST /api/users`).
  4. Insert в `invitations` (`createdByUserId = req.session.userId`, `createdAt = Math.floor(Date.now() / 1000)`).
  5. Ответ 201: `{ id, token, url, position, isAdmin, createdAt }`, где `url = ${PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'))}/join/${token}`.

### 4.2. `GET /api/invitations` — список

- **Auth:** `requireAdmin`.
- **Query:** `?includeAll=true` — вернуть всё (включая использованные/отозванные); без флага — только активные.
- **Response:** `Invitation[]` в порядке `createdAt DESC`, фильтр по `companyId` админа.

### 4.3. `POST /api/invitations/:id/revoke` — отозвать

- **Auth:** `requireAdmin`.
- **Логика:**
  1. Найти приглашение, проверить `companyId === admin.companyId`. Чужое → 404.
  2. Если уже `usedAt` или `revokedAt` → 400 «приглашение уже неактивно».
  3. `UPDATE invitations SET revokedAt = :nowSec WHERE id = :id`, где `:nowSec = Math.floor(Date.now() / 1000)` (колонка `int`, не `datetime` — единый формат с остальной схемой проекта).
  4. Ответ 200 с обновлённой записью.

### 4.4. `GET /api/invitations/by-token/:token` — публичное превью

- **Auth:** нет.
- **Логика:**
  1. Найти приглашение по `token`.
  2. Если не найдено / `usedAt` / `revokedAt` → 200 `{ valid: false, reason: 'not_found' | 'used' | 'revoked' }`.
  3. Иначе → 200 `{ valid: true, companyName, position }`.
- **Намеренно не отдаём** `companyId`, `createdByUserId`, `isAdmin`, `id` — публичной странице это не нужно.

### 4.5. `POST /api/invitations/by-token/:token/accept` — принять

- **Auth:** нет.
- **Body:** `{ phone: string, name: string }`. Валидация телефона — `loginSchema.shape.phone` (та же нормализация, что в существующем `/api/users/register`).
- **Логика:**
  1. Найти приглашение по `token`. Если нет / `usedAt` / `revokedAt` → 400 `{ reason: 'not_found' | 'used' | 'revoked' }`.
  2. Нормализовать `phone`. `getUserByPhone` → если занято → 400 `{ message: 'Пользователь с таким номером уже существует', field: 'phone' }`. Приглашение **не помечаем** `used`.
  3. `storage.createUser({ phone, name, isAdmin: invitation.isAdmin, companyId: invitation.companyId, position: invitation.position })`.
  4. Атомарно: `UPDATE invitations SET usedAt = :nowSec, usedByUserId = user.id WHERE id = :id AND usedAt IS NULL AND revokedAt IS NULL`. Если `affectedRows === 0` → удалить только что созданного `user`, определить причину (`usedAt` или `revokedAt`) повторным `SELECT` и вернуть 400 с правильным `reason`.
  5. `req.session.userId = user.id` (авто-логин).
  6. Ответ 201: `{ user, company: { id, name } }`.

## 5. Frontend

### 5.1. Роуты в `client/src/App.tsx`

```tsx
<Route path="/admin/invitations" component={Invitations} />
<Route path="/join/:token" component={JoinByInvite} />
```

Стек существующий: Wouter + React Query + shadcn/ui.

### 5.2. `client/src/pages/Invitations.tsx`

- Заголовок «Приглашения сотрудников» + краткий пояснительный текст.
- Кнопка **«Сгенерировать QR»**:
  - Шаг 1 — модалка с опциональными полями `position` (text input) и `role` (radio: «Сотрудник» / «Менеджер» / «Админ», по умолчанию «Сотрудник»). Кнопка «Создать».
  - Шаг 2 — после успеха `POST /api/invitations`: показ QR (canvas через библиотеку `qrcode`), под ним сама ссылка моноширинно. Кнопки: **«Скопировать ссылку»**, **«Поделиться»** (через `navigator.share`, если доступен; иначе скрыта), **«Сохранить QR»** (download canvas как PNG).
- **Список активных приглашений:** строки с датой создания, должностью (если есть), ролью, действиями: «Показать QR» (открывает шаг 2), «Копировать ссылку», «Отозвать» (с confirm).
- Аккордеон **«Показать историю»** → подгружает `?includeAll=true`, использованные/отозванные показывает серым с метками `✓ принял такой-то, тогда-то` / `✗ отозвано тогда-то`.
- Под капотом: `useQuery(['/api/invitations'])`, `useMutation` для create/revoke, `invalidateQueries` после.

### 5.3. Точка входа в раздел

Добавить пункт «Приглашения» в админ-навигацию (там же, где сейчас пункты `/admin/users`, `/admin/settings`, `/admin/api-keys`). Точное место навигации уточняется на этапе плана — впишусь в существующий компонент.

### 5.4. `client/src/pages/JoinByInvite.tsx`

Маршрут `/join/:token`. Публичный, не требует auth.

1. На маунте — `GET /api/invitations/by-token/:token`.
2. Состояния:
   - Loading — спиннер.
   - `valid: false` → большой экран «Ссылка недействительна», текст по `reason`:
     - `not_found` → «Ссылка не найдена. Уточните её у администратора».
     - `used` → «Эта ссылка уже использована».
     - `revoked` → «Администратор отозвал это приглашение».
   - `valid: true` → форма:
     - Заголовок: «Регистрация в компании **{companyName}**», под ним мелким — «Должность: {position}» (если есть).
     - Поля: `name` (обязательно), `phone` (тот же phone-input компонент, что в `Login` / `RegisterUser` — единый UX и нормализация).
     - Кнопка «Зарегистрироваться».
3. Submit → `POST /api/invitations/by-token/:token/accept`. На успехе — Toast «Добро пожаловать!», `setLocation('/dashboard')`. На ошибке — inline-сообщение под полем (по `field` из ответа).

### 5.5. Mobile

Обе страницы — mobile-first (стандарт TasksFlow). Модалка на узком экране → full-screen sheet. QR — квадрат `min(80vw, 320px)`. Форма `/join/:token` — без сайдбара/навигации, чистый минимум.

### 5.6. Зависимость

Одна новая npm-зависимость: `qrcode` (~70 KB, без peer-deps, поддерживает canvas + svg).

## 6. Безопасность

- 256 бит энтропии в токене → перебор нереален. Хранение plain — это разовый bearer для регистрации, не пароль.
- Публичные ручки `by-token/*` отдают только `companyName` + `position`. Никаких других данных.
- Owner-check на revoke: чужое приглашение → 404 (не 403, чтобы не подтверждать существование).
- Rate limiting на публичных ручках: 20 запросов/минуту с одного IP. Реализация — простой in-memory middleware либо `express-rate-limit`, если уже подключён в проекте (уточняется на этапе плана).
- Логи на create/use/revoke содержат `invitationId`, `companyId`, `actorUserId` — без токена.

## 7. Edge cases

| Случай | Поведение |
|---|---|
| Ссылку отозвали, пока сотрудник заполнял форму | Submit вернёт 400 `{ reason: 'revoked' }` → редирект на тот же экран с сообщением. |
| Двое сабмитят одну ссылку одновременно | Атомарный UPDATE с `WHERE usedAt IS NULL`. Один успех, у второго — 400 `{ reason: 'used' }`, его созданный `user` откатывается. |
| Телефон уже занят в этой компании | 400 «уже существует»; приглашение **остаётся активным** (можно ввести другой телефон). |
| Телефон занят в другой компании | То же 400. Глобальная уникальность телефона сохраняется. Сообщение нейтральное. |
| Окно закрыто до сабмита | Ничего не происходит, ссылка ещё активна. |
| Админ-создатель удалён/переведён | `createdByUserId` остаётся для аудита. На активность приглашения не влияет — оно живёт по `companyId`. |
| Компанию удалили | Orphan-приглашение. В коде сейчас нет пути удаления компании — если появится, добавим cascade. |
| `PUBLIC_BASE_URL` не задан, прод за reverse-proxy | Фолбек `req.protocol + '://' + req.get('host')`. Требует корректной настройки `trust proxy` в Express — проверяется на этапе плана. |
| Пустой/whitespace `name` | `z.string().trim().min(1)`. |

## 8. Тестирование

Использовать существующий тест-фреймворк проекта (`npm run test`; конкретный фреймворк — vitest или jest — уточняется на этапе плана).

### Server

1. `POST /api/invitations` от админа → создаёт активное, отдаёт URL.
2. `POST /api/invitations` без сессии / без admin → 401/403.
3. `GET /api/invitations` — возвращает только приглашения своей компании, не чужой.
4. `POST /api/invitations/:id/revoke` — собственное → ok; чужое → 404; уже использованное → 400.
5. `GET /api/invitations/by-token/:token` — `valid: true` для активного; `valid: false` с правильным `reason` для not_found / used / revoked.
6. `POST /api/invitations/by-token/:token/accept` happy path — создаёт `user`, метит приглашение, выставляет `req.session.userId`, копирует `position` и `isAdmin` из приглашения.
7. Race: 2 параллельных `accept` на один токен → ровно один успех, второй 400 `{ reason: 'used' }`, в БД ровно один новый `user`.
8. Дубль телефона: `accept` с уже занятым телефоном → 400, приглашение остаётся активным (`usedAt IS NULL`).

### Client (smoke)

1. `/admin/invitations` рендерится только админу; не-админ — редирект.
2. Submit формы создания → появляется модалка с QR + ссылкой.
3. `/join/:token` для невалидного токена показывает корректный текст по `reason`.

## 9. Не делаем сейчас (YAGNI)

- TTL ссылки.
- SMS-подтверждение телефона.
- Bulk-генерация N приглашений за раз.
- Email-рассылка ссылок (есть `navigator.share` и копирование).
- Аналитика «сколько приглашений → юзеров» (данные уже есть в `usedAt`/`usedByUserId`, можно добавить позже).

## 10. Файлы, которые затронем

**Backend:**
- `shared/schema.ts` — таблица `invitations`, типы.
- `shared/routes.ts` — секция `api.invitations.*`.
- `server/storage.ts` — методы `createInvitation`, `getInvitationByToken`, `getInvitationsByCompany`, `markInvitationUsed` (атомарно), `revokeInvitation`.
- `server/routes.ts` — 5 новых ручек, опционально rate-limit middleware.
- `.env` (документация) — опциональная `PUBLIC_BASE_URL`.

**Frontend:**
- `client/src/App.tsx` — два новых роута.
- `client/src/pages/Invitations.tsx` (новый).
- `client/src/pages/JoinByInvite.tsx` (новый).
- Существующий компонент админ-навигации — добавить пункт «Приглашения».
- `package.json` — зависимость `qrcode`.

**Тесты:** в существующей тестовой папке проекта.
