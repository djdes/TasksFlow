import { renderToString } from "react-dom/server";
import { PublicApp } from "./App";
import { matchRoute } from "./router";
import { buildHead } from "./seo";
import { normalizeSite } from "./site";

// matchRoute реэкспортируем, чтобы сервер (server/ssr.ts) решал, какие
// данные грузить, используя ту же логику матчинга.
export { matchRoute };

/** site — общие настройки (контакты, id счётчиков); без него — дефолт без аналитики. */
export function render(pathname: string, data: unknown, origin: string, site?: unknown) {
  const route = matchRoute(pathname);
  const appHtml = renderToString(<PublicApp route={route} data={data} site={normalizeSite(site)} />);
  const head = buildHead(route, data, origin);
  return { appHtml, head, routeKey: route.key };
}
