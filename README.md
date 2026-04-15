# TasksFlow

Система управления ежедневными задачами с оплатой за выполнение. React + Express + MySQL.

## Quick Start

```bash
# 1. Установка зависимостей
npm install

# 2. Настройка окружения
cp .env.example .env
# Отредактируйте .env - укажите данные MySQL

# 3. Создание таблиц в БД
npm run setup-db

# 4. Создание админа
npm run create-admin
# Следуйте инструкциям в консоли

# 5. Запуск dev-сервера
npm run dev
# Откройте http://localhost:5000
```

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
│  └── users, tasks tables                                    │
└─────────────────────────────────────────────────────────────┘
```

## Роли пользователей

### Админ (`isAdmin: true`)
- Видит все задачи
- Создаёт/редактирует/удаляет задачи
- Управляет пользователями
- Фильтрует по исполнителю и категории

### Сотрудник (`isAdmin: false`)
- Видит только свои задачи на сегодня
- Может выполнять задачи и загружать фото
- Видит свой баланс бонусов

## База данных

### Таблица `users`
| Поле | Тип | Описание |
|------|-----|----------|
| id | INT | Primary key |
| phone | VARCHAR(20) | Номер телефона (+7...), unique |
| name | VARCHAR(255) | Имя пользователя |
| isAdmin | BOOLEAN | Флаг админа |
| bonusBalance | INT | Баланс бонусов в рублях |
| createdAt | INT | Unix timestamp создания |

### Таблица `tasks`
| Поле | Тип | Описание |
|------|-----|----------|
| id | INT | Primary key |
| title | VARCHAR(255) | Название задачи |
| workerId | INT | FK на users.id (исполнитель) |
| requiresPhoto | BOOLEAN | Требуется фото для выполнения |
| photoUrls | TEXT | JSON массив URL фотографий |
| examplePhotoUrl | VARCHAR(500) | Пример фото от админа |
| isCompleted | BOOLEAN | Выполнена ли задача |
| isRecurring | BOOLEAN | Повторяющаяся (сбрасывается ежедневно) |
| weekDays | VARCHAR(20) | JSON [0-6], дни недели (0=Вс) |
| monthDay | INT | День месяца (1-31) |
| price | INT | Оплата за выполнение |
| category | VARCHAR(100) | Категория |
| description | TEXT | Описание |

## Скрипты

```bash
npm run dev          # Dev сервер с hot reload
npm run build        # Сборка для production
npm start            # Запуск production
npm run check        # TypeScript проверка

npm run setup-db     # Создание таблиц
npm run create-admin # Создание админа
npm run reset-tasks  # Сброс выполненных задач (для cron)
```

## Production (PM2)

```bash
# Сборка
npm run build

# Запуск через PM2
pm2 start npm --name "tasksflow" -- start

# Cron для сброса задач (каждый день в 00:00)
0 0 * * * cd /path/to/project && npm run reset-tasks
```

## Переменные окружения

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| MYSQL_HOST | Да | Хост MySQL |
| MYSQL_USER | Да | Пользователь MySQL |
| MYSQL_PASSWORD | Да | Пароль MySQL |
| MYSQL_DATABASE | Да | Имя базы данных |
| SESSION_SECRET | Да | Секрет для сессий (мин. 32 символа) |
| PORT | Нет | Порт сервера (по умолчанию 5000) |

## Документация

- [CLAUDE.md](./CLAUDE.md) - Подробная документация для разработчиков
- [API.md](./API.md) - Примеры API запросов
- [DEPLOY.md](./DEPLOY.md) - Инструкция по деплою

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui
- **Backend:** Express.js, TypeScript, Drizzle ORM
- **Database:** MySQL
- **State:** TanStack Query, React Context
- **Forms:** React Hook Form, Zod
- **Routing:** wouter
