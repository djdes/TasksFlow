/**
 * Публичные ассеты/служебные эндпоинты, не требующие React-SSR:
 *   GET /og/:slug.svg  — обложка статьи (SVG), /og/:slug.png — она же для og:image
 *   GET /sitemap.xml   — карта сайта (лендинг + блог + категории + статьи)
 *   GET /robots.txt    — robots + ссылка на sitemap
 *   GET /llms.txt      — описание сайта для ИИ-помощников (server/llms-txt.ts)
 *   GET /<ключ>.txt    — ключ IndexNow (server/indexnow.ts)
 *
 * Регистрируются и в dev, и в prod (вызываются из vite.ts / static.ts).
 */
import type { Express, Request, Response } from "express";
import { getAllPosts, getPost } from "./blog";
import { coverSvg, coverPng } from "./og-cover";
import { CLUSTERS } from "@shared/blog-clusters";
import { getPublicTasksflowBaseUrl } from "./public-urls";
import { LEGAL_DOCS } from "../client/src/public/legal";
import { buildLlmsTxt } from "./llms-txt";
import { indexNowKey } from "./indexnow";

export function setupPublicAssets(app: Express): void {
  // Обложка статьи: /og/:slug.svg — для страниц сайта, /og/:slug.png — для
  // og:image (мессенджеры и соцсети SVG в превью не показывают).
  const pngCache = new Map<string, Buffer>();
  app.get("/og/:file", async (req: Request, res: Response) => {
    const file = req.params.file || "";
    const wantPng = /\.png$/.test(file);
    const slug = file.replace(/\.(svg|png)$/, "");
    const post = getPost(slug);
    const cover = {
      title: post?.title || "TasksFlow — контроль задач для команд",
      cluster: post?.cluster || "upravlenie",
      // Неизвестный адрес — общая обложка: кэш не растёт от случайных slug.
      slug: post ? slug : "default",
    };
    if (wantPng) {
      try {
        let png = pngCache.get(cover.slug);
        if (!png) {
          png = await coverPng(cover);
          pngCache.set(cover.slug, png);
        }
        res
          .status(200)
          .set({ "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" })
          .end(png);
        return;
      } catch (err) {
        console.error("[og] PNG не собран, отдаю SVG:", err);
      }
    }
    res
      .status(200)
      .set({
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": wantPng ? "no-store" : "public, max-age=86400",
      })
      .end(coverSvg({ ...cover, slug }));
  });

  app.get("/sitemap.xml", (req: Request, res: Response) => {
    const origin = getPublicTasksflowBaseUrl(req);
    const posts = getAllPosts();
    const urls: { loc: string; priority: string; changefreq: string; lastmod?: string }[] = [
      { loc: `${origin}/`, priority: "1.0", changefreq: "weekly" },
      { loc: `${origin}/blog`, priority: "0.8", changefreq: "daily" },
      { loc: `${origin}/app`, priority: "0.6", changefreq: "monthly" },
      // Юридические документы: поисковики и проверяющие должны их находить.
      ...LEGAL_DOCS.map(({ slug }) => ({
        loc: `${origin}/${slug}`,
        priority: "0.3",
        changefreq: "yearly",
      })),
      ...CLUSTERS.map((c) => ({
        loc: `${origin}/blog/category/${c.key}`,
        priority: "0.6",
        changefreq: "weekly",
      })),
      ...posts.map((p) => ({
        loc: `${origin}/blog/${p.slug}`,
        priority: "0.7",
        changefreq: "monthly",
        lastmod: p.date,
      })),
    ];
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (u) =>
            `  <url><loc>${u.loc}</loc>` +
            (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : "") +
            `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
        )
        .join("\n") +
      `\n</urlset>\n`;
    res.status(200).set({ "Content-Type": "application/xml; charset=utf-8" }).end(xml);
  });

  // Без этого маршрута адрес отдавал оболочку кабинета (HTML с кодом 200).
  app.get("/llms.txt", (req: Request, res: Response) => {
    const body = buildLlmsTxt(getPublicTasksflowBaseUrl(req), getAllPosts());
    res
      .status(200)
      .set({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" })
      .end(body);
  });

  // Ключ IndexNow: Яндекс и Bing скачивают его, чтобы убедиться, что адреса
  // присылает владелец сайта. Без маршрута адрес отдал бы оболочку кабинета.
  app.get(`/${indexNowKey()}.txt`, (_req: Request, res: Response) => {
    res
      .status(200)
      .set({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" })
      .end(indexNowKey());
  });

  app.get("/robots.txt", (req: Request, res: Response) => {
    const origin = getPublicTasksflowBaseUrl(req);
    const body =
      `User-agent: *\n` +
      `Allow: /$\n` +
      `Allow: /blog\n` +
      `Disallow: /dashboard\n` +
      `Disallow: /admin\n` +
      `Disallow: /account\n` +
      `Disallow: /api\n` +
      `\nSitemap: ${origin}/sitemap.xml\n`;
    res.status(200).set({ "Content-Type": "text/plain; charset=utf-8" }).end(body);
  });
}
