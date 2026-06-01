/**
 * Тесты блог-пайплайна: парсинг Markdown + frontmatter, TOC, обложки,
 * статистика кластеров. Использует реальные статьи из content/blog.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getAllPosts,
  getPost,
  getByCluster,
  clusterStats,
  getFeatured,
  totalPosts,
  clearBlogCache,
} from "../server/blog";
import { coverSvg } from "../server/og-cover";
import { renderMarkdown, slugifyHeading, readingMinutes } from "../server/markdown";

beforeEach(() => clearBlogCache());

describe("markdown", () => {
  it("рендерит заголовки с id и собирает оглавление", () => {
    const r = renderMarkdown("## Первый раздел\n\nтекст\n\n### Подраздел\n\nещё текст");
    expect(r.html).toContain("<h2");
    expect(r.html).toContain('id="');
    expect(r.toc).toHaveLength(2);
    expect(r.toc[0].level).toBe(2);
    expect(r.toc[1].level).toBe(3);
    expect(r.toc[0].id).toMatch(/^[a-z0-9-]+$/);
  });

  it("slugify транслитерирует кириллицу", () => {
    expect(slugifyHeading("Контроль задач")).toBe("kontrol-zadach");
  });

  it("reading time >= 1", () => {
    expect(readingMinutes("одно слово")).toBeGreaterThanOrEqual(1);
  });
});

describe("blog loader", () => {
  it("загружает статьи из content/blog", () => {
    const posts = getAllPosts();
    expect(posts.length).toBeGreaterThan(0);
    expect(totalPosts()).toBe(posts.length);
    const p = posts[0];
    expect(p.slug).toBeTruthy();
    expect(p.title).toBeTruthy();
    expect(p.cluster).toBeTruthy();
    expect(p.readingMins).toBeGreaterThan(0);
  });

  it("getPost возвращает полную статью с html, toc, related", () => {
    const slug = getAllPosts()[0].slug;
    const full = getPost(slug)!;
    expect(full).toBeTruthy();
    expect(full.html).toContain("<");
    expect(Array.isArray(full.toc)).toBe(true);
    expect(Array.isArray(full.related)).toBe(true);
  });

  it("getPost для несуществующего slug → null", () => {
    expect(getPost("net-takoy-stati-xyz")).toBeNull();
  });

  it("clusterStats покрывает 4 кластера", () => {
    const stats = clusterStats();
    expect(stats).toHaveLength(4);
    expect(stats.reduce((s, c) => s + c.count, 0)).toBe(getAllPosts().length);
  });

  it("getByCluster фильтрует по кластеру", () => {
    const key = getAllPosts()[0].cluster;
    expect(getByCluster(key).every((p) => p.cluster === key)).toBe(true);
  });

  it("featured существует при непустом блоге", () => {
    expect(getFeatured()).toBeTruthy();
  });
});

describe("og cover", () => {
  it("возвращает корректный SVG", () => {
    const svg = coverSvg({ title: "Как ставить задачи", cluster: "upravlenie", slug: "x" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Tasks"); // вордмарк Tasks<tspan>Flow</tspan>
    expect(svg).toContain("Управление");
  });
});
