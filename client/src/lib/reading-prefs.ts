/**
 * Настройки чтения для тех, кто плохо видит: «Крупный текст» и «Контраст».
 * Хранятся на устройстве (localStorage) и ставятся атрибутами на <html>
 * до первого рендера — без мигания мелким текстом (main.tsx). Стили —
 * workspace.css, html[data-text="large"] и html[data-contrast="high"].
 */

export type ReadingPref = "textLarge" | "contrastHigh";

const KEYS: Record<ReadingPref, string> = {
  textLarge: "tf_text_large",
  contrastHigh: "tf_contrast_high",
};

export function getReadingPref(pref: ReadingPref): boolean {
  try {
    return localStorage.getItem(KEYS[pref]) === "true";
  } catch {
    return false;
  }
}

/** Атрибуты на <html> по сохранённым настройкам (или по переданным). */
export function applyReadingPrefs(prefs?: Partial<Record<ReadingPref, boolean>>): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const large = prefs?.textLarge ?? getReadingPref("textLarge");
  const contrast = prefs?.contrastHigh ?? getReadingPref("contrastHigh");
  if (large) root.dataset.text = "large";
  else delete root.dataset.text;
  if (contrast) root.dataset.contrast = "high";
  else delete root.dataset.contrast;
}

export function setReadingPref(pref: ReadingPref, value: boolean): void {
  try {
    localStorage.setItem(KEYS[pref], String(value));
  } catch {
    // Приватный режим: настройка проживёт до перезагрузки.
  }
  applyReadingPrefs({ [pref]: value });
}
