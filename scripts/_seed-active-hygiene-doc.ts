import { db } from "@/lib/db";

const HOME_ORG_ID = "cmmbrt40y0000rotsr41p4xh6";

async function main() {
  const template = await db.journalTemplate.findFirst({
    where: { code: "hygiene" },
    select: { id: true },
  });
  if (!template) {
    console.error("hygiene template not found");
    process.exit(1);
  }
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  );
  const existing = await db.journalDocument.findFirst({
    where: {
      organizationId: HOME_ORG_ID,
      templateId: template.id,
      status: "active",
      dateFrom: { lte: now },
      dateTo: { gte: now },
    },
  });
  if (existing) {
    console.log("already has an active hygiene doc:", existing.id);
    return;
  }
  const doc = await db.journalDocument.create({
    data: {
      organizationId: HOME_ORG_ID,
      templateId: template.id,
      title: "Гигиенический журнал · апрель 2026",
      dateFrom: monthStart,
      dateTo: monthEnd,
      status: "active",
      config: {},
    },
    select: { id: true, title: true, dateFrom: true, dateTo: true },
  });
  console.log("Created:", doc);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
