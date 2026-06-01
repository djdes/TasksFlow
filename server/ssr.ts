/**
 * SSR публичных страниц (лендинг + блог) в Express.
 *
 * Кабинет остаётся клиентским SPA. Публичные роуты (/, /blog, ...) сервер
 * рендерит в готовый HTML с мета-тегами и JSON-LD — для SEO и быстрого
 * первого экрана; клиент затем гидрирует интерактив (форма входа, тема).
 *
 * Dev:  модуль рендера грузится через vite.ssrLoadModule, шаблон —
 *       client/public.html, прогоняется через vite.transformIndexHtml.
 * Prod: импортируется собранный dist/server/entry-server.js, шаблон —
 *       dist/public/public.html (Vite уже вставил туда хешированные
 *       <script>/<link>).
 *
 * Пути резолвятся от process.cwd() (= корень проекта и в dev, и в prod),
 * как и uploadsDir в routes.ts — без import.meta/__dirname, чтобы работать
 * и в ESM-tsx (dev), и в CJS-bundle (prod).
 */
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { Express, Request, Response, NextFunction } from "express";
import { loadRouteData } from "./public-data";
import { getPublicTasksflowBaseUrl } from "./public-urls";

interface SsrModule {
  matchRoute: (pathname: string) => { key: string; params: Record<string, string> };
  render: (
    pathname: string,
    data: unknown,
    origin: string,
  ) => { appHtml: string; head: string; routeKey: string };
}

function safeJson(data: unknown): string {
  return JSON.stringify(data ?? null).replace(/</g, "\\u003c");
}

function analyticsSnippet(): string {
  const ym = process.env.YM_ID?.trim();
  const ga = process.env.GA_ID?.trim();
  let out = "";
  if (ym) {
    out +=
      `<script type="text/javascript">(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};` +
      `m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})` +
      `(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${JSON.stringify(ym)},"init",` +
      `{clickmap:true,trackLinks:true,accurateTrackBounce:true});</script>` +
      `<noscript><div><img src="https://mc.yandex.ru/watch/${ym}" style="position:absolute;left:-9999px" alt="" /></div></noscript>`;
  }
  if (ga) {
    out +=
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>` +
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config",${JSON.stringify(ga)});</script>`;
  }
  return out;
}

async function renderAndSend(
  req: Request,
  res: Response,
  ssr: SsrModule,
  template: string,
): Promise<void> {
  const pathname = req.path;
  const matched = ssr.matchRoute(pathname);
  const origin = getPublicTasksflowBaseUrl(req);
  const data = await loadRouteData(matched.key, matched.params);
  const { appHtml, head } = ssr.render(pathname, data, origin);
  const dataScript = `<script>window.__SSR_DATA__=${safeJson(data)}</script>` + analyticsSnippet();
  const html = template
    .replace("<!--app-head-->", head)
    .replace("<!--app-html-->", appHtml)
    .replace("<!--app-data-->", dataScript);
  res
    .status(matched.key === "not-found" ? 404 : 200)
    .set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" })
    .end(html);
}

function registerRoutes(app: Express, handler: (req: Request, res: Response, next: NextFunction) => void) {
  app.get("/", handler);
  app.get("/blog", handler);
  app.get("/blog/category/:cluster", handler);
  app.get("/blog/:slug", handler);
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
