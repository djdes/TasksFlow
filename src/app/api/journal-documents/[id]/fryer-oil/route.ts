import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeFryerOilEntryData, FRYER_OIL_TEMPLATE_CODE } from "@/lib/fryer-oil-document";
import { getServerSession } from "@/lib/server-session";

function toTimestamp(data: { startDate: string; startHour: number; startMinute: number }, second = 0) {
  return new Date(
    `${data.startDate}T${String(data.startHour).padStart(2, "0")}:${String(data.startMinute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`
  );
}

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

async function getDocument(documentId: string, organizationId: string) {
  return db.journalDocument.findFirst({
    where: { id: documentId, organizationId },
    include: { template: { select: { code: true } } },
  });
}

async function reserveUniqueDate(documentId: string, employeeId: string, data: ReturnType<typeof normalizeFryerOilEntryData>, currentId?: string) {
  for (let second = 0; second < 60; second += 1) {
    const date = toTimestamp(data, second);
    const existing = await db.journalDocumentEntry.findFirst({
      where: {
        documentId,
        employeeId,
        date,
        ...(currentId ? { NOT: { id: currentId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return date;
  }

  throw new Error("Слишком много записей на одно и то же время");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const document = await getDocument(documentId, session.user.organizationId);
  if (!document || document.template?.code !== FRYER_OIL_TEMPLATE_CODE) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }
  if (document.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { data?: unknown } | null;
  const data = normalizeFryerOilEntryData(body?.data);
  const employee = await db.user.findFirst({
    where: { organizationId: session.user.organizationId, isActive: true },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  if (!employee) {
    return NextResponse.json({ error: "Нет активных сотрудников для создания записи" }, { status: 400 });
  }

  const date = await reserveUniqueDate(documentId, employee.id, data);
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "Некорректная дата записи" }, { status: 400 });
  }

  const entry = await db.journalDocumentEntry.create({
    data: { documentId, employeeId: employee.id, date, data },
  });

  return NextResponse.json({ entry });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const document = await getDocument(documentId, session.user.organizationId);
  if (!document || document.template?.code !== FRYER_OIL_TEMPLATE_CODE) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }
  if (document.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string; data?: unknown } | null;
  if (!body?.id) return NextResponse.json({ error: "Не указан идентификатор записи" }, { status: 400 });

  const current = await db.journalDocumentEntry.findFirst({
    where: { id: body.id, documentId },
    select: { id: true, employeeId: true },
  });
  if (!current) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });

  const data = normalizeFryerOilEntryData(body.data);
  const date = await reserveUniqueDate(documentId, current.employeeId, data, current.id);
  const entry = await db.journalDocumentEntry.update({
    where: { id: current.id },
    data: { date, data },
  });

  return NextResponse.json({ entry });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const document = await getDocument(documentId, session.user.organizationId);
  if (!document || document.template?.code !== FRYER_OIL_TEMPLATE_CODE) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }
  if (document.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "Нужно передать ids" }, { status: 400 });
  }

  const result = await db.journalDocumentEntry.deleteMany({
    where: { documentId, id: { in: body.ids } },
  });

  return NextResponse.json({ deleted: result.count });
}
