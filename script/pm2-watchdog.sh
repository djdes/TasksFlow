#!/bin/sh
# Поднимает PM2 обратно, если демон умер.
#
# Зачем: 08.08.2026 сервер перезагрузился, и все проекты на нём легли —
# у PM2 нет systemd-автозапуска, а сделать `pm2 startup` нельзя, он требует
# root. Прод пролежал почти двое суток. Этот скрипт закрывает дыру
# средствами обычного пользователя: его дёргает пользовательский crontab
# по @reboot и раз в 5 минут как страховка.
#
# Падение самого процесса tasksflow чинит PM2 (autorestart) — здесь
# обрабатывается только случай «демона нет вообще / список пуст».
#
# Ставится кроном на деплое (.github/workflows/deploy.yml, шаг
# "ensure autostart cron"). Руками запускать не нужно.

NODEBIN="$HOME/.nvm/versions/node/v24.12.0/bin"
LOG="$HOME/pm2-watchdog.log"

PATH="$NODEBIN:$PATH"
export PATH

# `pm2 jlist` сам поднимает демона, если тот мёртв, и возвращает [].
ONLINE=$("$NODEBIN/pm2" jlist 2>/dev/null | grep -o '"status":"online"' | wc -l)

if [ "$ONLINE" -eq 0 ]; then
  echo "$(date -Is) watchdog: pm2 пуст -> resurrect" >> "$LOG"
  "$NODEBIN/pm2" resurrect >> "$LOG" 2>&1
fi
