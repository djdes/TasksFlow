/**
 * Подсказочный текст под streak-числом в StatHero.
 *
 * Извлечено для тестирования без React/framer-motion. Логика
 * отдельно — UX-текст pinned, чтобы случайное изменение порогов
 * не сбило мотивирующий контекст («1 день — первый день», «5+ —
 * крутая серия»).
 */

export function streakHint(days: number): string {
  if (days === 1) return "первый день";
  if (days < 5) return "так держать";
  if (days < 14) return "крутая серия!";
  return "ты мотор смены";
}
