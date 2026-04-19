import { db } from "@/lib/db";

/**
 * Returns the set of JournalTemplate IDs that have at least one record for
 * today's date (organization-scoped). Covers both storage systems:
 *
 *  - Simple `JournalEntry` rows with `createdAt >= todayStart` — legacy form
 *    journals (temp_control, ccp_monitoring, etc.).
 *  - Document-based journals where a `JournalDocumentEntry.date` row exists
 *    for today inside any active `JournalDocument` of the template
 *    (hygiene, cold_equipment_control, climate_control, cleaning, and the
 *    rest of the 2026 grid journals).
 *
 * Used by the dashboard compliance ring + by the `/journals` browser to
 * flag pending journals, and by each `/journals/[code]` page to decide
 * whether the «Не забудьте заполнить за сегодня» banner should render.
 */
export async function getTemplatesFilledToday(
  organizationId: string,
  now: Date = new Date()
): Promise<Set<string>> {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [legacyEntries, documents] = await Promise.all([
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
        entries: {
          some: {
            date: { gte: todayStart, lt: todayEnd },
          },
        },
      },
      select: { templateId: true },
      distinct: ["templateId"],
    }),
  ]);

  const filled = new Set<string>();
  for (const entry of legacyEntries) filled.add(entry.templateId);
  for (const document of documents) filled.add(document.templateId);
  return filled;
}

/**
 * Convenience check for a single template. Prefer `getTemplatesFilledToday`
 * when checking many templates at once — this one runs two extra queries.
 */
export async function isTemplateFilledToday(
  organizationId: string,
  templateId: string,
  now: Date = new Date()
): Promise<boolean> {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [legacyCount, documentEntryCount] = await Promise.all([
    db.journalEntry.count({
      where: {
        organizationId,
        templateId,
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    }),
    db.journalDocumentEntry.count({
      where: {
        date: { gte: todayStart, lt: todayEnd },
        document: { organizationId, templateId },
      },
    }),
  ]);

  return legacyCount + documentEntryCount > 0;
}
