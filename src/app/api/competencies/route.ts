import { getServerSession } from "@/lib/server-session";
import { ZodError } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { competencySchema } from "@/lib/validators";
import { isManagementRole } from "@/lib/user-roles";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const competencies = await db.staffCompetency.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: [{ userId: "asc" }, { skill: "asc" }],
  });

  return NextResponse.json(competencies);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  if (!isManagementRole(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  let data;
  try {
    data = competencySchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "Некорректные данные", details: e.issues },
        { status: 400 }
      );
    }
    throw e;
  }

  // Verify target user belongs to the same organization — prevents
  // cross-tenant writes via crafted userId in body.
  const targetUser = await db.user.findFirst({
    where: { id: data.userId, organizationId: session.user.organizationId },
    select: { id: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  const expiresAt =
    data.expiresAt && typeof data.expiresAt === "string" && data.expiresAt.length > 0
      ? new Date(data.expiresAt)
      : null;

  const competency = await db.staffCompetency.upsert({
    where: {
      organizationId_userId_skill: {
        organizationId: session.user.organizationId,
        userId: data.userId,
        skill: data.skill,
      },
    },
    update: {
      level: data.level,
      certifiedAt: data.level > 0 ? new Date() : null,
      expiresAt,
      certifiedById: session.user.id,
      notes: data.notes ?? null,
    },
    create: {
      organizationId: session.user.organizationId,
      userId: data.userId,
      skill: data.skill,
      level: data.level,
      certifiedAt: data.level > 0 ? new Date() : null,
      expiresAt,
      certifiedById: session.user.id,
      notes: data.notes ?? null,
    },
  });

  return NextResponse.json(competency);
}
