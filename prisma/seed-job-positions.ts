/**
 * One-shot idempotent seed: bucket every existing `User.positionTitle` (or the
 * role-label fallback) into per-org `JobPosition` rows, then point
 * `User.jobPositionId` at them.
 *
 * Safe to run multiple times — it only creates positions that don't exist yet
 * and only links users that aren't already linked.
 *
 * Runs automatically inside the `prisma db push` block of our deploy workflow;
 * also callable via `npx tsx prisma/seed-job-positions.ts`.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function resolveCategoryKey(role: string | null | undefined): "management" | "staff" {
  const normalised = (role ?? "").toLowerCase();
  if (
    normalised === "manager" ||
    normalised === "owner" ||
    normalised === "head_chef" ||
    normalised === "technologist"
  ) {
    return "management";
  }
  return "staff";
}

function resolveRoleLabel(role: string | null | undefined): string {
  const normalised = (role ?? "").toLowerCase();
  switch (normalised) {
    case "manager":
    case "owner":
      return "Управляющий";
    case "head_chef":
    case "technologist":
      return "Шеф-повар";
    case "cook":
    case "operator":
      return "Повар";
    case "waiter":
      return "Официант";
    default:
      return "Сотрудник";
  }
}

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });

  let totalPositions = 0;
  let totalLinked = 0;

  for (const org of orgs) {
    const users = await prisma.user.findMany({
      where: { organizationId: org.id, jobPositionId: null },
      select: {
        id: true,
        role: true,
        positionTitle: true,
      },
    });
    if (users.length === 0) continue;

    // Group by (categoryKey, displayName) — displayName prefers positionTitle,
    // falls back to the role label.
    const buckets = new Map<
      string,
      { categoryKey: "management" | "staff"; name: string; userIds: string[] }
    >();
    for (const u of users) {
      const categoryKey = resolveCategoryKey(u.role);
      const name = (u.positionTitle?.trim() || resolveRoleLabel(u.role)).slice(0, 120);
      const key = `${categoryKey}::${name}`;
      if (!buckets.has(key)) {
        buckets.set(key, { categoryKey, name, userIds: [] });
      }
      buckets.get(key)!.userIds.push(u.id);
    }

    let sortOrder = 0;
    for (const bucket of buckets.values()) {
      // Upsert the JobPosition for this org+category+name.
      const position = await prisma.jobPosition.upsert({
        where: {
          organizationId_categoryKey_name: {
            organizationId: org.id,
            categoryKey: bucket.categoryKey,
            name: bucket.name,
          },
        },
        create: {
          organizationId: org.id,
          categoryKey: bucket.categoryKey,
          name: bucket.name,
          sortOrder: sortOrder++,
        },
        update: {},
      });
      totalPositions += 1;

      if (bucket.userIds.length > 0) {
        const result = await prisma.user.updateMany({
          where: { id: { in: bucket.userIds }, jobPositionId: null },
          data: { jobPositionId: position.id },
        });
        totalLinked += result.count;
      }
    }
  }

  console.log(
    `[seed-job-positions] upserted=${totalPositions} linked_users=${totalLinked} orgs=${orgs.length}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
