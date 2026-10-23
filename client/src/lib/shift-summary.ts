/**
 * Чистые помощники для сводки смены и списка задач: подпись даты,
 * процент выполнения и стабильный цвет аватара сотрудника.
 * Вынесены из компонентов, чтобы проверять без React.
 */

/** «четверг, 23 октября» — дата смены для эйбрау над сводкой. */
export function shiftDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/** Целый процент 0..100. Пустая смена — 0, без деления на ноль. */
export function shiftPercent(closed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(Math.max(closed, 0), total) / total) * 100);
}

/** Количество тонов аватаров — палитра задана в workspace.css. */
export const AVATAR_TONES = 6;

/**
 * Тон аватара по id: один и тот же сотрудник всегда одного цвета,
 * соседние id не сливаются. Без id (не назначен) — null.
 */
export function avatarTone(id: number | null | undefined): number | null {
  if (id === null || id === undefined || !Number.isFinite(id)) return null;
  return ((Math.trunc(id) % AVATAR_TONES) + AVATAR_TONES) % AVATAR_TONES;
}
