/**
 * Audit more pages.
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
  "/settings/equipment/qr-sheet",
  "/settings/integrations/tasksflow",
  "/journals",
  "/dashboard",
  "/reports",
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const statePath = path.join(OUT_DIR, "auth-state-local.json");

  for (const urlPath of URLS) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: statePath,
      });
      const page = await context.newPage();
      const safeName = urlPath.replace(/\//g, "_").replace(/^_/, "dash");
      const fileName = `${safeName}-local-${vp.name}.png`;
      const filePath = path.join(OUT_DIR, fileName);

      try {
        await page.goto(`${BASE_URL}${urlPath}`, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: filePath, fullPage: true });
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        const ok = width <= vp.width + 5;
        console.log(`${ok ? "✓" : "✗"} ${fileName} (docWidth=${width})`);
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
