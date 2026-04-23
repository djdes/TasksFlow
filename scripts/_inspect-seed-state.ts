import { db } from "@/lib/db";

async function main() {
  const me = await db.user.findMany({
    where: { email: "bugdenes@gmail.com" },
    select: {
      id: true,
      name: true,
      email: true,
      isRoot: true,
      organizationId: true,
      role: true,
    },
  });
  console.log("ME:", me);
  if (!me[0]?.organizationId) {
    console.log("No org — exit.");
    await db.$disconnect();
    return;
  }
  const orgId = me[0].organizationId;
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  console.log("ORG:", org);
  const users = await db.user.findMany({
    where: { organizationId: orgId },
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
  console.log("USERS:", users.length);
  for (const u of users) {
    console.log(
      `  - ${u.id.slice(0, 8)}  root=${u.isRoot}  role=${u.role}  "${u.name}"  ${
        u.email
      }${u.archivedAt ? " (ARCHIVED)" : ""}`
    );
  }
  const positions = await db.jobPosition.findMany({
    where: { organizationId: orgId },
    orderBy: [{ categoryKey: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      categoryKey: true,
      sortOrder: true,
    },
  });
  console.log("POSITIONS:", positions.length);
  for (const p of positions) {
    console.log(`  - [${p.categoryKey}] "${p.name}"`);
  }
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
