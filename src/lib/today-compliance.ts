import { db } from "@/lib/db";

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

/**
 * Templates that legitimately expect a row for today every working
 * day. Everything else is aperiodic and shouldn't contribute red
 * pills to the dashboard. Keep this list in sync with the product
 * definition — when a journal's cadence changes, update here.
 */
export const DAILY_JOURNAL_CODES = new Set<string>([
  "hygiene",
  "health_check",
  "climate_control",
  "cold_equipment_control",
  "cleaning",
  "general_cleaning",
  "cleaning_ventilation_checklist",
  "uv_lamp_runtime",
  "fryer_oil",
  "finished_product",
  "perishable_rejection",
]);

type DayRollup = {
  date: Date;
  count: number;
};

async function isDocumentFilledForDay(
  documentId: string,
  todayStart: Date,
  todayEnd: Date
): Promise<boolean> {
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
  if (todayCount === 0) return false;

  let priorMax = 0;
  for (const [dayKey, count] of byDay.entries()) {
    if (dayKey === todayKey) continue;
    if (count > priorMax) priorMax = count;
  }

  // No history → one entry is enough (first day of a brand-new document).
  if (priorMax === 0) return true;

  return todayCount >= priorMax;
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
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // Aperiodic journals are treated as filled — no daily obligation.
  if (templateCode && !DAILY_JOURNAL_CODES.has(templateCode)) return true;

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

  if (legacyCount > 0) return true;
  if (activeDocuments.length === 0) return false;

  const checks = await Promise.all(
    activeDocuments.map((doc) =>
      isDocumentFilledForDay(doc.id, todayStart, todayEnd)
    )
  );
  return checks.every((ok) => ok);
}

// Kept for future consumers (e.g. analytics) — intentionally unused now.
export type { DayRollup };
