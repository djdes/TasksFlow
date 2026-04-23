import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page, type BrowserContext } from "playwright";

const BASE = process.env.EXTERNAL_API_BASE?.replace(/\/$/, "") || "https://wesetup.ru";
const EMAIL = process.env.EXTERNAL_VERIFY_EMAIL || "admin@haccp.local";
const PASSWORD = process.env.EXTERNAL_VERIFY_PASSWORD || "admin1234";
const SOURCE_DIR = ".agent/tasks/journals-external-api-part2";
const OUT_DIR = ".agent/tasks/journals-buttons-verify";

type ManifestItem = { code: string; documentId: string };
type VisibleButton = { label: string; tag: string; disabled: boolean };
type ButtonResult = {
  label: string;
  kind: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  detail: string;
};
type CodeResult = {
  code: string;
  documentId: string;
  pageOk: boolean;
  visibleButtons: VisibleButton[];
  results: ButtonResult[];
  pageErrors: string[];
  verdict: "PASS" | "FAIL";
};

const ACTION_PATTERNS: Array<{ kind: string; regex: RegExp }> = [
  { kind: "print", regex: /^печать$/i },
  { kind: "settings", regex: /^(настройки( журнала| документа)?|настроить журналы|настроить спецификацию)$/i },
  { kind: "add", regex: /^добавить(\s.+)?$/i },
  { kind: "catalog", regex: /^редактировать список изделий$/i },
  { kind: "close", regex: /^закончить журнал$/i },
  { kind: "save", regex: /^сохранить$/i },
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classifyButton(label: string) {
  return ACTION_PATTERNS.find((item) => item.regex.test(label))?.kind ?? null;
}

async function readManifest(): Promise<ManifestItem[]> {
  const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  const items: ManifestItem[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const evidencePath = path.join(SOURCE_DIR, entry.name, "evidence.json");
    try {
      const raw = JSON.parse(await fs.readFile(evidencePath, "utf8")) as {
        code?: string;
        documentId?: string;
        verdict?: string;
      };
      if (raw.code && raw.documentId && raw.verdict === "PASS") {
        items.push({ code: raw.code, documentId: raw.documentId });
      }
    } catch {
      // ignore
    }
  }
  return items.sort((a, b) => a.code.localeCompare(b.code));
}

async function login() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 2200 } });
  const page = await context.newPage();
  const response = await context.request.post(new URL("/api/auth/login", BASE).toString(), {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`login failed: ${response.status()}`);
  }
  return { browser, context, page };
}

async function collectVisibleButtons(page: Page): Promise<VisibleButton[]> {
  return page.evaluate(() => {
    const root = document.querySelector("main") || document.body;
    const nodes = Array.from(
      root.querySelectorAll<HTMLButtonElement | HTMLAnchorElement | HTMLInputElement>(
        "button, a[role='button'], input[type='button'], input[type='submit']"
      )
    );

    const items = nodes
      .map((node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const visible =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0;
        const label =
          node instanceof HTMLInputElement
            ? (node.value || "").trim()
            : (node.textContent || "").replace(/\s+/g, " ").trim();
        const disabled =
          node instanceof HTMLButtonElement || node instanceof HTMLInputElement
            ? node.disabled
            : node.getAttribute("aria-disabled") === "true";
        return visible && label
          ? {
              label,
              tag: node.tagName,
              disabled,
            }
          : null;
      })
      .filter((item): item is VisibleButton => item !== null);

    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.tag}:${item.label}:${item.disabled}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}

async function dismissOverlay(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  const openDialogs = page.locator("[role='dialog']");
  if ((await openDialogs.count()) > 0) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(250);
  }
}

async function clickLabeledControl(page: Page, label: string) {
  const exact = new RegExp(`^${escapeRegex(label)}$`, "i");
  const button = page.getByRole("button", { name: exact }).first();
  if (await button.count()) {
    await button.click();
    return;
  }
  const link = page.getByRole("link", { name: exact }).first();
  if (await link.count()) {
    await link.click();
    return;
  }
  const fallback = page.locator("button, a[role='button'], input[type='button'], input[type='submit']").filter({
    hasText: exact,
  }).first();
  await fallback.click();
}

async function verifyPrint(context: BrowserContext, documentId: string) {
  const response = await context.request.get(`${BASE}/api/journal-documents/${documentId}/pdf`);
  const body = await response.body();
  const contentType = response.headers()["content-type"] || "";
  return {
    ok: response.ok() && contentType.includes("pdf") && body.subarray(0, 4).toString("utf8") === "%PDF",
    status: response.status(),
    contentType,
    bytes: body.byteLength,
  };
}

async function exerciseButton(page: Page, context: BrowserContext, documentId: string, button: VisibleButton): Promise<ButtonResult> {
  const kind = classifyButton(button.label);
  if (!kind) {
    return { label: button.label, kind: "unknown", status: "SKIPPED", detail: "unclassified" };
  }
  if (button.disabled) {
    return { label: button.label, kind, status: "SKIPPED", detail: "disabled" };
  }

  if (kind === "print") {
    const pdf = await verifyPrint(context, documentId);
    return {
      label: button.label,
      kind,
      status: pdf.ok ? "PASS" : "FAIL",
      detail: `status=${pdf.status}, contentType=${pdf.contentType}, bytes=${pdf.bytes}`,
    };
  }

  const beforeUrl = page.url();
  const dialogsBefore = await page.locator("[role='dialog']").count();
  const menusBefore = await page.locator("[role='menu']").count();

  try {
    await clickLabeledControl(page, button.label);
    await page.waitForTimeout(400);
  } catch (error) {
    return {
      label: button.label,
      kind,
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const dialogsAfter = await page.locator("[role='dialog']").count();
  const menusAfter = await page.locator("[role='menu']").count();
  const afterUrl = page.url();
  const pageLooksOk = !afterUrl.includes("/login") && !/404/i.test(await page.title());

  if (kind === "save") {
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    return {
      label: button.label,
      kind,
      status: pageLooksOk ? "PASS" : "FAIL",
      detail: pageLooksOk ? "clicked without navigation breakage" : `unexpected url=${afterUrl}`,
    };
  }

  const openedDialog = dialogsAfter > dialogsBefore;
  const openedMenu = menusAfter > menusBefore;
  await dismissOverlay(page);

  return {
    label: button.label,
    kind,
    status: pageLooksOk && (openedDialog || openedMenu || afterUrl === beforeUrl) ? "PASS" : "FAIL",
    detail: openedDialog
      ? "dialog opened and dismissed"
      : openedMenu
        ? "menu opened and dismissed"
        : pageLooksOk
          ? "clicked without breakage"
          : `unexpected url=${afterUrl}`,
  };
}

async function main() {
  const manifest = await readManifest();
  await fs.mkdir(path.join(OUT_DIR, "raw"), { recursive: true });
  const { browser, context, page } = await login();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  const results: CodeResult[] = [];

  try {
    for (const item of manifest) {
      const detailUrl = `${BASE}/journals/${item.code}/documents/${item.documentId}`;
      await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await page.screenshot({ path: path.join(OUT_DIR, "raw", `${item.code}.png`), fullPage: true });

      const visibleButtons = await collectVisibleButtons(page);
      const buttonResults: ButtonResult[] = [];
      for (const button of visibleButtons) {
        if (!classifyButton(button.label)) continue;
        buttonResults.push(await exerciseButton(page, context, item.documentId, button));
      }

      const codePageErrors = [...pageErrors];
      pageErrors.length = 0;
      const pageOk = !page.url().includes("/login") && !/404/i.test(await page.title());
      const verdict =
        pageOk && buttonResults.every((result) => result.status !== "FAIL") && codePageErrors.length === 0
          ? "PASS"
          : "FAIL";

      results.push({
        code: item.code,
        documentId: item.documentId,
        pageOk,
        visibleButtons,
        results: buttonResults,
        pageErrors: codePageErrors,
        verdict,
      });
      console.log(`[${item.code}] ${verdict}`);
    }
  } finally {
    await browser.close();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    pass: results.filter((item) => item.verdict === "PASS").length,
    fail: results.filter((item) => item.verdict === "FAIL").length,
    results,
  };

  await fs.writeFile(path.join(OUT_DIR, "evidence.json"), JSON.stringify(summary, null, 2), "utf8");

  const lines = [
    `# Journal Buttons Verification - ${summary.generatedAt}`,
    `- Total journals: ${summary.total}`,
    `- PASS: ${summary.pass}`,
    `- FAIL: ${summary.fail}`,
    "",
    "| Code | Page | Buttons | Verdict |",
    "|---|---|---|---|",
    ...results.map((item) => {
      const buttons = item.results
        .map((result) => `${result.label}:${result.status}`)
        .join("; ");
      return `| ${item.code} | ${item.pageOk ? "PASS" : "FAIL"} | ${buttons || "no classified buttons"} | ${item.verdict} |`;
    }),
  ];
  await fs.writeFile(path.join(OUT_DIR, "evidence.md"), `${lines.join("\n")}\n`, "utf8");

  const failed = results.filter((item) => item.verdict === "FAIL");
  if (failed.length > 0) {
    const problems = [
      "# Problems",
      "",
      ...failed.map((item) => {
        const failedButtons = item.results
          .filter((result) => result.status === "FAIL")
          .map((result) => `${result.label} (${result.detail})`)
          .join(", ");
        const pageErrorsText = item.pageErrors.length > 0 ? ` pageErrors=${item.pageErrors.join(" | ")}` : "";
        return `- ${item.code}: ${failedButtons || "page failure"}${pageErrorsText}`;
      }),
    ];
    await fs.writeFile(path.join(OUT_DIR, "problems.md"), `${problems.join("\n")}\n`, "utf8");
  } else {
    await fs.writeFile(path.join(OUT_DIR, "problems.md"), "# Problems\n\n- None.\n", "utf8");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
