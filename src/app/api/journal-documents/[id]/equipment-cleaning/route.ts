import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  EQUIPMENT_CLEANING_TEMPLATE_CODE,
  normalizeEquipmentCleaningRowData,
} from "@/lib/equipment-cleaning-document";
import { isManagementRole } from "@/lib/user-roles";

async function loadDocument(id: string, organizationId: string) {
  const document = await db.journalDocument.findUnique({
    where: { id },
    include: { template: true },
  });

  if (!document || document.organizationId !== organizationId) {
    return null;
  }

  if (document.template.code !== EQUIPMENT_CLEANING_TEMPLATE_CODE) {
    throw new Error("WRONG_TEMPLATE");
  }

  return document;
}

function normalizeEntry(entry: {
  id: string;
  data: unknown;
}) {
  return {
    id: entry.id,
    data: normalizeEquipmentCleaningRowData(entry.data),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const document = await loadDocument(id, session.user.organizationId);
  if (!document) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }
  if (document.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    data?: unknown;
  };
  const data = normalizeEquipmentCleaningRowData(body.data);

  const employeeId =
    data.washerUserId || data.controllerUserId || document.createdById || null;
  if (!employeeId) {
    return NextResponse.json({ error: "Не выбран сотрудник" }, { status: 400 });
  }

  const employee = await db.user.findFirst({
    where: {
      id: employeeId,
      organizationId: session.user.organizationId,
    },
    select: { id: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  const entryDate = new Date(`${data.washDate}T${data.washTime}:00`);

  const entry = await db.journalDocumentEntry.create({
    data: {
      documentId: document.id,
      employeeId,
      date: entryDate,
      data,
    },
    select: {
      id: true,
      data: true,
    },
  });

  return NextResponse.json({ entry: normalizeEntry(entry) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const document = await loadDocument(id, session.user.organizationId);
  if (!document) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }
  if (document.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    data?: unknown;
  };
  if (!body.id) {
    return NextResponse.json({ error: "Не указан идентификатор строки" }, { status: 400 });
  }

  const currentEntry = await db.journalDocumentEntry.findFirst({
    where: {
      id: body.id,
      documentId: document.id,
    },
    select: { id: true },
  });
  if (!currentEntry) {
    return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });
  }

  const data = normalizeEquipmentCleaningRowData(body.data);
  const employeeId =
    data.washerUserId || data.controllerUserId || document.createdById || null;
  if (!employeeId) {
    return NextResponse.json({ error: "Не выбран сотрудник" }, { status: 400 });
  }

  const entry = await db.journalDocumentEntry.update({
    where: { id: currentEntry.id },
    data: {
      employeeId,
      date: new Date(`${data.washDate}T${data.washTime}:00`),
      data,
    },
    select: {
      id: true,
      data: true,
    },
  });

  return NextResponse.json({ entry: normalizeEntry(entry) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  if (!isManagementRole(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await params;
  const document = await loadDocument(id, session.user.organizationId);
  if (!document) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }
  if (document.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    ids?: string[];
  };
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Не переданы строки для удаления" }, { status: 400 });
  }

  const result = await db.journalDocumentEntry.deleteMany({
    where: {
      documentId: document.id,
      id: {
        in: ids,
      },
    },
  });

  return NextResponse.json({ deleted: result.count });
}
