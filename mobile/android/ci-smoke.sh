#!/usr/bin/env bash
# Запуск APK в эмуляторе (CI, job emulator в mobile-android.yml):
# ставим, открываем, ждём и проверяем, что приложение отдало tasksflow.ru
# в Chrome (TWA или Custom Tab) и не упало. Снимок экрана и логи — в OUT.
#   bash mobile/android/ci-smoke.sh <apk> <out-dir>
set -euo pipefail
APK="$1"
OUT="$2"
PKG="ru.tasksflow.app"
mkdir -p "$OUT"

adb install -r "$APK"
adb shell pm list packages | grep -qx "package:$PKG"
adb shell dumpsys package "$PKG" | grep -E "versionCode|versionName|targetSdk" | head -3

# На свежем эмуляторе Chrome сначала показывает «Добро пожаловать» —
# у людей он уже настроен. Отладочный образ читает флаги из этого файла.
if adb shell pm list packages | grep -q "package:com.android.chrome"; then
  adb shell 'echo "chrome --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
  adb shell am force-stop com.android.chrome
  echo "Chrome: $(adb shell dumpsys package com.android.chrome | grep -m1 versionName)"
else
  echo "Chrome в образе нет — приложение откроет Custom Tab другого браузера"
fi

adb logcat -c
adb shell am start -W -n "$PKG/.LauncherActivity"
# Ждём, пока Chrome откроет кабинет (до 60 с).
for _ in $(seq 1 30); do
  sleep 2
  adb shell dumpsys activity activities | grep -q "tasksflow.ru" && break
done
sleep 8

adb exec-out screencap -p > "$OUT/launch.png"
adb shell dumpsys activity activities > "$OUT/activities.txt"
adb logcat -d > "$OUT/logcat.txt"

if grep -A8 "FATAL EXCEPTION" "$OUT/logcat.txt" | grep -q "$PKG"; then
  echo "Приложение упало:"
  grep -A20 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -40
  exit 1
fi

focus="$(adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | head -2)"
echo "$focus"
if ! echo "$focus" | grep -Eq "com\.android\.chrome|org\.chromium|com\.google\.android\.apps\.chrome|$PKG"; then
  echo "На экране не Chrome и не TasksFlow"
  exit 1
fi
# Chrome должен был получить именно кабинет.
grep -q "tasksflow.ru" "$OUT/activities.txt" && echo "tasksflow.ru открыт" || {
  echo "В активностях нет tasksflow.ru"
  exit 1
}
