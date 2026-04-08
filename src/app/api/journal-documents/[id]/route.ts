import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const doc = await db.journalDocument.findUnique({
    where: { id },
    include: {
      template: true,
      entries: {
        orderBy: [{ employeeId: "asc" }, { date: "asc" }],
      },
    },
  });

  if (!doc || doc.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  // Load org employees for the grid rows
  const employees = await db.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ document: doc, employees });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  if (!["owner", "technologist"].includes(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const doc = await db.journalDocument.findUnique({ where: { id } });
  if (!doc || doc.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) data.status = body.status;
  if (body.autoFill !== undefined) data.autoFill = body.autoFill;
  if (body.responsibleTitle !== undefined) data.responsibleTitle = body.responsibleTitle;
  if (body.responsibleUserId !== undefined) data.responsibleUserId = body.responsibleUserId;

  const updated = await db.journalDocument.update({ where: { id }, data });
  return NextResponse.json({ document: updated });
}
