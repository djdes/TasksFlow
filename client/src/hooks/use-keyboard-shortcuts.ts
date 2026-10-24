import { useEffect } from "react";

/**
 * Глобальные горячие клавиши для Dashboard. Не работают когда фокус
 * в input/textarea/select (чтобы не перехватывать буквы при наборе).
 *
 * Биндинги:
 *   `/`  — фокус в поиск
 *   `?`  — открыть /help
 *   `g h` — go home (/dashboard)
 *
 * `N` (новая задача) и Ctrl+K — во всём кабинете, см. CabinetFrame.
 * Esc обрабатывается отдельно — закрывает меню/диалоги стандартно
 * через Radix `onOpenChange`, дублировать не надо.
 */

type Handlers = {
  onFocusSearch?: () => void;
  onHelp?: () => void;
  onDashboard?: () => void;
};

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(handlers: Handlers): void {
  useEffect(() => {
    let lastG = 0;
    function onKey(e: KeyboardEvent) {
      // Не перехватываем когда юзер печатает.
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "/":
          if (handlers.onFocusSearch) {
            e.preventDefault();
            handlers.onFocusSearch();
          }
          return;
        case "?":
          if (handlers.onHelp) {
            e.preventDefault();
            handlers.onHelp();
          }
          return;
        case "g":
        case "п":
          lastG = Date.now();
          return;
        case "h":
        case "р":
          // g h в течение 1 секунды → /dashboard.
          if (Date.now() - lastG < 1000 && handlers.onDashboard) {
            e.preventDefault();
            handlers.onDashboard();
          }
          return;
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    handlers.onFocusSearch,
    handlers.onHelp,
    handlers.onDashboard,
  ]);
}
