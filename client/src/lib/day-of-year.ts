/**
 * Утилиты «один tip / факт / совет в день» — стабильны в течение
 * локальных суток, меняются в полночь.
 *
 * Извлечено из TipOfTheDay.tsx чтобы тестировать без React/JSX-runtime.
 */

/**
 * Стабильный day-of-year в локальном timezone (с учётом DST).
 * 1 января (полдень) = 1, 31 декабря в обычный год = 365.
 */
export function dayOfYearLocal(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff =
    date.getTime() -
    start.getTime() +
    (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60_000;
  return Math.floor(diff / 86_400_000);
}

/** Выбирает item из array стабильно для одного дня (округление по day-of-year). */
export function pickByDayOfYear<T>(date: Date, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pickByDayOfYear: empty items array");
  }
  return items[dayOfYearLocal(date) % items.length];
}
