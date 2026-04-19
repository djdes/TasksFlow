import { db } from "@/lib/db";
import { DAILY_JOURNAL_CODES } from "@/lib/daily-journal-codes";

export { DAILY_JOURNAL_CODES };

/**
 * "Filled today" check for a journal template. Not every mandatory
 * journal has daily obligations — some are aperiodic (accidents,
 * complaints, breakdowns happen only when they happen) or event-driven
 * (incoming raw material inspection, intensive cooling, metal-impurity
 * checks, audits, staff training, equipment calibration…). Flagging
 * those as «не заполнено сегодня» every day would be wrong.
 *
 * So we classify templates by cadence:
 *
 *   - DAILY_JOURNAL_CODES — have to be filled every working day
 *     (hygiene, health_check, temperatures, cleaning, fryer, etc.)
 *   - everything else — aperiodic, counts as «always filled» from
 *     the compliance-ring perspective.
 *
 * For daily journals we compare today's rows against the document's
 * natural roster size (max rows observed on any single day within the
 * 30-day lookback window):
 *
 *   todayCount   = # of `JournalDocumentEntry` rows with `date = today`
 *   expectedCount = max # of rows seen on any single prior day within
 *                   the last 30 days (hygiene → # of employees,
 *                   cold-equipment → # of fridges, cleaning → # of
 *                   procedures, etc.)
 *   documentFilled = expectedCount === 0
 *                      ? todayCount > 0       // brand-new doc, any row counts
 *                      : todayCount >= expectedCount
 *
 * The template is considered filled today iff there's at least one
 * active document that covers today AND every such document is filled.
 *
 * Legacy `JournalEntry` journals (form-based, no per-day grid concept)
 * stay on the simpler "at least one entry today" rule.
 */


type DayRollup = {
  date: Date;
  count: number;
};

type DocumentRollup = {
  todayCount: number;
  expectedCount: number;
  filled: boolean;
};

/**
 * UTC-midnight of `now`'s calendar date. Entries are stored with their
 * `date` field at UTC-midnight (see /api/journal-documents/[id]/entries
 * — `new Date("YYYY-MM-DD")` parses as UTC midnight). We must compare
 * against UTC-today, otherwise a server that runs in a non-UTC
 * timezone produces a date-key off by one day.
 */
function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

async function rollupDocumentForDay(
  documentId: string,
  todayStart: Date,
  todayEnd: Date
): Promise<DocumentRollup> {
  const lookbackStart = new Date(todayStart);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 30);

  const entries = await db.journalDocumentEntry.findMany({
    where: {
      documentId,
      date: { gte: lookbackStart, lt: todayEnd },
    },
    select: { date: true },
  });

  const byDay = new Map<string, number>();
  for (const entry of entries) {
    const dayKey = entry.date.toISOString().slice(0, 10);
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
  }

  const todayKey = todayStart.toISOString().slice(0, 10);
  const todayCount = byDay.get(todayKey) ?? 0;

  // Use the most-recent prior day with any entries as the "expected"
  // roster size. This reflects the current roster (e.g. if an employee
  // was removed yesterday, expected drops right away) while skipping
  // weekend gaps and empty days. Max-over-30-days was too rigid — one
  // unusually-large prior day would keep today "not filled" forever.
  const priorDayKeys = [...byDay.keys()]
    .filter((dayKey) => dayKey !== todayKey)
    .sort();
  let expectedCount = 0;
  for (let i = priorDayKeys.length - 1; i >= 0; i--) {
    const count = byDay.get(priorDayKeys[i]) ?? 0;
    if (count > 0) {
      expectedCount = count;
      break;
    }
  }

  // No history → one entry is enough (first day of a brand-new document).
  if (expectedCount === 0) {
    return { todayCount, expectedCount: 0, filled: todayCount > 0 };
  }

  return {
    todayCount,
    expectedCount,
    filled: todayCount >= expectedCount,
  };
}

async function isDocumentFilledForDay(
  documentId: string,
  todayStart: Date,
  todayEnd: Date
): Promise<boolean> {
  const rollup = await rollupDocumentForDay(documentId, todayStart, todayEnd);
  return rollup.filled;
}

/**
 * Returns the set of JournalTemplate IDs considered "filled today"
 * (organization-scoped). See module-level docstring for the rules.
 * Aperiodic journals (not in `DAILY_JOURNAL_CODES`) are always
 * treated as filled and returned whenever the caller provides their
 * template codes via `allTemplates`.
 */
export async function getTemplatesFilledToday(
  organizationId: string,
  now: Date = new Date(),
  allTemplates?: Array<{ id: string; code: string }>
): Promise<Set<string>> {
  const todayStart = utcDayStart(now);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const lookbackStart = new Date(todayStart);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 30);

  const [legacyEntries, activeDocuments] = await Promise.all([
    db.journalEntry.findMany({
      where: {
        organizationId,
        createdAt: { gte: todayStart, lt: todayEnd },
      },
      select: { templateId: true },
      distinct: ["templateId"],
    }),
    db.journalDocument.findMany({
      where: {
        organizationId,
        status: "active",
        dateFrom: { lte: todayStart },
        dateTo: { gte: todayStart },
      },
      select: { id: true, templateId: true, template: { select: { code: true } } },
    }),
  ]);

  const filled = new Set<string>();
  for (const entry of legacyEntries) filled.add(entry.templateId);

  // Aperiodic journals are always considered filled — there's nothing
  // to do today unless an event (accident, complaint…) happens.
  if (allTemplates) {
    for (const tpl of allTemplates) {
      if (!DAILY_JOURNAL_CODES.has(tpl.code)) filled.add(tpl.id);
    }
  }

  const dailyDocs = activeDocuments.filter((doc) =>
    DAILY_JOURNAL_CODES.has(doc.template.code)
  );
  if (dailyDocs.length === 0) return filled;

  // Single grouped query instead of N per-document queries. Pulls all
  // 30-day rollup counts at once so the dashboard stays snappy even
  // with many daily documents.
  const dailyDocIds = dailyDocs.map((d) => d.id);
  const rollupRows = await db.journalDocumentEntry.groupBy({
    by: ["documentId", "date"],
    where: {
      documentId: { in: dailyDocIds },
      date: { gte: lookbackStart, lt: todayEnd },
    },
    _count: { _all: true },
  });

  // Group by documentId → Map<dayKey, count>
  const byDocument = new Map<string, Map<string, number>>();
  for (const row of rollupRows) {
    const dayKey = row.date.toISOString().slice(0, 10);
    let docMap = byDocument.get(row.documentId);
    if (!docMap) {
      docMap = new Map();
      byDocument.set(row.documentId, docMap);
    }
    docMap.set(dayKey, row._count._all);
  }

  const todayKey = todayStart.toISOString().slice(0, 10);

  function documentFilled(documentId: string): boolean {
    const byDay = byDocument.get(documentId) ?? new Map();
    const todayCount = byDay.get(todayKey) ?? 0;
    if (todayCount === 0) return false;

    const priorDayKeys = [...byDay.keys()]
      .filter((k) => k !== todayKey)
      .sort();
    for (let i = priorDayKeys.length - 1; i >= 0; i--) {
      const count = byDay.get(priorDayKeys[i]) ?? 0;
      if (count > 0) return todayCount >= count;
    }
    return true; // no history → any entry counts
  }

  const documentsByTemplate = new Map<string, string[]>();
  for (const doc of dailyDocs) {
    const list = documentsByTemplate.get(doc.templateId) ?? [];
    list.push(doc.id);
    documentsByTemplate.set(doc.templateId, list);
  }

  for (const [templateId, docIds] of documentsByTemplate.entries()) {
    if (docIds.length > 0 && docIds.every(documentFilled)) {
      filled.add(templateId);
    }
  }

  return filled;
}

/**
 * Single-template check. Same semantics as `getTemplatesFilledToday`.
 * Returns `true` for aperiodic templates (identified by `templateCode`)
 * without hitting the database beyond the legacy-entry lookup.
 */
export async function isTemplateFilledToday(
  organizationId: string,
  templateId: string,
  templateCode: string | null = null,
  now: Date = new Date()
): Promise<boolean> {
  const summary = await getTemplateTodaySummary(
    organizationId,
    templateId,
    templateCode,
    now
  );
  return summary.filled;
}

export type TemplateTodaySummary = {
  filled: boolean;
  /** True when the template has no daily obligation. UI may want to hide
   * progress bars in that case. */
  aperiodic: boolean;
  /** Sum of `JournalDocumentEntry` rows across all active documents for
   * today (across the template). 0 when only legacy entries exist. */
  todayCount: number;
  /** Sum of expected rows across all active documents for today. 0 when
   * the template has no documents (or all are brand-new without history). */
  expectedCount: number;
  /** True when there isn't a single active `JournalDocument` covering
   * today — the user has nothing to fill into and needs to create one. */
  noActiveDocument: boolean;
};

/**
 * Detailed per-template summary for today. Powers the per-journal banner
 * — the banner uses `todayCount`/`expectedCount` to render «X из Y
 * строк за сегодня заполнено».
 */
export async function getTemplateTodaySummary(
  organizationId: string,
  templateId: string,
  templateCode: string | null = null,
  now: Date = new Date()
): Promise<TemplateTodaySummary> {
  const todayStart = utcDayStart(now);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  // Aperiodic journals are treated as filled — no daily obligation.
  if (templateCode && !DAILY_JOURNAL_CODES.has(templateCode)) {
    return {
      filled: true,
      aperiodic: true,
      todayCount: 0,
      expectedCount: 0,
      noActiveDocument: false,
    };
  }

  const [legacyCount, activeDocuments] = await Promise.all([
    db.journalEntry.count({
      where: {
        organizationId,
        templateId,
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    }),
    db.journalDocument.findMany({
      where: {
        organizationId,
        templateId,
        status: "active",
        dateFrom: { lte: todayStart },
        dateTo: { gte: todayStart },
      },
      select: { id: true },
    }),
  ]);

  if (legacyCount > 0) {
    return {
      filled: true,
      aperiodic: false,
      todayCount: legacyCount,
      expectedCount: legacyCount,
      noActiveDocument: false,
    };
  }
  if (activeDocuments.length === 0) {
    return {
      filled: false,
      aperiodic: false,
      todayCount: 0,
      expectedCount: 0,
      noActiveDocument: true,
    };
  }

  const rollups = await Promise.all(
    activeDocuments.map((doc) =>
      rollupDocumentForDay(doc.id, todayStart, todayEnd)
    )
  );

  const todayCount = rollups.reduce((sum, r) => sum + r.todayCount, 0);
  const expectedCount = rollups.reduce((sum, r) => sum + r.expectedCount, 0);
  const filled = rollups.every((r) => r.filled);

  return {
    filled,
    aperiodic: false,
    todayCount,
    expectedCount,
    noActiveDocument: false,
  };
}

// Kept for future consumers (e.g. analytics) — intentionally unused now.
export type { DayRollup };
