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
    expect(r.appHtml).toContain("Задачи под контролем");
    expect(r.head).toContain("<title>");
    expect(r.head).toContain("application/ld+json");
    expect(r.head).toContain(`${ORIGIN}/`);
    // SSR-safe: форма входа отрендерилась без window
    expect(r.appHtml).toContain("Войти или зарегистрироваться");
  });

  it("блог-индекс → заголовок + breadcrumb JSON-LD", async () => {
    const data = await loadRouteData("blog-index", {});
    const r = render("/blog", data, ORIGIN);
    expect(r.routeKey).toBe("blog-index");
    expect(r.appHtml).toContain("Блог TasksFlow");
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
