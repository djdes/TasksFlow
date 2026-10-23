/**
 * Форматирование weekDays для UI бейджей: «Каждый день», «По будням»,
 * «Пн–Чт», «Пн, Ср, Пт».
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

/** Порядок в русской неделе: Пн=1 … Сб=6, Вс=7. */
const mondayFirst = (day: number) => (day === 0 ? 7 : day);

/**
 * Короткая подпись расписания из массива дней (0=Вс..6=Сб).
 *
 * Полная неделя, будни и выходные называются словами — на карточке это
 * читается быстрее, чем семь сокращений. Три и больше подряд идущих дня
 * сворачиваются в диапазон, остальное перечисляется. Дубликаты и
 * невалидные значения игнорируются.
 *
 *   formatWeekDaysShort([0..6])        → "Каждый день"
 *   formatWeekDaysShort([1..5])        → "По будням"
 *   formatWeekDaysShort([6, 0])        → "По выходным"
 *   formatWeekDaysShort([1, 2, 3, 4])  → "Пн–Чт"
 *   formatWeekDaysShort([1, 2, 3, 5])  → "Пн–Ср, Пт"
 *   formatWeekDaysShort([1, 3, 5])     → "Пн, Ср, Пт"
 *   formatWeekDaysShort([6, 0, 1])     → "Пн, Сб, Вс"
 *   formatWeekDaysShort([])            → ""
 */
export function formatWeekDaysShort(weekDays: readonly number[]): string {
  if (!weekDays.length) return "";
  // Невалидные значения игнорируем: не integer, или вне [0..6].
  // Без isInteger guard'а: 1.5 проходит range-check, но WEEK_DAY_
  // SHORT_NAMES[1.5] = undefined → join выдаёт "Пн, , Ср".
  const days = Array.from(new Set(weekDays))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => mondayFirst(a) - mondayFirst(b));
  if (days.length === 0) return "";

  const key = days.map(mondayFirst).join(",");
  if (key === "1,2,3,4,5,6,7") return "Каждый день";
  if (key === "1,2,3,4,5") return "По будням";
  if (key === "6,7") return "По выходным";

  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i <= days.length; i++) {
    const continues = i < days.length && mondayFirst(days[i]) === mondayFirst(days[i - 1]) + 1;
    if (continues) continue;
    const run = days.slice(start, i);
    if (run.length >= 3) {
      parts.push(`${WEEK_DAY_SHORT_NAMES[run[0]]}–${WEEK_DAY_SHORT_NAMES[run[run.length - 1]]}`);
    } else {
      parts.push(...run.map((d) => WEEK_DAY_SHORT_NAMES[d]));
    }
    start = i;
  }
  return parts.join(", ");
}

export { WEEK_DAY_SHORT_NAMES };
