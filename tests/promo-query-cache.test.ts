/**
 * Проверка дискового JSON-кэша промо-страниц и ИИ-выдачи TasksFlow:
 *   • атомарные именованные JSON-снимки без временных файлов и без TTL на чтении
 *   • ровно 0 SELECT / UPDATE к MySQL и таблице sessions при выдаче прогретых
 *     промо-страниц, блога, баннеров, *.md, Accept: text/markdown, /llms*.txt
 *     (в том числе для залогиненного посетителя с подписанной cookie connect.sid)
 *   • семантический HTML5 (<main id="main-content">, <time datetime="...">)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import session, { Store } from "express-session";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, matchRoute } from "../client/src/public/entry-server";
import { db } from "../server/db";
import { getAllPosts, warmBlogSnapshots } from "../server/blog";
import { warmLegalSnapshots } from "../server/public-data";
import { setupPublicAssets } from "../server/public-assets";
import { renderPublicPage, type SsrModule } from "../server/ssr";
import { registerBannerRoutes } from "../server/routes/banners";
import {
  getPublicBannersBothPlacementsSafe,
  getPromoCacheStatus,
} from "../server/promo-cache/datasets";
import {
  prefersMarkdown,
  renderPromoMarkdown,
} from "../server/promo-cache/markdown";
import {
  createPublicPromoSessionBypass,
  verifySignedSessionCookie,
  type PromoSessionRequest,
} from "../server/promo-cache/session-bypass";
import { writePromoSnapshotAtomicSync } from "../server/promo-cache/store";

const SESSION_SECRET = "promo-cache-test-secret-987654321";

function signConnectSid(sid: string, secret: string): string {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(sid)
    .digest("base64")
    .replace(/=+$/, "");
  return `connect.sid=${encodeURIComponent(`s:${sid}.${sig}`)}`;
}

class PoisonedSessionStore extends Store {
  get(_sid: string, cb: (err: unknown) => void): void {
    cb(new Error("SESSION SQL SELECT ON PROMO ROUTE"));
  }
  set(_sid: string, _sess: session.SessionData, cb?: (err?: unknown) => void): void {
    cb?.(new Error("SESSION SQL INSERT ON PROMO ROUTE"));
  }
  destroy(_sid: string, cb?: (err?: unknown) => void): void {
    cb?.(new Error("SESSION SQL DELETE ON PROMO ROUTE"));
  }
  touch(_sid: string, _sess: session.SessionData, cb?: (err?: unknown) => void): void {
    cb?.(new Error("SESSION SQL TOUCH ON PROMO ROUTE"));
  }
}

describe("promo-query-cache (TasksFlow)", () => {
  let cacheDir = "";
  const prevCacheDir = process.env.PROMO_CACHE_DIR;
  let realPostSlug = "";
  const nowSec = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "tf-promo-cache-"));
    process.env.PROMO_CACHE_DIR = cacheDir;

    // Прогреваем файловые снимки контента и доменные JSON-снимки БД.
    warmBlogSnapshots();
    warmLegalSnapshots();
    realPostSlug = getAllPosts()[0]?.slug ?? "";

    writePromoSnapshotAtomicSync("billing-prices", [
      { plan: "team", months: 1, priceRub: 1490 },
      { plan: "business", months: 1, priceRub: 3990 },
    ]);
    writePromoSnapshotAtomicSync("price-promotions", [
      {
        id: 10,
        title: "Весенний запуск",
        percent: 20,
        startsAt: nowSec - 3600,
        endsAt: nowSec + 86400,
      },
      {
        id: 11,
        title: "Будущая акция",
        percent: 50,
        startsAt: nowSec + 86400,
        endsAt: nowSec + 172800,
      },
    ]);
    writePromoSnapshotAtomicSync("public-banners", [
      {
        id: 1,
        text: "Скидка 20% на годовой тариф",
        linkUrl: "/#pricing",
        linkLabel: "Выбрать тариф",
        placement: "top",
        bgColor: null,
        textColor: null,
        active: true,
        startsAt: nowSec - 600,
        endsAt: nowSec + 7200,
        position: 0,
        createdAt: nowSec - 1000,
        updatedAt: nowSec - 1000,
      },
      {
        id: 2,
        text: "Ещё не начавшийся баннер",
        linkUrl: "/#pricing",
        linkLabel: "Скоро",
        placement: "top",
        bgColor: null,
        textColor: null,
        active: true,
        startsAt: nowSec + 7200,
        endsAt: nowSec + 14400,
        position: 1,
        createdAt: nowSec - 900,
        updatedAt: nowSec - 900,
      },
    ]);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    if (prevCacheDir === undefined) delete process.env.PROMO_CACHE_DIR;
    else process.env.PROMO_CACHE_DIR = prevCacheDir;
    if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it("хранит только именованные JSON-конверты version=1 без .tmp файлов", () => {
    const files = fs.readdirSync(cacheDir).sort();
    expect(files).toEqual([
      "billing-prices.json",
      "blog-index.json",
      "blog-posts.json",
      "legal-docs.json",
      "price-promotions.json",
      "public-banners.json",
    ]);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);

    const status = getPromoCacheStatus();
    expect(status.datasets.every((d) => d.exists && d.sizeBytes > 0)).toBe(true);
  });

  it("проверяет подпись cookie connect.sid и заголовок Accept: text/markdown без SQL", () => {
    const validCookie = signConnectSid("sess-abc-123", SESSION_SECRET);
    expect(verifySignedSessionCookie(validCookie, SESSION_SECRET)).toBe(true);
    expect(verifySignedSessionCookie(validCookie, "wrong-secret")).toBe(false);
    expect(verifySignedSessionCookie("connect.sid=s%3Asess-abc-123.bad", SESSION_SECRET)).toBe(false);

    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown;q=0.9, text/html;q=0.8")).toBe(true);
    expect(prefersMarkdown("text/html,application/xhtml+xml,*/*;q=0.8")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
  });

  it("отдаёт все публичные страницы, баннеры, .md и /llms*.txt с 0 запросов к БД даже с cookie сессии", async () => {
    const dbThrow = () => {
      throw new Error("UNEXPECTED MYSQL QUERY ON WARM PROMO PAGE");
    };
    const spies = [
      vi.spyOn(db, "select").mockImplementation(dbThrow as any),
      vi.spyOn(db, "execute").mockImplementation(dbThrow as any),
      vi.spyOn(db, "insert").mockImplementation(dbThrow as any),
      vi.spyOn(db, "update").mockImplementation(dbThrow as any),
      vi.spyOn(db, "delete").mockImplementation(dbThrow as any),
    ];

    try {
      const app = express();
      app.use(createPublicPromoSessionBypass(SESSION_SECRET));
      app.use(
        session({
          secret: SESSION_SECRET,
          resave: false,
          saveUninitialized: false,
          rolling: true,
          store: new PoisonedSessionStore(),
        }),
      );
      setupPublicAssets(app);
      registerBannerRoutes(app);

      const ssr: SsrModule = { matchRoute, render };
      const template =
        "<!doctype html><html lang=\"ru\"><head><!--app-head--></head><body><div id=\"public-root\"><!--app-html--></div><!--app-data--></body></html>";
      const ssrHandler: express.RequestHandler = async (req, res) => {
        const origin = "https://tasksflow.ru";
        if (prefersMarkdown(req.headers.accept)) {
          const md = await renderPromoMarkdown(req.path, origin);
          if (md) {
            res
              .status(md.status)
              .set({ "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept" })
              .end(md.markdown);
            return;
          }
        }
        const banners = await getPublicBannersBothPlacementsSafe();
        const authenticated = Boolean((req as PromoSessionRequest).hasSignedSession);
        const out = await renderPublicPage(ssr, template, req.path, "1", origin, {
          ...(authenticated ? { authenticated: true } : {}),
          banners,
        });
        res
          .status(out.status)
          .set({ "Content-Type": "text/html; charset=utf-8", Vary: "Accept" })
          .end(out.html);
      };
      app.get("/", ssrHandler);
      app.get("/blog", ssrHandler);
      app.get("/blog/category/:cluster", ssrHandler);
      app.get("/blog/:slug", ssrHandler);
      app.get("/privacy", ssrHandler);
      app.get("/app", ssrHandler);

      const signedCookie = signConnectSid("logged-in-user-sid", SESSION_SECRET);

      // 1. Главная с валидной cookie сессии: 0 SQL, сразу «Открыть кабинет», цена со скидкой 20% от 1490 = 1192 ₽
      const homeAuth = await request(app).get("/").set("Cookie", signedCookie).expect(200);
      expect(homeAuth.headers["vary"]).toContain("Accept");
      expect(homeAuth.text).toContain('<main id="main-content">');
      expect(homeAuth.text).toContain('type="text/markdown" href="https://tasksflow.ru/index.md"');
      expect(homeAuth.text).toContain("Открыть кабинет");
      expect(homeAuth.text).toContain("Весенний запуск");
      expect(homeAuth.text).not.toContain("Будущая акция");
      expect(homeAuth.text.replace(/<!-- -->/g, "")).toMatch(/1[\s\u00a0]?192[\s\u00a0]₽/);

      // 2. Главная без cookie (или с поддельной): кнопка «Войти»
      const homeAnon = await request(app)
        .get("/")
        .set("Cookie", "connect.sid=s%3Afake.invalid")
        .expect(200);
      expect(homeAnon.text).toContain(">Войти<");
      expect(homeAnon.text).not.toContain("Открыть кабинет");

      // 3. Статья блога и несуществующая статья (404 без SQL!)
      expect(realPostSlug).toBeTruthy();
      const postRes = await request(app)
        .get(`/blog/${realPostSlug}`)
        .set("Cookie", signedCookie)
        .expect(200);
      expect(postRes.text).toContain('<main id="main-content"');
      expect(postRes.text).toContain("<article");
      expect(postRes.text).toMatch(/<time dateTime="\d{4}-\d{2}-\d{2}">/);
      expect(postRes.text).toContain(`href="https://tasksflow.ru/blog/${realPostSlug}.md"`);

      await request(app)
        .get("/blog/missing-article-404-probe")
        .set("Cookie", signedCookie)
        .expect(404);

      // 4. Юридическая страница и /app
      const legalRes = await request(app).get("/privacy").set("Cookie", signedCookie).expect(200);
      expect(legalRes.text).toContain('<main id="main-content"');
      expect(legalRes.text).toMatch(/<time dateTime="\d{4}-\d{2}-\d{2}">Редакция от /);

      await request(app).get("/app").set("Cookie", signedCookie).expect(200);

      // 5. GET /api/banners: фильтрация окна startsAt..endsAt в памяти, 0 SQL
      const topBanners = await request(app)
        .get("/api/banners?placement=top")
        .set("Cookie", signedCookie)
        .expect(200);
      expect(topBanners.body).toHaveLength(1);
      expect(topBanners.body[0].text).toBe("Скидка 20% на годовой тариф");

      const contentBanners = await request(app)
        .get("/api/banners?placement=content")
        .set("Cookie", signedCookie)
        .expect(200);
      expect(contentBanners.body).toEqual([]);

      // 6. Двойная выдача Markdown: *.md и Accept: text/markdown
      const indexMd = await request(app).get("/index.md").set("Cookie", signedCookie).expect(200);
      expect(indexMd.headers["content-type"]).toContain("text/markdown");
      expect(indexMd.headers["x-robots-tag"]).toBe("noindex, follow");
      expect(indexMd.headers["vary"]).toContain("Accept");
      expect(indexMd.text).toContain("# TasksFlow");
      expect(indexMd.text).toContain("| Тариф | Стоимость | Возможности |");

      const negotiatedMd = await request(app)
        .get(`/blog/${realPostSlug}`)
        .set("Accept", "text/markdown, text/html;q=0.5")
        .set("Cookie", signedCookie)
        .expect(200);
      expect(negotiatedMd.headers["content-type"]).toContain("text/markdown");
      expect(negotiatedMd.text).toContain(`https://tasksflow.ru/blog/${realPostSlug}`);

      await request(app).get("/blog/missing-article-404-probe.md").expect(404);

      // 7. /llms.txt (без цен в ₽), /llms-full.txt, /robots.txt (Content-Signal), /sitemap.xml
      const llms = await request(app).get("/llms.txt").set("Cookie", signedCookie).expect(200);
      expect(llms.text).not.toMatch(/\d\s?₽/);

      const llmsFull = await request(app)
        .get("/llms-full.txt")
        .set("Cookie", signedCookie)
        .expect(200);
      expect(llmsFull.text).toContain("llms-full.txt");
      expect(llmsFull.text).toContain("Весенний запуск");

      const robots = await request(app).get("/robots.txt").expect(200);
      expect(robots.text).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no");
      expect(robots.text).toContain("Allow: /llms-full.txt");
      expect(robots.text).toContain("Disallow: /dashboard");
      expect(robots.text).toContain("Disallow: /api");

      await request(app).get("/sitemap.xml").set("Cookie", signedCookie).expect(200);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});
