# Access-control audit — FINAL

## Verdict: PASS (с одной пофикшенной дырой)

Все три запрошенных уровня доступа работают после фикса коммита `4410930`.

## 1. ROOT видит панель со всеми компаниями — PASS

- `root@wesetup.ru` залогинился, `/root` открылся, показал **5 организаций**:
  Тестовая Регистрация Организации (basic 1/0), Тестовая Организация (extended 1/0), Тестовая организация (админ) (pro 30/59), test1 (trial 7/44), Домашняя кухня (trial 4/1).
- DB-контроль: в `Organization` 6 записей (включая `platform`) — ROOT скрывает `platform` и видит остальные 5. Точное совпадение.
- Non-root защита проверена для менеджера (`admin@haccp.local`): браузер открыл `/root` → title "404: This page could not be found." (page-level `requireRoot()` бросает `notFound()`).
- Скриншот: `root-all-orgs.png`.

**Оговорка.** HTTP-probing анонимных запросов:
| path | anon (ожидалось 404) | факт |
|---|---|---|
| `/garbage-xyz` | 404 | 404 |
| `/root` | 404 | **307 → /login** |
| `/root/organizations` | 404 | 404 |
| `/api/root/impersonate` (GET) | 404 | **405** |

Next.js 16 middleware matcher `["/root", "/root/:path*", "/api/root", "/api/root/:path*"]`
срабатывает для вложенных путей (`/root/organizations`), но **не** для голых
`/root` и `/api/root/impersonate`. Это мелкий info-leak (факт существования
раздела выдаётся), а не обход: авторизованные non-root всё равно получают
404 через `requireRoot()` в layout. Вне scope текущей задачи, но зафиксирую в
`problems.md` — фиксится заменой matcher на catch-all с фильтрацией в коде,
либо переводом `requireRoot()` на `getServerSession + notFound()` без
`requireAuth()`-редиректа.

## 2. Менеджер видит только сотрудников своей компании — PASS

- `admin@haccp.local` (role `owner`, orgId `cmnm40ikt00002ktseet6fd5y`) открыл `/settings/users`.
- UI показал **30 записей**, все `@haccp.local`. Ни одного пользователя из других орг
  (`cmmbrt40y0000rotsr41p4xh6`, `cmmbrv80c0002rotsjdsb7t2l`, `cmo1z2bks…`, `cmo1y0te2…`, `platform`).
- DB-контроль: `SELECT count(*) FROM "User" WHERE "organizationId" = 'cmnm40ikt00002ktseet6fd5y'` → **30**. Совпадение 1-в-1.
- Фильтрация живёт в `src/app/(dashboard)/settings/users/page.tsx:24`:
  `db.user.findMany({ where: { organizationId: getActiveOrgId(session) } })`.
- Скриншот: `manager-users-own-org-only.png`.

## 3. Сотрудник видит только назначенные журналы — PASS (после фикса)

### Проблема, которая была
`/journals` рендерила `db.journalTemplate.findMany({ where: { isActive: true } })`
для всех. Функция `getAllowedJournalCodes` в `src/lib/journal-acl.ts`
существовала, но не использовалась на листинге — защиту давал только
`hasJournalAccess` на `/journals/[code]/page.tsx` (404 после клика).

### Фикс
Коммит **`4410930 fix(journals/acl): filter home list by UserJournalAccess for employees`**.
- `src/app/(dashboard)/journals/page.tsx` теперь вызывает `getAllowedJournalCodes(aclActorFromSession(session))` и передаёт `{ code: { in: allowedCodes } }` в `findMany`, когда функция вернула не-null (то есть когда актёр — employee с `journalAccessMigrated=true`).
- Менеджеры, root и не-мигрированные сотрудники получают `null` → никакого фильтра, полный список (ноль регрессии для существующих заказчиков).

### Проверка на проде
- Тестовая раздача ACL coldcook1@haccp.local: `journalAccessMigrated=true`, 3 строки `UserJournalAccess` (hygiene, cleaning, fryer_oil).
- Логин coldcook1, `/journals`:
  - Hero: "Всего 3 / Базовых 3 / Расширенных 0 / Обязательных 3".
  - Видны ровно 3 карточки с корректными иконками; расширенная секция скрыта.
- Прямое обращение:
  - `fetch('/journals/hygiene')` → **200** (разрешено).
  - `fetch('/journals/climate_control')` → **404** (не выдавалось).
- Скриншот: `employee-3-journals.png`.

### Возврат состояния
- `revert-acl.sql` откатил `journalAccessMigrated=false` + удалил 3 ACL-строки.
- `pm2 reload haccp-online --update-env` сбросил in-memory LRU ACL-кэш (60с TTL).
- Проверка после отката: coldcook1 снова видит 35/35 (bypass по `!migrated`).

## Артефакты
- `plan.md` — *(отсутствует; правка точечная, план хранится в этом FINAL)*
- `grant-acl.sql`, `revert-acl.sql` — транзакции, локальные и идентичные выполненным на проде.
- `manager-users-own-org-only.png`, `root-all-orgs.png`, `employee-3-journals.png`.
- Проверенный билд: `.build-sha = 4410930` на `https://wesetup.ru`.

## Итог
- ROOT → `/root` со всеми 5 орг ✓
- Менеджер → только своя орг (30/30) ✓
- Сотрудник → только назначенные журналы (3/3, `/journals` + прямой URL) ✓

Отдельный мелкий info-leak middleware-matcher'а — в `problems.md`.
