/**
 * Mobile responsive audit script.
 * Screenshots a list of URLs at multiple viewports and saves them for review.
 *
 * Usage:
 *   npx tsx scripts/mobile-audit.ts
 */

import { chromium, type Browser, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.AUDIT_BASE_URL || "https://wesetup.ru";
const OUT_DIR = process.env.AUDIT_OUT_DIR || "audit/mobile-audit-2026-04-22";

// Key mobile / tablet breakpoints
const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },   // iPhone SE / old Android
  { name: "375", width: 375, height: 667 },   // iPhone 8 / X
  { name: "390", width: 390, height: 844 },   // iPhone 12/13/14
  { name: "414", width: 414, height: 896 },   // iPhone Plus / Max
  { name: "428", width: 428, height: 926 },   // iPhone Pro Max
  { name: "768", width: 768, height: 1024 },  // iPad Mini
  { name: "1024", width: 1024, height: 1366 }, // iPad Pro
];

// Public pages (no auth required)
const PUBLIC_URLS = [
  "/",
  "/login",
  "/register",
  "/blog",
  "/journals-info",
];

async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function screenshotPage(
  browser: Browser,
  urlPath: string,
  viewport: (typeof VIEWPORTS)[number]
) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();

  const url = `${BASE_URL}${urlPath}`;
  const safeName = urlPath.replace(/\//g, "_").replace(/^_/, "root");
  const fileName = `${safeName}-${viewport.name}.png`;
  const filePath = path.join(OUT_DIR, fileName);

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    // Wait a bit for any lazy animations / fonts
    await page.waitForTimeout(1500);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`✓ ${fileName}`);
  } catch (err) {
    console.error(`✗ ${fileName} — ${(err as Error).message}`);
  } finally {
    await context.close();
  }
}

async function main() {
  ensureDir(OUT_DIR);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Output:   ${OUT_DIR}\n`);

  const browser = await chromium.launch({ headless: true });

  for (const urlPath of PUBLIC_URLS) {
    for (const vp of VIEWPORTS) {
      await screenshotPage(browser, urlPath, vp);
    }
  }

  await browser.close();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
