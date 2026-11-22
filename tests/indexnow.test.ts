/**
 * IndexNow: ключ отдаётся с сайта, а скрипт после выкладки отправляет
 * поисковикам только изменившиеся страницы.
 */
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_INDEXNOW_KEY, indexNowKey } from "../server/indexnow";
import { setupPublicAssets } from "../server/public-assets";
import {
  INDEXNOW_KEY,
  buildPayload,
  extractSitemapUrls,
  pickUrls,
  // @ts-expect-error — скрипт без типов: чистый .mjs для CI без npm ci
} from "../script/submit-indexnow.mjs";

const ORIGIN = "https://tasksflow.ru";

describe("ключ IndexNow", () => {
  it("в скрипте выкладки тот же, что отдаёт сервер", () => {
    expect(INDEXNOW_KEY).toBe(DEFAULT_INDEXNOW_KEY);
    expect(DEFAULT_INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/);
  });

  it("кривой INDEXNOW_KEY из окружения не ломает ключ", () => {
    const prev = process.env.INDEXNOW_KEY;
    process.env.INDEXNOW_KEY = "short";
    expect(indexNowKey()).toBe(DEFAULT_INDEXNOW_KEY);
    if (prev === undefined) delete process.env.INDEXNOW_KEY;
    else process.env.INDEXNOW_KEY = prev;
  });
});

describe("маршрут /<ключ>.txt и карта сайта", () => {
  let server: Server;
  let base = "";

  beforeAll(async () => {
    const app = express();
    setupPublicAssets(app);
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("отдаёт ключ текстом", async () => {
    const res = await fetch(`${base}/${DEFAULT_INDEXNOW_KEY}.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe(DEFAULT_INDEXNOW_KEY);
  });

  it("из настоящей sitemap.xml выбирает статью и раздел блога", async () => {
    const xml = await (await fetch(`${base}/sitemap.xml`, { headers: { host: "tasksflow.ru" } })).text();
    const urls: string[] = extractSitemapUrls(xml.replace(/http:\/\/[^/<]+/g, ORIGIN), ORIGIN);
    expect(urls).toContain(`${ORIGIN}/`);
    expect(urls.length).toBeGreaterThan(100);

    const picked = pickUrls(["content/blog/bonusnyj-ball.md"], urls, ORIGIN);
    expect(picked.mode).toBe("some");
    expect(picked.urls.sort()).toEqual([`${ORIGIN}/blog`, `${ORIGIN}/blog/bonusnyj-ball`]);
  });
});

describe("pickUrls", () => {
  const sitemap = [
    `${ORIGIN}/`,
    `${ORIGIN}/blog`,
    `${ORIGIN}/offer`,
    `${ORIGIN}/blog/category/motivaciya`,
    `${ORIGIN}/blog/a`,
    `${ORIGIN}/blog/b`,
  ];

  it("правки кабинета и сервера ничего не отправляют", () => {
    const r = pickUrls(["server/routes/tasks.ts", "client/src/App.tsx", "README.md"], sitemap, ORIGIN);
    expect(r).toEqual({ mode: "none", urls: [] });
  });

  it("лендинг или тарифы — все страницы, кроме статей", () => {
    for (const file of ["client/src/public/Landing.tsx", "shared/plans.ts", "content/legal/offer.md"]) {
      const r = pickUrls([file], sitemap, ORIGIN);
      expect(r.mode).toBe("some");
      expect(r.urls).toEqual(sitemap.slice(0, 4));
    }
  });

  it("удалённая статья, которой нет в карте, не отправляется", () => {
    const r = pickUrls(["content/blog/gone.md"], sitemap, ORIGIN);
    expect(r.urls).toEqual([`${ORIGIN}/blog`]);
  });

  it("первая выкладка скрипта и --all — вся карта", () => {
    expect(pickUrls(["script/submit-indexnow.mjs"], sitemap, ORIGIN)).toEqual({ mode: "all", urls: sitemap });
    expect(pickUrls([], sitemap, ORIGIN, true).mode).toBe("all");
  });
});

describe("extractSitemapUrls и buildPayload", () => {
  it("берёт только https-адреса своего сайта, без повторов", () => {
    const xml =
      `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc> ${ORIGIN}/blog </loc></url>` +
      `<url><loc>${ORIGIN}/</loc></url><url><loc>https://evil.example/x</loc></url>` +
      `<url><loc>http://tasksflow.ru/plain</loc></url></urlset>`;
    expect(extractSitemapUrls(xml, ORIGIN)).toEqual([`${ORIGIN}/`, `${ORIGIN}/blog`]);
  });

  it("собирает тело запроса по протоколу", () => {
    expect(buildPayload([`${ORIGIN}/`], `${ORIGIN}/`)).toEqual({
      host: "tasksflow.ru",
      key: INDEXNOW_KEY,
      keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList: [`${ORIGIN}/`],
    });
  });
});
