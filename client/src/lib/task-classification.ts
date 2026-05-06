/**
 * Классификация task'ов по типу — journal vs обычная.
 *
 * Извлечено из Dashboard.tsx. UX-критическая логика: журнальные
 * задачи на клик открывают TaskFormFiller (заполнить форму журнала),
 * обычные — TaskViewDialog. Если классификатор сломается, воркер
 * увидит «не ту» форму и запутается.
 */

type ClassifiableTask = {
  category?: string | null;
  journalLink?: string | null;
};

/**
 * journal task = есть journalLink ИЛИ category начинается с «WeSetup · ».
 *
 * Префикс «WeSetup · » — legacy convention для категорий, проставляемых
 * sync-кодом WeSetup. У новых задач есть journalLink (приоритетный
 * источник), у старых — только category.
 */
export function isJournalTask(task: ClassifiableTask): boolean {
  if (task.journalLink) return true;
  const category = task.category ?? "";
  return category.startsWith("WeSetup · ");
}
