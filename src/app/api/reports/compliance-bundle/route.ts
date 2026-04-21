import JSZip from "jszip";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveOrgId } from "@/lib/auth-helpers";
import { hasFullWorkspaceAccess } from "@/lib/role-access";
import { generateJournalDocumentPdf } from "@/lib/document-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * «Сводный отчёт за проверкой Роспотребнадзора» — single-click archive
 * of every journal document overlapping a date range. Inspector asks
 * «покажите всё за март» → manager taps once → gets a ZIP with every
 * journal's PDF + a manifest listing what's inside.
 *
 *   GET /api/reports/compliance-bundle?from=YYYY-MM-DD&to=YYYY-MM-DD
 *     (dates optional — defaults to the current calendar month)
 *
 * Auth: session + management role (owner/manager/head_chef/root).
 *
 * Output: `application/zip` stream with
 *   - `ОТЧЁТ.txt`        — human-readable manifest
 *   - `<журнал>/<doc>.pdf` — one PDF per active/closed document that
 *     overlaps the range. Grouped by template name.
 *
 * Failures on individual documents are logged into the manifest instead
 * of failing the whole ZIP — an inspector would rather get 28 of 30
 * journals now than none after we retry one.
 */

function parseYmd(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function firstOfCurrentMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function lastOfCurrentMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
}

function sanitizeForZip(name: string): string {
  // Remove characters that break on Windows/ZIP + collapse whitespace.
  return name
    .replace(/[\/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response(JSON.stringify({ error: "Не авторизован" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (
    !hasFullWorkspaceAccess({
      role: session.user.role,
      isRoot: session.user.isRoot,
    })
  ) {
    return new Response(JSON.stringify({ error: "Недостаточно прав" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const organizationId = getActiveOrgId(session);
  const url = new URL(request.url);
  const now = new Date();
  const from =
    parseYmd(url.searchParams.get("from")) ?? firstOfCurrentMonthUtc(now);
  const to = parseYmd(url.searchParams.get("to")) ?? lastOfCurrentMonthUtc(now);

  if (from > to) {
    return new Response(
      JSON.stringify({ error: "Неверный диапазон: from > to" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  // Guard against insane ranges — >400 days is either a date-picker bug
  // or an attempt to chew the whole archive into one ZIP.
  const days = Math.round((to.getTime() - from.getTime()) / 86400000);
  if (days > 400) {
    return new Response(
      JSON.stringify({
        error: "Слишком длинный диапазон. Выбирайте не больше 400 дней.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Find every document overlapping [from, to]. Include both active and
  // closed — an inspector cares about what was in the journal during the
  // period, not whether the doc is currently being written to.
  const toEndOfDay = new Date(to);
  toEndOfDay.setUTCHours(23, 59, 59, 999);

  const documents = await db.journalDocument.findMany({
    where: {
      organizationId,
      // Overlap: dateFrom <= to AND dateTo >= from
      dateFrom: { lte: toEndOfDay },
      dateTo: { gte: from },
    },
    include: {
      template: { select: { code: true, name: true } },
    },
    orderBy: [
      { template: { sortOrder: "asc" } },
      { dateFrom: "asc" },
    ],
  });

  const [organization] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
  ]);

  const zip = new JSZip();
  const manifestLines: string[] = [];
  manifestLines.push(`СВОДНЫЙ ОТЧЁТ ПО ЖУРНАЛАМ`);
  manifestLines.push(`Организация: ${organization?.name ?? "—"}`);
  manifestLines.push(`Период: ${ymd(from)} — ${ymd(to)}`);
  manifestLines.push(`Собран: ${now.toLocaleString("ru-RU")}`);
  manifestLines.push(``);
  manifestLines.push(`=== Содержание ===`);

  const totals = { included: 0, failed: 0 };
  // Generate PDFs sequentially — parallelising N heavy PDF generations
  // would spike memory on a small VPS. One by one is slower but safer.
  for (const doc of documents) {
    const templateFolder = sanitizeForZip(doc.template.name || doc.template.code);
    const fileLabel = sanitizeForZip(
      `${doc.title} · ${ymd(doc.dateFrom)}..${ymd(doc.dateTo)}`
    );
    try {
      const { buffer } = await generateJournalDocumentPdf({
        documentId: doc.id,
        organizationId,
      });
      zip.file(`${templateFolder}/${fileLabel}.pdf`, buffer);
      totals.included += 1;
      manifestLines.push(
        `✓ ${templateFolder} / ${fileLabel}.pdf (${doc.status === "closed" ? "закрыт" : "активен"})`
      );
    } catch (err) {
      totals.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      manifestLines.push(
        `✗ ${templateFolder} / ${fileLabel} — ошибка: ${message}`
      );
      console.error(
        `[compliance-bundle] PDF failed for ${doc.id}`,
        err
      );
    }
  }

  manifestLines.push(``);
  manifestLines.push(
    `Итого: включено ${totals.included}, ошибок ${totals.failed}, всего документов ${documents.length}.`
  );
  zip.file(`ОТЧЁТ.txt`, manifestLines.join("\r\n"));

  const archive = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const uint8 = new Uint8Array(archive);
  const archiveName = `compliance-${ymd(from)}__${ymd(to)}.zip`;

  return new Response(uint8, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${archiveName}"`,
      "Content-Length": String(uint8.length),
      "X-Compliance-Included": String(totals.included),
      "X-Compliance-Failed": String(totals.failed),
    },
  });
}
