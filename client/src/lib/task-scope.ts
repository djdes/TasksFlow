/**
 * Task scope классификация: personal vs shared.
 *
 * shared = «единичный» journal (один человек делает на всю смену,
 * бонус первому). personal = всё остальное (в т.ч. не-journal задачи).
 *
 * Извлечено из Dashboard.tsx для прямого тестирования + защиты от
 * regression: scope влияет на табы UI и подсчёт «общих» задач.
 */

export type TaskScope = "personal" | "shared";

type ScopableTask = {
  journalLink?: string | null;
};

/**
 * Возвращает scope из task.journalLink JSON.
 *   journalLink null/undefined  → personal
 *   journalLink невалидный JSON → personal (defensive)
 *   parsed.taskScope === "shared" → shared
 *   иначе                       → personal
 */
export function getTaskScope(task: ScopableTask): TaskScope {
  const raw = task.journalLink;
  if (!raw) return "personal";
  try {
    const parsed = JSON.parse(raw) as { taskScope?: string };
    return parsed.taskScope === "shared" ? "shared" : "personal";
  } catch {
    return "personal";
  }
}
