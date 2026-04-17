import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { getActiveOrgId, requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { isManagementRole } from "@/lib/user-roles";

/**
 * Minimal "add an employee" endpoint matching the reference-staff screen:
 * just Position + full name — no email invite here. We still create a `User`
 * row (everything downstream of hygiene / journals keys on userId), but with
 * `isActive=false`, an empty passwordHash, and a synthetic unique email so
 * the standard @unique constraint stays satisfied. If the owner later wants
 * the employee to log in, the existing `POST /api/users/invite` flow still
 * works — it looks up by id and sends a real token.
 */

const createSchema = z.object({
  jobPositionId: z.string().min(1, "Выберите должность"),
  fullName: z
    .string()
    .trim()
    .min(2, "ФИО слишком короткое")
    .max(200, "ФИО слишком длинное"),
});

function forbidden() {
  return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
}

function syntheticEmail(orgId: string) {
  const salt = crypto.randomBytes(6).toString("hex");
  return `staff-${salt}@${orgId}.local.haccp`;
}

function deriveRoleFromCategory(categoryKey: string): string {
  return categoryKey === "management" ? "manager" : "cook";
}

export async function POST(request: Request) {
  const session = await requireAuth();
  if (!isManagementRole(session.user.role) && !session.user.isRoot) {
    return forbidden();
  }
  const orgId = getActiveOrgId(session);

  let parsed;
  try {
    parsed = createSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Некорректные данные" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Не удалось прочитать запрос" }, { status: 400 });
  }

  const position = await db.jobPosition.findFirst({
    where: { id: parsed.jobPositionId, organizationId: orgId },
  });
  if (!position) {
    return NextResponse.json(
      { error: "Должность не найдена" },
      { status: 404 }
    );
  }

  const user = await db.user.create({
    data: {
      email: syntheticEmail(orgId),
      name: parsed.fullName,
      passwordHash: "",
      role: deriveRoleFromCategory(position.categoryKey),
      positionTitle: position.name,
      jobPositionId: position.id,
      organizationId: orgId,
      isActive: false, // no login until they go through /api/users/invite
      journalAccessMigrated: false,
    },
    select: {
      id: true,
      name: true,
      jobPositionId: true,
      isActive: true,
    },
  });

  return NextResponse.json({ user });
}
