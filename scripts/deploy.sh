#!/usr/bin/env bash
# Manual deploy from the developer machine. Mirrors .github/workflows/deploy.yml
# but runs locally via plink/pscp — useful when GitHub Actions is stuck
# (minutes exhausted, workflow paused, runner outage).
#
# Requirements:
#   - plink + pscp on PATH (ship with PuTTY / choco install putty)
#   - SSH creds exported in env OR read from ~/.wesetup-deploy.env
#
# Usage:
#   ./scripts/deploy.sh            # builds HEAD and deploys
#   ./scripts/deploy.sh --dry-run  # print commands without executing
#
# Environment (set in shell or in ~/.wesetup-deploy.env):
#   DEPLOY_SSH_HOST=wesetup.ru
#   DEPLOY_SSH_USER=wesetupru
#   DEPLOY_SSH_PASS=...
#   DEPLOY_SSH_PORT=22
#   DEPLOY_APP_DIR=/var/www/wesetupru/data/www/wesetup.ru/app
#   DEPLOY_HOSTKEY='ssh-ed25519 255 SHA256:NwU1dGS29JAjs2K5LfEtu3DLFgg04yo7ZEA4iOGkM6E'

set -eo pipefail

# Load creds from rc file if present
RC="$HOME/.wesetup-deploy.env"
if [ -f "$RC" ]; then
  # shellcheck disable=SC1090
  . "$RC"
fi

: "${DEPLOY_SSH_HOST:=wesetup.ru}"
: "${DEPLOY_SSH_USER:=wesetupru}"
: "${DEPLOY_SSH_PORT:=22}"
: "${DEPLOY_APP_DIR:=/var/www/wesetupru/data/www/wesetup.ru/app}"
: "${DEPLOY_HOSTKEY:=ssh-ed25519 255 SHA256:NwU1dGS29JAjs2K5LfEtu3DLFgg04yo7ZEA4iOGkM6E}"

if [ -z "${DEPLOY_SSH_PASS:-}" ]; then
  echo "✖ DEPLOY_SSH_PASS is not set. Create $RC with the deploy creds or export env vars." >&2
  exit 1
fi

DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN="echo [dry-run]"
fi

SHA=$(git rev-parse HEAD)
TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "==> Deploying $SHA ($TIME) to $DEPLOY_SSH_USER@$DEPLOY_SSH_HOST:$DEPLOY_APP_DIR"

echo "==> Writing build markers"
echo "$SHA" > .build-sha
echo "$TIME" > .build-time

echo "==> Creating deploy.tar (excluding node_modules, .next, .git, etc.)"
$DRY_RUN tar cf deploy.tar \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=public/screenshots \
  --exclude=.git \
  --exclude=.github \
  --exclude=.claude \
  --exclude=.vscode \
  --exclude=.agent \
  --exclude=_run.py \
  --exclude=_deploy.py \
  --exclude=_seed_remote.py \
  --exclude=haccp-deploy.tar \
  --exclude='*.tar' \
  --exclude='*.tar.gz' \
  --exclude='*.png' \
  --exclude='prod-*.png' \
  --exclude=test.txt \
  --exclude=.playwright-mcp \
  .

PLINK=(plink -batch -hostkey "$DEPLOY_HOSTKEY" -P "$DEPLOY_SSH_PORT" -l "$DEPLOY_SSH_USER" -pw "$DEPLOY_SSH_PASS" "$DEPLOY_SSH_HOST")
PSCP=(pscp -batch -hostkey "$DEPLOY_HOSTKEY" -P "$DEPLOY_SSH_PORT" -pw "$DEPLOY_SSH_PASS")

echo "==> Backing up .env on server"
$DRY_RUN "${PLINK[@]}" "[ -f $DEPLOY_APP_DIR/.env ] && cp $DEPLOY_APP_DIR/.env $DEPLOY_APP_DIR/.env.bak || true"

echo "==> Uploading tarball"
$DRY_RUN "${PSCP[@]}" deploy.tar "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST:$DEPLOY_APP_DIR/deploy.tar"

echo "==> Extracting + restoring .env"
$DRY_RUN "${PLINK[@]}" "cd $DEPLOY_APP_DIR && rm -rf src scripts prisma public .github docs && tar xf deploy.tar && rm deploy.tar && [ -f .env.bak ] && cp .env.bak .env || true"

echo "==> Installing deps + building on prod host"
$DRY_RUN "${PLINK[@]}" "cd $DEPLOY_APP_DIR && [ -s ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh || true; rm -rf node_modules .next && npm ci 2>&1 | tail -5 && npx prisma generate 2>&1 | tail -5 && npm run build 2>&1 | tail -10"

echo "==> Running prisma db push + seeds"
$DRY_RUN "${PLINK[@]}" "cd $DEPLOY_APP_DIR && [ -s ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh || true; npx prisma db push 2>&1 | tail -5 && set -a && . ./.env && set +a && npx tsx prisma/seed.ts 2>&1 | tail -5"

echo "==> Restarting PM2"
$DRY_RUN "${PLINK[@]}" "cd $DEPLOY_APP_DIR && [ -s ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh || true; npx pm2 restart haccp-online --update-env 2>&1 | tail -3 && npx pm2 restart haccp-telegram-poller --update-env 2>&1 | tail -3 && npx pm2 save 2>&1 | tail -2"

echo "==> Probing HTTP"
sleep 3
$DRY_RUN "${PLINK[@]}" "curl -I -s http://127.0.0.1:3002 | head -3"

echo "==> Cleanup local artifacts"
$DRY_RUN rm -f deploy.tar .build-sha .build-time

echo "✓ Deploy of $SHA complete. Remember: the repo on the server is NOT a git checkout — verify via .build-sha."
