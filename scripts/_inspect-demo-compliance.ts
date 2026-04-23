import { db } from "@/lib/db";
import { getTemplatesFilledToday } from "@/lib/today-compliance";
import { ALL_DAILY_JOURNAL_CODES } from "@/lib/daily-journal-codes";

const ORG_ID = "demo-screenshots";

async function main() {
  const [tf, org, docs, templates] = await Promise.all([
    db.tasksFlowIntegration.findFirst({
      where: { organizationId: ORG_ID, enabled: true },
      select: { id: true, baseUrl: true, enabled: true },
    }),
    db.organization.findUnique({
      where: { id: ORG_ID },
      select: { disabledJournalCodes: true },
    }),
    db.journalDocument.findMany({
      where: { organizationId: ORG_ID, status: "active" },
      select: {
        id: true,
        title: true,
        dateFrom: true,
        dateTo: true,
        template: { select: { code: true, name: true } },
      },
    }),
    db.journalTemplate.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
    }),
  ]);

  console.log("TF integration:", tf);
  console.log(`Active JournalDocuments: ${docs.length}`);
  const todaysDocs = docs.filter((d) => {
    const today = new Date();
    return d.dateFrom <= today && d.dateTo >= today;
  });
  console.log(`Of those covering TODAY: ${todaysDocs.length}`);
  const dailyDocs = todaysDocs.filter((d) =>
    ALL_DAILY_JOURNAL_CODES.has(d.template.code)
  );
  console.log(`Daily journal docs covering today: ${dailyDocs.length}`);
  for (const d of dailyDocs) {
    console.log(
      `  - ${d.template.code} "${d.title}" ${d.dateFrom.toISOString().slice(0, 10)}..${d.dateTo.toISOString().slice(0, 10)}`
    );
  }

  const disabled = new Set<string>(
    Array.isArray(org?.disabledJournalCodes)
      ? (org.disabledJournalCodes as string[])
      : []
  );
  const filled = await getTemplatesFilledToday(
    ORG_ID,
    new Date(),
    templates.map((t) => ({ id: t.id, code: t.code })),
    disabled
  );
  console.log(`\nTemplates filled today: ${filled.size}`);

  // Compute unfilledCount exactly like dashboard does.
  const mandatory = templates.filter(
    (t) =>
      ALL_DAILY_JOURNAL_CODES.has(t.code) && !disabled.has(t.code)
  );
  const unfilled = mandatory.filter((t) => !filled.has(t.id));
  console.log(`\nUnfilled daily (what dashboard counts): ${unfilled.length}`);
  for (const t of unfilled) console.log(`  - ${t.code}  "${t.name}"`);

  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
