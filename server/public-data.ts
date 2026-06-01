/**
 * Загрузка данных для SSR публичных страниц по ключу роута.
 *
 * Фаза B: блог ещё пустой — отдаём пустые наборы (страницы рендерят
 * empty-state). Фаза D подменит ветки blog-* на реальные данные из
 * server/blog.ts (чтение content/blog/*.md).
 */
import { CLUSTERS } from "@shared/blog-clusters";

function emptyClusterStats() {
  return CLUSTERS.map((c) => ({ key: c.key, title: c.title, short: c.short, count: 0 }));
}

export async function loadRouteData(
  routeKey: string,
  params: Record<string, string>,
): Promise<unknown> {
  switch (routeKey) {
    case "landing":
      return { featuredPosts: [], totalPosts: 0 };
    case "blog-index":
      return { posts: [], clusters: emptyClusterStats(), featured: null, activeCluster: null, total: 0 };
    case "blog-category":
      return { posts: [], clusters: emptyClusterStats(), featured: null, activeCluster: params.cluster ?? null, total: 0 };
    case "blog-article":
      return { post: null };
    default:
      return null;
  }
}
