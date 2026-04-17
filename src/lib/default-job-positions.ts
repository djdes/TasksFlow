import type { Prisma } from "@prisma/client";

type TxLike = Prisma.TransactionClient | {
  jobPosition: {
    upsert: (args: Prisma.JobPositionUpsertArgs) => Promise<unknown>;
  };
};

/**
 * Baseline `JobPosition` catalogue — every new organisation is seeded with
 * these positions so the /settings/users screen и все журналы сразу имеют
 * нормальный набор должностей. Идемпотентно: вызов для существующей org
 * просто ничего не добавит к уже существующим позициям с таким же именем.
 *
 * Ordering within each category is the sortOrder — owners can reorder later
 * (UI sorts by sortOrder first, then alphabetically).
 */
export const DEFAULT_JOB_POSITIONS: Array<{
  categoryKey: "management" | "staff";
  name: string;
}> = [
  // Руководство
  { categoryKey: "management", name: "Управляющий" },
  { categoryKey: "management", name: "Шеф-повар" },
  { categoryKey: "management", name: "Руководитель качества" },
  { categoryKey: "management", name: "Технолог" },
  { categoryKey: "management", name: "Начальник производства" },
  // Сотрудники
  { categoryKey: "staff", name: "Су-шеф" },
  { categoryKey: "staff", name: "Повар горячего цеха" },
  { categoryKey: "staff", name: "Повар холодного цеха" },
  { categoryKey: "staff", name: "Повар-кондитер" },
  { categoryKey: "staff", name: "Повар" },
  { categoryKey: "staff", name: "Официант" },
  { categoryKey: "staff", name: "Бармен" },
  { categoryKey: "staff", name: "Посудомойщик" },
  { categoryKey: "staff", name: "Уборщик" },
  { categoryKey: "staff", name: "Кладовщик" },
  { categoryKey: "staff", name: "Товаровед" },
  { categoryKey: "staff", name: "Менеджер зала" },
  { categoryKey: "staff", name: "Грузчик" },
];

/**
 * Upsert every default position for the given org. Safe to run inside an
 * existing Prisma transaction (pass `tx`) or against the top-level client —
 * both share the same method surface.
 */
export async function seedDefaultJobPositions(
  tx: TxLike,
  organizationId: string
): Promise<void> {
  let sortOrder = 0;
  for (const { categoryKey, name } of DEFAULT_JOB_POSITIONS) {
    await tx.jobPosition.upsert({
      where: {
        organizationId_categoryKey_name: {
          organizationId,
          categoryKey,
          name,
        },
      },
      create: {
        organizationId,
        categoryKey,
        name,
        sortOrder,
      },
      update: {},
    });
    sortOrder += 1;
  }
}
