#!/usr/bin/env bash
# Запуск сборки в iOS Simulator (CI, mobile-ios.yml): ставим, открываем,
# ждём строку "tf-loaded https://tasksflow.ru/..." из WebViewController
# (страница загрузилась) и снимаем экран.
#   bash mobile/ios/ci-smoke.sh <TasksFlow.app> <out-dir>
set -euo pipefail
APP="$1"
OUT="$2"
BUNDLE="ru.tasksflow.app"
mkdir -p "$OUT"

# Самый свежий доступный iPhone.
UDID="$(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
devices = json.load(sys.stdin)["devices"]
best = []
for runtime, items in devices.items():
    if ".iOS-" not in runtime:
        continue
    version = [int(x) for x in re.findall(r"\d+", runtime.split(".iOS-")[1])]
    for d in items:
        if d["name"].startswith("iPhone"):
            best.append((version, d["name"], d["udid"]))
best.sort()
print(best[-1][2])
')"
echo "Simulator: $UDID"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b

xcrun simctl install "$UDID" "$APP"
xcrun simctl spawn "$UDID" log stream --style compact --predicate "subsystem == \"$BUNDLE\"" > "$OUT/app.log" 2>&1 &
LOG_PID=$!
sleep 2
xcrun simctl launch "$UDID" "$BUNDLE"

for _ in $(seq 1 90); do
  grep -q "tf-loaded" "$OUT/app.log" && break
  sleep 1
done
# Даём странице дорисоваться после load.
sleep 5
xcrun simctl io "$UDID" screenshot "$OUT/launch.png"
kill "$LOG_PID" 2>/dev/null || true

tail -20 "$OUT/app.log"
grep -q "tf-loaded https://tasksflow.ru/" "$OUT/app.log"
echo "Кабинет загрузился в приложении"
