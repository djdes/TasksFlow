/**
 * Аналитика публичных страниц — только с согласия посетителя.
 *
 * Счётчики (Яндекс Метрика YM_ID, Google Analytics GA_ID) сервер больше
 * не вшивает в <head>: он передаёт только их id в window.__SSR_SITE__, а
 * скрипты подключаются здесь после «Принять» в CookieNotice. «Отклонить»
 * — скрипты не грузятся вовсе. Выбор хранится в localStorage этого
 * браузера; «Cookie» в подвале позволяет передумать.
 */
import type { AnalyticsIds } from "./types";

export type ConsentChoice = "granted" | "denied";

export const CONSENT_KEY = "tf_analytics_consent";
/** Событие «открыть настройки cookie» (кнопка в подвале). */
export const COOKIE_SETTINGS_EVENT = "tf:cookie-settings";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // доступ к storage запрещён (приватный режим, политика браузера)
  }
}

export function hasAnalytics(ids: AnalyticsIds | null | undefined): boolean {
  return Boolean(ids && (ids.ym || ids.ga));
}

export function readConsent(storage: ReadableStorage | null = browserStorage()): ConsentChoice | null {
  try {
    const v = storage?.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(choice: ConsentChoice, storage: WritableStorage | null = browserStorage()): void {
  try {
    storage?.setItem(CONSENT_KEY, choice);
  } catch {
    /* не сохранилось — спросим снова в следующий раз */
  }
}

/** Какие внешние скрипты нужны для этих id (чистая функция — для тестов). */
export function analyticsScriptUrls(ids: AnalyticsIds): string[] {
  const urls: string[] = [];
  if (ids.ym) urls.push("https://mc.yandex.ru/metrika/tag.js");
  if (ids.ga) urls.push(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ga)}`);
  return urls;
}

function addScript(doc: Document, src: string) {
  const s = doc.createElement("script");
  s.async = true;
  s.src = src;
  doc.head.appendChild(s);
}

/** Подключает счётчики. Повторный вызов ничего не делает. */
export function startAnalytics(ids: AnalyticsIds, win: Window = window): void {
  const w = win as Window & Record<string, any>;
  if (w.__tfAnalyticsStarted) return;
  w.__tfAnalyticsStarted = true;
  const doc = win.document;

  if (ids.ym) {
    // Очередь вызовов до загрузки tag.js — как в официальном сниппете.
    w.ym = w.ym || function ym() {
      // eslint-disable-next-line prefer-rest-params
      (w.ym.a = w.ym.a || []).push(arguments);
    };
    w.ym.l = Date.now();
    addScript(doc, "https://mc.yandex.ru/metrika/tag.js");
    w.ym(/^\d+$/.test(ids.ym) ? Number(ids.ym) : ids.ym, "init", {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
    });
  }

  if (ids.ga) {
    addScript(doc, `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ga)}`);
    w.dataLayer = w.dataLayer || [];
    // gtag.js различает именно объект arguments, а не массив.
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer.push(arguments);
    };
    w.gtag("js", new Date());
    w.gtag("config", ids.ga);
  }
}

const ANALYTICS_COOKIE = /^(_ym|_ga|_gid|_gat)/;

/** Стирает cookie счётчиков на этом домене (после отзыва согласия). */
export function clearAnalyticsCookies(doc: Document = document): void {
  const host = doc.location?.hostname ?? "";
  const parts = host.split(".");
  const domains = ["", host, parts.length > 2 ? `.${parts.slice(-2).join(".")}` : `.${host}`];
  for (const pair of doc.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (!name || !ANALYTICS_COOKIE.test(name)) continue;
    for (const d of domains) {
      doc.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
    }
  }
}
