/**
 * SSR публичных страниц (лендинг, блог, юридические документы) в Express.
 *
 * Кабинет остаётся клиентским SPA. Публичные роуты (/, /blog, /privacy, ...)
 * сервер рендерит в готовый HTML с мета-тегами и JSON-LD — для SEO и быстрого
 * первого экрана; клиент затем гидрирует интерактив (форма входа, тема).
 *
 * Dev:  модуль рендера грузится через vite.ssrLoadModule, шаблон —
 *       client/public.html, прогоняется через vite.transformIndexHtml.
 * Prod: импортируется собранный dist/server/entry-server.js, шаблон —
 *       dist/public/public.html (Vite уже вставил туда хешированные
 *       <script>/<link>).
 *
 * Аналитику сервер в <head> не вшивает: id счётчиков уходят в
 * window.__SSR_SITE__, а скрипты подключает клиент после согласия
 * посетителя (client/src/public/analytics.ts).
 *
 * Пути резолвятся от process.cwd() (= корень проекта и в dev, и в prod),
 * как и uploadsDir в routes.ts — без import.meta/__dirname, чтобы работать
 * и в ESM-tsx (dev), и в CJS-bundle (prod).
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { Express, Request, Response, NextFunction } from "express";
import { loadRouteData, siteConfig } from "./public-data";
import { getPublicTasksflowBaseUrl } from "./public-urls";

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
): Promise<{ status: number; html: string }> {
  const matched = ssr.matchRoute(pathname);
  // Пагинация блога — через ?page=N. Прокидываем в loadRouteData вместе
  // с параметрами роута (cluster/slug/doc). render() данные уже получает
  // готовыми, так что номер страницы ему не нужен.
  const data = await loadRouteData(matched.key, { ...matched.params, page: pageParam, origin });
  const site = siteConfig();
  const { appHtml, head } = ssr.render(pathname, data, origin, site);
  // Заменители-функции: в HTML статей могут встретиться «$&», «$'» и т. п.
  const html = template
    .replace("<!--app-head-->", () => head)
    .replace("<!--app-html-->", () => appHtml)
    .replace("<!--app-data-->", () => buildDataScript(data, site));
  return { status: matched.key === "not-found" ? 404 : 200, html };
}

async function renderAndSend(
  req: Request,
  res: Response,
  ssr: SsrModule,
  template: string,
): Promise<void> {
  const pageParam = typeof req.query.page === "string" ? req.query.page : "1";
  const { status, html } = await renderPublicPage(
    ssr,
    template,
    req.path,
    pageParam,
    getPublicTasksflowBaseUrl(req),
  );
  res
    .status(status)
    .set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" })
    .end(html);
}

function registerRoutes(app: Express, handler: (req: Request, res: Response, next: NextFunction) => void) {
  app.get("/", handler);
  app.get("/blog", handler);
  app.get("/blog/category/:cluster", handler);
  app.get("/blog/:slug", handler);
  // Юридические документы (content/legal/*.md).
  app.get("/privacy", handler);
  app.get("/consent", handler);
  app.get("/terms", handler);
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
