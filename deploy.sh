#!/bin/bash

set -uo pipefail

SERVER_USER="tasksflow"
SERVER_HOST="tasksflow.ru"
SERVER_PORT="50222"
REMOTE_PATH="/var/www/tasksflow/data/www/tasksflow.ru"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}=== TasksFlow Deploy ===${NC}"
echo -e "Server: ${SERVER_USER}@${SERVER_HOST}:${SERVER_PORT}"
echo -e "Path: ${REMOTE_PATH}"
echo ""

echo -e "${GREEN}Connecting to server...${NC}"
if ssh -p "$SERVER_PORT" "$SERVER_USER@$SERVER_HOST" << 'EOF'
set -Eeuo pipefail

export PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH"
DEPLOY_PATH="/var/www/tasksflow/data/www/tasksflow.ru"

cd "$DEPLOY_PATH"
[ -f package.json ] || { echo "FATAL: package.json not found in $(pwd)"; exit 1; }

echo ">>> pulling latest main"
git pull --ff-only origin main
git log --oneline -1

DEPS_STAMP=".deploy-deps.sha256"
DEPS_HASH="$(sha256sum package.json package-lock.json | sha256sum | awk '{print $1}')"
if [ ! -d node_modules ] || [ ! -f "$DEPS_STAMP" ] || [ "$(cat "$DEPS_STAMP")" != "$DEPS_HASH" ]; then
  echo ">>> dependencies changed: npm ci"
  npm ci --no-audit --fund=false --prefer-offline
  echo "$DEPS_HASH" > "$DEPS_STAMP"
else
  echo ">>> dependencies unchanged: skip npm ci"
fi

echo ">>> safe migrations"
npm run create-api-keys-table || echo "api_keys migration failed (non-fatal)"
npm run add-claim-col || echo "claim col migration failed (non-fatal)"
npm run add-managed-workers-col || echo "managed-workers col migration failed (non-fatal)"

echo ">>> build"
npm run build

echo ">>> reload app"
if pm2 describe tasksflow > /dev/null 2>&1; then
  pm2 reload tasksflow --update-env || pm2 restart tasksflow --update-env
else
  pm2 start dist/index.cjs --name tasksflow --cwd "$DEPLOY_PATH"
  pm2 save
fi

pm2 status
EOF
then
    echo ""
    echo -e "${GREEN}=== Deploy completed! ===${NC}"
    echo -e "Site: https://${SERVER_HOST}"
else
    echo ""
    echo -e "${RED}=== Deploy error! ===${NC}"
    exit 1
fi
