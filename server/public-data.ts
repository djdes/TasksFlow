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
      const posts = getAllPosts();
      return {
        posts,
        clusters: clusterStats(),
        featured: getFeatured(),
        activeCluster: null,
        total: posts.length,
      };
    }
    case "blog-category": {
      const cluster = params.cluster ?? null;
      const posts = cluster ? getByCluster(cluster) : getAllPosts();
      return {
        posts,
        clusters: clusterStats(),
        featured: null,
        activeCluster: cluster,
        total: posts.length,
      };
    }
    case "blog-article":
      return { post: getPost(params.slug) };
    default:
      return null;
  }
}
