/**
 * User-display форматтеры для UI: короткое имя, инициалы.
 *
 * Извлечены из Dashboard.tsx чтобы тестировать русские имена «Иванов
 * Сергей» → «ИС» (а не «ИВ» — это известная ошибка многих
 * non-locale форматтеров).
 */

type DisplayUser = {
  name?: string | null;
  // phone теперь nullable: email-юзеры (ветка лендинга) телефона не имеют.
  // Для них в качестве запасного отображения используем email.
  phone?: string | null;
  email?: string | null;
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
  const full = (user.name || user.phone || user.email || "").trim();
  if (!full) return "Не назначен";
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
  const name = (user.name || user.phone || user.email || "").trim();
  if (!name) return "?";
  // По символам, а не UTF-16 единицам: эмодзи в начале не режется пополам.
  const parts = name.split(/\s+/).map((part) => Array.from(part));
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).join("").toUpperCase();
}

/**
 * Телефон для чтения: «+7 999 123-45-67». Не российский или неполный
 * номер — как есть.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  // Только российский вид: +7…, 8… или 7… без плюса. «+8…» — чужая страна.
  const m = phone.replace(/[\s()-]/g, "").match(/^(?:\+7|8|7)(\d{10})$/);
  if (!m) return phone;
  const d = m[1];
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

type PersonLike = DisplayUser & { id: number; position?: string | null };

/** Как назвать человека в списке и в окнах: имя, иначе телефон, иначе номер записи. */
export function personLabel(user: PersonLike): string {
  return user.name || formatPhoneDisplay(user.phone) || user.email || `#${user.id}`;
}

/**
 * Текст, по которому ищут человека: имя, должность и телефон во всех
 * видах — как хранится, как показан, одни цифры и с 8 вместо +7.
 */
export function personSearchText(user: PersonLike): string {
  const digits = (user.phone ?? "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("7") ? `8${digits.slice(1)}` : "";
  return [user.name, user.position, user.email, user.phone, formatPhoneDisplay(user.phone), digits, local].filter(Boolean).join(" ");
}
