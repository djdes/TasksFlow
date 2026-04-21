/**
 * Server-helper для «смен сотрудников». Читает и решает — кто сегодня
 * работает и в какой должности. Используется в auto-assign местах:
 *   - CAPA (кто получит ticket «проверить компрессор» — сегодняшний
 *     менеджер, а не первый попавшийся).
 *   - TasksFlow bulk-assign (кому рассылать напоминания — только
 *     тем, кто фактически на смене).
 *
 * Правило resolve:
 *   1. `resolveOnDutyForPosition(organizationId, positionId, date)`
 *      — находит user-a, чей WorkShift на нужную date имеет
 *      jobPositionId = positionId AND status = "scheduled". Если
 *      позиция не переопределена в shift-записи, берём User.jobPositionId.
 *      Возвращает первого по sortOrder (в будущем можно rotation).
 *   2. `isUserOnDuty(userId, date)` — есть ли запись с
 *      status = "scheduled" на дату. Отсутствие записи трактуем как
 *      «не запланирован» (консервативно — инспектор не должен видеть
 *      «уборку сделала Анна», если Анна в отпуске).
 */
import { db } from "@/lib/db";

export type ShiftStatus = "scheduled" | "off" | "vacation" | "sick";

function dayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export async function isUserOnDuty(
  userId: string,
  date: Date = new Date()
): Promise<boolean> {
  const anchor = dayStart(date);
  const row = await db.workShift.findUnique({
    where: { userId_date: { userId, date: anchor } },
    select: { status: true },
  });
  return row?.status === "scheduled";
}

export type OnDutyUser = {
  userId: string;
  name: string;
  jobPositionId: string | null;
  jobPositionName: string | null;
  categoryKey: string | null;
};

export async function listOnDutyToday(
  organizationId: string,
  date: Date = new Date()
): Promise<OnDutyUser[]> {
  const anchor = dayStart(date);
  const shifts = await db.workShift.findMany({
    where: {
      organizationId,
      date: anchor,
      status: "scheduled",
    },
    select: {
      userId: true,
      jobPositionId: true,
      user: {
        select: {
          id: true,
          name: true,
          jobPositionId: true,
          jobPosition: {
            select: { id: true, name: true, categoryKey: true },
          },
        },
      },
      jobPosition: { select: { id: true, name: true, categoryKey: true } },
    },
  });
  return shifts.map((row) => {
    const pos = row.jobPosition ?? row.user.jobPosition ?? null;
    return {
      userId: row.user.id,
      name: row.user.name,
      jobPositionId: pos?.id ?? null,
      jobPositionName: pos?.name ?? null,
      categoryKey: pos?.categoryKey ?? null,
    };
  });
}

/**
 * Кто сегодня дежурит на нужной должности. Если таких несколько —
 * возвращаем первого по sortOrder JobPosition (потом по User.name).
 * null — никто не запланирован или все в отсутствии.
 */
export async function resolveOnDutyForPosition(
  organizationId: string,
  jobPositionId: string,
  date: Date = new Date()
): Promise<OnDutyUser | null> {
  const all = await listOnDutyToday(organizationId, date);
  const match = all.find((u) => u.jobPositionId === jobPositionId);
  return match ?? null;
}

/**
 * Удобный резолвер: найти дежурного любого из категорий — удобно для
 * «кто сегодня в руководстве» (для CAPA) или «кто сегодня из
 * сотрудников кухни» (для journal тасков).
 */
export async function resolveOnDutyByCategory(
  organizationId: string,
  categoryKey: "management" | "staff",
  date: Date = new Date()
): Promise<OnDutyUser | null> {
  const all = await listOnDutyToday(organizationId, date);
  return all.find((u) => u.categoryKey === categoryKey) ?? null;
}
