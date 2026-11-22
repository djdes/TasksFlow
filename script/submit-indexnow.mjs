#!/usr/bin/env node
/**
 * IndexNow после выкладки: сообщаем Яндексу и Bing, какие страницы изменились,
 * чтобы новая статья или новая цена попали в поиск за часы, а не за недели.
 *
 * Без зависимостей: в CI запускается сразу после checkout, без `npm ci`.
 *
 * Что отправляем (список изменённых файлов выкладки — из stdin, по строке):
 *   content/blog/<slug>.md           → статья и /blog
 *   лендинг, тарифы, документы       → все страницы сайта, кроме статей
 *   этот скрипт (первая выкладка)    → вся карта сайта
 *   --all                            → вся карта сайта
 * Ничего из этого не менялось — ничего не шлём: протокол просит не
 * присылать адреса без изменений.
 *
 * Отправляются только адреса, которые есть в боевой /sitemap.xml.
 * Любая ошибка сети или поисковика — предупреждение и код 0: выкладку
 * это не роняет.
 *
 *   git diff --name-only A B | node script/submit-indexnow.mjs
 *   node script/submit-indexnow.mjs --all [--dry-run] [--base-url https://tasksflow.ru]
 */
import { pathToFileURL } from "node:url";

/** Тот же ключ, что в server/indexnow.ts (сторож — tests/indexnow.test.ts). */
export const INDEXNOW_KEY = "eb3dd8a9637e090ab73742c4803963fa";

export const DEFAULT_BASE_URL = "https://tasksflow.ru";

/** Яндекс и общий адрес протокола (его слушает Bing). */
export const DEFAULT_ENDPOINTS = [
  "https://yandex.com/indexnow",
  "https://api.indexnow.org/indexnow",
];

/** Файлы, от которых зависят главная, разделы блога и документы. */
const SITE_WIDE = [
  /^client\/src\/public\//,
  /^content\/legal\//,
  /^shared\/plans\.ts$/,
  /^shared\/blog-clusters\.ts$/,
];
const SELF = /^script\/submit-indexnow\.mjs$/;
const BLOG_POST = /^content\/blog\/([^/]+)\.md$/;

/** Адреса из sitemap.xml — только своего сайта, без повторов. */
export function extractSitemapUrls(xml, baseUrl = DEFAULT_BASE_URL) {
  const host = new URL(baseUrl).host;
  const seen = new Set();
  for (const m of String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const raw = m[1].replace(/&amp;/g, "&");
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" && u.host === host) seen.add(u.toString());
    } catch {
      // кривой адрес в карте — пропускаем
    }
  }
  return [...seen];
}

/**
 * Что отправить по списку изменённых файлов.
 * mode: "all" — вся карта, "some" — выбранные адреса, "none" — нечего слать.
 */
export function pickUrls(changedFiles, sitemapUrls, baseUrl = DEFAULT_BASE_URL, all = false) {
  const origin = baseUrl.replace(/\/+$/, "");
  const files = changedFiles.map((f) => f.trim().replace(/\\/g, "/")).filter(Boolean);
  if (all || files.some((f) => SELF.test(f))) return { mode: "all", urls: [...sitemapUrls] };

  const inSitemap = new Set(sitemapUrls);
  const picked = new Set();
  const isArticle = (u) => /\/blog\/(?!category\/)[^/]+$/.test(new URL(u).pathname);

  if (files.some((f) => SITE_WIDE.some((re) => re.test(f)))) {
    for (const u of sitemapUrls) if (!isArticle(u)) picked.add(u);
  }
  for (const f of files) {
    const m = BLOG_POST.exec(f);
    if (!m) continue;
    picked.add(`${origin}/blog/${m[1]}`);
    picked.add(`${origin}/blog`);
  }
  // Удалённая или переименованная статья в карту не попадёт — её не шлём.
  const urls = [...picked].filter((u) => inSitemap.has(u));
  return { mode: urls.length ? "some" : "none", urls };
}

/** Тело запроса IndexNow. */
export function buildPayload(urls, baseUrl = DEFAULT_BASE_URL, key = INDEXNOW_KEY) {
  const origin = baseUrl.replace(/\/+$/, "");
  return {
    host: new URL(origin).host,
    key,
    keyLocation: `${origin}/${key}.txt`,
    urlList: urls,
  };
}

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.INDEXNOW_BASE_URL || DEFAULT_BASE_URL,
    key: process.env.INDEXNOW_KEY || INDEXNOW_KEY,
    all: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--all") opts.all = true;
    else if (argv[i] === "--dry-run") opts.dryRun = true;
    else if (argv[i] === "--base-url" && argv[i + 1]) opts.baseUrl = argv[++i];
  }
  return opts;
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function fetchText(url, timeoutMs = 20_000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  return { status: res.status, text: await res.text() };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const base = opts.baseUrl.replace(/\/+$/, "");
  const changed = opts.all ? [] : (await readStdin()).split("\n");

  const sitemap = await fetchText(`${base}/sitemap.xml`);
  if (sitemap.status !== 200) {
    console.warn(`[indexnow] ${base}/sitemap.xml ответил ${sitemap.status} — пропуск`);
    return;
  }
  const sitemapUrls = extractSitemapUrls(sitemap.text, base);
  const { mode, urls } = pickUrls(changed, sitemapUrls, base, opts.all);
  if (mode === "none") {
    console.log("[indexnow] публичные страницы не менялись — отправлять нечего");
    return;
  }
  console.log(`[indexnow] к отправке: ${urls.length} (${mode === "all" ? "вся карта сайта" : "изменённые"})`);
  for (const u of urls.slice(0, 20)) console.log(`  ${u}`);
  if (urls.length > 20) console.log(`  … и ещё ${urls.length - 20}`);
  if (opts.dryRun) return;

  // Поисковик проверит ключ по этому адресу: нет файла — запрос бесполезен.
  const keyFile = await fetchText(`${base}/${opts.key}.txt`);
  if (keyFile.status !== 200 || keyFile.text.trim() !== opts.key) {
    console.warn(`[indexnow] ${base}/<ключ>.txt ответил ${keyFile.status} или отдал не ключ — пропуск`);
    return;
  }

  const body = JSON.stringify(buildPayload(urls, base, opts.key));
  for (const endpoint of DEFAULT_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      // 200 — принято, 202 — принято, ключ ещё проверяется.
      const ok = res.status === 200 || res.status === 202;
      console[ok ? "log" : "warn"](`[indexnow] ${endpoint} → ${res.status}${ok ? "" : ` ${(await res.text()).slice(0, 200)}`}`);
    } catch (err) {
      console.warn(`[indexnow] ${endpoint} — ${err?.message || err}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.warn(`[indexnow] не отправлено: ${err?.message || err}`);
  });
}
