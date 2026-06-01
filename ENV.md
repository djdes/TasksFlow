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

Письма (welcome / magic-login / recovery) уходят СТРОГО через PHP-реле
`php-relay/send.php`, которое кладётся в веб-корень домена.

```
# URL реле и общий секрет (тот же, что RELAY_TOKEN внутри send.php)
PHP_RELAY_URL=https://tasksflow.ru/send.php
PHP_RELAY_TOKEN=<длинный_рандом_>=32_символа>
# Необязательно: отображаемый From (по умолчанию задаётся в send.php)
MAIL_FROM="TasksFlow <noreply@tasksflow.ru>"
```

- Без `PHP_RELAY_URL` + `PHP_RELAY_TOKEN` mailer работает в dev-режиме:
  пишет письма в `.dev-outbox/*.html` и НИЧЕГО не отправляет.
- Деплой: скопировать `php-relay/send.php` в веб-корень, поменять в нём
  `RELAY_TOKEN` на тот же секрет, и для доставляемости добавить SPF-запись
  в DNS домена (`v=spf1 ip4:<IP сервера> ~all`).

## Аналитика (опционально, для SEO-трафика)

Счётчики грузятся только если задан ID, иначе ничего не подключается.

```
YM_ID=<id Яндекс.Метрики>
GA_ID=<id Google Analytics 4>
```
