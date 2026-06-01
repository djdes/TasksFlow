/**
 * Маппинг pathname → публичный роут. Используется и на сервере (SSR,
 * выбор данных + head), и на клиенте (гидрация). Без серверных
 * зависимостей, чтобы импортироваться в обоих бандлах.
 *
 * Публичные страницы — это полноценные переходы по <a href> (не SPA-
 * роутер): для контентного сайта это проще и идеально для SEO.
 */
export type RouteKey =
  | "landing"
  | "blog-index"
  | "blog-article"
  | "blog-category"
  | "not-found";

export interface MatchedRoute {
  key: RouteKey;
  params: Record<string, string>;
}

export function matchRoute(pathname: string): MatchedRoute {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  if (p === "/") return { key: "landing", params: {} };
  if (p === "/blog") return { key: "blog-index", params: {} };

  const cat = p.match(/^\/blog\/category\/([^/]+)$/);
  if (cat) return { key: "blog-category", params: { cluster: decodeURIComponent(cat[1]) } };

  const art = p.match(/^\/blog\/([^/]+)$/);
  if (art) return { key: "blog-article", params: { slug: decodeURIComponent(art[1]) } };

  return { key: "not-found", params: {} };
}

/** Список pathname'ов, которые обслуживает SSR (а не SPA-кабинет). */
export function isPublicPath(pathname: string): boolean {
  return matchRoute(pathname).key !== "not-found";
}
