import { db } from "@/lib/db";

async function main() {
  const mgr = await db.user.findFirst({
    where: { email: "qa-manager@wesetup.test" },
    select: { organizationId: true },
  });
  if (!mgr?.organizationId) {
    console.error("manager not found");
    process.exit(1);
  }
  const orgId = mgr.organizationId;
  const positions = await db.jobPosition.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true },
  });
  const byName = new Map(positions.map((p) => [p.name, p.id]));

  const seeds = [
    {
      name: "Мария Тестова",
      phone: "+79990003002",
      role: "cook",
      pos: "Повар холодного цеха",
    },
    {
      name: "Сергей Тестов",
      phone: "+79990003003",
      role: "waiter",
      pos: "Официант",
    },
    {
      name: "Ольга Тестова",
      phone: "+79990003004",
      role: "operator",
      pos: "Посудомойщик",
    },
  ];
  for (const s of seeds) {
    const posId = byName.get(s.pos);
    const existing = await db.user.findFirst({
      where: { organizationId: orgId, phone: s.phone },
    });
    if (existing) {
      console.log("exists", s.name);
      continue;
    }
    await db.user.create({
      data: {
        organizationId: orgId,
        email: `${s.name.toLowerCase().replace(/\s+/g, ".")}@${orgId.slice(0, 8)}.local`,
        name: s.name,
        phone: s.phone,
        passwordHash: "",
        role: s.role,
        isActive: true,
        jobPositionId: posId ?? null,
        positionTitle: s.pos,
      },
    });
    console.log("+", s.name);
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
