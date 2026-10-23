import "dotenv/config";
import { runDueResets } from "../server/services/daily-reset";
import { resetStore } from "../server/task-history-store";

/**
 * Ручной/cron-запуск ежедневного сброса: `npm run reset-tasks`.
 *
 * Компании сервер сбрасывает сам в их местную полночь (планировщик в
 * server/daily-reset-scheduler.ts), этот скрипт — подстраховка и сброс
 * задач без компании (старые данные). Повторный запуск безопасен: компания
 * сбрасывается раз за местный день, история пишется без дублей, фото
 * больше не удаляются — вчерашний день остаётся в истории.
 */
async function main() {
  const done = await runDueResets(resetStore, Math.floor(Date.now() / 1000), {
    includeLegacy: true,
    onError: (companyId, err) => {
      console.error(`Сброс не прошёл (компания ${companyId ?? "без компании"}):`, err);
      process.exitCode = 1;
    },
  });
  for (const s of done) {
    console.log(
      `Компания ${s.companyId ?? "—"}: день ${s.day} в истории (${s.archived} записей, пропущено ${s.missed}), сброшено задач: ${s.reset}`,
    );
  }
  if (done.length === 0) console.log("Сбрасывать нечего: у всех компаний сегодня уже был сброс");
}

main()
  .catch((err) => {
    console.error("Ошибка:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Пул MySQL держит event loop — выходим явно, сохранив код ошибки.
    setTimeout(() => process.exit(process.exitCode ?? 0), 100);
  });
