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

## Аналитика (опционально, для SEO-трафика)

Счётчики грузятся только если задан ID, иначе ничего не подключается.

```
YM_ID=<id Яндекс.Метрики>
GA_ID=<id Google Analytics 4>
```
