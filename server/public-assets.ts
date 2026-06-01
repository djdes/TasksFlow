/**
 * Публичные ассеты/служебные эндпоинты, не требующие React-SSR:
 *   GET /og/:slug.svg  — обложка статьи (SVG)
 *   GET /sitemap.xml   — карта сайта (лендинг + блог + категории + статьи)
 *   GET /robots.txt    — robots + ссылка на sitemap
 *
 * Регистрируются и в dev, и в prod (вызываются из vite.ts / static.ts).
 */
import type { Express, Request, Response } from "express";
import { getAllPosts, getPost } from "./blog";
import { coverSvg } from "./og-cover";
import { CLUSTERS } from "@shared/blog-clusters";
import { getPublicTasksflowBaseUrl } from "./public-urls";

export function setupPublicAssets(app: Express): void {
  // Обложка статьи. :slug.svg — slug + расширение.
  app.get("/og/:file", (req: Request, res: Response) => {
    const file = req.params.file || "";
    const slug = file.replace(/\.svg$/, "");
    const post = getPost(slug);
    const svg = coverSvg({
      title: post?.title || "TasksFlow — контроль задач для команд",
      cluster: post?.cluster || "upravlenie",
      slug,
    });
    res
      .status(200)
      .set({
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      })
      .end(svg);
  });

  app.get("/sitemap.xml", (req: Request, res: Response) => {
    const origin = getPublicTasksflowBaseUrl(req);
    const posts = getAllPosts();
    const urls: { loc: string; priority: string; changefreq: string; lastmod?: string }[] = [
      { loc: `${origin}/`, priority: "1.0", changefreq: "weekly" },
      { loc: `${origin}/blog`, priority: "0.8", changefreq: "daily" },
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
