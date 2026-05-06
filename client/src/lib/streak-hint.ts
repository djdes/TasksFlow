/**
 * Подсказочные тексты в StatHero (4-5 плитки на главной).
 *
 * Извлечено для тестирования без React/framer-motion. UX-копирайт
 * pinned — тесты ловят случайное изменение текста через refactor.
 */

export function streakHint(days: number): string {
  if (days === 1) return "первый день";
  if (days < 5) return "так держать";
  if (days < 14) return "крутая серия!";
  return "ты мотор смены";
}

/** «Сегодня» tile hint: «Задач нет» / «Все сделано!» / `из N`. */
export function todayHint(remaining: number, totalCount: number): string {
  if (totalCount === 0) return "Задач нет";
  if (remaining === 0) return "Все сделано!";
  return `из ${totalCount}`;
}

/** «Сделано» tile hint: процент или приветствие если нет задач. */
export function completedHint(progress: number, totalCount: number): string {
  if (totalCount > 0) return `${Math.round(progress * 100)}%`;
  return "Поехали!";
}

/** «Премия» tile hint: накопление или мотивация. */
export function bonusHint(bonusBalance: number): string {
  return bonusBalance > 0 ? "копится" : "сделай первым";
}
