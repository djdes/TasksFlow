import { db } from "@/lib/db";

const OWNER_EMAIL = "bugdenes@gmail.com";

/**
 * Wipe demo employees + all job positions in the owner's organisation
 * and seed a minimal lineup: 1 руководитель + 4 разных сотрудника.
 *
 * Employees aren't hard-deleted — they carry FK references from
 * JournalDocumentEntry, TasksFlowUserLink etc. Archiving (archivedAt +
 * isActive=false) preserves historical rows while hiding them from the
 * /settings/users list and any adapter row-mode.
 *
 * Positions get hard-deleted — User.jobPositionId is nullable, so
 * references just null out.
 */

type PositionSeed = {
  name: string;
  categoryKey: "management" | "staff";
};

type UserSeed = {
  name: string;
  emailLocal: string;
  role: string;
  positionName: string;
  phone?: string;
};

const POSITION_SEEDS: PositionSeed[] = [
  { name: "Шеф-повар", categoryKey: "management" },
  { name: "Повар", categoryKey: "staff" },
  { name: "Официант", categoryKey: "staff" },
  { name: "Посудомойщик", categoryKey: "staff" },
];

const USER_SEEDS: UserSeed[] = [
  {
    name: "Анна Новикова",
    emailLocal: "anna.chef",
    role: "head_chef",
    positionName: "Шеф-повар",
    phone: "+79990001001",
  },
  {
    name: "Иван Петров",
    emailLocal: "ivan.cook",
    role: "cook",
    positionName: "Повар",
    phone: "+79990001002",
  },
  {
    name: "Мария Иванова",
    emailLocal: "maria.cook",
    role: "cook",
    positionName: "Повар",
    phone: "+79990001003",
  },
  {
    name: "Сергей Кузнецов",
    emailLocal: "sergey.waiter",
    role: "waiter",
    positionName: "Официант",
    phone: "+79990001004",
  },
  {
    name: "Ольга Соколова",
    emailLocal: "olga.dishwasher",
    role: "operator",
    positionName: "Посудомойщик",
    phone: "+79990001005",
  },
];

async function main() {
  const owner = await db.user.findFirst({
    where: { email: OWNER_EMAIL },
    select: { id: true, organizationId: true, name: true },
  });
  if (!owner?.organizationId) {
    console.error(`Owner ${OWNER_EMAIL} not found or without org`);
    process.exit(1);
  }
  const orgId = owner.organizationId;
  console.log(`Owner: ${owner.name} (${owner.id})  Org: ${orgId}`);

  // ---- Archive every non-owner employee ----
  const toArchive = await db.user.findMany({
    where: {
      organizationId: orgId,
      id: { not: owner.id },
      archivedAt: null,
    },
    select: { id: true, name: true, email: true },
  });
  console.log(`\nArchiving ${toArchive.length} existing users…`);
  for (const u of toArchive) {
    console.log(`  - ${u.name}  <${u.email}>`);
  }
  if (toArchive.length > 0) {
    await db.user.updateMany({
      where: { id: { in: toArchive.map((u) => u.id) } },
      data: { archivedAt: new Date(), isActive: false },
    });
  }

  // ---- Delete every position in this org ----
  const orgPositions = await db.jobPosition.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true },
  });
  console.log(`\nDeleting ${orgPositions.length} job positions…`);
  if (orgPositions.length > 0) {
    // Null the FK on any remaining user first so delete doesn't fail
    // if onDelete behaviour isn't permissive.
    await db.user.updateMany({
      where: { organizationId: orgId, jobPositionId: { not: null } },
      data: { jobPositionId: null, positionTitle: null },
    });
    await db.jobPosition.deleteMany({
      where: { organizationId: orgId },
    });
  }

  // ---- Seed new positions ----
  console.log(`\nSeeding ${POSITION_SEEDS.length} positions…`);
  const positionIdByName = new Map<string, string>();
  let sortOrder = 1;
  for (const seed of POSITION_SEEDS) {
    const created = await db.jobPosition.create({
      data: {
        organizationId: orgId,
        name: seed.name,
        categoryKey: seed.categoryKey,
        sortOrder: sortOrder++,
      },
      select: { id: true, name: true },
    });
    positionIdByName.set(seed.name, created.id);
    console.log(`  + ${seed.categoryKey} "${created.name}"`);
  }

  // ---- Seed new users ----
  console.log(`\nSeeding ${USER_SEEDS.length} users…`);
  // Pick an email domain that matches an existing pattern in this org —
  // use the seed-script «@wesetup.local» suffix unique per org id.
  const emailSuffix = `${orgId.slice(0, 8)}@wesetup.local`;
  for (const seed of USER_SEEDS) {
    const positionId = positionIdByName.get(seed.positionName);
    await db.user.create({
      data: {
        organizationId: orgId,
        email: `${seed.emailLocal}.${emailSuffix}`,
        name: seed.name,
        passwordHash: "",
        isActive: true,
        role: seed.role,
        phone: seed.phone ?? null,
        jobPositionId: positionId ?? null,
        positionTitle: seed.positionName,
      },
    });
    console.log(`  + [${seed.role}] "${seed.name}"  ${seed.positionName}`);
  }

  // ---- Summary ----
  const summary = await db.user.findMany({
    where: { organizationId: orgId, archivedAt: null },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      positionTitle: true,
      isRoot: true,
    },
  });
  console.log(`\nFinal active roster (${summary.length}):`);
  for (const u of summary) {
    console.log(
      `  ${u.isRoot ? "[ROOT]" : ""}  ${u.role.padEnd(12)}  ${u.name}  /  ${
        u.positionTitle ?? "—"
      }`
    );
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
