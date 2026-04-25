/**
 * Theme provider: light / dark / system.
 *
 * Источники истины:
 *   1) localStorage 'theme-preference' = 'light' | 'dark' | 'system'
 *   2) При 'system' — `window.matchMedia('(prefers-color-scheme: dark)')`
 *
 * Дубль логики живёт в `client/index.html` <script> ДО React-mount —
 * это анти-flash; здесь же — реактивная часть для UI-переключателя
 * и подписки на смену системной темы.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  /** Реально применённая тема — что сейчас на экране. */
  theme: ResolvedTheme;
  /** Что выбрал пользователь. 'system' = «как в браузере». */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const STORAGE_KEY = "theme-preference";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage заблокирован (incognito с настройкой) — system
  }
  return "system";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyHtmlClass(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    readStoredPreference
  );
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredPreference())
  );

  // Apply class on mount + on preference change.
  useEffect(() => {
    const next = resolveTheme(preference);
    setTheme(next);
    applyHtmlClass(next);
  }, [preference]);

  // Слушаем системную тему — только если preference = 'system'.
  useEffect(() => {
    if (preference !== "system") return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(DARK_QUERY);
    const handler = () => {
      const next: ResolvedTheme = mq.matches ? "dark" : "light";
      setTheme(next);
      applyHtmlClass(next);
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler); // legacy Safari
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — сессионная переключалка переживёт reload только если
      // localStorage доступен; тут уж ничего не сделаем.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, preference, setPreference }),
    [theme, preference, setPreference]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Безопасный fallback на случай когда хук дёрнули вне провайдера —
    // это не должно случаться в нормальной работе, но и крашить
    // приложение из-за UI-переключалки не хочется.
    return {
      theme: "light",
      preference: "system",
      setPreference: () => undefined,
    };
  }
  return ctx;
}
