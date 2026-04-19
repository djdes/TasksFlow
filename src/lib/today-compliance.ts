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

async function rollupDocumentForDay(
  documentId: string,
  todayStart: Date,
  todayEnd: Date
): Promise<DocumentRollup> {
  const lookbackStart = new Date(todayStart);
  lookbackStart.setDate(lookbackStart.getDate() - 30);

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

  let priorMax = 0;
  for (const [dayKey, count] of byDay.entries()) {
    if (dayKey === todayKey) continue;
    if (count > priorMax) priorMax = count;
  }

  // No history → one entry is enough (first day of a brand-new document).
  if (priorMax === 0) {
    return { todayCount, expectedCount: 0, filled: todayCount > 0 };
  }

  return {
    todayCount,
    expectedCount: priorMax,
    filled: todayCount >= priorMax,
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
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

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
  const documentsByTemplate = new Map<string, string[]>();
  for (const doc of dailyDocs) {
    const list = documentsByTemplate.get(doc.templateId) ?? [];
    list.push(doc.id);
    documentsByTemplate.set(doc.templateId, list);
  }

  await Promise.all(
    [...documentsByTemplate.entries()].map(async ([templateId, docIds]) => {
      const checks = await Promise.all(
        docIds.map((id) => isDocumentFilledForDay(id, todayStart, todayEnd))
      );
      if (checks.length > 0 && checks.every((ok) => ok)) {
        filled.add(templateId);
      }
    })
  );

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
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // Aperiodic journals are treated as filled — no daily obligation.
  if (templateCode && !DAILY_JOURNAL_CODES.has(templateCode)) {
    return { filled: true, aperiodic: true, todayCount: 0, expectedCount: 0 };
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
    };
  }
  if (activeDocuments.length === 0) {
    return { filled: false, aperiodic: false, todayCount: 0, expectedCount: 0 };
  }

  const rollups = await Promise.all(
    activeDocuments.map((doc) =>
      rollupDocumentForDay(doc.id, todayStart, todayEnd)
    )
  );

  const todayCount = rollups.reduce((sum, r) => sum + r.todayCount, 0);
  const expectedCount = rollups.reduce((sum, r) => sum + r.expectedCount, 0);
  const filled = rollups.every((r) => r.filled);

  return { filled, aperiodic: false, todayCount, expectedCount };
}

// Kept for future consumers (e.g. analytics) — intentionally unused now.
export type { DayRollup };
