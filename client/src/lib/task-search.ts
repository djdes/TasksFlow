/**
 * Поиск task'ов по строке. Match идёт по title + description +
 * category + workerName (объединённые в haystack), case-insensitive.
 *
 * Извлечено из Dashboard.tsx — там было inline в filter-цепочке.
 * Тестировать на месте сложно (тащит всё состояние страницы), а
 * логика net'но проста: «воркер ищет по слову — должно найтись хоть
 * в одной колонке».
 */

type SearchableTask = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
};

/**
 * Возвращает true если task матчит query в любом из полей. Пустая
 * query (после trim) → true (фильтр выключен). Match без учёта
 * регистра.
 */
export function matchTaskBySearch(
  task: SearchableTask,
  workerName: string | null | undefined,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    task.title,
    task.description,
    task.category,
    workerName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}
