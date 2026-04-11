import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

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
  if (!isValidDate(dateObj)) {
    return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
  }
  dateObj.setUTCHours(0, 0, 0, 0);

  const docDateFrom = new Date(doc.dateFrom);
  docDateFrom.setUTCHours(0, 0, 0, 0);
  const docDateTo = new Date(doc.dateTo);
  docDateTo.setUTCHours(0, 0, 0, 0);

  if (dateObj < docDateFrom || dateObj > docDateTo) {
    return NextResponse.json(
      { error: "Дата записи должна попадать в период документа" },
      { status: 400 }
    );
  }

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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  if (!["owner", "technologist"].includes(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const doc = await db.journalDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  if (doc.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    ids?: string[];
    employeeId?: string;
    date?: string;
  };

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const result = await db.journalDocumentEntry.deleteMany({
      where: {
        documentId,
        id: { in: body.ids },
      },
    });

    return NextResponse.json({ deleted: result.count });
  }

  if (body.employeeId && body.date) {
    const dateObj = new Date(body.date);
    if (!isValidDate(dateObj)) {
      return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
    }
    dateObj.setUTCHours(0, 0, 0, 0);

    const result = await db.journalDocumentEntry.deleteMany({
      where: {
        documentId,
        employeeId: body.employeeId,
        date: dateObj,
      },
    });

    return NextResponse.json({ deleted: result.count });
  }

  if (body.employeeId) {
    const result = await db.journalDocumentEntry.deleteMany({
      where: {
        documentId,
        employeeId: body.employeeId,
      },
    });

    return NextResponse.json({ deleted: result.count });
  }

  return NextResponse.json(
    { error: "Нужно передать ids либо employeeId и date" },
    { status: 400 }
  );
}
