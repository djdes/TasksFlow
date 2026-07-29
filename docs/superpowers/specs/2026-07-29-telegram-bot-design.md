# Telegram-бот TasksFlow: постановка задач голосом продукта ProjectsFlow

Дата: 2026-07-29
Статус: согласован, готов к плану реализации
Задача-источник: ProjectsFlow → проект TasksFlow → «ТГ-бот TasksFlow для постановки задач»
(`839b5431-920a-49dd-8ac1-1315ebaebafc`, дедлайн 2026-07-31)

## 1. Проблема и цель

Задачи в TasksFlow ставятся только через веб-форму: выбрать исполнителя, отметить
чекбоксы, проставить дни недели. Руководителю на производстве проще написать в
Telegram «Олегу каждую пятницу мыть холодильник, фото обязательно, 200р».

Цель: бот `@thetasksflowbot` (id 8810015596, токен уже в `.env`), который принимает
свободный текст (и фото), прогоняет его через
AI-воркер, показывает карточку с распознанными полями и по нажатию создаёт реальную
задачу в TasksFlow. Плюс — сотрудник видит свои задачи на сегодня и закрывает их
фотографией прямо в боте.

## 2. Согласованные решения

| Вопрос | Решение |
| --- | --- |
| Где живёт системный промпт | В `c:/www/ralph` (репо PFLoopDispatch). ProjectsFlow **только читаем** |
| Привязка аккаунта | Кнопка на сайте TasksFlow → Telegram Login Widget (как в ProjectsFlow) |
| Объём v1 | Постановка задач + несколько задач из одного сообщения + «мои задачи»/закрытие |
| Голосовые | **Нет** (вне рамок) |
| Дата задачи | Новое поле `tasks.due_date` |
| Семантика `dueDate` | Видна с сегодня до даты, после — бейдж «Просрочено» |
| Права | Как на сайте: админ — всей компании, руководитель — только `managedWorkerIds`, воркер — нельзя |
| `requiresPhoto` по умолчанию | `true`; снимается, если в тексте явно «без фото» |
| Фото из сообщения | Идут в «пример фото» задачи; распределяются по задачам как в PF |
| Хранение примеров фото | Расширяем до массива `tasks.example_photo_urls` |

## 3. Три репозитория, три роли

| Репо | Роль | Трогаем |
| --- | --- | --- |
| `c:/www/TasksFlow` | Бот, БД, карточки, создание задач | ✅ основная работа |
| `c:/www/projectsflow` | **Только очередь AI-job'ов** | ❌ ни строки |
| `c:/www/ralph` (PFLoopDispatch) | Воркер: забирает job, зовёт Claude с системным промптом | ✅ новый промпт + ветка |

## 4. Архитектура потока

```
Telegram ──► TasksFlow: server/telegram/*
                 │  POST {PF_API_URL}/agent/ai-prompt-jobs
                 │  Authorization: Bearer pfat_…
                 │  { text: <JSON-конверт>, projectId: <PF TasksFlow>, mode: 'improve' }
                 ▼
            ProjectsFlow (очередь) — ставит job с dispatcherUserId = admin@projectsflow.ru
                 ▼
            ralph dispatch.ps1 (поллинг) ──► ai-job-worker.ps1 ──► Do-TasksFlow
                                                  prompts/tasksflow-task.md
                                                  claude -p --model sonnet
                 │  POST /agent/ai-prompt-jobs/:id/complete { ok, improvedText: <JSON> }
                 ▼
            TasksFlow long-poll GET /agent/ai-prompt-jobs/:id?wait=25 (до 6 раз ≈150с)
                 ▼
            драфт в telegram_task_drafts ──► карточка в ТГ ──[✅ Создать]──► storage.createTask()
```

Почему `mode: 'improve'`, а не новый режим: enum режимов зашит в схему ProjectsFlow
(`improve | compose | compose-advanced`), а ProjectsFlow мы не трогаем. Роутинг к
нужному промпту делает воркер — по имени проекта плюс маркеру внутри payload.

Побочный эффект `mode:'improve'` с непустым `projectId`: ProjectsFlow соберёт
`kbContext` проекта TasksFlow и положит в job. Воркер его игнорирует. Лишний трафик,
но безвредно и не требует правок ProjectsFlow.

## 5. Контракт с воркером

Это ядро. Ошибка здесь = переделка всей цепочки.

### 5.1 TasksFlow → воркер (`inputText`)

JSON-конверт, а не голый текст — по нему воркер и опознаёт «свой» job:

```json
{
  "app": "tasksflow",
  "v": 1,
  "today": "2026-07-29",
  "dow": 3,
  "author": { "name": "Ярослав", "role": "admin" },
  "members": [
    { "id": 12, "name": "Олег Боев", "position": "повар" },
    { "id": 15, "name": "Анна Смирнова", "position": "продавец" }
  ],
  "categories": ["уборка", "готовка"],
  "hasPhotos": 2,
  "message": "олегу каждую пятницу мыть холодильник, фото обязательно, 200р"
}
```

- `members` уже отфильтрованы по правам автора. AI физически не может назначить
  человека, которому автор не вправе ставить задачи.
- `categories` — существующие категории компании (подсказка, не ограничение).
- `hasPhotos` — сколько фото пришло вместе с сообщением (влияет на формулировки).
- `dow` — `Date.getDay()` (0=Вс…6=Сб), чтобы «в пятницу» резолвилось однозначно.

### 5.2 Воркер → TasksFlow (`improvedText`)

```json
{
  "version": 1,
  "app": "tasksflow",
  "segments": [
    {
      "id": "s1",
      "title": "Помыть холодильник",
      "description": "Вымыть изнутри, полки вынуть и промыть отдельно.",
      "workerId": 12,
      "workerName": "Олег Боев",
      "confidence": 0.9,
      "requiresPhoto": true,
      "price": 200,
      "category": "уборка",
      "isRecurring": true,
      "weekDays": [5],
      "monthDay": null,
      "dueDate": null,
      "checklist": ["холодильник", "стол №1"]
    }
  ]
}
```

### 5.3 Дефолты для нераспознанного

Явное требование задачи-источника. Дефолты применяет **TasksFlow** при нормализации
ответа — воркер может прислать `null`, и это нормально.

| Поле | Дефолт | Почему так |
| --- | --- | --- |
| `workerId` | `null` | Не угадываем. Карточка покажет «не выбран», ставится кнопкой |
| `requiresPhoto` | `true` | Продукт про фотоотчёт. Снимается тапом или словами «без фото» |
| `isRecurring` | `false` | Разовая безопаснее: не воскреснет молча каждый день |
| `weekDays` / `monthDay` / `dueDate` | `null` | Задача видна сразу и висит, пока не закроют |
| `price` | `0` | Премия только по явному указанию |
| `category` | `null` | Не выдумываем |
| `checklist` | `[]` | Подзадачи только если в тексте перечислены |
| `title` | первые ≤80 символов сообщения | Фолбэк, когда воркер не дал заголовок |

### 5.4 Нормализация и валидация ответа (на стороне TasksFlow)

Ответ воркера — недоверенный вход. Перед записью в драфт:

- `workerId` обязан быть в списке `members` этого запроса, иначе → `null`.
- `title` тримится до 255, `description` — до 5000 (лимиты схемы).
- `price` → целое ≥0; `weekDays` → уникальные целые 0..6; `monthDay` → 1..31.
- `dueDate` → `YYYY-MM-DD`, парсится в unix-сек локальной полуночи; прошедшие даты
  принимаются как есть (задача сразу «просрочена» — это валидный сценарий).
- `dueDate` и `isRecurring` взаимоисключающи: при заданном `dueDate` форсим
  `isRecurring = false`.
- `checklist` → максимум 30 пунктов, заголовки ≤200 символов, `id` генерим сами.
- `category` — до 100 символов.
- Сегментов больше 10 → берём первые 10, в карточке честно пишем «показаны первые 10».

## 6. Изменения в ralph (PFLoopDispatch)

### 6.1 `ai-job-worker.ps1`

Новая ветка перед разбором `$Mode`:

```powershell
function Test-TasksFlowJob {
  if ($ProjectName -ne 'TasksFlow') { return $false }
  try { $o = $InputText | ConvertFrom-Json } catch { return $false }
  return ($o -and $o.app -eq 'tasksflow')
}
```

Диспетчеризация в конце файла:

```powershell
if (Test-TasksFlowJob)                  { Do-TasksFlow }
elseif ($Mode -eq 'compose')            { Do-Compose }
elseif ($Mode -eq 'compose-advanced')   { Do-ComposeAdvanced }
else                                    { Do-Improve }
```

`Do-TasksFlow`:
1. Читает `prompts/tasksflow-task.md` (UTF-8 с BOM — кириллица).
2. Подставляет `{{TODAY}}`, `{{DOW_NAME}}`, `{{AUTHOR}}`, `{{MEMBERS}}`,
   `{{CATEGORIES}}`, `{{HAS_PHOTOS}}`, `{{MESSAGE}}` из конверта.
3. `Invoke-ClaudeText` — модель `claude-sonnet-4-6` (структурная задача, не проза),
   watchdog не меньше 180с.
4. Парсит JSON через существующий `Parse-ComposeJson`, но с ключом `segments`
   → переиспользуем как есть.
5. `Complete-Job $true <json>` либо `$false 'tasksflow_bad_json'`.

Ветка добавляется **до** `$Mode`-проверок и никак не меняет поведение существующих
режимов: другие проекты в неё не попадают.

### 6.2 `prompts/tasksflow-task.md`

Системный промпт. Содержание:

- Роль: «разбираешь сообщение руководителя в задачи для TasksFlow — системы
  фотоотчётов сотрудников производства и магазина».
- Формат ответа: **строго JSON**, без преамбулы и markdown-заборов.
- Правила распознавания исполнителя: только из списка `members`, матч по имени/
  фамилии/должности; не уверен — `workerId: null`.
- Правила расписания: словарь «каждый день / по будням / по пн,ср,пт / каждое 15
  число / завтра / в пятницу / до 3 августа» → `isRecurring`, `weekDays`, `monthDay`,
  `dueDate` (см. таблицу маппинга в §8).
- `requiresPhoto`: `true` по умолчанию; `false` только при явном «без фото»,
  «фото не надо», «просто отметить».
- Премия: число рядом с «р/руб/₽/премия» → `price`.
- Разбивка на несколько задач: одна задача = один исполнитель + одно действие.
  «Олегу холодильник, Ане столы» → 2 сегмента. Перечисление шагов одной работы
  («вымыть холодильник: полки, дверцу, морозилку») → **чек-лист внутри одной задачи**,
  а не отдельные задачи.
- Перефраз: `title` — короткий императив; `description` — причёсанный текст автора,
  без выдумывания шагов и критериев.

## 7. Модель данных

Миграции — по конвенции проекта: идемпотентный `script/_add-*.ts` + дубль в
авто-миграции на старте `server/index.ts` (ловим `ER_DUP_FIELDNAME`).
`npm run db:push` заблокирован в проекте — drizzle-kit не трогаем.

### 7.1 `users` — привязка Telegram

```sql
ALTER TABLE users
  ADD COLUMN telegram_user_id    BIGINT       NULL,
  ADD COLUMN telegram_username   VARCHAR(64)  NULL,
  ADD COLUMN telegram_first_name VARCHAR(128) NULL,
  ADD COLUMN telegram_photo_url  VARCHAR(512) NULL,
  ADD COLUMN tg_chat_id          BIGINT       NULL,
  ADD COLUMN tg_linked_at        INT          NULL,
  ADD COLUMN tg_started_at       INT          NULL,
  ADD UNIQUE KEY uq_users_telegram_user_id (telegram_user_id);
```

UNIQUE — чтобы один Telegram не привязался к двум сотрудникам.

### 7.2 `tasks` — срок и примеры фото

```sql
ALTER TABLE tasks
  ADD COLUMN due_date           INT  NULL,
  ADD COLUMN example_photo_urls TEXT NULL;
```

- `due_date` — unix-секунды локальной полуночи целевого дня (в проекте все даты `int`).
- `example_photo_urls` — JSON-массив URL. Чтение: если колонка пуста, читаем legacy
  `example_photo_url` как массив из одного элемента. Запись — всегда в новую колонку,
  плюс дублируем первый URL в старую для обратной совместимости старых клиентов.

### 7.3 Таблицы бота

```sql
CREATE TABLE telegram_task_drafts (
  id           CHAR(36)    NOT NULL PRIMARY KEY,
  user_id      INT         NOT NULL,
  company_id   INT         NOT NULL,
  chat_id      BIGINT      NOT NULL,
  message_id   BIGINT      NULL,        -- сообщение-карточка, редактируем его
  source_key   VARCHAR(191) NULL,       -- дедуп альбомов/ретраев апдейтов
  status       VARCHAR(20) NOT NULL,    -- composing | confirming | confirmed | cancelled | expired
  raw_text     TEXT        NULL,
  segments     TEXT        NULL,        -- JSON, см. §5.2 + included
  attachments  TEXT        NULL,        -- JSON [{key, fileId, filename, targetSegmentIndexes[]}]
  created_at   INT         NOT NULL,
  expires_at   INT         NOT NULL,    -- +30 мин
  UNIQUE KEY uq_ttd_source_key (source_key),
  KEY idx_ttd_chat (chat_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE telegram_task_messages (
  chat_id           BIGINT      NOT NULL,
  message_id        BIGINT      NOT NULL,
  task_id           INT         NOT NULL,
  checklist_item_id VARCHAR(64) NULL,
  created_at        INT         NOT NULL,
  PRIMARY KEY (chat_id, message_id),
  KEY idx_ttm_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE telegram_chat_state (
  chat_id            BIGINT      NOT NULL PRIMARY KEY,
  awaiting_task_id   INT         NULL,
  awaiting_item_id   VARCHAR(64) NULL,
  updated_at         INT         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`telegram_task_messages` — чтобы фото-ответ (reply) на карточку задачи попал в нужную
задачу. `telegram_chat_state` — чтобы работал и путь без reply: нажал «📸 Фото» →
следующее фото в чате уходит в эту задачу (TTL 15 минут).

Уборка: драфты со `status='composing'` и `expires_at < now` и записи
`telegram_task_messages` старше 30 дней чистит тот же фоновый таймер, что уже гоняет
`processPendingDeliveries` в `server/index.ts`.

## 8. `dueDate`: семантика и маппинг

### 8.1 Видимость

Фильтр «видна сегодня» сейчас живёт **только в клиенте** (`client/src/lib/task-filters.ts`);
сервер в `GET /api/tasks` режет лишь по компании и `managedWorkerIds`. Чтобы бот не завёл
вторую реализацию расписания, переносим чистую функцию `isTaskVisibleOn` в
`shared/task-visibility.ts` и импортируем из клиента и из бота. Логика с учётом `dueDate`:

```
dueDate не задан            → как сейчас (weekDays / monthDay / всегда)
dueDate задан, сегодня ≤ dueDate → видна, бейдж «⏳ до 3 авг» / «⏳ сегодня»
dueDate задан, сегодня > dueDate → видна, бейдж «🔴 Просрочено»
```

Задача с `dueDate` никогда не скрывается досрочно: сотрудник видит её заранее и
может сделать раньше. `dueDate` не участвует в ежедневном сбросе — он трогает только
`is_recurring = 1`, а `dueDate` форсит `isRecurring = false`.

### 8.2 Маппинг фраз

| Текст | `isRecurring` | `weekDays` | `monthDay` | `dueDate` |
| --- | --- | --- | --- | --- |
| «каждый день» | `true` | `null` | `null` | `null` |
| «по будням» | `true` | `[1,2,3,4,5]` | `null` | `null` |
| «по пн, ср, пт» | `true` | `[1,3,5]` | `null` | `null` |
| «каждую пятницу» | `true` | `[5]` | `null` | `null` |
| «каждое 15 число» | `true` | `null` | `15` | `null` |
| «до 3 августа» / «3 августа» | `false` | `null` | `null` | `2026-08-03` |
| «завтра» | `false` | `null` | `null` | завтрашняя дата |
| «в пятницу» (разово) | `false` | `null` | `null` | ближайшая пятница |
| ничего про срок | `false` | `null` | `null` | `null` |

### 8.3 Веб-UI

- `CreateTask.tsx` / `EditTask.tsx` — поле «Срок» (date input), взаимоисключающее с
  блоком повторения: при выборе срока чекбокс «повторяющаяся» гаснет.
- Карточка задачи — бейдж срока/просрочки рядом с существующими чипами.
- `DuplicateTaskDialog` — срок копируется вместе с остальными полями.

## 9. Привязка Telegram

Зеркалим ProjectsFlow (`ConnectTelegramAccount` + `meTelegramRouter`).

- **Клиент:** `client/src/pages/Account.tsx` — блок «Telegram»: не привязан → Login
  Widget-кнопка (`telegram-widget.js`, `data-telegram-login=<BOT_USERNAME>`,
  `data-onauth`); привязан → имя/username и кнопка «Отвязать».
- **Сервер:**
  - `GET /api/me/telegram` — статус (`linked`, `username`, `chatStarted`).
  - `POST /api/me/telegram/connect` — payload виджета. Проверки: HMAC-SHA256 с
    секретом `sha256(TASKSFLOW_BOT_TOKEN)`, свежесть `auth_date` ≤24ч (и не из
    будущего дальше 5 минут), UNIQUE — иначе 409 «уже привязан к другому аккаунту».
    Сравнение хэша — `timingSafeEqual`.
  - `DELETE /api/me/telegram` — отвязка (обнуляем колонки).
- **`/start` в боте** — находим юзера по `telegram_user_id`, кэшируем `tg_chat_id`
  и `tg_started_at`. Не привязан → сообщение «открой Аккаунт на tasksflow.ru и нажми
  „Привязать Telegram“» со ссылкой.

**Ограничение, которое надо знать заранее:** Login Widget работает только на домене,
прописанном в BotFather (`/setdomain tasksflow.ru`), и только по https. На localhost
привязка не проверяется — dev-проверка возможна либо на проде, либо через ручную
простановку `telegram_user_id` в БД.

## 10. UX бота: постановка задач

### 10.1 Поток

1. Личное сообщение с текстом (или фото с подписью, или альбом).
2. Проверка привязки → проверка прав (`isAdmin` или непустой `managedWorkerIds`).
   Воркер получает вежливый отказ: «задачи ставит руководитель; свои задачи —
   команда /tasks».
3. Сразу создаём драфт (`status='composing'`), апдейт подтверждён — Telegram не ждёт AI.
4. `sendMessage("⏳ Разбираю…")`, дальше фоном: спиннер `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` каждые ~2.5с
   через `editMessageText`, ошибки редактирования — только в лог.
5. Enqueue в ProjectsFlow → long-poll до ~150с.
6. Успех → нормализация (§5.4) → `segments` в драфт → карточка.
   Неуспех → §12 (деградация).

### 10.2 Карточка, одна задача

```
🆕 Новая задача
👤 Олег Боев · 📸 фото обязательно
🔁 Каждую пятницу · 💰 200 ₽ · 🏷 уборка
📎 Пример фото: 1
📝 Помыть холодильник изнутри, полки вынуть

[ ✅ Создать ]      [ ✖️ Отмена ]
[ 👤 Исполнитель ]  [ 📸 Фото ]
[ 🔁 Повтор ]       [ 📅 Срок ]
```

### 10.3 Карточка, несколько задач

```
🆕 Распознал 2 задачи:

1. Помыть холодильник
   👤 Олег · 📸 · 🔁 пт
2. Протереть столы
   👤 Анна · 📸 · 📅 до 3 авг

[ ✅ Создать все (2) ]  [ ✖️ Отмена ]
[ ✏️ 1 ]  [ ✏️ 2 ]
[ 📎 Распределить файлы (3) ]
```

`✏️ N` открывает под-карточку сегмента с теми же кнопками, что в §10.2, плюс
`🗑 Исключить` (тогл `included`) и `⬅️ Назад`. Счётчик в «Создать все» считает только
включённые.

### 10.4 Пикеры

- **Исполнитель** — список доступных сотрудников (по правам), постранично по 8,
  плюс «🚫 Без исполнителя».
- **Фото** — тогл `requiresPhoto`.
- **Повтор** — пресеты: `Каждый день · Будни · Пн-Ср-Пт · Не повторять`; конкретные
  дни недели — вторым экраном с чекбоксами.
- **Срок** — пресеты: `Сегодня · Завтра · Через неделю · Без срока`. Произвольная дата
  в боте не вводится (YAGNI — правится на сайте).

### 10.5 Callback-схема

`callback_data` ≤64 байт, поэтому `draftId` в коллбэках — короткий (12 hex), полный
UUID лежит в БД.

| Данные | Действие |
| --- | --- |
| `c:<d>` | Создать все включённые |
| `x:<d>` | Отмена |
| `e:<d>:<s>` / `b:<d>` | Открыть правку сегмента / назад к сводной |
| `i:<d>:<s>` | Тогл «включена» |
| `w:<d>:<s>:<p>` / `W:<d>:<s>:<uid>` | Пикер исполнителя / выбор |
| `p:<d>:<s>` | Тогл requiresPhoto |
| `r:<d>:<s>:<preset>` | Пресет повтора |
| `l:<d>:<s>:<preset>` | Пресет срока |
| `f:<d>:<file>:<p>` / `F:<d>:<file>:<seg>` | Пикер файла / тогл файл→задача |
| `fa:<d>:<file>` / `fn:<d>:<file>` | Файл ко всем / очистить |

Каждый коллбэк заново проверяет: драфт существует, не истёк, принадлежит этому
`telegram_user_id`, у автора всё ещё есть права. `callback_data` не доверяем.

### 10.6 Создание

По `c:<d>` для каждого включённого сегмента:

- `storage.createTask({...})` с `companyId` автора — тот же путь, что у веб-роута,
  включая проверку принадлежности `workerId` компании и `canAssignToWorker`.
- Назначенные сегменту файлы скачиваются через `getFile` и кладутся в `uploads/`,
  URL'ы пишутся в `example_photo_urls`.
- `recordAudit('task.created')` — как в веб-роуте.
- Ошибка одного сегмента не валит остальные; итог: «✅ Создано: 2 (ошибок: 0)».
- Карточка редактируется в итоговую сводку с id созданных задач.

## 11. Фото-вложения

Повторяем механику ProjectsFlow:

- Фото/альбом приходят вместе с текстом → сохраняем `file_id` в `attachments` драфта.
  Альбом собирается по `media_group_id`; `source_key` защищает от дублей при ретраях.
- По умолчанию файл прикрепляется к **первому** сегменту (`targetSegmentIndexes: [0]`).
- Кнопка `📎 Распределить файлы (N)` появляется, только когда сегментов > 1. Пикер:
  «Файл 1 из 3», список задач с `✅`/`⬜`, `🔗 Ко всем`, `🧹 Очистить`, пагинация.
- Скачивание — только на этапе создания задачи (не раньше): лимит 10 МБ на файл,
  только `photo` и `document` с image-mime, имя файла генерим сами (как в текущем
  upload-роуте), путь — существующий `uploads/`.

## 12. «Мои задачи» и закрытие

Команда `/tasks` (и кнопка меню бота) — для любого привязанного пользователя.

```
📋 На сегодня: 3

1. ⬜ Помыть холодильник 📸 💰200
2. ⬜ Столы (0/2) 📸
3. ✅ Раковина

[ 1 ] [ 2 ] [ 3 ]      [ 🔄 Обновить ]
```

Тап по номеру → карточка задачи: описание, примеры фото (media group), кнопки
`📸 Отправить фото`, а для чек-листа — по кнопке на пункт.

Закрытие:
1. Нажал `📸 Отправить фото` → пишем `telegram_chat_state.awaiting_task_id` и
   отвечаем «Жду фото».
2. Следующее фото в чате (или фото-reply на карточку — ищем через
   `telegram_task_messages`) скачивается в `uploads/` и уходит в тот же путь, что
   веб: пополняем `photoUrls`, затем `/complete`-логика.
3. Задача с чек-листом закрывается только когда все пункты сфотканы — эту проверку
   уже делает существующий код, бот его переиспользует, а не дублирует.
4. Задача с `verifierWorkerId` уходит в `submitted` — бот честно пишет «отправлено на
   проверку», а не «готово».

Ключевое требование: **никакой параллельной бизнес-логики**. Бот вызывает те же
функции storage/сервисов, что и HTTP-роуты; премии, аудит, WeSetup-зеркалирование и
верификация работают ровно так же.

## 13. Деградация и ошибки

| Ситуация | Поведение |
| --- | --- |
| Пользователь не привязан | Ссылка на страницу Аккаунт, AI не зовём |
| Нет прав ставить задачи | Отказ + подсказка про `/tasks` |
| `PF_AGENT_TOKEN` не задан | Пропускаем AI, сразу ручной черновик |
| ProjectsFlow 503 (`ai_not_configured` / `no_dispatcher_for_project`) | Ручной черновик |
| ProjectsFlow 429 (rate-limit) | «Лимит AI исчерпан, попробуй позже» + ручной черновик |
| Таймаут ~150с / job `failed` | Ручной черновик |
| Невалидный JSON от воркера | Ручной черновик |
| Ошибка `editMessageText` спиннера | Только лог, поток не прерываем |
| Драфт истёк к моменту нажатия | «Черновик истёк — пришли задачу заново» |
| Сотрудник удалён между разбором и созданием | Сегмент создаётся без исполнителя, в сводке помечен |

**Ручной черновик** = тот же драфт и та же карточка, но без AI: `title` — первая
строка сообщения (≤80 символов), `description` — остальное, исполнитель пустой,
дефолты из §5.3. Бот остаётся рабочим, даже когда диспетчер офлайн.

## 14. Безопасность

- Login Widget: HMAC + freshness + `timingSafeEqual` + UNIQUE-констрейнт.
- Webhook (если включён): проверка заголовка `X-Telegram-Bot-Api-Secret-Token`.
- Права проверяются на **каждом** коллбэке заново, а не только при разборе.
- Мультитенантность: `companyId` берётся от привязанного пользователя, никогда из
  сообщения. Исполнители фильтруются по компании автора.
- Скачивание файлов: только через `getFile` по `file_id` из апдейта (произвольные URL
  не качаем), лимит размера, безопасное имя файла.
- Секреты (`PF_AGENT_TOKEN`, токен бота) — в `.env`, в git не едут.
- Rate-limit на пользователя: не более 20 разборов в час (свой счётчик), чтобы один
  чат не выжрал общий лимит ProjectsFlow.

### Известное ограничение: общий лимит AI

ProjectsFlow лимитирует `improve` как **60 job'ов в час на пользователя-инициатора**,
а инициатор у нас один — владелец `PF_AGENT_TOKEN`. Значит потолок 60 разборов в час
на **всех** пользователей бота. Для текущего масштаба (одна компания) с запасом; при
росте потребуется отдельный агент-токен на компанию или свой воркер. Бот на 429
отвечает понятным текстом и не теряет сообщение (уходит в ручной черновик).

## 15. Конфигурация

```env
TASKSFLOW_BOT_TOKEN=…            # уже есть в .env
TELEGRAM_BOT_USERNAME=thetasksflowbot   # для Login Widget на сайте
TELEGRAM_MODE=auto               # auto | webhook | polling
TELEGRAM_WEBHOOK_URL=            # https://tasksflow.ru/api/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_HTTP_PROXY=             # RU-хостинг режет api.telegram.org
TELEGRAM_API_BASE_URL=           # альтернатива прокси: relay

PF_API_URL=https://projectsflow.ru/api
PF_AGENT_TOKEN=pfat_…
PF_TASKSFLOW_PROJECT_ID=bcc868e6-853c-4c8b-a592-6f3fcb20a298
```

`auto` = webhook, если задан `TELEGRAM_WEBHOOK_URL`, иначе long-poll `getUpdates`.
Без `TASKSFLOW_BOT_TOKEN` модуль бота не стартует и пишет одну строку в лог — сервер
работает как раньше.

## 16. Тесты (vitest, каталог `tests/`)

| Файл | Что проверяет |
| --- | --- |
| `tg-worker-payload.test.ts` | Сборка конверта: `members` по правам, `today`/`dow`, категории |
| `tg-worker-response.test.ts` | Нормализация ответа: чужой `workerId` → null, лимиты длин, дефолты, битый JSON |
| `tg-schedule-map.test.ts` | Маппинг расписания/срока в `weekDays`/`monthDay`/`dueDate`/`isRecurring` |
| `tg-due-date-visibility.test.ts` | `isTaskVisibleOn` с `dueDate`: до, в день, после |
| `tg-login-widget.test.ts` | HMAC: валидный, битый, протухший, из будущего, уже привязанный |
| `tg-callback-parse.test.ts` | Парсер `callback_data`, границы 64 байт, мусорный ввод |
| `tg-attachments.test.ts` | Распределение файлов: дефолт `[0]`, «ко всем», «очистить», дедуп альбома |
| `tg-permissions.test.ts` | Воркер не может ставить; руководитель — только `managedWorkerIds` |
| `tg-degradation.test.ts` | 503 / 429 / таймаут / битый JSON → ручной черновик |
| `tg-complete-photo.test.ts` | Закрытие фото: обычная, чек-лист, задача с верификацией |
| `example-photos-compat.test.ts` | Чтение legacy `example_photo_url` при пустом массиве |

Плюс существующий гейт: `npm run check && npm test`.

## 17. Затрагиваемые файлы

### TasksFlow

| Файл | Изменение |
| --- | --- |
| `shared/schema.ts` | Колонки `users.telegram_*`, `tasks.due_date`, `tasks.example_photo_urls`; таблицы бота; расширение `insertTaskSchema` |
| `script/_add-telegram-cols.ts` | Новая миграция (users) |
| `script/_add-due-date-col.ts` | Новая миграция (tasks.due_date) |
| `script/_add-example-photos-col.ts` | Новая миграция (tasks.example_photo_urls) |
| `script/_create-telegram-tables.ts` | Три таблицы бота |
| `server/index.ts` | Авто-миграции, старт модуля бота, уборка драфтов в существующем таймере |
| `server/routes.ts` | `/api/me/telegram` (GET/POST connect/DELETE), `/api/telegram/webhook` |
| `server/storage.ts` | Парс/сериализация `example_photo_urls`, `due_date` в CRUD задач |
| `server/telegram/config.ts` | Чтение env, режим работы |
| `server/telegram/client.ts` | Мини-клиент Bot API (send/edit/answerCallback/getUpdates/getFile/setWebhook) |
| `server/telegram/poller.ts` | Long-poll `getUpdates` с offset и backoff |
| `server/telegram/handle-update.ts` | Роутер апдейтов: команды, текст, фото, коллбэки |
| `server/telegram/link.ts` | Login Widget verify + `/start` |
| `server/telegram/composer.ts` | AI-разбор, спиннер, драфт, создание задач |
| `server/telegram/pf-ai.ts` | HTTP-клиент к очереди ProjectsFlow |
| `server/telegram/drafts.ts` | Репозиторий драфтов |
| `server/telegram/cards.ts` | Рендер карточек и клавиатур |
| `server/telegram/callbacks.ts` | Парсер/диспетчер `callback_data` |
| `server/telegram/attachments.ts` | Файлы: приём, распределение, скачивание |
| `server/telegram/my-tasks.ts` | `/tasks`, карточка задачи, закрытие фото |
| `shared/task-visibility.ts` | Переезд `isTaskVisibleOn` + поддержка `dueDate` (общая для клиента и бота) |
| `client/src/lib/task-filters.ts` | Ре-экспорт из `shared/` — существующие импорты и тесты не ломаем |
| `client/src/pages/Account.tsx` | Блок «Telegram» |
| `client/src/pages/CreateTask.tsx`, `EditTask.tsx` | Поле «Срок», галерея примеров фото |
| `client/src/components/GroupedTaskList.tsx`, `TaskViewDialog.tsx` | Бейдж срока/просрочки, галерея примеров |
| `ENV.md`, `.env.example` | Новые переменные |

### ralph (PFLoopDispatch)

| Файл | Изменение |
| --- | --- |
| `prompts/tasksflow-task.md` | Новый системный промпт |
| `ai-job-worker.ps1` | `Test-TasksFlowJob` + `Do-TasksFlow` + ветка диспетчеризации |

### ProjectsFlow

Изменений нет.

## 18. Фазы реализации

| Ф | Содержание | Проверяемый результат |
| --- | --- | --- |
| 1 | Миграции, конфиг, клиент Bot API, поллер/вебхук, роутер, привязка на сайте, `/start` | Привязал аккаунт, бот отвечает на `/start` |
| 2 | `dueDate`: колонка, форма, бейджи, видимость, тесты | На сайте можно поставить срок, просрочка красная |
| 3 | AI-постановка: PF-клиент, промпт в ralph, драфты, карточки, мульти-сегмент, файлы | Написал текст → карточка → задача в системе |
| 4 | `/tasks`, карточка задачи, закрытие фото и чек-листа | Сотрудник закрыл задачу из Telegram |

Фазы 1 и 2 независимы и могут идти параллельно; 3 требует 1; 4 требует 1.

## 19. Вне рамок (YAGNI)

- Голосовые сообщения и транскрибация.
- Групповые чаты и упоминания бота — только личка.
- Редактирование текста задачи внутри бота (правим поля кнопками, текст — на сайте).
- Исходящие уведомления и напоминания из TasksFlow в Telegram.
- Журнальный режим WeSetup через бота.
- Произвольный ввод даты в боте (только пресеты).
- Отдельный агент-токен на компанию (появится, если упрёмся в лимит из §14).
