import { LandingPage } from "./pages/LandingPage";
import { BlogIndex } from "./pages/BlogIndex";
import { BlogArticle } from "./pages/BlogArticle";
import { LegalPage } from "./pages/LegalPage";
import { AppPage } from "./pages/AppPage";
import { NotFoundPage } from "./pages/NotFound";
import { CookieNotice } from "./components/CookieNotice";
import { DEFAULT_SITE, SiteProvider } from "./site";
import type { MatchedRoute } from "./router";
import type { SiteConfig } from "./types";

function Page({ route, data }: { route: MatchedRoute; data: any }) {
  switch (route.key) {
    case "landing":
      return <LandingPage data={data} />;
    case "blog-index":
    case "blog-category":
      return <BlogIndex data={data} />;
    case "blog-article":
      return <BlogArticle data={data} />;
    case "legal":
      return <LegalPage data={data} />;
    case "app":
      return <AppPage data={data} />;
    default:
      return <NotFoundPage />;
  }
}

/**
 * Корень публичной части. Один и тот же компонент рендерится на сервере
 * (SSR) и гидрируется на клиенте. Данные приходят из props (SSR) или
 * window.__SSR_DATA__ / __SSR_SITE__ (гидрация).
 */
export function PublicApp({ route, data, site = DEFAULT_SITE }: { route: MatchedRoute; data: any; site?: SiteConfig }) {
  return (
    <SiteProvider value={site}>
      <Page route={route} data={data} />
      <CookieNotice />
    </SiteProvider>
  );
}
