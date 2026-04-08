import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildCleaningAutoFillRows,
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  createEmptyCleaningEntryData,
  normalizeCleaningDocumentConfig,
} from "@/lib/cleaning-document";
import { toDateKey } from "@/lib/hygiene-document";

type CleaningAction = "apply_auto_fill" | "save_cell" | "sync_rows";

function toDateOnly(value: string) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
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
  const body = (await request.json().catch(() => ({}))) as {
    action?: CleaningAction;
    rowId?: string;
    date?: string;
    mark?: "routine" | "general" | null;
    removedRowIds?: string[];
  };

  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "Не указано действие" }, { status: 400 });
  }

  const document = await db.journalDocument.findUnique({
    where: { id },
    include: {
      template: true,
      entries: {
        orderBy: [{ employeeId: "asc" }, { date: "asc" }],
      },
    },
  });

  if (!document || document.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }

  if (document.template.code !== CLEANING_DOCUMENT_TEMPLATE_CODE) {
    return NextResponse.json({ error: "Неверный тип документа" }, { status: 400 });
  }

  if (document.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const config = normalizeCleaningDocumentConfig(document.config);

  if (action === "save_cell") {
    if (!body.rowId || !body.date) {
      return NextResponse.json({ error: "rowId и date обязательны" }, { status: 400 });
    }

    const hasRow = config.rows.some((row) => row.id === body.rowId);
    if (!hasRow) {
      return NextResponse.json({ error: "Строка не найдена в конфигурации" }, { status: 400 });
    }

    const dateKey = body.date;
    const documentFrom = toDateKey(document.dateFrom);
    const documentTo = toDateKey(document.dateTo);
    if (dateKey < documentFrom || dateKey > documentTo) {
      return NextResponse.json({ error: "Дата вне периода документа" }, { status: 400 });
    }

    const date = toDateOnly(dateKey);

    if (!body.mark) {
      const result = await db.journalDocumentEntry.deleteMany({
        where: {
          documentId: document.id,
          employeeId: body.rowId,
          date,
        },
      });

      return NextResponse.json({ deleted: result.count });
    }

    const entry = await db.journalDocumentEntry.upsert({
      where: {
        documentId_employeeId_date: {
          documentId: document.id,
          employeeId: body.rowId,
          date,
        },
      },
      update: {
        data: createEmptyCleaningEntryData(body.mark),
      },
      create: {
        documentId: document.id,
        employeeId: body.rowId,
        date,
        data: createEmptyCleaningEntryData(body.mark),
      },
    });

    return NextResponse.json({ entry });
  }

  if (!["owner", "technologist"].includes(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  if (action === "sync_rows") {
    const removedRowIds = Array.isArray(body.removedRowIds)
      ? body.removedRowIds.filter((item): item is string => typeof item === "string")
      : [];

    if (removedRowIds.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const result = await db.journalDocumentEntry.deleteMany({
      where: {
        documentId: document.id,
        employeeId: {
          in: removedRowIds,
        },
      },
    });

    return NextResponse.json({ deleted: result.count });
  }

  const generatedRows = buildCleaningAutoFillRows({
    config,
    dateFrom: document.dateFrom,
    dateTo: document.dateTo,
  });

  const existingKeys = new Set(
    document.entries.map((entry) => `${entry.employeeId}:${toDateKey(entry.date)}`)
  );

  const rowsToCreate = generatedRows
    .filter((row) => !existingKeys.has(`${row.employeeId}:${toDateKey(row.date)}`))
    .map((row) => ({
      documentId: document.id,
      employeeId: row.employeeId,
      date: row.date,
      data: row.data,
    }));

  if (rowsToCreate.length > 0) {
    await db.journalDocumentEntry.createMany({
      data: rowsToCreate,
      skipDuplicates: true,
    });
  }

  return NextResponse.json({
    created: rowsToCreate.length,
    updated: 0,
  });
}
