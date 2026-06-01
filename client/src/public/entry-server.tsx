import { renderToString } from "react-dom/server";
import { PublicApp } from "./App";
import { matchRoute } from "./router";
import { buildHead } from "./seo";

// matchRoute реэкспортируем, чтобы сервер (server/ssr.ts) решал, какие
// данные грузить, используя ту же логику матчинга.
export { matchRoute };

export function render(pathname: string, data: unknown, origin: string) {
  const route = matchRoute(pathname);
  const appHtml = renderToString(<PublicApp route={route} data={data} />);
  const head = buildHead(route, data, origin);
  return { appHtml, head, routeKey: route.key };
}
