/**
 * Знак TasksFlow — галочка в рамке видоискателя — и цвета бренда.
 * Один источник для логотипа в интерфейсе (BrandMark), иконок PWA и
 * приложений (script/generate-app-icons.ts) и цвета системных панелей.
 *
 * Координаты — в квадрате 32×32; сам знак занимает 8…24 (16 единиц).
 */
export const BRAND_FRAME_PATH =
  "M8 12V9.5A1.5 1.5 0 0 1 9.5 8H12M20 8h2.5A1.5 1.5 0 0 1 24 9.5V12M24 20v2.5a1.5 1.5 0 0 1-1.5 1.5H20M12 24H9.5A1.5 1.5 0 0 1 8 22.5V20";
export const BRAND_CHECK_PATH = "m11.5 16.5 3 3 6-7";
export const BRAND_FRAME_STROKE = 2;
export const BRAND_CHECK_STROKE = 2.6;

/** hsl(var(--primary)) светлой темы. */
export const BRAND_PRIMARY = "#5568f6";
/** Indigo-полоса шапки кабинета (workspace.css): светлая и тёмная тема. */
export const BRAND_BAND_LIGHT = ["#4b5bef", "#5566f6", "#6a5cf7"] as const;
export const BRAND_BAND_DARK = ["#1c2459", "#1a2050", "#251f52"] as const;
/** Фон страницы под полосой. */
export const BRAND_PAGE_LIGHT = "#f3f4f6";
export const BRAND_PAGE_DARK = "#0b1220";
