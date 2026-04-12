/**
 * Smoke-tests POST /api/external/entries for every JournalTemplate code
 * registered on the target host.
 *
 * Usage (PowerShell / bash):
 *   EXTERNAL_API_BASE=https://wesetup.ru \
 *   EXTERNAL_API_TOKEN=... \
 *   EXTERNAL_API_ORG_ID=cmnm40ikt00002ktseet6fd5y \
 *   npx tsx scripts/test-external-fill.ts
 *
 * Emits per-code evidence under .agent/tasks/journals-external-api/<code>/
 * and a summary matrix in .agent/tasks/journals-external-api/SMOKE.md.
 */
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.EXTERNAL_API_BASE?.replace(/\/$/, "") || "https://wesetup.ru";
const TOKEN = process.env.EXTERNAL_API_TOKEN || "";
const ORG_ID = process.env.EXTERNAL_API_ORG_ID || "";
const CODES_FILE =
  process.env.EXTERNAL_CODES_FILE ||
  ".agent/tasks/journals-external-api/prod-journal-codes.txt";
const OUT_DIR = ".agent/tasks/journals-external-api";

if (!TOKEN || !ORG_ID) {
  console.error(
    "Missing EXTERNAL_API_TOKEN or EXTERNAL_API_ORG_ID env. Aborting smoke run."
  );
  process.exit(2);
}

type Result = {
  code: string;
  postStatus: number;
  postOk: boolean;
  documentId?: string;
  entriesWritten?: number;
  createdDocument?: boolean;
  pdfStatus?: number;
  pdfContentType?: string;
  pdfBytes?: number;
  error?: string;
};

const today = new Date().toISOString().slice(0, 10);

function demoDataForCode(code: string) {
  switch (code) {
    case "hygiene":
      return { status: "healthy", temperatureAbove37: false };
    case "health_check":
      return { signed: true, measures: "Осмотр пройден" };
    case "climate_control":
      return { morning: { temp: 22, humidity: 55 }, evening: { temp: 23, humidity: 58 } };
    case "cold_equipment_control":
      return { readings: [{ equipmentName: "Холодильник 1", temp: 3.5 }] };
    case "cleaning":
    case "general_cleaning":
    case "sanitary_day_control":
    case "cleaning_ventilation_checklist":
    case "equipment_cleaning":
      return { done: true, note: "Выполнено по графику" };
    case "uv_lamp_runtime":
    case "uv_lamp_control":
      return { runtimeMinutes: 30, status: "ok" };
    case "fryer_oil":
      return { tpm: 18, action: "check" };
    case "finished_product":
    case "perishable_rejection":
      return { productName: "Суп куриный", quantity: 10, unit: "л", result: "pass" };
    case "incoming_control":
    case "incoming_raw_materials_control":
      return { supplier: "ООО Поставщик", product: "Курица", quantity: 5, unit: "кг", result: "pass" };
    default:
      return { note: `external-smoke ${today}`, value: 1 };
  }
}

async function postEntry(code: string): Promise<Result> {
  const payload = {
    organizationId: ORG_ID,
    journalCode: code,
    date: today,
    source: "external_smoke",
    data: demoDataForCode(code),
  };
  try {
    const res = await fetch(`${BASE}/api/external/entries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep raw */
    }
    const body = (parsed || {}) as Record<string, unknown>;
    return {
      code,
      postStatus: res.status,
      postOk: Boolean(body.ok),
      documentId: typeof body.documentId === "string" ? body.documentId : undefined,
      entriesWritten: typeof body.entriesWritten === "number" ? body.entriesWritten : undefined,
      createdDocument: typeof body.createdDocument === "boolean" ? body.createdDocument : undefined,
      error: body.ok === false ? String(body.error ?? "") : undefined,
    };
  } catch (error) {
    return {
      code,
      postStatus: 0,
      postOk: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probePdf(baseResult: Result): Promise<Result> {
  if (!baseResult.documentId) return baseResult;
  try {
    const res = await fetch(
      `${BASE}/api/journal-documents/${baseResult.documentId}/pdf`,
      { headers: { authorization: `Bearer ${TOKEN}` } }
    );
    const contentType = res.headers.get("content-type") || "";
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      ...baseResult,
      pdfStatus: res.status,
      pdfContentType: contentType,
      pdfBytes: buf.length,
    };
  } catch (error) {
    return {
      ...baseResult,
      pdfStatus: 0,
      error: (baseResult.error || "") + "; pdf: " +
        (error instanceof Error ? error.message : String(error)),
    };
  }
}

async function writeEvidence(result: Result) {
  const dir = path.join(OUT_DIR, result.code);
  await fs.mkdir(dir, { recursive: true });
  // External API acceptance: POST succeeded and document + entry upsert went through.
  // PDF endpoint is session-gated for the UI; non-200 from it is expected when hitting
  // with a bearer token and does not block external integration.
  const pdfNote = result.pdfStatus === 200
    ? "pdf-ok"
    : result.pdfStatus === 401
      ? "pdf-session-gated"
      : `pdf-${result.pdfStatus ?? "skip"}`;
  const verdict = result.postOk ? "PASS" : "FAIL";
  const md = [
    `# ${result.code} external API — ${new Date().toISOString()}`,
    `- POST status: ${result.postStatus}`,
    `- ok: ${result.postOk}`,
    `- documentId: ${result.documentId ?? "-"}`,
    `- entriesWritten: ${result.entriesWritten ?? "-"}`,
    `- createdDocument: ${result.createdDocument ?? "-"}`,
    `- PDF status: ${result.pdfStatus ?? "-"}`,
    `- PDF content-type: ${result.pdfContentType ?? "-"}`,
    `- PDF bytes: ${result.pdfBytes ?? "-"}`,
    `- error: ${result.error ?? "-"}`,
    `- AC-external: ${verdict}`,
    "",
  ].join("\n");
  await fs.writeFile(path.join(dir, "evidence.md"), md, "utf8");
  await fs.writeFile(
    path.join(dir, "evidence.json"),
    JSON.stringify({ ...result, verdict }, null, 2),
    "utf8"
  );
  return verdict;
}

async function main() {
  const raw = await fs.readFile(CODES_FILE, "utf8");
  const codes = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const summary: Array<{ code: string; verdict: string; note: string }> = [];

  for (const code of codes) {
    process.stdout.write(`[${code}] ... `);
    const base = await postEntry(code);
    const withPdf = await probePdf(base);
    const verdict = await writeEvidence(withPdf);
    const note = withPdf.error
      ? withPdf.error.slice(0, 120)
      : `post=${withPdf.postStatus} entries=${withPdf.entriesWritten ?? "-"} pdf=${withPdf.pdfStatus ?? "-"}`;
    summary.push({ code, verdict, note });
    console.log(verdict, note);
  }

  const mdLines = [
    `# External API smoke — ${new Date().toISOString()}`,
    `Base: ${BASE}`,
    `Org: ${ORG_ID}`,
    "",
    "| Code | Verdict | Note |",
    "|---|---|---|",
    ...summary.map((s) => `| ${s.code} | ${s.verdict} | ${s.note.replace(/\|/g, "/")} |`),
  ];
  await fs.writeFile(path.join(OUT_DIR, "SMOKE.md"), mdLines.join("\n"), "utf8");
  await fs.writeFile(
    path.join(OUT_DIR, "SMOKE.json"),
    JSON.stringify({ base: BASE, organizationId: ORG_ID, ranAt: new Date().toISOString(), results: summary }, null, 2),
    "utf8"
  );

  const failed = summary.filter((s) => s.verdict !== "PASS").length;
  console.log(`\nDone. PASS=${summary.length - failed} FAIL=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(3);
});
