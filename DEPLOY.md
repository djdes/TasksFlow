# Деплой

Прод — tasksflow.ru: процесс PM2 `tasksflow` (Node 24 из nvm на сервере), MariaDB 10.11.
Веб-сервер проксирует запросы на порт из `.env` (`PORT`, без него 5000; пример для Apache —
`.htaccess.example`). Прод — чистая копия `origin/main`: руками на сервере код не правят.

## Как выкатывается

Push в `main` запускает `.github/workflows/deploy.yml` («Deploy to Production»). Повторить
выкладку без нового коммита — «Run workflow» у этого workflow. Деплои идут по одному: следующий
ждёт, пока закончится текущий.

1. **test** — `npm ci`, `npm run check`, `npm test`, `npm run build`. Красный `main` на прод
   не уезжает. UI smoke здесь не гоняется: его прогоняет `ci.yml` на PR и рабочих ветках.
2. **deploy** — по SSH на сервере:
   - `git fetch` и `git reset --hard origin/main`; ручные правки пропадают, лог их перечисляет;
   - секреты GitHub с именами переменных дописываются в `.env`, пустые его не трогают;
   - `npm ci`, если поменялись `package.json` или `package-lock.json`; ключи VAPID для push
     создаются один раз и дальше не меняются;
   - `npm run backup-db` — дамп в `~/backups` до миграций; без бэкапа деплой останавливается;
   - шаг «safe migrations»: строка без `|| echo` обязательна, её падение останавливает деплой до
     сборки и оставляет прод на старом коде;
   - сборка в `dist.next`, подмена `dist` только после успеха; прежняя сборка лежит в
     `~/.tasksflow-deploy/dist.prev`;
   - `pm2 reload`, затем `/api/health` должен за ~90 секунд отдать `buildSha` новой сборки,
     иначе деплой сам откатывается на прежнюю;
   - проверка адресов оплаты (только предупреждения в логе) и crontab для
     `script/pm2-watchdog.sh`: поднимает PM2 после перезагрузки сервера и проверяет его раз в
     5 минут.

После выкладки: `https://tasksflow.ru/api/health` — `buildSha` равен короткому SHA коммита.
Логи PM2, команды на сервере и SQL на чтение из облачной сессии Claude — скилл `prod`
(`.claude/skills/prod`, мостик `.github/workflows/claude-ops.yml`).

## Секреты GitHub

- Доступ: `SSH_HOST`, `SSH_USER`, `SSH_PORT`, `SSH_PRIVATE_KEY`; `DEPLOY_PATH` необязателен
  (по умолчанию `/var/www/tasksflow/data/www/tasksflow.ru`).
- Приложение: Telegram, ProjectsFlow, почта, Робокасса, реквизиты, DaData — полный список в
  `env:` шага деплоя, смысл каждой переменной — `ENV.md` и `.env.example`.
- Мобильные приложения и их ключи подписи — `docs/mobile.md`.

## SSH из Claude Code на своём компьютере

`.mcp.json` подключает MCP-сервер `ssh-tasks`. Порт, пользователь и ключ он берёт из переменных
окружения, а не из файла, потому что репозиторий публичный: `TASKSFLOW_SSH_PORT`,
`TASKSFLOW_SSH_USER`, `TASKSFLOW_SSH_KEY_PATH` и необязательный `TASKSFLOW_SSH_HOST` (по умолчанию
`tasksflow.ru`). В Windows задайте их через `setx ИМЯ значение` и перезапустите терминал. Из облачной
сессии SSH закрыт — там работает скилл `prod`.

## Новый сервер

1. Node 24 через nvm (деплой берёт `~/.nvm/versions/node/v24.12.0/bin`), PM2, MariaDB 10.11 с
   временем МСК и utf8mb4.
2. Клон репозитория в `DEPLOY_PATH`, `.env` с `MYSQL_*`, `SESSION_SECRET`, `PORT`,
   `NODE_ENV=production`.
3. Пустая база — по README (Quick Start, «Схема базы»). `setup-db` и `db:push` заблокированы.
4. Веб-сервер проксирует всё на `PORT`, затем первый деплой через «Run workflow».

## Ежедневный сброс задач

Повторяющиеся задачи (`isRecurring: true`) сервер сбрасывает сам — в местную полночь каждой
компании (пояс задаётся в настройках компании, по умолчанию Москва). Перед сбросом вчерашний
день уходит в историю (`task_history`): выполненные задачи с фото, чек-листом и проверкой,
невыполненные по расписанию — как пропуск. Файлы фото не удаляются; старые можно удалять
переменной `PHOTO_RETENTION_DAYS`.

Cron — подстраховка для задач без компании. Запускать его повторно и одновременно с сервером
безопасно: компания сбрасывается один раз за местный день.

```bash
mkdir -p /var/www/tasksflow/data/www/tasksflow.ru/logs
crontab -e
```

```
0 0 * * * cd /var/www/tasksflow/data/www/tasksflow.ru && /var/www/tasksflow/data/.nvm/versions/node/v24.12.0/bin/npm run reset-tasks >> ./logs/reset-tasks.log 2>&1
```

Вручную: `npm run reset-tasks`, лог — `./logs/reset-tasks.log`.
