# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

**ВАЖНО:**
- Все сообщения коммитов писать на **русском языке**
- После каждого коммита автоматически делать `git push origin main`
- Формат коммита: краткое описание изменений на русском

Пример:
```bash
git commit -m "Исправлен скролл на мобильных устройствах"
git push origin main
```

## Build & Development Commands

```bash
npm run dev              # Start dev server with hot reload
npm run build            # Build for production (client + server)
npm start                # Run production build
npm run check            # TypeScript type checking
npm run test             # Run tests (vitest)
npm run test:watch       # Run tests in watch mode
npm run db:push          # Push Drizzle schema changes to MySQL
npm run db:indexes       # Add database indexes for performance
npm run setup-db         # Initialize database tables
npm run create-admin     # Create initial admin user
npm run update-tasks     # Run task table migrations
npm run reset-tasks      # Reset recurring tasks (daily cron job)
```

## Architecture Overview

**TasksFlow** is a full-stack recurring task management system with React frontend and Express backend, both in TypeScript.

### Project Structure
```
TasksFlow/
├── client/src/
│   ├── components/           # React components
│   │   ├── ui/               # Shadcn/ui базовые компоненты (16 файлов)
│   │   ├── EditTaskDialog.tsx      # Диалог редактирования задачи
│   │   ├── TaskViewDialog.tsx      # Просмотр задачи + загрузка фото
│   │   ├── DuplicateTaskDialog.tsx # Дублирование задачи
│   │   ├── CreateWorkerDialog.tsx  # Создание сотрудника
│   │   └── EditWorkerDialog.tsx    # Редактирование сотрудника
│   ├── contexts/
│   │   └── AuthContext.tsx   # Глобальное состояние авторизации (login/logout/user)
│   ├── hooks/
│   │   ├── use-tasks.ts      # CRUD операции для задач (TanStack Query)
│   │   ├── use-workers.ts    # CRUD операции для сотрудников
│   │   ├── use-users.ts      # Получение списка пользователей
│   │   └── use-toast.ts      # Toast уведомления
│   ├── pages/
│   │   ├── Login.tsx         # Страница входа по номеру телефона
│   │   ├── Dashboard.tsx     # Главная страница со списком задач
│   │   ├── AdminUsers.tsx    # Управление пользователями (только админ)
│   │   ├── CreateTask.tsx    # Создание задачи
│   │   ├── EditTask.tsx      # Редактирование задачи
│   │   ├── CreateWorker.tsx  # Создание сотрудника
│   │   └── EditWorker.tsx    # Редактирование сотрудника
│   ├── lib/
│   │   ├── queryClient.ts    # Настройка TanStack Query
│   │   └── utils.ts          # Утилиты (cn для classnames)
│   ├── App.tsx               # Роутинг (wouter) + провайдеры
│   ├── main.tsx              # Точка входа React
│   └── index.css             # Все стили приложения (Tailwind + кастомные)
├── server/
│   ├── index.ts              # Express сервер, сессии, rate limiting, graceful shutdown
│   ├── routes.ts             # ВСЕ API эндпоинты + middleware авторизации
│   ├── storage.ts            # Data Access Layer (SQL запросы через Drizzle)
│   ├── logger.ts             # Логирование через Pino (dev: pretty, prod: JSON)
│   ├── db.ts                 # Подключение к MySQL (Drizzle ORM)
│   ├── mail.ts               # Отправка email при выполнении задачи
│   ├── vite.ts               # Dev-режим с Vite
│   └── static.ts             # Раздача статики в production
├── tests/
│   └── schema.test.ts        # Тесты валидации Zod схем
├── shared/
│   ├── schema.ts             # Drizzle схема БД + Zod валидация + TypeScript типы
│   └── routes.ts             # Описание API эндпоинтов с Zod схемами
└── script/                   # Скрипты миграций БД
```

## Detailed File Descriptions

### Frontend (client/src/)

#### App.tsx
- Главный файл приложения
- Роутинг через `wouter` (Switch/Route)
- Провайдеры: QueryClientProvider, AuthProvider, TooltipProvider, Toaster
- ScrollToTop компонент для сброса скролла при переходах
- Отключает автоматический scroll restoration браузера

#### pages/Login.tsx
- Авторизация по номеру телефона (+7...)
- Красивый UI с анимациями и градиентами
- Форма: React Hook Form + Zod валидация
- После успешного входа - полная перезагрузка страницы (window.location.href) для исправления viewport на мобильных

#### pages/Dashboard.tsx
- Главная страница приложения
- **Для админа**: все задачи + фильтры по исполнителю/категории + кнопки редактирования/удаления/дублирования
- **Для обычного пользователя**: только свои задачи на сегодня (фильтр по weekDays/monthDay)
- Прогресс-бар выполнения задач
- FAB кнопка создания задачи (только админ)
- Bottom navigation: Главная, Настройки, Выход
- Dropdown меню для обычных пользователей (меньше опций)
- TaskViewDialog для просмотра задачи и загрузки фото
- Баланс бонусов отображается для сотрудников

#### contexts/AuthContext.tsx
- React Context для глобального состояния авторизации
- `user` - текущий пользователь (null если не авторизован)
- `isLoading` - загрузка состояния авторизации
- `login(phone)` - вход по номеру телефона
- `logout()` - выход из системы
- Использует TanStack Query для кэширования и синхронизации

#### hooks/use-tasks.ts
Хуки для работы с задачами:
- `useTasks()` - получить все задачи
- `useTask(id)` - получить одну задачу
- `useCreateTask()` - создать задачу
- `useUpdateTask()` - обновить задачу
- `useDeleteTask()` - удалить задачу
- `useCompleteTask()` - отметить выполненной
- `useUncompleteTask()` - отменить выполнение

#### index.css
Все стили приложения:
- CSS переменные для цветовой схемы (--primary, --background, etc.)
- Tailwind @layer components с кастомными классами:
  - `.app-header` - шапка (60px mobile, 68px desktop)
  - `.app-layout` - основной layout с отступами
  - `.task-card` - карточка задачи (p-5, rounded-2xl)
  - `.task-checkbox` - чекбокс задачи (w-8 h-8)
  - `.task-title` - заголовок задачи (text-lg)
  - `.bottom-nav` - нижняя навигация (sidebar на desktop)
  - `.fab-button` - плавающая кнопка
  - `.progress-card` - прогресс-бар
  - `.filters-bar` - фильтры

### Backend (server/)

#### routes.ts
Все API эндпоинты:

**Auth:**
- `POST /api/auth/login` - вход по телефону
- `GET /api/auth/me` - текущий пользователь
- `POST /api/auth/logout` - выход

**Tasks:**
- `GET /api/tasks` - список задач (requireAuth)
- `GET /api/tasks/:id` - одна задача
- `POST /api/tasks` - создать (requireAdmin)
- `PUT /api/tasks/:id` - обновить (requireAdmin)
- `DELETE /api/tasks/:id` - удалить (requireAdmin)
- `POST /api/tasks/:id/complete` - выполнить задачу
- `POST /api/tasks/:id/uncomplete` - отменить выполнение
- `POST /api/tasks/:id/photo` - загрузить фото (до 10 шт)
- `DELETE /api/tasks/:id/photo` - удалить фото
- `POST /api/tasks/:id/example-photo` - загрузить пример фото (админ)
- `DELETE /api/tasks/:id/example-photo` - удалить пример фото

**Users:**
- `GET /api/users` - список пользователей
- `POST /api/users` - создать пользователя (requireAdmin)
- `PUT /api/users/:id` - обновить пользователя (requireAdmin)
- `POST /api/users/:id/reset-balance` - сбросить баланс (requireAdmin)

**Workers:**
- `GET /api/workers` - список сотрудников
- `GET /api/workers/:id` - один сотрудник
- `POST /api/workers` - создать
- `PUT /api/workers/:id` - обновить
- `DELETE /api/workers/:id` - удалить

Middleware:
- `requireAuth` - проверка авторизации
- `requireAdmin` - проверка прав админа

#### storage.ts
Data Access Layer:
- Все SQL запросы через Drizzle ORM
- weekDays и photoUrls парсятся из JSON при чтении
- weekDays и photoUrls сериализуются в JSON при записи

### Shared

#### schema.ts
Drizzle схема базы данных:

**users:**
- id, phone (unique), name, isAdmin, createdAt, bonusBalance

**workers:**
- id, name

**tasks:**
- id, title, workerId (FK to users)
- requiresPhoto, photoUrl (legacy), photoUrls (JSON array, до 10 фото)
- examplePhotoUrl - пример фото от админа
- isCompleted, isRecurring
- weekDays (JSON array [0-6], 0=Вс, 6=Сб)
- monthDay (1-31)
- price, category, description

Zod схемы валидации:
- insertUserSchema, updateUserSchema
- loginSchema
- insertWorkerSchema
- insertTaskSchema

#### routes.ts
Типизированные API эндпоинты:
- Объект `api` с описанием всех эндпоинтов
- `buildUrl(path, params)` - подстановка параметров в URL

## Data Flow

1. **Авторизация:**
   - Login.tsx → AuthContext.login() → POST /api/auth/login → session.userId

2. **Получение задач:**
   - Dashboard.tsx → useTasks() → GET /api/tasks → storage.getTasks() → SELECT from tasks

3. **Выполнение задачи:**
   - Dashboard.tsx → useCompleteTask() → POST /api/tasks/:id/complete
   - Backend проверяет права и наличие фото (если требуется)
   - Начисляет бонус исполнителю (tasks.price → users.bonusBalance)
   - Отправляет email админу

4. **Загрузка фото:**
   - TaskViewDialog.tsx → POST /api/tasks/:id/photo (FormData)
   - Multer сохраняет в /uploads/
   - storage.updateTask() добавляет URL в photoUrls

## Key Behaviors

### Видимость задач для обычного пользователя
```typescript
// Dashboard.tsx - isTaskVisibleToday()
// Задача видна если:
// 1. monthDay совпадает с текущим днём месяца (если указан)
// 2. weekDays содержит текущий день недели (если указаны)
```

### Сброс задач (cron)
- `npm run reset-tasks` - сбрасывает isCompleted=false для повторяющихся задач
- Запускается ежедневно через cron/PM2

### Бонусы
- При выполнении задачи с price > 0 сумма добавляется к bonusBalance исполнителя
- При отмене выполнения - вычитается
- Админ может сбросить баланс через API

## Path Aliases
```typescript
@/*          → ./client/src/*
@shared/*    → ./shared/*
```

## Database

MySQL with Drizzle ORM. Schema in `shared/schema.ts`.

**Tables:** `users`, `workers`, `tasks`

**Key fields:**
- `tasks.weekDays` - JSON array stored as string, parsed to `number[]` on retrieval (0=Sun, 6=Sat)
- `tasks.isRecurring` - If true, `isCompleted` resets daily via cron script
- `tasks.price` - Payment amount for task completion

**Required env vars:** `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `SESSION_SECRET`, `PORT`

## Auth

Phone-based login (no password). Two roles: regular user and admin (`isAdmin` flag).

Session stored via express-session with memorystore. Auth middleware (`requireAuth`, `requireAdmin`) defined inline in `server/routes.ts`.

## Deployment

Production uses PM2. See `DEPLOY.md` for nginx/apache proxy setup. Server listens on PORT (5001 on prod).

File uploads via Multer to `uploads/` directory (images only, 10MB max).

### Production Server

- **URL**: https://tasksflow.ru
- **Path**: `/var/www/tasksflow/data/www/tasksflow.ru`
- **Node.js**: `/var/www/tasksflow/data/.nvm/versions/node/v24.12.0/bin`
- **Process Manager**: PM2
- **Auto-deploy**: GitHub webhook triggers deploy script on push to main

**Deploy commands (on server):**
```bash
cd /var/www/tasksflow/data/www/tasksflow.ru
git pull origin main
npm install
npm run db:push
npm run build
pm2 restart all
```

**Cron (reset tasks daily at 6:00):**
```bash
0 6 * * * cd /var/www/tasksflow/data/www/tasksflow.ru && npm run reset-tasks >> /var/log/reset-tasks.log 2>&1
```

## Known Issues & Workarounds

### Mobile viewport после клавиатуры
После ввода в поле телефона на мобильных клавиатура меняет viewport. При закрытии viewport может не восстановиться. **Решение:** Login.tsx использует `window.location.href` вместо SPA навигации для полной перезагрузки страницы.

### JSON поля в MySQL
weekDays и photoUrls хранятся как VARCHAR/TEXT с JSON. Парсинг происходит в storage.ts при чтении, сериализация при записи.

## Security Features

- **Rate Limiting**: 1000 req/15min общий лимит, 10 req/15min для авторизации
- **Phone Validation**: Zod валидация формата +7XXXXXXXXXX на клиенте и сервере
- **Session Security**: httpOnly cookies, sameSite: lax, secure в production
- **Error Boundaries**: React ErrorBoundary для graceful error handling

## Production Features

- **Health Check**: GET /api/health - проверка состояния сервера и БД
- **Graceful Shutdown**: Корректное завершение при SIGTERM/SIGINT
- **Structured Logging**: Pino logger (JSON в production, pretty в dev)
- **PWA Support**: Service Worker, manifest.json, offline caching

## Testing

```bash
npm run test        # Запуск тестов один раз
npm run test:watch  # Запуск в watch режиме
npm run test:ui     # Запуск с UI интерфейсом
```

Тесты находятся в `tests/` директории. Используется Vitest.
