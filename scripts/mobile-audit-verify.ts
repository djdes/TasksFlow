/**
 * Verify mobile fixes on localhost — scroll to tables and capture viewport.
 */

import { chromium } from "playwright";
import * as path from "path";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = "audit/mobile-audit-2026-04-22";

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "375", width: 375, height: 667 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });

  const loginContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await loginContext.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').first().fill("admin@haccp.local");
  await page.locator('input[type="password"]').first().fill("admin1234");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL("**/dashboard", { timeout: 10000 });
  const statePath = path.join(OUT_DIR, "auth-state-local.json");
  await loginContext.storageState({ path: statePath });
  await loginContext.close();
  console.log("Logged in.\n");

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState: statePath,
    });
    const p = await ctx.newPage();

    // Batches — scroll to table
    await p.goto(`${BASE_URL}/batches`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    await p.evaluate(() => window.scrollTo(0, 400));
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT_DIR, `dashbatches-table-local-${vp.name}.png`) });
    console.log(`✓ batches table ${vp.name}`);

    // Users — scroll to work-off grid
    await p.goto(`${BASE_URL}/settings/users`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 600));
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT_DIR, `dashsettings_users-table-local-${vp.name}.png`) });
    console.log(`✓ users table ${vp.name}`);

    await ctx.close();
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
