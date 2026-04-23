# AI Context: WeSetup (HACCP-Online)

> Этот файл создан для AI-агентов. Он содержит высокоуровневый обзор проекта, архитектуру, ключевые паттерны и недавние изменения. **Обновляй при значительных изменениях.**

---

## Что это за проект

**WeSetup (HACCP-Online)** — SaaS-платформа для автоматизации документооборота пищевых предприятий (рестораны, столовые, производства) по стандартам HACCP.

Основные функции:
- Электронные журналы (гигиена, температурный режим, инвентаризация, СИЗ, обучение, аудиты и т.д.)
- Telegram-бот + мини-апп для быстрого заполнения журналов с телефона
- **TasksFlow** — интеграция с внешней таск-системой: задачи создаются из журналов, сотрудники выполняют их через Telegram/WebApp, результат записывается обратно в журнал
- Автоматические напоминания, дайджесты, отчёты
- Экспорт в PDF

---

## Стек

| Слой | Технология |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| ORM | Prisma 7 |
| DB | PostgreSQL |
| Auth | NextAuth.js v5 (beta) |
| UI | Tailwind CSS 4, shadcn/ui |
| Telegram | Grammy (bot), Telegram WebApp SDK (mini-app) |
| TasksFlow | REST API + HMAC webhooks |
| Dev server | `npm run dev` → `localhost:3000` |

---

## Ключевые директории

```
src/
  app/                    # Next.js App Router
    (dashboard)/          # Защищённые маршруты (журналы, настройки)
    api/                  # API routes
      telegram/webhook/   # Входящие обновления от Telegram
      integrations/tasksflow/  # Webhooks от TasksFlow
      task-fill/[taskId]/      # Публичная страница заполнения задачи
    mini/                 # Telegram WebApp (мини-апп)
  components/             # React-компоненты
  lib/                    # Бизнес-логика, хелперы
    bot/                  # Grammy bot (handlers, start-response)
    tasksflow-adapters/   # Адаптеры журналов для TasksFlow ⭐
    *-document.ts         # Модели данных для каждого типа журнала
  content/                # SEO-контент (статьи)
prisma/
  schema.prisma           # Модель данных
```

---

## Критически важные паттерны

### 1. Config-based vs Entry-based журналы

**Важно понимать, когда пишешь TasksFlow-адаптеры или работаешь с данными журналов.**

| Тип | Где хранятся данные | Примеры |
|-----|-------------------|---------|
| **Entry-based** | `JournalDocumentEntry` (отдельная таблица) | `hygiene`, `health_check`, `climate` |
| **Config-based** | `JournalDocument.config` (JSONB) | `cleaning`, `equipment_maintenance`, `product_writeoff`, `staff_training`, `audit_plan` и т.д. |

**Правило**: Generic TasksFlow-адаптер (`src/lib/tasksflow-adapters/generic.ts`) работает **только** для entry-based журналов — он пишет в `JournalDocumentEntry`. Для config-based журналов **обязательно** нужен специфический адаптер, иначе данные не появятся в UI журнала.

### 2. TasksFlow Integration

```
Журнал (config/entries)
    ↓ syncDocument()
TaskLink (таблица связи журнал ↔ TasksFlow)
    ↓ createTask()
TasksFlow API
    ↓ worker fills form
/api/integrations/tasksflow/complete
    ↓ applyRemoteCompletion()
Журнал обновлён
```

**Где жить:** `src/lib/tasksflow-adapters/`
- `index.ts` — реестр адаптеров
- `types.ts` — контракт `JournalAdapter`
- `generic.ts` — fallback для entry-based
- `{templateCode}.ts` — специфические адаптеры (по одному на config-based журнал)

**Как добавить новый адаптер:**
1. Создать файл `src/lib/tasksflow-adapters/{код}.ts`
2. Реализовать `JournalAdapter` (мета, schedule, listDocuments, syncDocument, applyRemoteCompletion, getTaskForm)
3. Импортировать и добавить в `SPECIFIC_ADAPTERS` в `index.ts`
4. Проверить `npx tsc --noEmit`

### 3. Telegram Bot Architecture

- **Outbound** (`src/lib/telegram.ts`) — отправка сообщений, дайджестов, напоминаний
- **Inbound** (`src/lib/bot/bot-app.ts` + `src/app/api/telegram/webhook/route.ts`) — обработка входящих обновлений
- **Mini-app** (`src/app/mini/page.tsx`) — WebApp для сотрудников, авторизация через `initData`

**Bot token** и **webhook secret** лежат в `.env`.

**Локальное тестирование бота:** см. `docs/local-testing.md`.

### 4. Journal Data Models

Каждый тип журнала имеет свой `*-document.ts` файл в `src/lib/`:
- Типы: `{Type}DocumentConfig`, `{Type}Row`
- Константа: `{TYPE}_TEMPLATE_CODE`
- Factory: `create{Type}Row()`
- Normalization: `normalize{Type}Config()`

**Примеры:**
- `src/lib/cleaning-document.ts` — матрица уборки (`config.matrix`)
- `src/lib/staff-training-document.ts` — записи об инструктажах (`config.rows[]`)
- `src/lib/audit-plan-document.ts` — план аудитов (`config.rows[]`, `config.sections[]`, `config.columns[]`)

---

## Недавние изменения (актуальность: 2026-04-22)

### ✅ Массовая имплементация TasksFlow-адаптеров
Добавлены адаптеры для всех config-based журналов:
- `equipment_calibration`, `breakdown_history`, `accident_journal`
- `acceptance` (incoming_control + incoming_raw_materials_control)
- `metal_impurity`, `ppe_issuance`, `disinfectant_usage`
- `glass_list`, `staff_training`, `training_plan`
- `audit_plan`, `audit_protocol`, `audit_report`
- `traceability`

Все адаптеры зарегистрированы в `src/lib/tasksflow-adapters/index.ts`.
TypeScript компилируется чисто (`npx tsc --noEmit` ✅).

### ✅ Mobile responsiveness audit
Пройден аудит адаптивности на всех брейкпоинтах (320/375/640/768/1024).

---

## Частые задачи в этом проекте

| Задача | Где начинать | Что проверить |
|--------|-------------|--------------|
| Добавить новый журнал | `prisma/schema.prisma` → `src/lib/*-document.ts` → UI компонент | Данные видны в UI? Экспорт в PDF работает? |
| Добавить TasksFlow-адаптер | `src/lib/tasksflow-adapters/{код}.ts` → `index.ts` | `tsc --noEmit`, рантайм: создать задачу → заполнить → проверить журнал |
| Править Telegram-бота | `src/lib/bot/handlers/*.ts`, `src/lib/telegram.ts` | Локально: `scripts/bot-polling-local.ts` |
| Править мини-апп | `src/app/mini/page.tsx`, `src/app/mini/_components/*.tsx` | Открыть через туннель на телефоне |
| Править UI журналов | `src/components/journals/*.tsx` | Мобильная адаптивность, горизонтальный скролл |
| Работа с БД | `prisma/schema.prisma` → `npx prisma migrate dev` | Сидинг (`prisma/seed*.ts`) не сломан? |

---

## Ограничения и подводные камни

1. **No git push** — пользователь не пушит в origin (лимиты). Все изменения локальные. Если нужно сохранить работу — делай коммиты локально (`git commit`), но не пушь без явного разрешения.

2. **Windows environment** — PowerShell, не bash. Пути с `\`. Не используй `rm`, `cp`, `&&`, `||` — используй `Remove-Item`, `Copy-Item`, `;`, `if`.

3. **Dev server port** — обычно `:3000`, но если занят — Next.js переключается на `:3001`. Проверяй `Get-NetTCPConnection -LocalPort 3000`.

4. **Telegram WebApp требует HTTPS** — для локального тестирования нужен туннель (localtunnel/cloudflared/ngrok). См. `docs/local-testing.md`.

5. **Prisma + Next.js dev** — иногда Prisma Client устаревает после изменения схемы. Если видишь ошибки типа "Unknown field" — запусти `npx prisma generate`.

6. **TypeScript strictness** — проект на strict TypeScript. Любой новый код должен проходить `npx tsc --noEmit --project tsconfig.json`.

---

## Полезные команды

```powershell
# Dev server
npm run dev

# TypeScript check
npx tsc --noEmit --project tsconfig.json

# Prisma
npx prisma generate
npx prisma migrate dev
npx prisma db seed

# Tests
npm test

# Localtunnel (для Telegram тестирования)
npx localtunnel --port 3000

# Bot polling (локально)
npx tsx scripts/bot-polling-local.ts
```

---

## Контакты / владелец

Проект принадлежит пользователю (Ярослав). Он работает на Windows, использует Cursor/VS Code, Next.js dev сервер на `localhost:3000`. Telegram-бот: `@wesetupbot`.
