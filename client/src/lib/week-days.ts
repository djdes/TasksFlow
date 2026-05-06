/**
 * Форматирование weekDays для UI бейджей: «Пн, Ср, Пт».
 *
 * Извлечено из GroupedTaskList.tsx — sort-порядок критичен (русская
 * неделя начинается с понедельника, а Date.getDay() с воскресенья=0).
 * Воскресенье должно отображаться ПОСЛЕДНИМ, не первым.
 */

const WEEK_DAY_SHORT_NAMES: Record<number, string> = {
  0: "Вс",
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
};

/**
 * Возвращает строку «Пн, Ср, Пт» из массива дней (0=Вс..6=Сб).
 *
 * Sort-логика: воскресенье (0) преобразуется в 7 для сравнения,
 * чтобы было ПОСЛЕ субботы. Дубликаты игнорируются (через Set).
 *
 *   formatWeekDaysShort([1, 3, 5])     → "Пн, Ср, Пт"
 *   formatWeekDaysShort([0, 6])        → "Сб, Вс"
 *   formatWeekDaysShort([6, 0, 1])     → "Пн, Сб, Вс"
 *   formatWeekDaysShort([])            → ""
 *   formatWeekDaysShort([1, 1, 3])     → "Пн, Ср"
 */
export function formatWeekDaysShort(weekDays: readonly number[]): string {
  if (!weekDays.length) return "";
  const unique = Array.from(new Set(weekDays));
  // Невалидные значения игнорируем: не integer, или вне [0..6].
  // Без isInteger guard'а: 1.5 проходит range-check, но WEEK_DAY_
  // SHORT_NAMES[1.5] = undefined → join выдаёт "Пн, , Ср".
  const valid = unique.filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6,
  );
  return valid
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((d) => WEEK_DAY_SHORT_NAMES[d])
    .join(", ");
}

export { WEEK_DAY_SHORT_NAMES };
