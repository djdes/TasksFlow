/**
 * Full-surface screenshot capture for WeSetup.
 *
 * Logs in once as the demo-screenshots user (seeded by
 * prisma/seed-demo-screenshots.ts) and walks every public + authenticated
 * route in three viewports (desktop 1440, tablet 768, mobile 390). Saves
 * PNGs into `public/screenshots/<viewport>/<slug>.png` so Next.js serves
 * them at `/screenshots/<viewport>/<slug>.png`.
 *
 * Run:
 *   BASE_URL=https://wesetup.ru \
 *   DEMO_SCREENSHOT_EMAIL=... \
 *   DEMO_SCREENSHOT_PASSWORD=... \
 *   npx tsx scripts/capture-screenshots.ts
 *
 * BASE_URL defaults to http://localhost:3000 for local smoke-runs.
 * Failure to capture one route doesn't abort the rest — the bad slug is
 * just skipped and logged.
 */
import "dotenv/config";
import { chromium, type Browser, type BrowserContext } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { JOURNAL_INFO } from "../src/content/journal-info";
import { FEATURES_ORDER } from "../src/content/features";

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
const EMAIL = process.env.DEMO_SCREENSHOT_EMAIL;
const PASSWORD = process.env.DEMO_SCREENSHOT_PASSWORD;
const OUT_ROOT = path.resolve("public/screenshots");

type Viewport = { name: string; width: number; height: number };
const VIEWPORTS: Viewport[] = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

type Target = { slug: string; path: string; auth?: boolean };

function buildTargets(): Target[] {
  const journalCodes = Object.keys(JOURNAL_INFO);

  const publicTargets: Target[] = [
    { slug: "landing", path: "/" },
    { slug: "blog", path: "/blog" },
    { slug: "journals-info", path: "/journals-info" },
    ...journalCodes.map((code) => ({
      slug: `journals-info-${code}`,
      path: `/journals-info/${code}`,
    })),
    ...FEATURES_ORDER.map((slug) => ({
      slug: `features-${slug}`,
      path: `/features/${slug}`,
    })),
    { slug: "login", path: "/login" },
    { slug: "register", path: "/register" },
  ];

  const authTargets: Target[] = [
    { slug: "dashboard", path: "/dashboard", auth: true },
    { slug: "journals", path: "/journals", auth: true },
    ...journalCodes.map((code) => ({
      slug: `journals-${code}`,
      path: `/journals/${code}`,
      auth: true as const,
    })),
    { slug: "capa", path: "/capa", auth: true },
    { slug: "changes", path: "/changes", auth: true },
    { slug: "losses", path: "/losses", auth: true },
    { slug: "batches", path: "/batches", auth: true },
    { slug: "plans", path: "/plans", auth: true },
    { slug: "competencies", path: "/competencies", auth: true },
    { slug: "reports", path: "/reports", auth: true },
    { slug: "settings", path: "/settings", auth: true },
    { slug: "settings-users", path: "/settings/users", auth: true },
    { slug: "settings-areas", path: "/settings/areas", auth: true },
    { slug: "settings-equipment", path: "/settings/equipment", auth: true },
    { slug: "settings-products", path: "/settings/products", auth: true },
    { slug: "settings-notifications", path: "/settings/notifications", auth: true },
    { slug: "settings-subscription", path: "/settings/subscription", auth: true },
  ];

  return [...publicTargets, ...authTargets];
}

async function login(context: BrowserContext) {
  if (!EMAIL || !PASSWORD) {
    console.warn(
      "[capture] DEMO_SCREENSHOT_EMAIL / PASSWORD not set — protected pages will be skipped"
    );
    return false;
  }
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 15_000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  const ok = page.url().includes("/dashboard");
  await page.close();
  if (!ok) console.warn("[capture] login did not reach /dashboard, got", page.url());
  return ok;
}

async function captureOne(
  context: BrowserContext,
  target: Target,
  viewport: Viewport,
  authed: boolean
): Promise<void> {
  if (target.auth && !authed) return;

  const page = await context.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  try {
    await page.goto(`${BASE_URL}${target.path}`, {
      waitUntil: "networkidle",
      timeout: 20_000,
    });
    // Give Tailwind transitions / font load a beat so screenshots aren't
    // caught mid-fade.
    await page.waitForTimeout(600);

    const dir = path.join(OUT_ROOT, viewport.name);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${target.slug}.png`);
    await page.screenshot({ path: file, fullPage: true, type: "png" });
    process.stdout.write(`  \u2713 ${viewport.name}/${target.slug}.png\n`);
  } catch (err) {
    process.stdout.write(
      `  \u2717 ${viewport.name}/${target.slug} — ${(err as Error).message.slice(0, 80)}\n`
    );
  } finally {
    await page.close();
  }
}

async function main() {
  const targets = buildTargets();
  console.log(
    `[capture] base=${BASE_URL} · targets=${targets.length} · viewports=${VIEWPORTS.length}`
  );

  const browser: Browser = await chromium.launch();
  const context = await browser.newContext({
    locale: "ru-RU",
    deviceScaleFactor: 1.5,
    viewport: { width: 1440, height: 900 },
  });

  const authed = await login(context);
  console.log(`[capture] authed=${authed}`);

  // Flat loop: viewport outer so we don't churn the context zoom too often.
  for (const viewport of VIEWPORTS) {
    console.log(`\n== ${viewport.name} (${viewport.width}×${viewport.height}) ==`);
    for (const target of targets) {
      await captureOne(context, target, viewport, authed);
    }
  }

  await context.close();
  await browser.close();
  console.log("\n[capture] done →", OUT_ROOT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
