# Environment Variables

Create a `.env` file in the project root (`TasksFlow/.env`) with the
following variables:

```
MYSQL_HOST=your_host
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
SESSION_SECRET=your_secret_key
PORT=5000
NODE_ENV=production
```

Notes:
- `PORT` should match the port your Node.js server listens on (default: 5000).
- `NODE_ENV=production` is required for static serving in production.
- `SESSION_SECRET` should be a long, random string.

## Email-авторизация и PHP-почта (лендинг)

Письма (welcome / magic-login / recovery) уходят СТРОГО через PHP.

**По умолчанию в production** mailer вызывает `php -r` с нативным `mail()`
(транспорт `php-cli`). Это НЕ требует ни env, ни токена, ни правок nginx —
нужен только установленный PHP на хосте (на FastPanel/Linux он есть).

Выбор транспорта (`server/mailer.ts`):
- `PHP_RELAY_URL` + `PHP_RELAY_TOKEN` заданы → `php-relay` (HTTP `send.php`);
- иначе `NODE_ENV=production` → `php-cli` (`php -r` mail()) — **дефолт**;
- иначе → `dev` (письма пишутся в `.dev-outbox/*.html`, не отправляются).

```
# Необязательно: путь к php, если не в PATH
PHP_BIN=/usr/bin/php
# Необязательно: отображаемый отправитель (envelope-from берётся отсюда же)
MAIL_FROM="TasksFlow <noreply@tasksflow.ru>"

# Альтернатива php-cli — HTTP-реле send.php в веб-корне (если так удобнее):
# PHP_RELAY_URL=https://tasksflow.ru/send.php
# PHP_RELAY_TOKEN=<длинный_рандом_>=32_символа, тот же что в send.php>
```

- Доставляемость: для писем нужна корректная DNS/SPF домена
  (`v=spf1 ip4:<IP сервера> ~all`) и рабочий локальный MTA (exim/postfix),
  иначе Gmail может отклонять письма от `mail()`.

## Telegram-бот (@thetasksflowbot)

Бот принимает задачи текстом, показывает карточку и создаёт задачи, а
сотрудникам даёт `/tasks` и закрытие фотографией.

**Без `TASKSFLOW_BOT_TOKEN` модуль бота не стартует вовсе** — в лог уходит
одна строка, сервер работает ровно как раньше.

```
TASKSFLOW_BOT_TOKEN=8810015596:AA...
# Нужен Login Widget'у на странице «Аккаунт» и для ссылки t.me/<username>
TELEGRAM_BOT_USERNAME=thetasksflowbot

# auto | webhook | polling | off
# auto = webhook, если заданы URL и секрет; иначе long-poll getUpdates
TELEGRAM_MODE=auto
TELEGRAM_WEBHOOK_URL=https://tasksflow.ru/api/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=<рандом ≥32 символов>
```

Замечания:
- **Привязка аккаунта работает только на домене из BotFather** (`/setdomain
  tasksflow.ru`) и только по https. На localhost Telegram откажет — это
  ограничение их стороны. Для локальной проверки проставьте
  `users.telegram_user_id` вручную в БД.
- `TELEGRAM_WEBHOOK_SECRET` обязателен в webhook-режиме: без него вебхук
  отбрасывает все апдейты (принимать что угодно от кого угодно нельзя).
- **Polling предпочтительнее за прокси**: он не требует входящей
  доступности вообще, обе стороны идут через один и тот же прокси.

### Если хостинг не пускает к api.telegram.org

RU-провайдеры местами не маршрутизируют подсети Telegram (типично
`ETIMEDOUT`). Два варианта, любой из них:

```
# 1. HTTP-прокси (через него идут и sendMessage, и getUpdates)
TELEGRAM_HTTP_PROXY=http://user:pass@proxy-host:3128
# 2. Свой relay вместо api.telegram.org
TELEGRAM_API_BASE_URL=https://tg-relay.example.com
```

Тот же приём используется в ProjectsFlow — прокси там уже настроен, его
значение можно взять из `.env` на прод-сервере ProjectsFlow.

## AI-разбор задач через очередь ProjectsFlow

Бот кладёт сообщение в очередь ProjectsFlow, воркер ralph зовёт Claude с
промптом `prompts/tasksflow-task.md` и возвращает JSON с сегментами.

```
PF_API_URL=https://projectsflow.ru/api
PF_AGENT_TOKEN=pfat_...
PF_TASKSFLOW_PROJECT_ID=bcc868e6-853c-4c8b-a592-6f3fcb20a298
```

Если переменные не заданы или AI недоступен (лимит, таймаут, битый ответ),
бот **не ломается**: он отдаёт ручной черновик с той же карточкой, и
руководитель доставляет поля кнопками. Сообщение не теряется никогда.

Известное ограничение: ProjectsFlow лимитирует режим `improve` как 60
job'ов в час на пользователя-инициатора, а инициатор один — владелец
`PF_AGENT_TOKEN`. Значит потолок 60 разборов в час на всех пользователей
бота. Сверху есть свой лимит 20 разборов в час на пользователя, чтобы один
чат не выел общий.

## Аналитика (опционально, для SEO-трафика)

Счётчики грузятся только если задан ID, иначе ничего не подключается.

```
YM_ID=<id Яндекс.Метрики>
GA_ID=<id Google Analytics 4>
```
