import { db } from "@/lib/db";

const DEMO_ORG_ID = "demo-screenshots";
const KEEP_EMAIL = "demo-screenshots@wesetup.local"; // «Демо Менеджер»

type PositionSeed = { name: string; categoryKey: "management" | "staff" };
type UserSeed = {
  name: string;
  emailLocal: string;
  role: string;
  positionName: string;
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
  },
  {
    name: "Иван Петров",
    emailLocal: "ivan.cook",
    role: "cook",
    positionName: "Повар",
  },
  {
    name: "Мария Иванова",
    emailLocal: "maria.cook",
    role: "cook",
    positionName: "Повар",
  },
  {
    name: "Сергей Кузнецов",
    emailLocal: "sergey.waiter",
    role: "waiter",
    positionName: "Официант",
  },
  {
    name: "Ольга Соколова",
    emailLocal: "olga.dishwasher",
    role: "operator",
    positionName: "Посудомойщик",
  },
];

async function main() {
  const org = await db.organization.findUnique({
    where: { id: DEMO_ORG_ID },
    select: { id: true, name: true },
  });
  if (!org) {
    console.error(`Org ${DEMO_ORG_ID} not found`);
    process.exit(1);
  }
  console.log(`Org: ${org.name} (${org.id})`);

  const keep = await db.user.findFirst({
    where: { organizationId: org.id, email: KEEP_EMAIL },
    select: { id: true, name: true, role: true },
  });
  if (!keep) {
    console.error(`Keep-user ${KEEP_EMAIL} not found`);
    process.exit(1);
  }
  console.log(`Keeping: [${keep.role}] ${keep.name}`);

  // ---- Archive everyone except KEEP ----
  const toArchive = await db.user.findMany({
    where: {
      organizationId: org.id,
      id: { not: keep.id },
      archivedAt: null,
    },
    select: { id: true, name: true, email: true },
  });
  console.log(`\nArchiving ${toArchive.length} existing users…`);
  for (const u of toArchive) console.log(`  - ${u.name}  <${u.email}>`);
  if (toArchive.length > 0) {
    await db.user.updateMany({
      where: { id: { in: toArchive.map((u) => u.id) } },
      data: { archivedAt: new Date(), isActive: false },
    });
  }

  // ---- Delete every position ----
  const positions = await db.jobPosition.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true },
  });
  console.log(`\nDeleting ${positions.length} job positions…`);
  if (positions.length > 0) {
    await db.user.updateMany({
      where: { organizationId: org.id, jobPositionId: { not: null } },
      data: { jobPositionId: null, positionTitle: null },
    });
    await db.jobPosition.deleteMany({ where: { organizationId: org.id } });
  }

  // ---- Seed new positions ----
  console.log(`\nSeeding ${POSITION_SEEDS.length} positions…`);
  const positionIdByName = new Map<string, string>();
  let sortOrder = 1;
  for (const seed of POSITION_SEEDS) {
    const created = await db.jobPosition.create({
      data: {
        organizationId: org.id,
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
  for (const seed of USER_SEEDS) {
    const positionId = positionIdByName.get(seed.positionName);
    await db.user.create({
      data: {
        organizationId: org.id,
        email: `${seed.emailLocal}@${org.id}.local`,
        name: seed.name,
        passwordHash: "",
        isActive: true,
        role: seed.role,
        jobPositionId: positionId ?? null,
        positionTitle: seed.positionName,
      },
    });
    console.log(`  + [${seed.role}] "${seed.name}"  ${seed.positionName}`);
  }

  const summary = await db.user.findMany({
    where: { organizationId: org.id, archivedAt: null },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { name: true, role: true, positionTitle: true },
  });
  console.log(`\nFinal active roster (${summary.length}):`);
  for (const u of summary) {
    console.log(
      `  ${u.role.padEnd(12)}  ${u.name}  /  ${u.positionTitle ?? "—"}`
    );
  }

  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
