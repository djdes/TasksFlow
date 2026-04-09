import fs from "fs/promises";
import path from "path";
import { chromium, type Page } from "playwright";

type Args = {
  loginUrl: string;
  rootUrl: string;
  outDir: string;
  username?: string;
  password?: string;
  headless: boolean;
  maxPagesPerJournal: number;
};

type JournalLink = {
  title: string;
  href: string;
  url: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    loginUrl: process.env.SOURCE_SITE_LOGIN_URL ?? "https://lk.haccp-online.ru/docs/login",
    rootUrl: "https://lk.haccp-online.ru/docs/1",
    outDir: "tmp-source-journals/full-crawl",
    username: process.env.SOURCE_SITE_USERNAME ?? "test18",
    password: process.env.SOURCE_SITE_PASSWORD ?? "test11",
    headless: true,
    maxPagesPerJournal: 30,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--")) continue;
    if (key === "--headed") {
      args.headless = false;
      continue;
    }
    if (!value || value.startsWith("--")) continue;
    if (key === "--login-url") args.loginUrl = value;
    if (key === "--root-url") args.rootUrl = value;
    if (key === "--out") args.outDir = value;
    if (key === "--username") args.username = value;
    if (key === "--password") args.password = value;
    if (key === "--max-pages") args.maxPagesPerJournal = Math.max(1, Number(value) || 30);
    i += 1;
  }

  return args;
}

function sanitizeName(input: string) {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "item";
}

function isJournalHref(href: string) {
  if (!href.startsWith("/docs/")) return false;
  if (href.includes("/logout")) return false;
  if (href.includes("/settings")) return false;
  if (href.includes("/position")) return false;
  if (href === "/docs/1" || href === "/docs/1/") return false;
  return true;
}

async function ensureLoggedIn(page: Page, args: Args) {
  await page.goto(args.loginUrl, { waitUntil: "domcontentloaded" });
  const hasPassword = await page.locator('input[type="password"]').count();
  if (!hasPassword) return;
  if (!args.username || !args.password) {
    throw new Error("Missing SOURCE_SITE_USERNAME or SOURCE_SITE_PASSWORD");
  }
  const userField = page
    .locator('input[type="text"], input[name*="login" i], input[name*="user" i]')
    .first();
  const passField = page.locator('input[type="password"], input[name*="pass" i]').first();
  await userField.fill(args.username);
  await passField.fill(args.password);
  await page
    .locator('button[type="submit"], input[type="submit"], button:has-text("Войти")')
    .first()
    .click();
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
}

async function getJournalLinks(page: Page, rootUrl: string): Promise<JournalLink[]> {
  await page.goto(rootUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  return page.evaluate(() => {
    const out: JournalLink[] = [];
    const seen = new Set<string>();
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = a.getAttribute("href") || "";
      const title = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (!href || !title) continue;
      const key = `${title}|${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        title,
        href,
        url: new URL(href, window.location.origin).toString(),
      });
    }
    return out;
  });
}

function toJournalPrefix(url: string) {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return `${u.origin}/docs/`;
  return `${u.origin}/docs/${parts[1]}/`;
}

async function captureState(page: Page, targetUrl: string, outputStem: string) {
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(500);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Download is starting")) {
      return {
        url: targetUrl,
        title: "",
        h1: "",
        tables: 0,
        forms: 0,
        modals: 0,
        buttons: [],
        tablike: [],
        links: [],
        skipped: "download",
      };
    }
    throw error;
  }

  await page.screenshot({ path: `${outputStem}.png`, fullPage: true });
  await fs.writeFile(`${outputStem}.html`, await page.content(), "utf8");

  const meta = await page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')
    )
      .map((n) => (n instanceof HTMLInputElement ? n.value.trim() : (n.textContent || "").trim()))
      .filter(Boolean)
      .slice(0, 200);
    const tablike = Array.from(document.querySelectorAll('[role="tab"], .tab, .tabs a, .nav-tabs a'))
      .map((n) => (n.textContent || "").trim())
      .filter(Boolean)
      .slice(0, 200);
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => ({
        text: (a.textContent || "").trim(),
        href: a.getAttribute("href") || "",
      }))
      .filter((x) => x.href)
      .slice(0, 400);
    return {
      url: location.href,
      title: document.title,
      h1: (document.querySelector("h1")?.textContent || "").trim(),
      tables: document.querySelectorAll("table").length,
      forms: document.querySelectorAll("form").length,
      modals: document.querySelectorAll('[role="dialog"], .modal, .popup').length,
      buttons,
      tablike,
      links,
    };
  });

  await fs.writeFile(`${outputStem}.json`, JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

async function crawlJournal(page: Page, journal: JournalLink, outDir: string, maxPages: number) {
  const prefix = toJournalPrefix(journal.url);
  const queue: string[] = [journal.url];
  const visited = new Set<string>();
  const pages: string[] = [];

  while (queue.length && pages.length < maxPages) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const index = pages.length + 1;
    const stem = path.join(outDir, `${String(index).padStart(2, "0")}-${sanitizeName(current)}`);
    const meta = await captureState(page, current, stem);
    pages.push(meta.url);

    for (const link of meta.links as Array<{ href: string }>) {
      if (!link.href) continue;
      const resolved = new URL(link.href, meta.url).toString();
      if (resolved.includes("docprint")) continue;
      if (!resolved.startsWith(prefix)) continue;
      if (visited.has(resolved)) continue;
      if (!queue.includes(resolved)) queue.push(resolved);
    }
  }

  await fs.writeFile(
    path.join(outDir, "summary.json"),
    JSON.stringify(
      {
        journal,
        prefix,
        capturedPages: pages.length,
        pages,
      },
      null,
      2
    ),
    "utf8"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outRoot = path.resolve(args.outDir);
  await fs.mkdir(outRoot, { recursive: true });

  const browser = await chromium.launch({ headless: args.headless });
  const page = await browser.newPage({ viewport: { width: 1600, height: 2200 } });

  await ensureLoggedIn(page, args);

  const links = await getJournalLinks(page, args.rootUrl);
  const journals = links.filter((l) => isJournalHref(new URL(l.url).pathname));

  const runMeta = {
    startedAt: new Date().toISOString(),
    rootUrl: args.rootUrl,
    totalLinks: links.length,
    journals: journals.length,
  };
  await fs.writeFile(path.join(outRoot, "run-meta.json"), JSON.stringify(runMeta, null, 2), "utf8");

  for (let i = 0; i < journals.length; i += 1) {
    const j = journals[i];
    const pathSlug = sanitizeName(new URL(j.url).pathname);
    const titleSlug = sanitizeName(j.title);
    const dir = path.join(outRoot, `${String(i + 1).padStart(2, "0")}-${titleSlug}-${pathSlug}`);
    await fs.mkdir(dir, { recursive: true });
    await crawlJournal(page, j, dir, args.maxPagesPerJournal);
  }

  await browser.close();
  console.log(`Done. Captured journals: ${journals.length}. Output: ${outRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
