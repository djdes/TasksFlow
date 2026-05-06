/**
 * Форматирование Unix timestamp (секунды) в человеко-читаемое
 * локализованное datetime string'ом для admin таблиц (API keys,
 * integrations, webhook queue).
 *
 * Раньше эта функция дублировалась в ApiKeys.tsx и Integrations.tsx.
 * Извлечено для DRY и unit-тестирования (toLocaleString — небольшой
 * runtime trap при ts=0 / null / NaN).
 */

/**
 * @param ts Unix timestamp в секундах (типичный column в БД).
 * @returns "06.05.2026, 12:34:56" в ru-RU локали, "—" если ts=0/null/undefined/NaN.
 */
export function formatTimestamp(
  ts: number | null | undefined,
): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  return new Date(ts * 1000).toLocaleString("ru-RU");
}
