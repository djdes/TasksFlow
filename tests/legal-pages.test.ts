/**
 * Юридические страницы, согласие и cookie-аналитика: роуты, данные из
 * content/legal, реквизиты из env (без выдумок), SEO, данные для гидрации
 * без вшитых счётчиков, логика согласия и галочка LegalConsent.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render, matchRoute } from "../client/src/public/entry-server";
import { analyticsIds, legalContactEmail, loadLegalData, loadRouteData, siteConfig } from "../server/public-data";
import { buildDataScript, renderPublicPage } from "../server/ssr";
import { LegalConsent } from "../client/src/components/LegalConsent";
import {
  COOKIE_SECTION_ID,
  OPERATOR_PLACEHOLDERS,
  formatLegalDate,
  operatorLines,
} from "../client/src/public/legal";
import { RECURRING_OFFER_HREF } from "../shared/billing";
import {
  CONSENT_KEY,
  analyticsScriptUrls,
  hasAnalytics,
  readConsent,
  startAnalytics,
  writeConsent,
} from "../client/src/public/analytics";

const ORIGIN = "https://tasksflow.ru";
const FULL_ENV = {
  LEGAL_OPERATOR_NAME: "ООО «Тест»",
  LEGAL_OPERATOR_INN: "7700000000",
  LEGAL_OPERATOR_OGRN: "1027700000000",
  LEGAL_OPERATOR_ADDRESS: "г. Москва, ул. Тестовая, 1",
  LEGAL_CONTACT_EMAIL: "legal@example.test",
  LEGAL_UPDATED_AT: "2026-11-01",
};
const SLUGS = ["privacy", "consent", "terms", "offer"] as const;
// Дата редакции из файла (frontmatter updated), пока не задан LEGAL_UPDATED_AT.
const FILE_DATES: Record<(typeof SLUGS)[number], string> = { privacy: "2026-10-23", consent: "2026-10-23", terms: "2026-10-24", offer: "2026-10-24" };
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("роуты документов", () => {
  it("/privacy, /consent, /terms, /offer — SSR-страницы legal", () => {
    expect(matchRoute("/privacy")).toEqual({ key: "legal", params: { doc: "privacy" } });
    expect(matchRoute("/offer")).toEqual({ key: "legal", params: { doc: "offer" } });
    expect(matchRoute("/consent/")).toEqual({ key: "legal", params: { doc: "consent" } });
    expect(matchRoute("/terms").key).toBe("legal");
    expect(matchRoute("/privacy-old").key).toBe("not-found");
    expect(matchRoute("/blog/privacy").key).toBe("blog-article");
  });
});

describe("данные документов", () => {
  it.each(SLUGS)("%s: без env — плейсхолдер оператора, email поддержки, дата из файла", (slug) => {
    const d = loadLegalData(slug, {});
    expect(d.doc?.title).toBeTruthy();
    expect(d.doc?.html).toContain(`<span class="legal-ph"`);
    expect(d.doc?.html).toContain(OPERATOR_PLACEHOLDERS.name);
    expect(d.doc?.html).not.toContain("{{");
    expect(d.contactEmail).toBe("support@tasksflow.ru");
    expect(d.operator).toEqual({ name: null, inn: null, ogrn: null, address: null });
    expect(d.doc?.updatedAt).toBe(FILE_DATES[slug]);
  });

  it.each(SLUGS)("%s: с env — реквизиты и email подставлены, плейсхолдеров нет", (slug) => {
    const d = loadLegalData(slug, FULL_ENV);
    expect(d.doc?.html).toContain("ООО «Тест»");
    expect(d.doc?.html).not.toContain("legal-ph");
    expect(d.doc?.updatedAt).toBe("2026-11-01");
    if (slug !== "consent" || d.doc?.html.includes("@")) {
      expect(d.doc?.html).toContain("legal@example.test");
    }
  });

  it("в текстах нет зашитых реквизитов: только подстановки из env", () => {
    for (const slug of SLUGS) {
      const raw = fs.readFileSync(path.join(process.cwd(), "content/legal", `${slug}.md`), "utf8");
      expect(raw, slug).not.toMatch(/\b\d{10,15}\b/);
      expect(raw, slug).toContain("{{operator}}");
    }
  });

  it("политика: есть раздел cookie, на который ведёт плашка", () => {
    const d = loadLegalData("privacy", {});
    expect(d.doc?.toc.map((t) => t.id)).toContain(COOKIE_SECTION_ID);
  });

  it("согласие: цели, перечень данных, срок и отзыв — отдельными разделами", () => {
    const texts = loadLegalData("consent", {}).doc?.toc.map((t) => t.text) ?? [];
    expect(texts).toEqual(expect.arrayContaining(["Цели", "Какие данные", "Срок и отзыв"]));
  });

  it("оферта: раздел «Автопродление» — на него ведёт галочка согласия при оплате", () => {
    const doc = loadLegalData("offer", {}).doc;
    const anchor = RECURRING_OFFER_HREF.split("#")[1];
    expect(doc?.toc.map((t) => t.id)).toContain(anchor);
    expect(doc?.toc.map((t) => t.text)).toEqual(expect.arrayContaining(["Стоимость", "Оплата", "Автопродление", "Возврат"]));
    expect(doc?.html).toContain("Робокасс");
  });

  it("неизвестный документ — null, а не исключение", async () => {
    expect(loadLegalData("../package", {}).doc).toBeNull();
    expect(((await loadRouteData("legal", { doc: "privacy" })) as any).doc.slug).toBe("privacy");
  });
});

describe("реквизиты оператора", () => {
  it("незаданные поля — плейсхолдеры с именем переменной", () => {
    const lines = operatorLines({ name: null, inn: null, ogrn: null, address: null });
    expect(lines.every((l) => l.placeholder)).toBe(true);
    expect(lines.map((l) => l.env)).toEqual([
      "LEGAL_OPERATOR_NAME",
      "LEGAL_OPERATOR_INN",
      "LEGAL_OPERATOR_OGRN",
      "LEGAL_OPERATOR_ADDRESS",
    ]);
  });

  it("15 цифр — ОГРНИП, 13 — ОГРН", () => {
    const ip = operatorLines({ name: "ИП Иванов", inn: "770000000000", ogrn: "304770000000000", address: null });
    expect(ip[2]).toMatchObject({ label: "ОГРНИП", placeholder: false });
    expect(ip[3].placeholder).toBe(true);
    expect(operatorLines({ name: "ООО", inn: null, ogrn: "1027700000000", address: null })[2].label).toBe("ОГРН");
  });

  it("дата редакции по-русски, мусор — null", () => {
    expect(formatLegalDate("2026-10-23")).toBe("23 октября 2026");
    expect(formatLegalDate("2026-13-01")).toBeNull();
    expect(formatLegalDate(null)).toBeNull();
  });
});

describe("SSR документов", () => {
  it("страница: заголовок, дата, переключатель, карточка оператора; head с canonical", () => {
    const data = loadLegalData("privacy", {});
    const r = render("/privacy", data, ORIGIN);
    expect(r.appHtml).toContain("Политика обработки персональных данных");
    expect(r.appHtml).toContain("Редакция от 23 октября 2026");
    expect(r.appHtml).toContain('aria-current="page"');
    expect(r.appHtml).toContain("Оператор и контакты");
    expect(r.appHtml).toContain("mailto:support@tasksflow.ru");
    expect(r.head).toContain(`<link rel="canonical" href="${ORIGIN}/privacy" />`);
    expect(r.head).toContain("BreadcrumbList");
  });

  it("подвал: ссылки на документы и контакт на всех страницах", () => {
    const r = render("/", { featuredPosts: [], totalPosts: 0 }, ORIGIN);
    for (const href of ["/privacy", "/consent", "/terms", "mailto:support@tasksflow.ru"]) {
      expect(r.appHtml).toContain(`href="${href}"`);
    }
    expect(r.appHtml).not.toContain(">Cookie<");
  });

  it("лендинг: «Обсудить» — письмо с темой, «Начать» и «Попробовать» — к форме #start", () => {
    const r = render("/", { featuredPosts: [], totalPosts: 0 }, ORIGIN);
    expect(r.appHtml).toContain('id="start"');
    expect(r.appHtml).toMatch(/href="mailto:support@tasksflow\.ru\?subject=[^"]+"/);
    expect(r.appHtml.match(/href="#start"/g)?.length).toBe(2);
  });

  it("с аналитикой: в подвале «Cookie», плашки в SSR нет", () => {
    const site = { contactEmail: "support@tasksflow.ru", analytics: { ym: "12345678", ga: null } };
    const r = render("/", { featuredPosts: [], totalPosts: 0 }, ORIGIN, site);
    expect(r.appHtml).toContain(">Cookie<");
    expect(r.appHtml).not.toContain("cookie-bar");
  });
});

describe("настройки сайта и данные для гидрации", () => {
  it("id счётчиков проверяются, мусор отбрасывается", () => {
    expect(analyticsIds({ YM_ID: " 12345678 ", GA_ID: "G-ABC123XYZ" })).toEqual({ ym: "12345678", ga: "G-ABC123XYZ" });
    expect(analyticsIds({ YM_ID: "123abc", GA_ID: '"><script>' })).toEqual({ ym: null, ga: null });
    expect(legalContactEmail({ LEGAL_CONTACT_EMAIL: "not-an-email" })).toBe("support@tasksflow.ru");
    expect(siteConfig({}).analytics).toEqual({ ym: null, ga: null });
  });

  it("buildDataScript: данные и сайт, «<» экранирован", () => {
    const s = buildDataScript({ x: "</script>" }, { contactEmail: "a@b.c", analytics: { ym: null, ga: null } });
    expect(s).toContain("window.__SSR_DATA__=");
    expect(s).toContain("window.__SSR_SITE__=");
    expect(s).not.toContain("</script>\"");
    expect(s).toContain("\\u003c/script>");
  });

  it("renderPublicPage: счётчик не вшит в HTML, только id; «$&» в разметке не ломается", async () => {
    process.env.YM_ID = "12345678";
    const ssr = {
      matchRoute: () => ({ key: "landing", params: {} }),
      render: () => ({ appHtml: "<main>$& $'</main>", head: "<title>t</title>", routeKey: "landing" }),
    };
    const tpl = "<head><!--app-head--></head><body><!--app-html--><!--app-data--></body>";
    const { status, html } = await renderPublicPage(ssr, tpl, "/", "1", ORIGIN);
    expect(status).toBe(200);
    expect(html).toContain("<main>$& $'</main>");
    expect(html).not.toContain("mc.yandex.ru");
    expect(html).toContain('"ym":"12345678"');
  });
});

describe("согласие на аналитику", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const m = new Map(Object.entries(initial));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  }

  it("выбор читается и пишется, мусор и ошибки storage — «не выбрано»", () => {
    const s = memoryStorage({ [CONSENT_KEY]: "maybe" });
    expect(readConsent(s)).toBeNull();
    writeConsent("granted", s);
    expect(readConsent(s)).toBe("granted");
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readConsent(broken)).toBeNull();
    expect(() => writeConsent("denied", broken)).not.toThrow();
  });

  it("без id аналитики нет, URL скриптов собираются с экранированием", () => {
    expect(hasAnalytics({ ym: null, ga: null })).toBe(false);
    expect(hasAnalytics({ ym: "1", ga: null })).toBe(true);
    expect(analyticsScriptUrls({ ym: "1", ga: "G-A&B" })).toEqual([
      "https://mc.yandex.ru/metrika/tag.js",
      "https://www.googletagmanager.com/gtag/js?id=G-A%26B",
    ]);
  });

  it("startAnalytics подключает оба счётчика один раз", () => {
    const appended: string[] = [];
    const doc = { createElement: () => ({}), head: { appendChild: (el: { src: string }) => appended.push(el.src) } };
    const win: any = { document: doc };
    startAnalytics({ ym: "12345678", ga: "G-TEST1234" }, win);
    startAnalytics({ ym: "12345678", ga: "G-TEST1234" }, win);
    expect(appended).toEqual([
      "https://mc.yandex.ru/metrika/tag.js",
      "https://www.googletagmanager.com/gtag/js?id=G-TEST1234",
    ]);
    expect(win.ym.a[0][0]).toBe(12345678);
    expect(win.ym.a[0][1]).toBe("init");
    expect(win.dataLayer).toHaveLength(2);
  });
});

describe("LegalConsent", () => {
  const html = (props: Partial<Parameters<typeof LegalConsent>[0]> = {}) =>
    renderToStaticMarkup(createElement(LegalConsent, { checked: false, onChange: () => {}, id: "c1", ...props }));

  it("чекбокс не отмечен по умолчанию, подпись связана, ссылки на оба документа", () => {
    const h = html();
    expect(h).toContain('type="checkbox"');
    expect(h).toContain('id="c1"');
    expect(h).toContain('for="c1"');
    expect(h).not.toContain('checked=""');
    expect(h).toContain("Согласен на");
    expect(h).toContain('href="/consent"');
    expect(h).toContain('href="/privacy"');
    expect(h).not.toContain('role="alert"');
  });

  it("checked, ошибка с aria-связкой, compact", () => {
    expect(html({ checked: true })).toContain('checked=""');
    const withError = html({ error: "Нужно согласие" });
    expect(withError).toContain('role="alert"');
    expect(withError).toContain('aria-invalid="true"');
    expect(withError).toContain('aria-describedby="c1-error"');
    expect(withError).toContain('id="c1-error"');
    expect(html({ error: null })).not.toContain("aria-invalid");
    expect(html({ compact: true })).toContain('class="text-xs"');
  });

  it("без id — уникальные id у двух галочек на странице", () => {
    const h = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(LegalConsent, { checked: false, onChange: () => {} }),
        createElement(LegalConsent, { checked: false, onChange: () => {} }),
      ),
    );
    const ids = [...h.matchAll(/<input id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
