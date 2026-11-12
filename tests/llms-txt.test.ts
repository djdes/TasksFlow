/**
 * /llms.txt — описание сайта для ИИ-помощников. Собирается из тех же данных,
 * что лендинг и блог; раньше адрес отдавал оболочку кабинета (HTML, 200).
 */
import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildLlmsTxt } from "../server/llms-txt";
import { setupPublicAssets } from "../server/public-assets";
import { getAllPosts } from "../server/blog";
import { LANDING_FAQ } from "../client/src/public/landing-faq";
import { DEFAULT_DESCRIPTION } from "../client/src/public/seo";
import { LEGAL_DOCS } from "../client/src/public/legal";
import { PLAN_IDS, PLANS } from "../shared/plans";

const ORIGIN = "https://tasksflow.ru";

describe("buildLlmsTxt", () => {
  const posts = getAllPosts();
  const txt = buildLlmsTxt(`${ORIGIN}/`, posts);

  it("начинается с названия и описания главной", () => {
    expect(txt.startsWith(`# TasksFlow\n\n> ${DEFAULT_DESCRIPTION}\n`)).toBe(true);
  });

  it("содержит тарифы, вопросы лендинга, документы и все статьи", () => {
    for (const id of PLAN_IDS) expect(txt).toContain(`- ${PLANS[id].name}: `);
    expect(LANDING_FAQ.length).toBeGreaterThan(0);
    for (const { q, a } of LANDING_FAQ) {
      expect(txt).toContain(`### ${q}`);
      expect(txt).toContain(a);
    }
    for (const d of LEGAL_DOCS) expect(txt).toContain(`(${ORIGIN}${d.path})`);
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) expect(txt).toContain(`(${ORIGIN}/blog/${p.slug})`);
  });

  it("ссылки только на свой сайт, без HTML и цен", () => {
    for (const m of txt.matchAll(/\]\((https?:\/\/[^)]+)\)/g)) expect(m[1].startsWith(`${ORIGIN}/`)).toBe(true);
    expect(txt).not.toMatch(/<[a-z!]/i);
    expect(txt).not.toMatch(/\d\s?₽/);
  });

  it("без статей раздел «Статьи» не выводится", () => {
    expect(buildLlmsTxt(ORIGIN, [])).not.toContain("## Статьи");
  });
});

describe("GET /llms.txt", () => {
  const app = express();
  setupPublicAssets(app);
  let server: ReturnType<typeof app.listen>;
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("отдаёт текст, а не HTML приложения", async () => {
    const r = await fetch(`${base}/llms.txt`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/^text\/plain/);
    const body = await r.text();
    expect(body.startsWith("# TasksFlow")).toBe(true);
    expect(body).not.toContain("<!DOCTYPE");
  });
});
