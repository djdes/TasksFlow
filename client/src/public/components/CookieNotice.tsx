import { useCallback, useEffect, useRef, useState } from "react";
import { useSite } from "../site";
import { COOKIE_SECTION_ID } from "../legal";
import {
  COOKIE_SETTINGS_EVENT,
  clearAnalyticsCookies,
  hasAnalytics,
  readConsent,
  startAnalytics,
  writeConsent,
} from "../analytics";

/** Формы входа, которые плашка не должна перекрывать (hero, финальный CTA, CTA статьи). */
const AVOID_SELECTOR = "[data-cookie-avoid]";

function overlapsAvoided(bar: HTMLElement): boolean {
  // Где плашка стоит в показанном состоянии: transform в «спрятанном»
  // её только сдвигает, поэтому считаем от раскладки, а не от rect.
  const rect = bar.getBoundingClientRect();
  const bottomGap = parseFloat(getComputedStyle(bar).bottom) || 0;
  const top = window.innerHeight - bottomGap - bar.offsetHeight;
  const bottom = window.innerHeight - bottomGap;
  return Array.from(document.querySelectorAll<HTMLElement>(AVOID_SELECTOR)).some((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > top && r.top < bottom && r.right > rect.left && r.left < rect.right;
  });
}

/**
 * Уведомление об аналитических cookie. Есть только если заданы YM_ID или
 * GA_ID; счётчики грузятся после «Принять», после «Отклонить» — никогда.
 * SSR и первый клиентский рендер ничего не выводят (выбор лежит в
 * localStorage), плашка появляется после гидрации. Пока под ней оказалась
 * форма входа, плашка уезжает вниз, чтобы не закрывать главный CTA.
 */
export function CookieNotice() {
  const { analytics } = useSite();
  const enabled = hasAnalytics(analytics);
  const [open, setOpen] = useState(false);
  const [tucked, setTucked] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const choice = readConsent();
    if (choice === "granted") startAnalytics(analytics);
    else if (choice === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, [enabled, analytics]);

  // Прячем плашку, пока она перекрывала бы форму входа; иначе показываем.
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const bar = barRef.current;
      if (bar) setTucked(overlapsAvoided(bar));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [open]);

  // Пока плашка открыта, низ страницы не должен прятаться под ней.
  useEffect(() => {
    const root = document.documentElement;
    if (!open || !barRef.current) return;
    root.style.setProperty("--cookie-bar-space", `${barRef.current.offsetHeight + 16}px`);
    root.classList.add("has-cookie-bar");
    return () => {
      root.classList.remove("has-cookie-bar");
      root.style.removeProperty("--cookie-bar-space");
    };
  }, [open]);

  const accept = useCallback(() => {
    writeConsent("granted");
    startAnalytics(analytics);
    setOpen(false);
  }, [analytics]);

  const decline = useCallback(() => {
    writeConsent("denied");
    clearAnalyticsCookies();
    setOpen(false);
    // Уже загруженные счётчики не выгрузить — останавливаем перезагрузкой.
    if ((window as Window & { __tfAnalyticsStarted?: boolean }).__tfAnalyticsStarted) window.location.reload();
  }, []);

  if (!enabled || !open) return null;

  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Cookie и аналитика"
      className="cookie-bar"
      data-tucked={tucked ? "true" : "false"}
    >
      <p className="cookie-bar-text">
        Cookie для аналитики — только с согласия.{" "}
        <a href={`/privacy#${COOKIE_SECTION_ID}`}>Подробнее</a>
      </p>
      <div className="cookie-bar-actions">
        <button type="button" onClick={decline} className="cookie-btn">
          Отклонить
        </button>
        <button type="button" onClick={accept} className="cookie-btn is-primary">
          Принять
        </button>
      </div>
    </div>
  );
}
