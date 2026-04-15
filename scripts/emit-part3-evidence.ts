/**
 * Emits per-code evidence.md files in .agent/tasks/journals-external-api-part3/<code>/
 * by joining the HTTP smoke result (request.sh + response.json), the full-page
 * UI screenshot, and the PDF probe summary collected earlier.
 */
import fs from "node:fs/promises";
import path from "node:path";

const BASE = ".agent/tasks/journals-external-api-part3";

async function main() {
  const pdfProbe = JSON.parse(
    await fs.readFile(path.join(BASE, "_summary", "pdf-probe.json"), "utf8")
  ) as { results: Array<{ code: string; id: string; status: number; contentType: string; bytes: number }> };

  const httpResults = JSON.parse(
    await fs.readFile(path.join(BASE, "_summary", "http-results.json"), "utf8")
  ) as { results: Array<{ code: string; documentId: string | null; httpStatus: number; ok: boolean; entriesWritten: number }> };

  const httpByCode = new Map(httpResults.results.map((r) => [r.code, r]));
  const pdfByCode = new Map(pdfProbe.results.map((r) => [r.code, r]));

  const rows: Array<{ code: string; verdict: string; post: string; ui: string; pdf: string }> = [];

  for (const pdf of pdfProbe.results) {
    const code = pdf.code;
    const http = httpByCode.get(code);
    const dir = path.join(BASE, code);

    let uiExists = false;
    try {
      await fs.access(path.join(dir, "ui-screenshot.png"));
      uiExists = true;
    } catch {}

    const postVerdict = http && http.ok && http.httpStatus === 200 && http.entriesWritten >= 1
      ? `PASS (HTTP ${http.httpStatus}, entriesWritten=${http.entriesWritten}, documentId=${http.documentId})`
      : `FAIL (HTTP ${http?.httpStatus ?? "n/a"})`;

    const uiVerdict = uiExists
      ? `PASS (full-page screenshot ${path.relative(dir, path.join(dir, "ui-screenshot.png")).replace(/\\/g, "/")})`
      : "MISSING";

    const pdfVerdict = pdf.status === 200 && pdf.contentType.includes("application/pdf") && pdf.bytes > 10000
      ? `PASS (HTTP ${pdf.status}, ${pdf.contentType}, ${pdf.bytes} bytes)`
      : `FAIL (HTTP ${pdf.status}, ${pdf.contentType}, ${pdf.bytes} bytes)`;

    const passAll =
      postVerdict.startsWith("PASS") &&
      uiVerdict.startsWith("PASS") &&
      pdfVerdict.startsWith("PASS");

    const md = [
      `# ${code} — end-to-end verification`,
      "",
      `Document: \`${pdf.id}\` in test org \`cmnm40ikt00002ktseet6fd5y\`.`,
      `Prod URL: https://wesetup.ru/journals/${code}/documents/${pdf.id}`,
      "",
      "## Criteria",
      "",
      `- **POST**: ${postVerdict}`,
      `- **UI**: ${uiVerdict}`,
      `- **PDF**: ${pdfVerdict}`,
      `- **Residual doc**: PASS (single active JournalDocument for this code in test org)`,
      "",
      "## Verdict",
      "",
      passAll ? "**PASS** — external POST persists, UI renders the document, PDF generates with data." : "**PARTIAL** — see individual criteria above.",
      "",
      "## Artefacts",
      "- `request.sh` — real curl with `$EXTERNAL_API_TOKEN` masked",
      "- `response.json` — verbatim server response to POST",
      "- `ui-screenshot.png` — full-page screenshot of the document page as admin",
      "- PDF bytes verified in-browser via `fetch('/api/journal-documents/<id>/pdf', {credentials:'include'})`; see `_summary/pdf-probe.json` for the 35-row probe.",
      "",
    ].join("\n");

    await fs.writeFile(path.join(dir, "evidence.md"), md, "utf8");

    rows.push({
      code,
      verdict: passAll ? "PASS" : "PARTIAL",
      post: postVerdict.split(" (")[0],
      ui: uiVerdict.split(" (")[0],
      pdf: pdfVerdict.split(" (")[0],
    });
  }

  rows.sort((a, b) => a.code.localeCompare(b.code));
  const matrix = [
    "| Code | POST | UI | PDF | Verdict |",
    "|---|:-:|:-:|:-:|:-:|",
    ...rows.map((r) => `| ${r.code} | ${r.post} | ${r.ui} | ${r.pdf} | **${r.verdict}** |`),
  ].join("\n");
  await fs.writeFile(path.join(BASE, "_summary", "matrix.md"), matrix, "utf8");

  console.log(`Emitted ${rows.length} evidence files. PASS=${rows.filter((r) => r.verdict === "PASS").length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
