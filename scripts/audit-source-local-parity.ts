import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { chromium, type BrowserContext, type Page } from "playwright";
import pg from "pg";
import { SOURCE_JOURNAL_MAP, resolveJournalCodeAlias } from "@/lib/source-journal-map";

type BehaviorEntry = {
  code: string;
  route: string;
  listImpl: string;
  detailImpl: string;
  createFlow: boolean;
  openFlow: boolean;
  editFlow: boolean;
  deleteFlow: boolean;
  archiveCloseFlow: boolean;
  saveFlow: boolean;
  buttonProofStatus: string;
};

type PrintEntry = {
  code: string;
  sourceSlug: string;
  route: string;
  listPrint: string;
  detailPrint: string;
  printStatus: string;
};

type SourceJournal = {
  title: string;
  href: string;
  url: string;
  sourceSlug: string;
};

type PageCapture = {
  ok: boolean;
  url: string | null;
  title: string;
  h1: string;
  textSnippet: string;
  buttons: string[];
  tables: number;
  forms: number;
  inputs: number;
  printButtons: number;
  createButtons: number;
  detailUrl: string | null;
  skipped?: string | null;
};

type DbRisk = {
  status: "PASS" | "WARN" | "FAIL";
  notes: string[];
};

type AuditRow = {
  sourceJournal: string;
  sourceSlug: string;
  localCode: string | null;
  coverage: "PASS" | "WARN" | "FAIL";
  visual: "PASS" | "WARN" | "FAIL";
  logic: "PASS" | "WARN" | "FAIL";
  buttons: "PASS" | "WARN" | "FAIL";
  pdf: "PASS" | "WARN" | "FAIL";
  db: "PASS" | "WARN" | "FAIL";
  severity: "Critical" | "Major" | "Minor" | "DB risk" | "None";
  notes: string[];
};

type AuditSummary = {
  taskId: string;
  generatedAt: string;
  sourceStartUrl: string;
  localBaseUrl: string;
  sourceTotal: number;
  localTotal: number;
  rows: AuditRow[];
  unmappedSource: SourceJournal[];
  ignoredSourceSections: SourceJournal[];
  localWithoutSource: string[];
  duplicates: Array<{ sourceSlug: string; titles: string[] }>;
  blocked: string[];
};

const TASK_ID = "source-parity-audit-2026-04-13";
const TASK_DIR = path.resolve(`.agent/tasks/${TASK_ID}`);
const RAW_DIR = path.join(TASK_DIR, "raw");
const SOURCE_DIR = path.join(RAW_DIR, "source");
const LOCAL_DIR = path.join(RAW_DIR, "local");
const OUTPUT_JSON = path.join(TASK_DIR, "evidence.json");
const OUTPUT_MD = path.join(TASK_DIR, "evidence.md");
const PROBLEMS_MD = path.join(TASK_DIR, "problems.md");
const BEHAVIOR_MATRIX = path.resolve(".agent/tasks/journals-full-parity-2026-04-11/raw/behavior-matrix.json");
const PRINT_MATRIX = path.resolve(".agent/tasks/journals-full-parity-2026-04-11/raw/print-matrix.json");
const NON_JOURNAL_SOURCE_SLUGS = new Set(["articles", "news"]);
const OOO_LABEL_PREFIX = String.fromCodePoint(1086, 1086, 1086);
const IP_LABEL_PREFIX = String.fromCodePoint(1080, 1087);
const EMPLOYEES_LABEL = String.fromCodePoint(
  1089, 1086, 1090, 1088, 1091, 1076, 1085, 1080, 1082, 1080
);
const FEEDBACK_LABEL = String.fromCodePoint(
  1086, 1073, 1088, 1072, 1090, 1085, 1072, 1103, 32, 1089, 1074, 1103, 1079, 1100
);
const EXIT_LABEL = String.fromCodePoint(1074, 1099, 1093, 1086, 1076);
const CORPORATE_SOLUTION_LABEL = String.fromCodePoint(
  1082, 1086, 1088, 1087, 1086, 1088, 1072, 1090, 1080, 1074, 1085, 1086, 1077, 32,
  1088, 1077, 1096, 1077, 1085, 1080, 1077
);
const PRIVATE_SOLUTIONS_LABEL = String.fromCodePoint(
  1095, 1072, 1089, 1090, 1085, 1099, 1077, 32, 1088, 1072, 1079, 1088, 1072, 1073,
  1086, 1090, 1082, 1080
);

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });

function requireEnv(name: string, fallback?: string) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function sanitizeName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function isJournalHref(href: string) {
  if (!href.startsWith("/docs/")) return false;
  if (href.includes("/logout")) return false;
  if (href.includes("/settings")) return false;
  if (href.includes("/position")) return false;
  if (href === "/docs/1" || href === "/docs/1/") return false;
  return true;
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(normalized) as T;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function saveJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIgnoredJournalButtonLabel(label: string) {
  return (
    label.startsWith(OOO_LABEL_PREFIX) ||
    label.startsWith(IP_LABEL_PREFIX) ||
    label === EMPLOYEES_LABEL ||
    label === FEEDBACK_LABEL ||
    label === EXIT_LABEL ||
    label === CORPORATE_SOLUTION_LABEL ||
    label === PRIVATE_SOLUTIONS_LABEL ||
    label === "previous"
  );
}

function getComparableButtons(capture: PageCapture | null) {
  if (!capture) return [] as string[];

  return [
    ...new Set(
      capture.buttons
        .map(normalizeText)
        .filter((label) => label && !isIgnoredJournalButtonLabel(label))
    ),
  ];
}

function getMissingComparableButtons(
  sourceCapture: PageCapture | null,
  localCapture: PageCapture | null
) {
  const sourceButtons = new Set(getComparableButtons(sourceCapture));
  const localButtons = new Set(getComparableButtons(localCapture));
  return [...sourceButtons].filter((label) => label && !localButtons.has(label));
}

function severityFromStatuses(row: Pick<AuditRow, "coverage" | "visual" | "logic" | "buttons" | "pdf" | "db">): AuditRow["severity"] {
  if (row.coverage === "FAIL" || row.logic === "FAIL" || row.pdf === "FAIL") return "Critical";
  if (row.db === "FAIL") return "DB risk";
  if (row.visual === "FAIL" || row.buttons === "FAIL") return "Major";
  if (
    row.coverage === "WARN" ||
    row.visual === "WARN" ||
    row.logic === "WARN" ||
    row.buttons === "WARN" ||
    row.pdf === "WARN" ||
    row.db === "WARN"
  ) {
    return "Minor";
  }
  return "None";
}

function firstDetailUrlFromHtml(html: string, currentUrl: string) {
  const hrefMatch =
    html.match(/location\.href=['"]([^'"]*\/doc\/1\/\?id=[^'"]+)['"]/i) ||
    html.match(/["'](\/docs\/[^"']*\/doc\/1\/\?id=[^"']+)["']/i);
  if (!hrefMatch?.[1]) return null;
  return new URL(hrefMatch[1], currentUrl).toString();
}

async function loginSource(page: Page, loginUrl: string, username: string, password: string) {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  const hasPassword = await page.locator('input[type="password"]').count();
  if (!hasPassword) return;
  await page.locator('input[type="text"], input[name*="login" i], input[name*="user" i]').first().fill(username);
  await page.locator('input[type="password"], input[name*="pass" i]').first().fill(password);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
}

async function loginLocal(baseUrl: string, email: string, password: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 2200 } });
  const page = await context.newPage();
  const response = await context.request.post(new URL("/api/auth/login", baseUrl).toString(), {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`Local login failed with status ${response.status()}`);
  }
  return { browser, context, page };
}

async function discoverSourceJournals(page: Page, startUrl: string) {
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => ({
      title: (a.textContent || "").replace(/\s+/g, " ").trim(),
      href: a.getAttribute("href") || "",
      url: a.href,
    }))
  );

  return links
    .filter((item) => item.title && item.href && isJournalHref(new URL(item.url).pathname))
    .map((item) => ({
      ...item,
      sourceSlug: new URL(item.url).pathname.split("/").filter(Boolean)[1] || "",
    }))
    .filter((item) => item.sourceSlug);
}

async function capturePage(
  page: Page,
  targetUrl: string,
  outStem: string,
  mode: "source" | "local"
): Promise<PageCapture> {
  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      url: targetUrl,
      title: "",
      h1: "",
      textSnippet: message,
      buttons: [],
      tables: 0,
      forms: 0,
      inputs: 0,
      printButtons: 0,
      createButtons: 0,
      detailUrl: null,
      skipped: "navigation-error",
    };
  }

  await page.screenshot({ path: `${outStem}.png`, fullPage: true });
  const html = await page.content();
  await fs.writeFile(`${outStem}.html`, html, "utf8");

  const data = await page.evaluate(({ mode }) => {
    const labels = Array.from(
      document.querySelectorAll("button, a, input[type='button'], input[type='submit']")
    )
      .map((node) => {
        if (node instanceof HTMLInputElement) return (node.value || "").trim();
        return (node.textContent || "").replace(/\s+/g, " ").trim();
      })
      .filter(Boolean);

    const detailLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find((a) =>
      mode === "local"
        ? /\/journals\/[^/]+\/documents\/[^/]+/i.test(a.href)
        : /\/doc\/1\/\?id=/i.test(a.href)
    );

    return {
      ok: !location.href.includes("/login"),
      url: location.href,
      title: document.title,
      h1: (document.querySelector("h1")?.textContent || "").trim(),
      textSnippet: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 1000),
      buttons: labels.slice(0, 200),
      tables: document.querySelectorAll("table").length,
      forms: document.querySelectorAll("form").length,
      inputs: document.querySelectorAll("input, textarea, select").length,
      printButtons: labels.filter((label) => /печать/i.test(label)).length,
      createButtons: labels.filter((label) => /(создать|добавить|нов|заполнить|открыть журнал)/i.test(label)).length,
      detailUrl: detailLink?.href || null,
    };
  }, { mode });

  const result = {
    ...data,
    detailUrl: data.detailUrl || (mode === "source" ? firstDetailUrlFromHtml(html, data.url) : null),
  };
  await saveJson(`${outStem}.json`, result);
  return result;
}

async function createLocalDocument(context: BrowserContext, baseUrl: string, templateCode: string) {
  const today = new Date().toISOString().slice(0, 10);
  const response = await context.request.post(new URL("/api/journal-documents", baseUrl).toString(), {
    data: {
      templateCode,
      title: `Audit ${templateCode}`,
      dateFrom: today,
      dateTo: today,
    },
  });
  if (!response.ok()) {
    throw new Error(`create failed: ${response.status()}`);
  }
  const payload = (await response.json()) as { document?: { id?: string } };
  if (!payload.document?.id) {
    throw new Error("create response missing document id");
  }
  return payload.document.id;
}

async function probeLocalPdf(context: BrowserContext, baseUrl: string, docId: string) {
  const response = await context.request.get(new URL(`/api/journal-documents/${docId}/pdf`, baseUrl).toString());
  const body = await response.body();
  return {
    ok: response.ok() && (response.headers()["content-type"] || "").includes("pdf") && body.subarray(0, 4).toString("utf8") === "%PDF",
    status: response.status(),
    contentType: response.headers()["content-type"] || "",
    bytes: body.byteLength,
  };
}

function collectDbRisk(args: {
  code: string;
  templateExists: boolean;
  documents: Array<{ config: unknown; responsibleUserId: string | null }>;
  entries: Array<{ data: unknown; employeeId: string }>;
}): DbRisk {
  const notes: string[] = [];
  if (!args.templateExists) {
    return { status: "FAIL", notes: ["active JournalTemplate missing in local DB"] };
  }

  const visit = (value: unknown, callback: (record: Record<string, unknown>) => void) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, callback));
      return;
    }
    const record = value as Record<string, unknown>;
    callback(record);
    Object.values(record).forEach((child) => visit(child, callback));
  };

  let nameOnlyMatches = 0;
  for (const document of args.documents) {
    if (!document.responsibleUserId) {
      notes.push("document has null responsibleUserId");
    }
    visit(document.config, (record) => {
      const nameOnly =
        (hasText(record.responsibleEmployee) && !record.responsibleEmployeeId) ||
        (hasText(record.approveEmployee) && !record.approveEmployeeId) ||
        (hasText(record.employeeName) && !record.employeeId);
      if (nameOnly) nameOnlyMatches += 1;
    });
  }

  for (const entry of args.entries) {
    visit(entry.data, (record) => {
      const nameOnly =
        (hasText(record.responsibleEmployee) && !record.responsibleEmployeeId) ||
        (hasText(record.employeeName) && !record.employeeId);
      if (nameOnly) nameOnlyMatches += 1;
    });
  }

  if (nameOnlyMatches > 0) {
    notes.push(`name-only staff fields found: ${nameOnlyMatches}`);
  }

  if (notes.length === 0) return { status: "PASS", notes: ["no obvious DB-binding drift found"] };
  return { status: notes.some((note) => note.includes("name-only")) ? "WARN" : "WARN", notes };
}

function statusFromPair(sourceCapture: PageCapture | null, localCapture: PageCapture | null) {
  if (!sourceCapture || !localCapture) return "FAIL" as const;
  if (!sourceCapture.ok || !localCapture.ok) return "FAIL" as const;

  const missingButtons = getMissingComparableButtons(sourceCapture, localCapture);

  if (missingButtons.length > 5) return "FAIL" as const;
  if (
    missingButtons.length > 0 ||
    Math.abs(sourceCapture.tables - localCapture.tables) > 1 ||
    Math.abs(sourceCapture.inputs - localCapture.inputs) > 5
  ) {
    return "WARN" as const;
  }

  return "PASS" as const;
}

function renderEvidence(summary: AuditSummary) {
  const lines = [
    `# Evidence Bundle: ${summary.taskId}`,
    "",
    `- Generated: ${summary.generatedAt}`,
    `- Source start URL: ${summary.sourceStartUrl}`,
    `- Local base URL: ${summary.localBaseUrl}`,
    `- Source journals discovered: ${summary.sourceTotal}`,
    `- Local journals audited: ${summary.localTotal}`,
    `- Unmapped source journals: ${summary.unmappedSource.length}`,
    `- Ignored non-journal source sections: ${summary.ignoredSourceSections.length}`,
    `- Local journals without source match: ${summary.localWithoutSource.length}`,
    `- Blocked rows: ${summary.blocked.length}`,
    "",
    "## Canonical Matrix",
    "",
    "| source journal | local code | coverage | visual | logic | buttons | pdf | db | severity | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...summary.rows.map((row) =>
      `| ${row.sourceJournal} | ${row.localCode || "—"} | ${row.coverage} | ${row.visual} | ${row.logic} | ${row.buttons} | ${row.pdf} | ${row.db} | ${row.severity} | ${row.notes.join("; ") || "ok"} |`
    ),
    "",
    "## Exceptions",
    "",
    `- Unmapped source: ${summary.unmappedSource.map((item) => item.sourceSlug).join(", ") || "none"}`,
    `- Ignored non-journal source sections: ${
      summary.ignoredSourceSections.map((item) => item.sourceSlug).join(", ") || "none"
    }`,
    `- Local without source: ${summary.localWithoutSource.join(", ") || "none"}`,
    `- Duplicate source slugs: ${
      summary.duplicates.map((item) => `${item.sourceSlug} (${item.titles.join(" / ")})`).join(", ") || "none"
    }`,
    `- Blocked rows: ${summary.blocked.join(", ") || "none"}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderProblems(summary: AuditSummary) {
  const failing = summary.rows.filter((row) => row.severity !== "None");
  const lines = ["# Problems", ""];
  if (failing.length === 0) {
    lines.push("- None.");
    return `${lines.join("\n")}\n`;
  }
  for (const row of failing) {
    lines.push(`- ${row.localCode || row.sourceSlug}: [${row.severity}] ${row.notes.join("; ")}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  await ensureDir(TASK_DIR);
  await ensureDir(RAW_DIR);
  await ensureDir(SOURCE_DIR);
  await ensureDir(LOCAL_DIR);

  const sourceLoginUrl = requireEnv("SOURCE_SITE_LOGIN_URL");
  const sourceStartUrl = requireEnv("SOURCE_SITE_START_URL", "https://lk.haccp-online.ru/docs/1");
  const sourceUsername = requireEnv("SOURCE_SITE_USERNAME");
  const sourcePassword = requireEnv("SOURCE_SITE_PASSWORD");
  const localBaseUrl = requireEnv("LOCAL_BASE_URL", "http://127.0.0.1:3000");
  const localEmail = requireEnv("LOCAL_PROOF_EMAIL", "admin@haccp.local");
  const localPassword = requireEnv("LOCAL_PROOF_PASSWORD", "admin1234");
  const connectionString = requireEnv("DATABASE_URL");

  const behavior = await readJson<BehaviorEntry[]>(BEHAVIOR_MATRIX);
  const print = await readJson<PrintEntry[]>(PRINT_MATRIX);
  const printByCode = new Map(print.map((item) => [item.code, item]));
  const sourceMapBySlug = new Map(SOURCE_JOURNAL_MAP.map((item) => [item.sourceSlug, item]));

  const sourceBrowser = await chromium.launch({ headless: true });
  const sourcePage = await sourceBrowser.newPage({ viewport: { width: 1600, height: 2200 } });
  await loginSource(sourcePage, sourceLoginUrl, sourceUsername, sourcePassword);
  const discovered = await discoverSourceJournals(sourcePage, sourceStartUrl);
  await saveJson(path.join(RAW_DIR, "source-discovery.json"), discovered);
  const journalSources = discovered.filter((item) => !NON_JOURNAL_SOURCE_SLUGS.has(item.sourceSlug));
  const ignoredSourceSections = discovered.filter((item) => NON_JOURNAL_SOURCE_SLUGS.has(item.sourceSlug));

  const duplicateBuckets = new Map<string, string[]>();
  for (const item of discovered) {
    const list = duplicateBuckets.get(item.sourceSlug) || [];
    list.push(item.title);
    duplicateBuckets.set(item.sourceSlug, list);
  }
  const duplicates = [...duplicateBuckets.entries()]
    .filter(([, titles]) => titles.length > 1)
    .map(([sourceSlug, titles]) => ({ sourceSlug, titles }));

  const pool = new pg.Pool({ connectionString });
  let localBrowser: Awaited<ReturnType<typeof loginLocal>>["browser"] | null = null;
  let localContext: Awaited<ReturnType<typeof loginLocal>>["context"] | null = null;
  let localPage: Awaited<ReturnType<typeof loginLocal>>["page"] | null = null;
  let localRuntimeError: string | null = null;

  try {
    const localLogin = await loginLocal(localBaseUrl, localEmail, localPassword);
    localBrowser = localLogin.browser;
    localContext = localLogin.context;
    localPage = localLogin.page;
  } catch (error) {
    localRuntimeError = error instanceof Error ? error.message : String(error);
    await saveJson(path.join(RAW_DIR, "local-runtime-error.json"), {
      capturedAt: new Date().toISOString(),
      localBaseUrl,
      error: localRuntimeError,
    });
  }

  try {
    const localTemplatesResult = await pool.query<{
      id: string;
      code: string;
      name: string;
    }>('select "id", "code", "name" from "JournalTemplate" where "isActive" = true order by "sortOrder" asc');
    const localTemplates = localTemplatesResult.rows;
    const localCodes = localTemplates.map((item) => item.code);
    const localTemplateByCode = new Map(localTemplates.map((item) => [item.code, item]));

    const sourceCaptures = new Map<string, { list: PageCapture; detail: PageCapture | null }>();
    for (const source of journalSources) {
      const dir = path.join(SOURCE_DIR, `${sanitizeName(source.sourceSlug)}-${sanitizeName(source.title)}`);
      await ensureDir(dir);
      const list = await capturePage(sourcePage, source.url, path.join(dir, "list"), "source");
      const detail = list.detailUrl
        ? await capturePage(sourcePage, list.detailUrl, path.join(dir, "detail"), "source")
        : null;
      sourceCaptures.set(source.sourceSlug, { list, detail });
    }

    const localCaptures = new Map<string, { list: PageCapture; detail: PageCapture | null; pdf: Awaited<ReturnType<typeof probeLocalPdf>> | null }>();
    if (localPage && localContext) {
      for (const item of behavior) {
        const dir = path.join(LOCAL_DIR, sanitizeName(item.code));
        await ensureDir(dir);
        const list = await capturePage(localPage, new URL(item.route, localBaseUrl).toString(), path.join(dir, "list"), "local");
        let detail = list.detailUrl ? await capturePage(localPage, list.detailUrl, path.join(dir, "detail"), "local") : null;
        if (!detail && item.createFlow) {
          try {
            const docId = await createLocalDocument(localContext, localBaseUrl, item.code);
            detail = await capturePage(
              localPage,
              new URL(`/journals/${item.code}/documents/${docId}`, localBaseUrl).toString(),
              path.join(dir, "detail-created"),
              "local"
            );
          } catch {
            detail = null;
          }
        }
        let pdf = null;
        const docId = detail?.url?.match(/\/documents\/([^/?#]+)/)?.[1] || null;
        if (docId && printByCode.get(item.code) && printByCode.get(item.code)?.listPrint !== "none") {
          try {
            pdf = await probeLocalPdf(localContext, localBaseUrl, docId);
          } catch (error) {
            pdf = {
              ok: false,
              status: 0,
              contentType: "",
              bytes: 0,
              error: error instanceof Error ? error.message : String(error),
            };
          }
          await saveJson(path.join(dir, "pdf.json"), pdf);
        }
        localCaptures.set(item.code, { list, detail, pdf });
      }
    }

    const rows: AuditRow[] = [];
    for (const source of journalSources) {
      const mapped = sourceMapBySlug.get(source.sourceSlug);
      const localCode = mapped?.localCode ?? null;
      const localCodeResolved = localCode ? resolveJournalCodeAlias(localCode) : null;
      const sourceCapture = sourceCaptures.get(source.sourceSlug) || null;
      const localCapture = localCodeResolved ? localCaptures.get(localCodeResolved) || null : null;
      const behaviorEntry = localCodeResolved ? behavior.find((item) => item.code === localCodeResolved) || null : null;
      const template = localCodeResolved ? localTemplateByCode.get(localCodeResolved) || null : null;
      const documents = template
        ? (
            await pool.query<{ config: unknown; responsibleUserId: string | null }>(
              'select "config", "responsibleUserId" from "JournalDocument" where "templateId" = $1 limit 20',
              [template.id]
            )
          ).rows
        : [];
      const entries = template
        ? (
            await pool.query<{ data: unknown; employeeId: string }>(
              'select e."data", e."employeeId" from "JournalDocumentEntry" e join "JournalDocument" d on d."id" = e."documentId" where d."templateId" = $1 limit 50',
              [template.id]
            )
          ).rows
        : [];

      const dbRisk = collectDbRisk({
        code: localCodeResolved || source.sourceSlug,
        templateExists: Boolean(template),
        documents,
        entries,
      });

      const coverage =
        localRuntimeError
          ? localCodeResolved
            ? "WARN"
            : "FAIL"
          : localCodeResolved && localCapture && behaviorEntry
            ? "PASS"
            : localCodeResolved
              ? "WARN"
              : "FAIL";
      const visual = statusFromPair(sourceCapture?.list || null, localCapture?.list || null);
      const logic =
        localRuntimeError
          ? localCodeResolved
            ? "WARN"
            : "FAIL"
          : localCapture?.list.ok &&
              (localCapture.detail?.ok || Boolean(localCapture.list.detailUrl) || behaviorEntry?.createFlow)
            ? "PASS"
            : localCodeResolved
              ? "WARN"
              : "FAIL";
      const missingButtons = getMissingComparableButtons(
        sourceCapture?.list || null,
        localCapture?.list || null
      );
      const buttons =
        !localCodeResolved
          ? "FAIL"
          : missingButtons.length > 5
            ? "FAIL"
            : missingButtons.length > 0
              ? "WARN"
              : "PASS";
      const pdf =
        !localCodeResolved
          ? "FAIL"
          : printByCode.get(localCodeResolved)?.listPrint === "none"
            ? "PASS"
            : localCapture?.pdf?.ok
              ? "PASS"
              : localCapture?.detail
                ? "WARN"
                : "FAIL";
      const notes = [
        localCodeResolved ? `mapped to ${localCodeResolved}` : "no local code mapping",
        ...(localRuntimeError ? [`local runtime blocked: ${localRuntimeError}`] : []),
        sourceCapture?.detail ? "source detail captured" : "source detail not found",
        localCapture?.detail ? "local detail captured" : "local detail not captured",
        ...missingButtons.slice(0, 8).map((label) => `missing button: ${label}`),
        ...dbRisk.notes,
      ];
      const row: AuditRow = {
        sourceJournal: source.title,
        sourceSlug: source.sourceSlug,
        localCode: localCodeResolved,
        coverage,
        visual,
        logic,
        buttons,
        pdf,
        db: dbRisk.status,
        severity: severityFromStatuses({ coverage, visual, logic, buttons, pdf, db: dbRisk.status }),
        notes,
      };
      rows.push(row);
    }

    const unmappedSource = journalSources.filter((item) => !sourceMapBySlug.get(item.sourceSlug)?.localCode);
    const sourceCodes = new Set(rows.map((row) => row.localCode).filter((value): value is string => Boolean(value)));
    const localWithoutSource = localCodes.filter((code) => !sourceCodes.has(code));
    const blocked = rows.filter((row) => row.severity !== "None").map((row) => row.localCode || row.sourceSlug);

    const summary: AuditSummary = {
      taskId: TASK_ID,
      generatedAt: new Date().toISOString(),
      sourceStartUrl,
      localBaseUrl,
      sourceTotal: journalSources.length,
      localTotal: localCodes.length,
      rows,
      unmappedSource,
      ignoredSourceSections,
      localWithoutSource,
      duplicates,
      blocked,
    };

    await saveJson(OUTPUT_JSON, summary);
    await fs.writeFile(OUTPUT_MD, renderEvidence(summary), "utf8");
    await fs.writeFile(PROBLEMS_MD, renderProblems(summary), "utf8");
  } finally {
    await pool.end();
    await sourceBrowser.close();
    if (localContext) {
      await localContext.close();
    }
    if (localBrowser) {
      await localBrowser.close();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
