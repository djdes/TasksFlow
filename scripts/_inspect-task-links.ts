import { db } from "@/lib/db";

const ORG_ID_HOME = "cmmbrt40y0000rotsr41p4xh6";
const ORG_ID_DEMO = "demo-screenshots";

async function main() {
  for (const orgId of [ORG_ID_HOME, ORG_ID_DEMO]) {
    const integration = await db.tasksFlowIntegration.findUnique({
      where: { organizationId: orgId },
      select: { id: true },
    });
    if (!integration) {
      console.log(`\n=== ${orgId}: нет интеграции ===`);
      continue;
    }
    const links = await db.tasksFlowTaskLink.findMany({
      where: { integrationId: integration.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    console.log(
      `\n=== ${orgId}: ${links.length} TaskLinks (latest 50) ===`
    );
    for (const l of links) {
      const doc = await db.journalDocument.findUnique({
        where: { id: l.journalDocumentId },
        select: { title: true, template: { select: { code: true, name: true } } },
      });
      let userName = "?";
      if (l.rowKey.startsWith("employee-")) {
        const u = await db.user.findUnique({
          where: { id: l.rowKey.slice("employee-".length) },
          select: { name: true },
        });
        userName = u?.name ?? "unknown";
      }
      console.log(
        `  tf#${l.tasksflowTaskId}  ${l.journalCode.padEnd(28)}  docTitle="${doc?.title}"  rowKey=${l.rowKey}  user="${userName}"  status=${l.remoteStatus}`
      );
    }
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
