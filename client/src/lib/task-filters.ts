/**
 * Pure-фильтры для task list. Извлечены из Dashboard.tsx чтобы
 * проще тестировать без полного состояния страницы.
 *
 * Worker не видит чужие задачи, кроме как через эти фильтры —
 * случайная регрессия = «задача не показывается в её день».
 */

// isTaskVisibleOn переехал в shared/task-visibility.ts — ту же функцию
// использует Telegram-бот для списка «задачи на сегодня». Здесь только
// реэкспорт, чтобы не трогать существующие импорты и тесты.
export {
  isTaskVisibleOn,
  getDueStatus,
  formatDueBadge,
  startOfLocalDay,
  type ScheduledTask,
  type DueStatus,
} from "@shared/task-visibility";

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
