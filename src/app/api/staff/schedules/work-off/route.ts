import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrgId, requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { isManagementRole } from "@/lib/user-roles";

const toggleSchema = z.object({
  userId: z.string().min(1),
  /// ISO date like "2026-04-18"
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD"),
  enabled: z.boolean(),
});

function parseDayUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Toggle a single "work-off" cell in the staff grid. Fires every time a
 * manager checks/unchecks a day for an employee — kept tiny so the grid can
 * fire-and-forget without batching. Idempotent: an unchecked cell with no row
 * still returns ok.
 */
export async function POST(request: Request) {
  const session = await requireAuth();
  if (!isManagementRole(session.user.role) && !session.user.isRoot) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const orgId = getActiveOrgId(session);

  let parsed;
  try {
    parsed = toggleSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Некорректные данные" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Не удалось прочитать запрос" }, { status: 400 });
  }

  const user = await db.user.findFirst({
    where: { id: parsed.userId, organizationId: orgId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  const date = parseDayUtc(parsed.date);

  if (parsed.enabled) {
    await db.staffWorkOffDay.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date },
      update: {},
    });
  } else {
    await db.staffWorkOffDay.deleteMany({
      where: { userId: user.id, date },
    });
  }
  return NextResponse.json({ ok: true });
}
