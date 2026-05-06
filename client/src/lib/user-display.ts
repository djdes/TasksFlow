/**
 * User-display форматтеры для UI: короткое имя, инициалы.
 *
 * Извлечены из Dashboard.tsx чтобы тестировать русские имена «Иванов
 * Сергей» → «ИС» (а не «ИВ» — это известная ошибка многих
 * non-locale форматтеров).
 */

type DisplayUser = {
  name?: string | null;
  phone: string;
};

/**
 * Короткая форма для бейджа исполнителя. Из «Имя Фамилия» возвращает
 * фамилию (последнее слово). Если 1 слово — оно. Если name пуст и
 * есть phone — phone.
 *
 *   "Иван Петров" → "Петров"
 *   "Мария"        → "Мария"
 *   {name:null, phone:"+79991234567"} → "+79991234567"
 */
export function getUserShortName(user: DisplayUser | null | undefined): string {
  if (!user) return "Не назначен";
  const full = (user.name || user.phone).trim();
  if (!full) return user.phone;
  const parts = full.split(/\s+/);
  return parts.length >= 2 ? parts[parts.length - 1] : parts[0];
}

/**
 * Двухбуквенные инициалы для аватара.
 *
 *   "Иванов Сергей" → "ИС" (НЕ "ИВ" — берём первую букву каждого
 *                            из 2 первых слов)
 *   "Мария"          → "МА" (первые 2 буквы единственного слова)
 *   "О"               → "О" (1 буква как есть)
 *   user=null/undefined → "?"
 */
export function getUserInitials(user: DisplayUser | null | undefined): string {
  if (!user) return "?";
  const name = (user.name || user.phone).trim();
  if (!name) return "?";
  const parts = name.split(/\s+/);
  if (parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
