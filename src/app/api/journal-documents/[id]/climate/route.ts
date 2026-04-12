import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CLIMATE_DOCUMENT_TEMPLATE_CODE,
  buildClimateAutoFillEntryData,
  buildClimateAutoFillRows,
  mergeClimateEntryData,
  normalizeClimateDocumentConfig,
  normalizeClimateEntryData,
  syncClimateEntryDataWithConfig,
} from "@/lib/climate-document";
import { toDateKey } from "@/lib/hygiene-document";
import { isManagementRole, pickPrimaryManager } from "@/lib/user-roles";

type ClimateAction = "apply_auto_fill" | "sync_entries";

export async function POST(
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
  const body = (await request.json()) as { action?: ClimateAction };
  const action = body.action;

  if (!action) {
    return NextResponse.json({ error: "Не указано действие" }, { status: 400 });
  }

  const document = await db.journalDocument.findUnique({
    where: { id },
    include: {
      template: true,
      entries: {
        orderBy: [{ date: "asc" }, { employeeId: "asc" }],
      },
    },
  });

  if (!document || document.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }

  if (document.template.code !== CLIMATE_DOCUMENT_TEMPLATE_CODE) {
    return NextResponse.json({ error: "Неверный тип документа" }, { status: 400 });
  }

  const config = normalizeClimateDocumentConfig(document.config);

  if (action === "sync_entries") {
    await Promise.all(
      document.entries.map((entry) =>
        db.journalDocumentEntry.update({
          where: { id: entry.id },
          data: {
            data: syncClimateEntryDataWithConfig(
              normalizeClimateEntryData(entry.data),
              config
            ),
          },
        })
      )
    );

    return NextResponse.json({ updated: document.entries.length });
  }

  const users = await db.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    select: { id: true, role: true },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });

  const responsibleUserId =
    document.responsibleUserId || pickPrimaryManager(users)?.id;

  if (!responsibleUserId) {
    return NextResponse.json(
      { error: "Нет активного сотрудника для автозаполнения" },
      { status: 400 }
    );
  }

  const generatedRows = buildClimateAutoFillRows({
    config,
    dateFrom: document.dateFrom,
    dateTo: document.dateTo,
    responsibleTitle: document.responsibleTitle,
    responsibleUserId,
  });

  const existingByKey = new Map(
    document.entries.map((entry) => [
      `${entry.employeeId}:${toDateKey(entry.date)}`,
      entry,
    ])
  );

  const rowsToCreate = generatedRows
    .filter((row) => !existingByKey.has(`${row.employeeId}:${toDateKey(row.date)}`))
    .map((row) => ({
      documentId: document.id,
      employeeId: row.employeeId,
      date: row.date,
      data: row.data,
    }));

  const rowsToUpdate = generatedRows.flatMap((row) => {
    const key = `${row.employeeId}:${toDateKey(row.date)}`;
    const existing = existingByKey.get(key);
    if (!existing) return [];

    const merged = mergeClimateEntryData(
      syncClimateEntryDataWithConfig(normalizeClimateEntryData(existing.data), config),
      buildClimateAutoFillEntryData({
        config,
        dateKey: toDateKey(row.date),
        responsibleTitle: document.responsibleTitle,
      })
    );

    return [
      db.journalDocumentEntry.update({
        where: { id: existing.id },
        data: { data: merged },
      }),
    ];
  });

  if (rowsToCreate.length > 0) {
    await db.journalDocumentEntry.createMany({
      data: rowsToCreate,
      skipDuplicates: true,
    });
  }

  if (rowsToUpdate.length > 0) {
    await Promise.all(rowsToUpdate);
  }

  return NextResponse.json({
    created: rowsToCreate.length,
    updated: rowsToUpdate.length,
  });
}
