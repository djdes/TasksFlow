import { LandingPage } from "./pages/LandingPage";
import { BlogIndex } from "./pages/BlogIndex";
import { BlogArticle } from "./pages/BlogArticle";
import { NotFoundPage } from "./pages/NotFound";
import type { MatchedRoute } from "./router";

/**
 * Корень публичной части. Один и тот же компонент рендерится на сервере
 * (SSR) и гидрируется на клиенте. Данные приходят из props (SSR) или
 * window.__SSR_DATA__ (гидрация).
 */
export function PublicApp({ route, data }: { route: MatchedRoute; data: any }) {
  switch (route.key) {
    case "landing":
      return <LandingPage data={data} />;
    case "blog-index":
    case "blog-category":
      return <BlogIndex data={data} />;
    case "blog-article":
      return <BlogArticle data={data} />;
    default:
      return <NotFoundPage />;
  }
}
