/**
 * Pure-фильтры для task list. Извлечены из Dashboard.tsx чтобы
 * проще тестировать без полного состояния страницы.
 *
 * Worker не видит чужие задачи, кроме как через эти фильтры —
 * случайная регрессия = «задача не показывается в её день».
 */

type ScheduledTask = {
  weekDays?: readonly number[] | null;
  monthDay?: number | null;
};

/**
 * Видна ли задача СЕГОДНЯ.
 *
 *   monthDay set + не сегодня → false
 *   weekDays set + не включает сегодня → false
 *   иначе → true (включая «совсем без расписания»)
 *
 * @param task         задача со схемой расписания
 * @param dayOfWeek    new Date().getDay() — 0=воскресенье..6=суббота
 * @param dayOfMonth   new Date().getDate() — 1..31
 */
export function isTaskVisibleOn(
  task: ScheduledTask,
  dayOfWeek: number,
  dayOfMonth: number,
): boolean {
  if (task.monthDay !== null && task.monthDay !== undefined) {
    if (task.monthDay !== dayOfMonth) return false;
  }
  if (
    task.weekDays &&
    Array.isArray(task.weekDays) &&
    task.weekDays.length > 0
  ) {
    if (!task.weekDays.includes(dayOfWeek)) return false;
  }
  return true;
}

type ChippableTask = {
  requiresPhoto?: boolean | null;
  price?: number | null;
  journalLink?: string | null;
};

export type ChipFilters = {
  photo: boolean;
  bonus: boolean;
  journal: boolean;
};

/**
 * Quick-chip фильтр на task. AND-семантика — «С премией» + «Журнальные»
 * = только journal-задачи с price > 0. Если все чипы false → match всегда.
 */
export function passesChipFilters(
  task: ChippableTask,
  chips: ChipFilters,
): boolean {
  if (chips.photo && !task.requiresPhoto) return false;
  if (chips.bonus && (!task.price || task.price <= 0)) return false;
  if (chips.journal && !task.journalLink) return false;
  return true;
}
