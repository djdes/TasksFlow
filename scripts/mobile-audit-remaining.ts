/**
 * Audit remaining dashboard pages for mobile overflow.
 */

import { chromium } from "playwright";
import * as path from "path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = "audit/mobile-audit-2026-04-22";

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "375", width: 375, height: 667 },
];

const URLS = [
  "/changes",
  "/losses",
  "/plans",
  "/competencies",
  "/sanpin",
  "/settings/equipment",
  "/settings/areas",
  "/settings/products",
  "/settings/notifications",
  "/settings/audit",
  "/settings/auto-journals",
  "/settings/subscription",
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const statePath = path.join(OUT_DIR, "auth-state-local.json");

  for (const urlPath of URLS) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: statePath,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      });
      const page = await context.newPage();
      const url = `${BASE_URL}${urlPath}`;
      const safeName = urlPath.replace(/\//g, "_").replace(/^_/, "dash");
      const fileName = `${safeName}-local-${vp.name}.png`;
      const filePath = path.join(OUT_DIR, fileName);

      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: filePath, fullPage: true });
        console.log(`✓ ${fileName}`);
      } catch (err) {
        console.error(`✗ ${fileName} — ${(err as Error).message}`);
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
