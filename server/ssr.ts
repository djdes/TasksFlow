/**
 * SSR публичных страниц (лендинг, блог, юридические документы) в Express.
 *
 * Кабинет остаётся клиентским SPA. Публичные роуты (/, /blog, /privacy, ...)
 * сервер рендерит в готовый HTML с мета-тегами и JSON-LD — для SEO и быстрого
 * первого экрана; клиент затем гидрирует интерактив (форма входа, тема).
 * При заголовке `Accept: text/markdown` те же URL отдают чистый Markdown из
 * дисковых JSON-снимков без запуска React-рендера и без запросов к БД.
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { Express, Request, Response, NextFunction } from "express";
import { loadRouteData, siteConfig } from "./public-data";
import { getPublicTasksflowBaseUrl } from "./public-urls";
import { LEGAL_DOCS } from "../client/src/public/legal";
import type { SiteConfig } from "../client/src/public/types";
import { getPublicBannersBothPlacementsSafe } from "./promo-cache/datasets";
import { prefersMarkdown, renderPromoMarkdown } from "./promo-cache/markdown";
import type { PromoSessionRequest } from "./promo-cache/session-bypass";

export interface SsrModule {
  matchRoute: (pathname: string) => { key: string; params: Record<string, string> };
  render: (
    pathname: string,
    data: unknown,
    origin: string,
    site?: unknown,
  ) => { appHtml: string; head: string; routeKey: string };
}

function safeJson(data: unknown): string {
  return JSON.stringify(data ?? null).replace(/</g, "\\u003c");
}

/** Данные для гидрации: данные страницы и общие настройки сайта. */
export function buildDataScript(data: unknown, site: unknown = siteConfig()): string {
  return `<script>window.__SSR_DATA__=${safeJson(data)};window.__SSR_SITE__=${safeJson(site)}</script>`;
}

/** Готовый HTML публичной страницы. Отдельно от Express — его же зовут превью и тесты. */
export async function renderPublicPage(
  ssr: SsrModule,
  template: string,
  pathname: string,
  pageParam: string,
  origin: string,
  siteOverrides?: Partial<SiteConfig>,
): Promise<{ status: number; html: string }> {
  const matched = ssr.matchRoute(pathname);
  // Пагинация блога — через ?page=N. Прокидываем в loadRouteData вместе
  // с параметрами роута (cluster/slug/doc). render() данные уже получает
  // готовыми, так что номер страницы ему не нужен.
  const data = await loadRouteData(matched.key, { ...matched.params, page: pageParam, origin });
  const site: SiteConfig = { ...siteConfig(), ...siteOverrides };
  const { appHtml, head } = ssr.render(pathname, data, origin, site);
  // Заменители-функции: в HTML статей могут встретиться «$&», «$'» и т. п.
  const status =
    matched.key === "not-found" ||
    (matched.key === "blog-article" && !(data as { post?: unknown } | null)?.post) ||
    (matched.key === "legal" && !(data as { doc?: unknown } | null)?.doc)
      ? 404
      : 200;
  const html = template
    .replace("<!--app-head-->", () => head)
    .replace("<!--app-html-->", () => appHtml)
    .replace("<!--app-data-->", () => buildDataScript(data, site));
  return { status, html };
}

async function renderAndSend(
  req: Request,
  res: Response,
  ssr: SsrModule,
  template: string,
): Promise<void> {
  const origin = getPublicTasksflowBaseUrl(req);

  if (prefersMarkdown(req.headers.accept)) {
    const md = await renderPromoMarkdown(req.path, origin);
    if (md) {
      res
        .status(md.status)
        .set({
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "no-cache",
          Vary: "Accept",
        })
        .end(md.markdown);
      return;
    }
  }

  const pageParam = typeof req.query.page === "string" ? req.query.page : "1";
  const hasSignedSession = Boolean((req as PromoSessionRequest).hasSignedSession);
  const banners = await getPublicBannersBothPlacementsSafe();
  const { status, html } = await renderPublicPage(ssr, template, req.path, pageParam, origin, {
    ...(hasSignedSession ? { authenticated: true } : {}),
    banners,
  });
  res
    .status(status)
    .set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      Vary: "Accept",
    })
    .end(html);
}

function registerRoutes(app: Express, handler: (req: Request, res: Response, next: NextFunction) => void) {
  app.get("/", handler);
  app.get("/blog", handler);
  app.get("/blog/category/:cluster", handler);
  app.get("/blog/:slug", handler);
  // Юридические документы (content/legal/*.md): /privacy, /consent, /terms, /offer.
  for (const doc of LEGAL_DOCS) app.get(doc.path, handler);
  // Приложение для телефона: как поставить на Android и iPhone.
  app.get("/app", handler);
}

/** DEV: SSR через работающий Vite dev-сервер. Регистрация синхронная. */
export function setupPublicSsrDev(app: Express, vite: any): void {
  const templatePath = path.join(process.cwd(), "client", "public.html");
  const handler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ssr = (await vite.ssrLoadModule("/src/public/entry-server.tsx")) as SsrModule;
      let template = await fs.promises.readFile(templatePath, "utf-8");
      template = await vite.transformIndexHtml(req.originalUrl, template);
      await renderAndSend(req, res, ssr, template);
    } catch (e) {
      vite.ssrFixStacktrace?.(e as Error);
      next(e);
    }
  };
  registerRoutes(app, handler);
}

/** PROD: SSR через собранный бандл. Модуль и шаблон кэшируются после 1-го запроса. */
export function setupPublicSsrProd(app: Express): void {
  const templatePath = path.join(process.cwd(), "dist", "public", "public.html");
  const ssrPath = path.join(process.cwd(), "dist", "server", "entry-server.js");
  let cachedSsr: SsrModule | null = null;
  let cachedTemplate: string | null = null;

  const handler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!cachedSsr) {
        cachedSsr = (await import(pathToFileURL(ssrPath).href)) as unknown as SsrModule;
      }
      if (!cachedTemplate) {
        cachedTemplate = await fs.promises.readFile(templatePath, "utf-8");
      }
      await renderAndSend(req, res, cachedSsr, cachedTemplate);
    } catch (e) {
      next(e);
    }
  };
  registerRoutes(app, handler);
}
