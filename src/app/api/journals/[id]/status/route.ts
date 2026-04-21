import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isManagementRole } from "@/lib/user-roles";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  if (!isManagementRole(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json();
  const { status } = body;

  if (!["draft", "submitted", "approved"].includes(status)) {
    return NextResponse.json({ error: "Недопустимый статус" }, { status: 400 });
  }

  const entry = await db.journalEntry.findUnique({
    where: { id },
  });

  if (!entry || entry.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  }

  const updated = await db.journalEntry.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json(updated);
}
