/**
 * SSR smoke: публичные страницы рендерятся на сервере в готовый HTML
 * с контентом, мета-тегами и JSON-LD, и не падают на window (SSR-safe).
 */
import { describe, it, expect } from "vitest";
import { render, matchRoute } from "../client/src/public/entry-server";
import { loadRouteData } from "../server/public-data";
import { buildHead } from "../client/src/public/seo";

const ORIGIN = "https://tasksflow.ru";

describe("matchRoute", () => {
  it("сопоставляет публичные пути", () => {
    expect(matchRoute("/").key).toBe("landing");
    expect(matchRoute("/blog").key).toBe("blog-index");
    expect(matchRoute("/blog/kak-stavit-zadachi").key).toBe("blog-article");
    expect(matchRoute("/blog/category/upravlenie")).toEqual({
      key: "blog-category",
      params: { cluster: "upravlenie" },
    });
    expect(matchRoute("/dashboard").key).toBe("not-found");
  });
});

describe("SSR render", () => {
  it("лендинг → h1 + title + JSON-LD + canonical", () => {
    const r = render("/", { featuredPosts: [], totalPosts: 0 }, ORIGIN);
    expect(r.routeKey).toBe("landing");
    expect(r.appHtml).toContain("Контролируйте смену");
    expect(r.head).toContain("<title>");
    expect(r.head).toContain("application/ld+json");
    expect(r.head).toContain(`${ORIGIN}/`);
    // SSR-safe: форма входа отрендерилась без window
    expect(r.appHtml).toContain("Войти или зарегистрироваться");
  });

  it("лендинг с акцией: цена со скидкой, зачёркнутая старая, плашка с датой по Москве", () => {
    const promotion = { id: 1, title: "Осенняя акция", percent: 20, startsAt: 0, endsAt: Date.UTC(2026, 9, 31, 21) / 1000 };
    const r = render("/", { featuredPosts: [], totalPosts: 0, prices: [{ plan: "team", months: 1, priceRub: 990 }], promotion }, ORIGIN);
    const html = r.appHtml.replace(/<!-- -->/g, "");
    expect(html).toMatch(/Осенняя акция: <b>−20 %<\/b> на все платные тарифы до 31 октября/);
    expect(html).toMatch(/<s class="plan-old"[^>]*>990\s₽<\/s>792\s₽/);
    expect(html).toContain("Сейчас акция: −20 % на все тарифы до 31 октября.");
    // Без акции — обычная цена.
    const plain = render("/", { featuredPosts: [], totalPosts: 0, prices: [{ plan: "team", months: 1, priceRub: 990 }] }, ORIGIN).appHtml;
    expect(plain).not.toContain("plan-old");
    expect(plain).toMatch(/plan-value">990\s₽/);
  });

  it("блог-индекс → заголовок + breadcrumb JSON-LD", async () => {
    const data = await loadRouteData("blog-index", {});
    const r = render("/blog", data, ORIGIN);
    expect(r.routeKey).toBe("blog-index");
    // h1 теперь «Блог <span text-gradient>TasksFlow</span>» — проверяем по
    // стабильному заголовку в head + подзаголовку в разметке.
    expect(r.head).toContain("Блог TasksFlow");
    expect(r.appHtml).toContain("Практические статьи");
    expect(r.head).toContain("BreadcrumbList");
  });

  it("категория → activeCluster в данных и канонический url", async () => {
    const data = await loadRouteData("blog-category", { cluster: "upravlenie" });
    expect((data as any).activeCluster).toBe("upravlenie");
    const r = render("/blog/category/upravlenie", data, ORIGIN);
    expect(r.appHtml).toContain("Управление и контроль задач");
    expect(r.head).toContain(`${ORIGIN}/blog/category/upravlenie`);
  });

  it("несуществующая статья → страница «не найдена», не краш", () => {
    const r = render("/blog/nope", { post: null }, ORIGIN);
    expect(r.routeKey).toBe("blog-article");
    expect(r.appHtml).toContain("не найдена");
  });
});

describe("buildHead", () => {
  it("статья с FAQ → BlogPosting + FAQPage + og:image", () => {
    const post = {
      slug: "test", title: "Тестовая статья", description: "Описание", date: "2026-01-01",
      cluster: "upravlenie", tags: ["a"], readingMins: 5, html: "<p>x</p>", related: [], toc: [],
      faq: [{ q: "Вопрос?", a: "Ответ." }],
    };
    const head = buildHead({ key: "blog-article", params: { slug: "test" } }, { post }, ORIGIN);
    expect(head).toContain("BlogPosting");
    expect(head).toContain("FAQPage");
    expect(head).toContain(`${ORIGIN}/og/test.svg`);
  });
});
