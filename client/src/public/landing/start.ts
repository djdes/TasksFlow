import { prefersReducedMotion } from "./use-motion";

/**
 * «Начать бесплатно», «Попробовать» и ссылка в подвале ведут к форме входа
 * в hero (#start): докручиваем к ней и ставим фокус в поле — без
 * перезагрузки. Если формы на странице нет (блог, документы), обработчик
 * ничего не делает и срабатывает обычный переход на /#start.
 */
export function goToStart(event?: { preventDefault(): void }): void {
  const box = typeof document === "undefined" ? null : document.getElementById("start");
  if (!box) return;
  event?.preventDefault();
  box.scrollIntoView({ behavior: prefersReducedMotion() ? ("instant" as ScrollBehavior) : "smooth", block: "center" });
  box.querySelector<HTMLInputElement>("input:not([type=hidden]):not([disabled])")?.focus({ preventScroll: true });
}
