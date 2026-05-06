/**
 * Coerce weekDays из разных представлений (array / JSON-string / null)
 * в clean array of integers [0..6] или null.
 *
 * Используется в EditTask и DuplicateTaskDialog при заполнении формы
 * из task'а (server возвращает weekDays как массив, но legacy/sync
 * данные могут прийти как JSON-string).
 *
 * Защищает от corrupted данных:
 *   • Array.isArray check после JSON.parse (string '{"foo":1}' даёт
 *     object, не array)
 *   • integer + range filter (защита от floats и out-of-range)
 *
 * Симметрично с server-side z.array(z.number().int().min(0).max(6))
 * — ловит те же anomalies.
 */

export function coerceWeekDays(input: unknown): number[] | null {
  let candidate: unknown = input;

  // Если это string — попробуем распарсить как JSON.
  if (typeof candidate === "string") {
    if (candidate.trim() === "") return null;
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(candidate)) return null;

  const filtered = candidate.filter(
    (n): n is number =>
      typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6,
  );

  return filtered.length > 0 ? filtered : null;
}
