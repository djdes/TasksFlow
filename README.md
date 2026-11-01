# TasksFlow

Система управления ежедневными задачами с оплатой за выполнение. React + Express + MySQL.

## Quick Start

```bash
npm ci
cp .env.example .env   # MYSQL_*, SESSION_SECRET; остальные переменные — ENV.md
npm run dev            # http://localhost:5000
```

Первый админ появляется при регистрации компании на `/register/company`.

**Схема базы.** `npm run setup-db` и `npm run db:push` заблокированы: 28.04.2026
`DROP TABLE` из `script/create-tables.ts` и `drizzle-kit push --force` уничтожили боевую базу.
Пустую базу собирают так:

1. Таблицы `users`, `companies`, `workers`, `tasks` — из SQL, который печатает
   `npx drizzle-kit export --dialect=mysql --schema=./shared/schema.ts`. Команда к базе не подключается.
2. Остальное — скрипты `script/` в том порядке, в каком их запускает шаг «safe migrations»
   в `.github/workflows/deploy.yml`, и затем те, которых в деплое нет (таблицы `sessions`,
   `audit_log`, `webhook_deliveries`, `banners`, колонки email-входа, `is_root`, чек-листа,
   индексы). Полный список в нужном порядке — функция `migrate()` в
   `.claude/skills/dev-stand/stand.sh`. Скрипты идемпотентны.

В облачной сессии Claude то же самое делает `bash .claude/skills/dev-stand/stand.sh`: он поднимает
MariaDB, схему и демо-данные. Новая колонка — это новый точечный скрипт в `script/` и строка
в `deploy.yml`, а не правка через `drizzle-kit push`.

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
├─────────────────────────────────────────────────────────────┤
│  React SPA (Vite)                                           │
│  ├── wouter (routing)                                       │
│  ├── TanStack Query (server state)                          │
│  ├── React Hook Form + Zod (forms)                          │
│  └── Tailwind + Shadcn/ui (styling)                         │
├─────────────────────────────────────────────────────────────┤
│  Express.js API                                             │
│  ├── express-session (auth)                                 │
│  ├── multer (file uploads)                                  │
│  └── Drizzle ORM (database)                                 │
├─────────────────────────────────────────────────────────────┤
│  MySQL Database                                             │
│  └── схема: shared/schema.ts                                │
└─────────────────────────────────────────────────────────────┘
```

## Роли пользователей

- **Администратор** (`users.is_admin`) — всё в своей компании.
- **Своя роль компании** (`company_roles`, «Роли и права» в «Сотрудниках») — набор прав:
  «Ставит задачи», «Добавляет сотрудников», «Принимает задачи», «Видит отчёты», «Своё — на проверку».
- **Руководитель из WeSetup** (`managed_worker_ids`) — свои люди.
- **Сотрудник** — свои задачи на сегодня, фото, баланс премий.

Модель прав одна — `shared/roles.ts`, сервер считает их в `server/access.ts`.

## База данных

Источник правды о схеме — `shared/schema.ts` (Drizzle, MySQL/MariaDB). Как собрать пустую базу
и добавить колонку — в Quick Start выше.

## Скрипты

```bash
npm run dev          # Dev сервер с hot reload
npm run build        # Сборка для production
npm start            # Запуск production
npm run check        # TypeScript проверка
npm test             # Unit-тесты (vitest)
npm run smoke        # UI smoke в браузере, после npm run build

npm run reset-tasks  # Ручной сброс задач (сервер и так сбрасывает в полночь компании)
npm run backup-db    # mysqldump в ~/backups (деплой делает его перед миграциями)
```

Миграции — точечные `npm run add-*` / `create-*` из `package.json`, порядок — в `deploy.yml`.

## Production

Push в `main` выкатывает прод сам: проверки, бэкап базы, миграции, сборка, `pm2 reload`
и откат, если новая сборка не ответила на `/api/health`. Как это устроено, секреты, новый
сервер и cron сброса задач — [DEPLOY.md](./DEPLOY.md).

## Переменные окружения

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| MYSQL_HOST | Да | Хост MySQL |
| MYSQL_USER | Да | Пользователь MySQL |
| MYSQL_PASSWORD | Да | Пароль MySQL |
| MYSQL_DATABASE | Да | Имя базы данных |
| SESSION_SECRET | Да | Секрет для сессий (мин. 32 символа) |
| PORT | Нет | Порт сервера (по умолчанию 5000) |

Полный список — [ENV.md](./ENV.md) и [.env.example](./.env.example).

## Документация

- [AGENTS.md](./AGENTS.md) - Правила и устройство проекта для разработчиков и агентов (CLAUDE.md подключает его же)
- [docs/01-architecture.md](./docs/01-architecture.md) - Защита от регрессий: CI, pre-commit, правила миграций
- [ENV.md](./ENV.md) - Переменные окружения
- [API.md](./API.md) - Примеры API запросов
- [DEPLOY.md](./DEPLOY.md) - Автодеплой из `main`, секреты, новый сервер, сброс задач
- [docs/mobile.md](./docs/mobile.md) - Приложения для Android и iPhone, push-уведомления, публикация в магазинах
- [docs/billing.md](./docs/billing.md) - Оплата тарифов через Робокассу: подключение магазина, автопродление, цены

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui
- **Backend:** Express.js, TypeScript, Drizzle ORM
- **Database:** MySQL
- **State:** TanStack Query, React Context
- **Forms:** React Hook Form, Zod
- **Routing:** wouter
