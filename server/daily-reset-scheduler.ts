import { dayInZone, DEFAULT_TIMEZONE } from "@shared/day";
import { logger } from "./logger";
import { runDueResets } from "./services/daily-reset";
import { photoRetentionDays, pruneHistoryPhotos, resetStore } from "./task-history-store";

/**
 * Раз в минуту: сбросить компании, у которых началась местная полночь
 * (с переносом в историю), и раз в сутки — удалить фото старше
 * PHOTO_RETENTION_DAYS, если он задан. Внешний cron больше не нужен для
 * компаний; `npm run reset-tasks` вызывает ту же логику и безопасен
 * при одновременном запуске (см. server/services/daily-reset.ts).
 */
const TICK_MS = 60_000;
let running = false;
let lastPruneDay: string | null = null;

export async function dailyResetTick(now: number = Math.floor(Date.now() / 1000)): Promise<void> {
  if (running) return;
  running = true;
  try {
    const done = await runDueResets(resetStore, now, {
      onError: (companyId, err) => logger.error({ err, companyId }, "[reset] сброс компании не прошёл, повторим"),
    });
    for (const summary of done) logger.info(summary, "[reset] задачи сброшены, вчерашний день в истории");

    const days = photoRetentionDays();
    const today = dayInZone(now, DEFAULT_TIMEZONE);
    if (days && lastPruneDay !== today) {
      lastPruneDay = today;
      let total = 0;
      for (let i = 0; i < 20; i++) {
        const n = await pruneHistoryPhotos(days, now);
        total += n;
        if (n < 500) break;
      }
      if (total > 0) logger.info({ total, days }, "[reset] удалены старые фото истории");
    }
  } catch (err) {
    logger.error({ err }, "[reset] тик не прошёл");
  } finally {
    running = false;
  }
}

export function startDailyResetScheduler(): () => void {
  if (process.env.DAILY_RESET_SCHEDULER === "off") {
    logger.warn("[reset] DAILY_RESET_SCHEDULER=off — задачи сбрасывает только cron");
    return () => {};
  }
  const first = setTimeout(() => void dailyResetTick(), 20_000);
  const timer = setInterval(() => void dailyResetTick(), TICK_MS);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
