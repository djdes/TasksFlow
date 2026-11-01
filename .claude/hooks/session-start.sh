#!/bin/bash
# SessionStart для облачных сессий Claude Code: ставит зависимости npm, чтобы
# npm run check / lint / test / smoke работали сразу. Локально ничего не делает.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Ставим, только если с прошлой удачной установки поменялся этот скрипт,
# package.json или lock-файл. npm ci, а не npm install: lock не переписывается,
# и сессия не начинается с грязного package-lock.json.
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  npm ci --no-audit --no-fund
  sha256sum .claude/hooks/session-start.sh package.json package-lock.json > "$hashes" || rm -f "$hashes"
fi
