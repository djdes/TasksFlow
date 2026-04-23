import { db } from "@/lib/db";

async function main() {
  const org = await db.organization.findFirst({
    where: { name: { contains: "Демо-кухня" } },
    select: { id: true, name: true },
  });
  if (!org) {
    console.log("Демо-кухня WESETUP not found");
    process.exit(1);
  }
  console.log("ORG:", org);
  const users = await db.user.findMany({
    where: { organizationId: org.id },
    orderBy: [{ isRoot: "desc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isRoot: true,
      archivedAt: true,
      positionTitle: true,
    },
  });
  console.log(`USERS: ${users.length}`);
  for (const u of users) {
    console.log(
      `  ${u.isRoot ? "[ROOT]" : ""}  ${u.role.padEnd(12)}  "${u.name}"  ${u.email}${u.archivedAt ? " ARCHIVED" : ""}`
    );
  }
  const pos = await db.jobPosition.findMany({
    where: { organizationId: org.id },
    orderBy: [{ categoryKey: "asc" }, { sortOrder: "asc" }],
    select: { name: true, categoryKey: true },
  });
  console.log(`POSITIONS: ${pos.length}`);
  for (const p of pos) console.log(`  [${p.categoryKey}] ${p.name}`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
