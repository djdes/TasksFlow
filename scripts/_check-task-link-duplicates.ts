import { db } from "@/lib/db";

async function main() {
  const links = await db.tasksFlowTaskLink.findMany({
    select: {
      id: true,
      integrationId: true,
      tasksflowTaskId: true,
      journalCode: true,
      rowKey: true,
      journalDocumentId: true,
    },
  });
  const byTfId = new Map<number, typeof links>();
  for (const l of links) {
    const arr = byTfId.get(l.tasksflowTaskId) ?? [];
    arr.push(l);
    byTfId.set(l.tasksflowTaskId, arr);
  }
  const dupes = Array.from(byTfId.entries()).filter(([, a]) => a.length > 1);
  console.log(`Total links: ${links.length}`);
  console.log(`Duplicate tasksflowTaskId values: ${dupes.length}`);
  for (const [tfId, arr] of dupes) {
    console.log(`  tf#${tfId}:`);
    for (const l of arr) {
      const doc = await db.journalDocument.findUnique({
        where: { id: l.journalDocumentId },
        select: { title: true, organizationId: true },
      });
      console.log(
        `    - integrationId=${l.integrationId}  journalCode=${l.journalCode}  rowKey=${l.rowKey}  doc="${doc?.title}"  org=${doc?.organizationId}`
      );
    }
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
