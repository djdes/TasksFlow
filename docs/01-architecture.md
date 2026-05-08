# TasksFlow — Architecture & Anti-Regression Plan

**Date:** 2026-05-08
**Соответствие:** `c:\www\Wesetup.ru\docs\superpowers\specs\01-architecture.md` (sister project — те же principles, упрощённые под Express+Drizzle stack).

## Что было

- **1325 unit-тестов в 83 файлах** уже есть (солидно). Но:
- Они не запускались в CI до прода. Прод-deploy через SSH стартовал **без всякой проверки** на push в master.
- Не было pre-commit hook'а — сломанный код мог попасть в master без локальной проверки.
- 28.04.2026 произошёл инцидент с потерей прод-БД из-за `drizzle-kit push --force`. После этого `db:push` и `setup-db` заблокированы в package.json, миграции — точечные `add-*-col` / `create-*-table` скрипты.

## Что добавлено (Phase 1)

1. **CI gate в .github/workflows/deploy.yml**: новый job `ci-gate` запускается ДО `deploy`. Делает `npm ci → npm run check → npm test`. Если что-то падает — deploy не стартует. Регрессии больше не уезжают на прод автоматически.

2. **Pre-commit hook (.husky/pre-commit)**: на каждый локальный `git commit` запускается `tsc --noEmit` + `vitest run`. Если новый коммит сломал что-то — commit блокируется.

3. **`prepare` script + activated `core.hooksPath`**: при `npm install` husky подключается автоматически. Если кто-то клонирует свежий репо и сразу коммитит — гард уже работает.

4. **`test:gate` script** — `npm run check && npm test` одной командой для локального проверочного прогона.

## Принципы которые соблюдаем

| Правило | Почему |
|---------|--------|
| **Tests-first для bug-fix'ов** | Без теста баг возвращается через 2 недели в новом виде. После 28.04.2026-инцидента это критично. |
| **Не блокировать deploy легаси-fail'ами** | TF baseline = 1325 pass / 0 fail. Любой fail = регрессия. Если у TF появятся легаси — добавим baseline по схеме Wesetup. |
| **Контракты явные**: schema.ts (Drizzle) + zod на ввод | Нельзя пихнуть произвольные поля в storage methods. Каждый endpoint валидирует body zod-схемой. |
| **HMAC для cross-system** | WeSetup ↔ TF callback'и через webhookSecret. Нельзя подделать чужую запись. |
| **Никаких --force / drop в db-скриптах** | Урок 28.04.2026. Каждая миграция — additive `ALTER TABLE`. |

## Anti-patterns (не делаем)

- **Direct query в обход storage layer** — все DB-операции через `IStorage` интерфейс (см. `server/storage.ts`).
- **Catch-all `try/catch { /* swallow */ }`** — caller должен решать как обрабатывать. Минимум `console.warn` + telemetry.
- **`as any` в типах** — узкий тип + exhaustive switch, иначе runtime crash.
- **Хардкод client-side секретов** — все ключи через env, шифрованы через `api-key-encrypted` storage.
- **Drift между schema.ts и реальной БД** — миграции применяются ТОЛЬКО через скрипты в `script/` (audited diff'ом до запуска).

## Слои (текущая структура)

```
server/
├── routes.ts          # HTTP routes (3000+ строк — TODO Phase 2 split)
├── storage.ts         # IStorage interface + реализация (Drizzle queries)
├── auth.ts            # session middleware + requireAuth/requireAdmin
├── api-key-storage.ts # API keys + encryption
├── webhook-queue.ts   # outbound webhooks к WeSetup, retry-логика
├── mail.ts            # SMTP / templates
├── url-allowlist.ts   # safelist для outbound URL'ов (защита от SSRF)
└── ...

shared/
├── schema.ts          # Drizzle schema = source of truth для DB
└── journal-link.ts    # JournalLink Zod schema (для cross-system контракта)

client/
└── src/               # React UI (vite-bundled)

tests/
└── *.test.ts          # 1325 vitest tests (covers storage, routes, parsing)

script/
└── *.ts              # одноразовые миграции / админ-задачи (point-in-time)
```

## Phase 2 — план (не делаем сейчас)

- **Split `server/routes.ts`** (3000+ строк) на feature-modules: `routes/auth.ts`, `routes/tasks.ts`, `routes/api-keys.ts`, `routes/wesetup-callback.ts`. Каждый — registers routes на `app`.
- **Branded types**: `UserId`, `CompanyId`, `TaskId` — компилятор не даст перепутать.
- **Sentry-style observability**: console.error → структурированный logger с уровнями.
- **Snapshot tests** для critical client-side компонентов (Dashboard, TaskViewDialog).
- **Per-endpoint contract tests** — прогоняем на каждый ride: same request → same response shape.

## Workflow с этого момента

1. **Перед коммитом**: pre-commit запустит typecheck + tests. Сломал — exit 1, коммит блокируется.
2. **Перед merge в main**: GitHub Actions ci-gate job. Сломал — deploy не идёт.
3. **При merge / manual dispatch**: deploy job через SSH к прод-серверу. Тесты УЖЕ прошли — фиксы реально доезжают.
4. **Если бажно**: пишешь test ДО fix'а, fix покрывает test, коммитишь оба.

«Сломал → сначала тест → потом фикс». Без теста баг возвращается через 2 недели.
