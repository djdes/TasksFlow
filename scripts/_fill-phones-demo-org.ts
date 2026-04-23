import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

const DEMO_ORG_ID = "demo-screenshots";

/**
 * «Демо-кухня WESETUP» — публичная демо-организация, которая светится
 * на wesetup.ru. Каждому активному сотруднику назначаем уникальный
 * synthetic phone из блока +79990002xxx, чтоб не пересекался с
 * «Домашняя кухня» (+79990001xxx).
 */
const PHONE_BY_EMAIL: Record<string, string> = {
  "demo-screenshots@wesetup.local": "+79990002000", // Демо Менеджер
  "anna.chef@demo-screenshots.local": "+79990002001",
  "ivan.cook@demo-screenshots.local": "+79990002002",
  "maria.cook@demo-screenshots.local": "+79990002003",
  "sergey.waiter@demo-screenshots.local": "+79990002004",
  "olga.dishwasher@demo-screenshots.local": "+79990002005",
};

async function main() {
  const org = await db.organization.findUnique({
    where: { id: DEMO_ORG_ID },
    select: { id: true, name: true },
  });
  if (!org) {
    console.error(`Org ${DEMO_ORG_ID} not found`);
    process.exit(1);
  }
  console.log(`Org: ${org.name}`);

  const users = await db.user.findMany({
    where: { organizationId: org.id, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });
  console.log(`Active users: ${users.length}`);

  let poolNum = 2010;

  for (const u of users) {
    const target =
      normalizePhone(PHONE_BY_EMAIL[u.email] ?? null) ??
      normalizePhone(`+7999000${poolNum++}`);
    if (!target) continue;

    if (u.phone === target) {
      console.log(`  = ${u.name.padEnd(20)} ${target}  (актуально)`);
      continue;
    }
    const dup = await db.user.findFirst({
      where: {
        organizationId: org.id,
        phone: target,
        id: { not: u.id },
        archivedAt: null,
      },
      select: { name: true },
    });
    if (dup) {
      console.log(
        `  ! ${u.name.padEnd(20)} конфликт с «${dup.name}» на ${target}`
      );
      continue;
    }
    await db.user.update({
      where: { id: u.id },
      data: { phone: target },
    });
    console.log(`  + ${u.name.padEnd(20)} ${target}`);
  }

  console.log(`\nFinal state:`);
  const after = await db.user.findMany({
    where: { organizationId: org.id, archivedAt: null },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { name: true, phone: true, role: true },
  });
  for (const u of after) {
    console.log(
      `  ${u.role.padEnd(12)} ${u.name.padEnd(20)} ${u.phone ?? "— нет"}`
    );
  }

  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
