#!/usr/bin/env bash
# Дев-стенд TasksFlow в облачном контейнере Claude: MariaDB 10.11 (МСК) + `npm run dev`
# (Express + Vite) на :5000.
#
#   bash .claude/skills/dev-stand/stand.sh [up]   поднять (база, .env, зависимости, схема, демо, сервер)
#   bash .claude/skills/dev-stand/stand.sh status | logs [N] | down | reset
#
# Схема пустой базы: базовые таблицы — из shared/schema.ts (`drizzle-kit export` только печатает
# SQL, к базе не подключается), остальное — те же скрипты script/, что гоняет деплой, в его порядке.
# `setup-db`, `db:push`, `drizzle-kit push` здесь не используются: они запрещены (потеря базы 28.04.2026).
# Вход: +79990000001, PIN 4826 (админ и root).

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DS_ROOT="$(cd "$HERE/../../.." && pwd)"
. "$HERE/lib.sh"
cd "$DS_ROOT"

DB=tasksflow_dev
DB_USER=tasksflow_dev
DB_PASS=devpass123
PORT=5000
URL="http://localhost:$PORT"
ADMIN_PHONE=+79990000001
ADMIN_PIN=4826
export MYSQL_HOST=127.0.0.1 MYSQL_USER="$DB_USER" MYSQL_PASSWORD="$DB_PASS" MYSQL_DATABASE="$DB"

write_env() {
  ds_write_env .env <<EOF
MYSQL_HOST=$MYSQL_HOST
MYSQL_USER=$MYSQL_USER
MYSQL_PASSWORD=$MYSQL_PASSWORD
MYSQL_DATABASE=$MYSQL_DATABASE
SESSION_SECRET=dev-stand-session-secret-only-for-local-db-0123456789
PORT=$PORT
# Бот на стенде не нужен: с токеном сервер ждёт Telegram до 90 с перед стартом.
TELEGRAM_MODE=off
LOG_LEVEL=info
EOF
}

# Те же миграции, что в деплое (порядок читается из deploy.yml), плюс скрипты, которых нет
# в деплое, но без которых схема неполная. Все идемпотентны.
migrate() {
  local chain extra name
  chain="$(grep -oE 'npm run [a-z0-9:-]+' .github/workflows/deploy.yml | awk '{print $3}' | grep -vE '^(backup-db|build)$' | awk '!seen[$0]++')"
  extra="add-email-auth-cols add-is-root-col add-checklist-col add-banners-table db:indexes"
  for name in $chain $extra; do
    if ! npm run -s "$name" >>"$DS_OUT/migrate.log" 2>&1; then
      case "$name" in
        add-pin-cols | add-company-features | add-billing) ds_die "обязательная миграция $name упала, лог: output/dev-stand/migrate.log" ;;
        *) ds_log "миграция $name упала (в деплое она тоже необязательна)" ;;
      esac
    fi
  done
  for f in script/_add-audit-log-table.ts script/add-sessions-table.ts script/add-webhook-deliveries.ts; do
    [ -f "$f" ] && { npx tsx "$f" >>"$DS_OUT/migrate.log" 2>&1 || ds_log "$f упал"; }
  done
}

schema() {
  local stamp="$DS_OUT/tasksflow-schema.sha256" want tables
  want="$(cat shared/schema.ts .github/workflows/deploy.yml script/*.ts | sha256sum | cut -d' ' -f1)"
  tables="$(ds_db_tables "$DB")"
  if [ "$tables" = 0 ]; then
    ds_log "пустая база: базовые таблицы users/companies/workers/tasks из shared/schema.ts"
    npx drizzle-kit export --dialect=mysql --schema=./shared/schema.ts >"$DS_OUT/schema-export.sql" 2>"$DS_OUT/schema-export.log" ||
      ds_die "drizzle-kit export упал, лог: output/dev-stand/schema-export.log"
    node -e '
      const s = require("fs").readFileSync(process.argv[1], "utf8");
      const body = s.slice(s.indexOf("CREATE TABLE"));
      for (const st of body.split(/;\s*\n/)) {
        const m = st.match(/CREATE TABLE `(\w+)`/);
        if (m && ["users", "companies", "workers", "tasks"].includes(m[1])) process.stdout.write(st.trim() + ";\n");
      }' "$DS_OUT/schema-export.sql" | ds_sql "$DB"
  elif [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$want" ]; then
    return 0
  fi
  ds_log "миграции script/ в порядке деплоя (лог: output/dev-stand/migrate.log)…"
  : >"$DS_OUT/migrate.log"
  migrate
  tables="$(ds_db_tables "$DB")"
  ds_log "таблиц в $DB: $tables"
  echo "$want" >"$stamp"
}

up() {
  ds_require_cloud
  ds_mariadb_up
  ds_db_ensure "$DB" "$DB_USER" "$DB_PASS"
  write_env
  ds_deps
  schema
  ds_start tasksflow "$PORT" npm run dev
  ds_log "жду $URL/api/health…"
  ds_wait_http "$URL/api/health" 180 || {
    tail -40 "$DS_OUT/tasksflow.log" >&2
    ds_die "сервер не ответил, лог: output/dev-stand/tasksflow.log"
  }
  if [ "$(ds_sql -N -e "SELECT COUNT(*) FROM \`$DB\`.users")" = 0 ]; then
    ds_log "демо-данные через API (компания, сотрудники, задачи)"
    TF_URL="$URL" TF_ADMIN_PHONE="$ADMIN_PHONE" TF_ADMIN_PIN="$ADMIN_PIN" node "$HERE/seed.mjs" || ds_die "сид упал"
    ds_sql "$DB" -e "UPDATE users SET is_root = 1 WHERE phone = '$ADMIN_PHONE'"
  fi
  echo "TasksFlow: $URL  (вход: $ADMIN_PHONE / PIN $ADMIN_PIN — админ и root; демо без входа: $URL/demo)"
}

case "${1:-up}" in
  up) up ;;
  down) ds_stop tasksflow ;;
  status) ds_status_line tasksflow "$PORT" "$URL/api/health" ;;
  logs) tail -n "${2:-80}" "$DS_OUT/tasksflow.log" ;;
  reset)
    ds_stop tasksflow
    ds_mariadb_up
    ds_db_drop "$DB"
    rm -f "$DS_OUT/tasksflow-schema.sha256"
    up
    ;;
  *) ds_die "команды: up | status | logs [N] | down | reset" ;;
esac
