/**
 * Загрузка данных для SSR публичных страниц по ключу роута. Реальные
 * данные блога берутся из server/blog.ts (content/blog/*.md).
 */
import {
  getAllPosts,
  getByCluster,
  getFeatured,
  getPost,
  clusterStats,
  totalPosts,
} from "./blog";

const PAGE_SIZE = 12;

function clampPage(raw: string | undefined, itemCount: number): number {
  const totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));
  const n = parseInt(raw || "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, totalPages);
}

export async function loadRouteData(
  routeKey: string,
  params: Record<string, string>,
): Promise<unknown> {
  switch (routeKey) {
    case "landing": {
      const featuredPosts = getAllPosts().slice(0, 3);
      return { featuredPosts, totalPosts: totalPosts() };
    }
    case "blog-index": {
      const featured = getFeatured();
      // Featured показываем отдельным блоком на 1-й странице, поэтому
      // исключаем его из пагинируемого списка, чтобы не было дубля.
      const rest = getAllPosts().filter((p) => !featured || p.slug !== featured.slug);
      const page = clampPage(params.page, rest.length);
      const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
      const start = (page - 1) * PAGE_SIZE;
      return {
        posts: rest.slice(start, start + PAGE_SIZE),
        clusters: clusterStats(),
        featured: page === 1 ? featured : null,
        activeCluster: null,
        total: getAllPosts().length,
        page,
        totalPages,
        pageSize: PAGE_SIZE,
      };
    }
    case "blog-category": {
      const cluster = params.cluster ?? null;
      const list = cluster ? getByCluster(cluster) : getAllPosts();
      const page = clampPage(params.page, list.length);
      const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      const start = (page - 1) * PAGE_SIZE;
      return {
        posts: list.slice(start, start + PAGE_SIZE),
        clusters: clusterStats(),
        featured: null,
        activeCluster: cluster,
        total: list.length,
        page,
        totalPages,
        pageSize: PAGE_SIZE,
      };
    }
    case "blog-article":
      return { post: getPost(params.slug) };
    default:
      return null;
  }
}
