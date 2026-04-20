# TasksFlow Cleaning Autoprovision Spec

## Context

В `WeSetup` уже есть зачатки интеграции с `TasksFlow`:

- уборочный журнал умеет пушить recurring-задачи в `TasksFlow`
- завершение задачи в `TasksFlow` уже может зеркалиться обратно в ячейку журнала
- есть страница интеграции и таблица сопоставления сотрудников

Но критичный кусок недоделан:

- `sync-users` только ищет совпадения по телефону и не создаёт отсутствующих сотрудников в `TasksFlow`
- API `TasksFlow` не даёт server-to-server создать пользователя через API key
- root `WeSetup` не проходит в API интеграции, хотя страница настроек ему доступна
- UI всё ещё формулирует интеграцию как “сопоставление по телефону”, хотя нужен полноценный импорт сотрудников

## Goal

Сделать рабочий one-way сценарий:

1. Компания подключает `TasksFlow` в `WeSetup`.
2. Root/руководитель синхронизирует сотрудников.
3. Все активные сотрудники организации появляются в `TasksFlow` автоматически, если их там ещё нет.
4. Уборочный журнал `WeSetup` создаёт/обновляет recurring-задачи в `TasksFlow` для назначенной уборщицы.
5. Завершение такой задачи в `TasksFlow` проставляет выполнение в журнале `WeSetup`.

## Scope

Входит в задачу:

- доработка API `TasksFlow` для server-to-server создания пользователей по API key
- доработка клиента `WeSetup` и `sync-users` для автосоздания отсутствующих сотрудников
- точечный допуск root к API интеграции в `WeSetup`
- обновление UI текста/статусов интеграции под импорт сотрудников, а не только поиск совпадений
- тесты на автопровижининг и на использование новых remote id в синке

Не входит:

- двусторонняя синхронизация задач (`TasksFlow -> WeSetup` создание новых задач)
- массовое удаление сотрудников в `TasksFlow`
- отдельный provisioning менеджеров/компаний вне текущей org-scoped интеграции
- рефактор всего legacy-слоя `workers` в `TasksFlow`

## Design Decisions

### 1. Canonical remote employee = `TasksFlow user`

Хотя в `TasksFlow` есть таблицы `users` и `workers`, задачи и права уже реально завязаны на `users.id` (`task.workerId` сравнивается с `session.userId`). Поэтому для интеграции каноническим удалённым сотрудником считается именно `user`.

`tasksflowWorkerId` в `WeSetup` остаётся служебным полем совместимости и заполняется тем же id, что и `tasksflowUserId`, как и раньше.

### 2. Provisioning strategy

Алгоритм `POST /api/integrations/tasksflow/sync-users`:

1. Берём всех активных пользователей текущей org в `WeSetup`.
2. Нормализуем телефон.
3. Загружаем `TasksFlow` users по API key.
4. Если пользователь с таким телефоном уже есть, линкуем его.
5. Если нет, создаём нового `TasksFlow` user как non-admin в компании, привязанной к API key.
6. Сразу апдейтим локальный `TasksFlowUserLink`.

Manual links не перетираются.

### 3. Root access in WeSetup

API routes интеграции `TasksFlow` должны принимать:

- management-пользователей текущей org
- root пользователя в режиме impersonation через `getActiveOrgId(session)`

Глобально менять `requireRole` нельзя. Нужен точечный guard внутри routes интеграции.

### 4. Cleaning sync contract

Ничего концептуально не меняем в существующем adapter-based sync:

- источник правды для задач остаётся `WeSetup`
- задачи в `TasksFlow` создаются на `tasksflowUserId`
- completion из `TasksFlow` продолжает зеркалиться обратно через polling/webhook

Нужно лишь гарантировать, что после employee sync у уборщицы всегда есть валидный `tasksflowUserId`, чтобы adapter не скипал строку как `skippedNoLink`.

## Acceptance Criteria

### AC1. Автосоздание сотрудников в TasksFlow

Если активный пользователь `WeSetup` с валидным телефоном отсутствует в `TasksFlow`, `sync-users` создаёт его удалённо и сохраняет `TasksFlowUserLink` с ненулевым `tasksflowUserId`.

### AC2. Идемпотентность employee sync

Повторный запуск `sync-users` не создаёт дубликаты в `TasksFlow` для уже импортированных сотрудников и переиспользует существующего remote user по нормализованному телефону.

### AC3. Root может работать с интеграцией

Root `WeSetup` в режиме impersonation может читать статус интеграции, список links и запускать `sync-users`, не получая redirect/403 из API.

### AC4. Уборочная строка создаёт задачу после синка сотрудника

Если у строки уборки назначен сотрудник, который был импортирован через `sync-users`, `syncDocumentToTasksFlow` создаёт или обновляет recurring-задачу в `TasksFlow` без `skippedNoLink` по этой строке.

### AC5. Completion из TasksFlow продолжает зеркалиться в журнал

Существующий pull-side sync completion не ломается после изменений и по завершённой задаче продолжает проставлять значение в ячейке уборочного журнала.

### AC6. UI интеграции объясняет новый режим

Страница `/settings/integrations/tasksflow` в `WeSetup` больше не говорит только про “сопоставление по телефону”, а явно сообщает, что синхронизация создаёт отсутствующих сотрудников в `TasksFlow` и линкует существующих.

## Test Strategy

### WeSetup

- route/unit test для `sync-users`:
  - existing remote user by phone -> link only
  - missing remote user -> create remote user and link
  - manual link -> skip overwrite
- sync test для cleaning adapter / dispatcher:
  - imported user id используется как `workerId`
  - строка не попадает в `skippedNoLink`

### TasksFlow

- server/API test:
  - `POST /api/users` с API key создаёт non-admin user в компании ключа
  - повторный вызов с тем же телефоном корректно даёт validation/conflict response без дубля

## Evidence Requirements

- свежие тесты по обоим репозиториям
- типизация/сборка для затронутых участков
- `evidence.md` и `evidence.json` в этой папке
- только локальные коммиты, без push
