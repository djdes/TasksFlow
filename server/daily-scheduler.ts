import { dayInZone, DEFAULT_TIMEZONE } from "@shared/day";
import { logger } from "./logger";
import { getPublicTasksflowBaseUrl } from "./public-urls";
import { runDueResets } from "./services/daily-reset";
import { runReminders } from "./services/reminders";
import { reminderStore, telegramSender } from "./reminders-runtime";
import { photoRetentionDays, pruneHistoryPhotos, resetStore } from "./task-history-store";

/**
 * Раз в минуту, по местному времени каждой компании:
 *   • сброс повторяющихся задач в полночь с переносом дня в историю;
 *   • напоминания и итоги дня в Telegram (если бот запущен);
 *   • раз в сутки — удаление фото старше PHOTO_RETENTION_DAYS, если задан.
 * Внешний cron для компаний больше не нужен; `npm run reset-tasks`
 * вызывает ту же логику сброса и безопасен при одновременном запуске.
 */
const TICK_MS = 60_000;
let running = false;
let lastPruneDay: string | null = null;

export async function dailyTick(now: number = Math.floor(Date.now() / 1000)): Promise<void> {
  if (running) return;
  running = true;
  try {
    const done = await runDueResets(resetStore, now, {
      onError: (companyId, err) => logger.error({ err, companyId }, "[reset] сброс компании не прошёл, повторим"),
    });
    for (const summary of done) logger.info(summary, "[reset] задачи сброшены, вчерашний день в истории");

    const { getTelegramRuntime } = await import("./telegram");
    const runtime = getTelegramRuntime();
    if (runtime) {
      const runs = await runReminders(reminderStore, telegramSender(runtime), now, {
        reportUrl: `${getPublicTasksflowBaseUrl()}/reports`,
        onError: (companyId, err) => logger.error({ err, companyId }, "[reminders] рассылка не прошла"),
      });
      for (const run of runs) if (run.sent > 0) logger.info(run, "[reminders] отправлено");
    }

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

export function startDailyScheduler(): () => void {
  if (process.env.DAILY_RESET_SCHEDULER === "off") {
    logger.warn("[reset] DAILY_RESET_SCHEDULER=off — задачи сбрасывает только cron, напоминаний нет");
    return () => {};
  }
  const first = setTimeout(() => void dailyTick(), 20_000);
  const timer = setInterval(() => void dailyTick(), TICK_MS);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
