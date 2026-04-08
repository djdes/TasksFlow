import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * PUT — upsert a single grid cell (employee + date + data).
 * Called on each cell edit in the grid UI.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const doc = await db.journalDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  if (doc.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const body = await request.json();
  const { employeeId, date, data } = body;

  if (!employeeId || !date || !data) {
    return NextResponse.json({ error: "employeeId, date, data обязательны" }, { status: 400 });
  }

  // Verify employee belongs to org
  const employee = await db.user.findFirst({
    where: { id: employeeId, organizationId: session.user.organizationId },
  });
  if (!employee) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  // Truncate to date-only (midnight UTC)
  const dateObj = new Date(date);
  dateObj.setUTCHours(0, 0, 0, 0);

  const entry = await db.journalDocumentEntry.upsert({
    where: {
      documentId_employeeId_date: {
        documentId,
        employeeId,
        date: dateObj,
      },
    },
    update: { data },
    create: {
      documentId,
      employeeId,
      date: dateObj,
      data,
    },
  });

  return NextResponse.json({ entry });
}
