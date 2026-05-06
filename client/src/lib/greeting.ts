/**
 * Выбор приветствия по времени дня + форматирование даты.
 *
 * Извлечено из GreetingBanner.tsx чтобы тестировать без React/JSX.
 * Эти границы 05-11 / 11-17 / 17-22 / 22-05 — продуктовое решение,
 * случайное смещение испортит UX («Доброе утро» в 16:00).
 */

export type TimeOfDay = "morning" | "day" | "evening" | "night";

export const WEEKDAYS = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
] as const;

export const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

/**
 * Время суток по локальному часу (0-23).
 *   05-10 → morning   (Доброе утро)
 *   11-16 → day       (Добрый день)
 *   17-21 → evening   (Добрый вечер)
 *   22-04 → night     (Доброй ночи)
 *
 * Границы inclusive с нижней стороны: 05:00:00 уже morning, 11:00 day.
 */
export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

/** Русское приветствие по времени суток. */
export function greetingByTime(t: TimeOfDay): string {
  switch (t) {
    case "morning":
      return "Доброе утро";
    case "day":
      return "Добрый день";
    case "evening":
      return "Добрый вечер";
    case "night":
      return "Доброй ночи";
  }
}

/** «понедельник, 6 мая». Используется как dateLabel в баннере. */
export function formatDateLabel(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/**
 * «Иван Петров» → «Иван». Используется чтобы заголовок не выглядел
 * формально как в анкете. Whitespace-tolerant. Возвращает null если
 * пусто/null/только пробелы.
 */
export function firstNameOf(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}
