import { db } from "@/lib/db";

async function main() {
  const orgs = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
  });
  console.log(`Organizations: ${orgs.length}`);
  for (const o of orgs) {
    console.log(
      `  ${o.id.slice(0, 10)}  users=${o._count.users}  created=${o.createdAt.toISOString().slice(0, 10)}  "${o.name}"`
    );
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
