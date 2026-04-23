/**
 * Mobile responsive audit for protected pages.
 * Logs in, then screenshots dashboard routes at multiple viewports.
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.AUDIT_BASE_URL || "https://wesetup.ru";
const OUT_DIR = process.env.AUDIT_OUT_DIR || "audit/mobile-audit-2026-04-22";

const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "375", width: 375, height: 667 },
  { name: "390", width: 390, height: 844 },
  { name: "414", width: 414, height: 896 },
  { name: "428", width: 428, height: 926 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 1366 },
];

// Core protected pages to audit
const PROTECTED_URLS = [
  "/dashboard",
  "/journals",
  "/batches",
  "/capa",
  "/reports",
  "/settings",
  "/settings/users",
  "/settings/journal-access",
  "/settings/permissions",
  "/settings/schedule",
];

async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true });

  // Login once and save storage state
  const loginContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const loginPage = await loginContext.newPage();

  console.log(`Logging in at ${BASE_URL}/login ...`);
  await loginPage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

  // Try to fill credentials (adjust selectors if needed after snapshot)
  const emailInput = loginPage.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = loginPage.locator('input[type="password"]').first();
  const submitBtn = loginPage.locator('button[type="submit"]').first();

  if (await emailInput.count()) {
    await emailInput.fill("admin@haccp.local");
  }
  if (await passwordInput.count()) {
    await passwordInput.fill("admin1234");
  }
  if (await submitBtn.count()) {
    await submitBtn.click();
    await loginPage.waitForLoadState("networkidle");
    await loginPage.waitForTimeout(2000);
  }

  const currentUrl = loginPage.url();
  console.log(`Post-login URL: ${currentUrl}`);

  if (currentUrl.includes("/login")) {
    console.error("Login failed — still on login page.");
    await loginPage.screenshot({ path: path.join(OUT_DIR, "login-failed.png") });
    await browser.close();
    process.exit(1);
  }

  // Save auth state
  const statePath = path.join(OUT_DIR, "auth-state.json");
  await loginContext.storageState({ path: statePath });
  await loginContext.close();
  console.log("Auth state saved.\n");

  // Screenshot protected pages
  for (const urlPath of PROTECTED_URLS) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        storageState: statePath,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
      const page = await context.newPage();

      const url = `${BASE_URL}${urlPath}`;
      const safeName = urlPath.replace(/\//g, "_").replace(/^_/, "dash");
      const fileName = `${safeName}-${vp.name}.png`;
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
  console.log("\nProtected pages done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
