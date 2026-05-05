/**
 * Pure-функции backoff-лестницы для webhook delivery queue.
 *
 * Отделено от webhook-queue.ts чтобы тесты могли импортить без
 * подтягивания storage → db → MYSQL_* env vars. Логика тут не зависит
 * ни от чего внешнего, только Date.now().
 *
 * См. server/webhook-queue.ts для контекста использования и
 * tests/webhook-queue.test.ts для regression-тестов.
 *
 * История фиксов:
 *   • Тик 7 (commit d055e99): после первого синхронного fail
 *     attemptOrEnqueue писал attempts=0 → дубликат 5min задержки в
 *     начале лестницы. Фикс: attempts=1 при enqueue, лестница строго
 *     возрастает на retry-шагах.
 */

/**
 * Backoff-лестница в минутах. attempts=0 — синхронная попытка
 * (мгновенная, RETRY_LADDER_MIN[0]=0). attempts=1 — первый ретрай
 * через 5 мин. И т.д.
 *
 * Sum = 0+5+15+60+360+1440 = 1880 мин ≈ 31.3 часа от первого fail
 * до permanent failed.
 */
export const RETRY_LADDER_MIN = [0, 5, 15, 60, 6 * 60, 24 * 60] as const;

export const MAX_ATTEMPTS = RETRY_LADDER_MIN.length;

/**
 * Когда сделать следующий retry-попытку (unix-seconds). attempts —
 * сколько попыток уже было сделано (включая синхронную).
 */
export function computeNextRetryAt(attempts: number): number {
  const delayMin =
    RETRY_LADDER_MIN[Math.min(attempts, RETRY_LADDER_MIN.length - 1)];
  return Math.floor(Date.now() / 1000) + delayMin * 60;
}

/** Should this HTTP error trigger a retry? */
export function isRetriable(status: number): boolean {
  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;
  return false;
}
