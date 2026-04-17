import { NextResponse } from "next/server";
import { getActiveOrgId, requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { isManagementRole } from "@/lib/user-roles";

async function guard(id: string, orgId: string) {
  const user = await db.user.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, archivedAt: true, isRoot: true },
  });
  return user;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (!isManagementRole(session.user.role) && !session.user.isRoot) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const { id } = await params;
  const orgId = getActiveOrgId(session);
  const user = await guard(id, orgId);
  if (!user) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }
  if (user.isRoot) {
    return NextResponse.json(
      { error: "ROOT-учётную запись нельзя архивировать" },
      { status: 400 }
    );
  }
  if (user.id === session.user.id) {
    return NextResponse.json(
      { error: "Нельзя архивировать самого себя" },
      { status: 400 }
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      archivedAt: new Date(),
      isActive: false,
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  if (!isManagementRole(session.user.role) && !session.user.isRoot) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const { id } = await params;
  const orgId = getActiveOrgId(session);
  const user = await guard(id, orgId);
  if (!user) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      archivedAt: null,
      isActive: true,
    },
  });
  return NextResponse.json({ ok: true });
}
