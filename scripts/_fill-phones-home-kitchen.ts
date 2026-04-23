import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

const OWNER_EMAIL = "bugdenes@gmail.com";

/**
 * Every user in «Домашняя кухня» gets a unique +7 phone if they don't
 * have one. Uses the same `+79990001xxx` block as the other seeds so the
 * numbers are obviously synthetic and sortable by seed order.
 */
const PHONE_BY_EMAIL: Record<string, string> = {
  "bugdenes@gmail.com": "+79990001000",
  // Users I seeded earlier already have phones, but the script is
  // idempotent — we'll write them back in the canonical format.
  "anna.chef.cmmbrt40@wesetup.local": "+79990001001",
  "ivan.cook.cmmbrt40@wesetup.local": "+79990001002",
  "maria.cook.cmmbrt40@wesetup.local": "+79990001003",
  "sergey.waiter.cmmbrt40@wesetup.local": "+79990001004",
  "olga.dishwasher.cmmbrt40@wesetup.local": "+79990001005",
};

async function main() {
  const owner = await db.user.findFirst({
    where: { email: OWNER_EMAIL },
    select: { organizationId: true },
  });
  if (!owner?.organizationId) {
    console.error(`Owner ${OWNER_EMAIL} not found`);
    process.exit(1);
  }
  const orgId = owner.organizationId;

  const users = await db.user.findMany({
    where: { organizationId: orgId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, phone: true },
  });

  console.log(`Organization ${orgId}, active users: ${users.length}`);

  // Pool of synthetic numbers to draw from for users not in the map.
  let nextPoolNum = 1010;

  for (const u of users) {
    const target =
      normalizePhone(PHONE_BY_EMAIL[u.email] ?? null) ??
      normalizePhone(`+7999000${nextPoolNum++}`);
    if (!target) continue;

    if (u.phone === target) {
      console.log(`  = ${u.name.padEnd(24)} ${target}  (уже актуально)`);
      continue;
    }

    // Uniqueness-guard: no two users in the org with the same phone.
    const dup = await db.user.findFirst({
      where: {
        organizationId: orgId,
        phone: target,
        id: { not: u.id },
        archivedAt: null,
      },
      select: { id: true, name: true },
    });
    if (dup) {
      console.log(
        `  ! ${u.name.padEnd(24)} конфликт с «${dup.name}» на ${target}, пропускаем`
      );
      continue;
    }

    await db.user.update({
      where: { id: u.id },
      data: { phone: target },
    });
    console.log(`  + ${u.name.padEnd(24)} ${target}`);
  }

  console.log(`\nFinal state:`);
  const after = await db.user.findMany({
    where: { organizationId: orgId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { name: true, phone: true, role: true },
  });
  for (const u of after) {
    console.log(
      `  ${u.role.padEnd(12)} ${u.name.padEnd(24)} ${u.phone ?? "— нет"}`
    );
  }

  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
