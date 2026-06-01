import { describe, it, expect } from "vitest";
import { loadRouteData } from "../server/public-data";

describe("blog pagination (loadRouteData)", () => {
  it("страница 1: не больше pageSize, totalPages>1, featured показан", async () => {
    const d: any = await loadRouteData("blog-index", { page: "1" });
    expect(d.pageSize).toBe(12);
    expect(d.page).toBe(1);
    expect(d.posts.length).toBeLessThanOrEqual(12);
    expect(d.totalPages).toBeGreaterThan(1);
    expect(d.featured).toBeTruthy();
    expect(d.total).toBeGreaterThan(12);
  });

  it("страница 2: другой срез, featured скрыт", async () => {
    const p1: any = await loadRouteData("blog-index", { page: "1" });
    const p2: any = await loadRouteData("blog-index", { page: "2" });
    expect(p2.page).toBe(2);
    expect(p2.featured).toBeNull();
    expect(p2.posts[0].slug).not.toBe(p1.posts[0].slug);
  });

  it("страница вне диапазона зажимается к последней", async () => {
    const d: any = await loadRouteData("blog-index", { page: "9999" });
    expect(d.page).toBe(d.totalPages);
  });

  it("featured не дублируется в сетке 1-й страницы", async () => {
    const d: any = await loadRouteData("blog-index", { page: "1" });
    expect(d.posts.some((p: any) => p.slug === d.featured.slug)).toBe(false);
  });

  it("категория тоже пагинируется", async () => {
    const d: any = await loadRouteData("blog-category", { cluster: "upravlenie", page: "1" });
    expect(d.activeCluster).toBe("upravlenie");
    expect(d.posts.length).toBeLessThanOrEqual(12);
    expect(d.posts.every((p: any) => p.cluster === "upravlenie")).toBe(true);
  });
});
