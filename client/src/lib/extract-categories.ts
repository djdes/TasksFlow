/**
 * Извлечение списка уникальных непустых категорий из массива задач.
 *
 * Используется в Dashboard для построения фильтр-чипов «по категории».
 * Раньше была inline IIFE в Dashboard.tsx с кастом `(task as any).category`
 * и фильтром на null/undefined/empty/whitespace. Извлечено для:
 *   • тестируемости defensive-веток (null, undefined, "  ", non-string),
 *   • DRY на случай если admin-страницы добавят свой category-filter,
 *   • явной читаемости (название говорит что делает).
 *
 * Семантика:
 *   • category=null/undefined → выкидывается
 *   • category="" / "  " → выкидывается (whitespace-only тоже мусор)
 *   • category=number/object → выкидывается (typeof guard)
 *   • дубликаты → схлопываются (Set)
 *   • leading/trailing whitespace НЕ trim'ится — server отвечает за
 *     нормализацию категорий при сохранении. Мы не «исправляем» данные
 *     на клиенте чтобы не маскировать backend-баги.
 *   • сортировка — стабильная локалозависимая (ru-RU чтобы «Я» шла
 *     после «Ё», без неё было бы codepoint-сравнение).
 */

type CategoryHavingTask = {
  category?: string | null;
};

export function extractCategories(
  tasks: readonly CategoryHavingTask[],
): string[] {
  const seen = new Set<string>();
  for (const task of tasks) {
    const c = task.category;
    if (typeof c !== "string") continue;
    if (c.trim() === "") continue;
    seen.add(c);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, "ru-RU"));
}
