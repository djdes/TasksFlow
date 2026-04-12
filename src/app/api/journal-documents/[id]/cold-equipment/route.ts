import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE,
  buildColdEquipmentAutoFillEntryData,
  buildColdEquipmentAutoFillRows,
  mergeColdEquipmentEntryData,
  normalizeColdEquipmentDocumentConfig,
  normalizeColdEquipmentEntryData,
  syncColdEquipmentEntryDataWithConfig,
} from "@/lib/cold-equipment-document";
import { toDateKey } from "@/lib/hygiene-document";
import { isManagementRole, pickPrimaryManager } from "@/lib/user-roles";

type ColdEquipmentAction = "apply_auto_fill" | "sync_entries";

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
  const body = (await request.json()) as { action?: ColdEquipmentAction };
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

  if (document.template.code !== COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE) {
    return NextResponse.json({ error: "Неверный тип документа" }, { status: 400 });
  }

  if (document.status === "closed") {
    return NextResponse.json(
      { error: "Закрытый документ нельзя изменять" },
      { status: 400 }
    );
  }

  const config = normalizeColdEquipmentDocumentConfig(document.config);
  const entriesByDate = new Map<string, (typeof document.entries)>();

  document.entries.forEach((entry) => {
    const dateKey = toDateKey(entry.date);
    const bucket = entriesByDate.get(dateKey);
    if (bucket) {
      bucket.push(entry);
      return;
    }
    entriesByDate.set(dateKey, [entry]);
  });

  const duplicateDateKeys = Array.from(entriesByDate.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([dateKey]) => dateKey);

  if (duplicateDateKeys.length > 0) {
    return NextResponse.json(
      {
        error:
          duplicateDateKeys.length === 1
            ? `Обнаружено несколько строк с датой ${duplicateDateKeys[0]}. Удалите дубликаты и повторите действие.`
            : `Обнаружены дублирующиеся строки по датам: ${duplicateDateKeys.join(", ")}. Удалите дубликаты и повторите действие.`,
      },
      { status: 409 }
    );
  }

  if (action === "sync_entries") {
    await Promise.all(
      document.entries.map((entry) =>
        db.journalDocumentEntry.update({
          where: { id: entry.id },
          data: {
            data: syncColdEquipmentEntryDataWithConfig(
              normalizeColdEquipmentEntryData(entry.data),
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

  const generatedRows = buildColdEquipmentAutoFillRows({
    config,
    dateFrom: document.dateFrom,
    dateTo: document.dateTo,
    responsibleTitle: document.responsibleTitle,
    responsibleUserId,
  });

  const existingByDate = new Map<string, (typeof document.entries)[number]>(
    Array.from(entriesByDate.entries()).map(([dateKey, entries]) => [dateKey, entries[0]])
  );

  const rowsToCreate = generatedRows
    .filter((row) => !existingByDate.has(toDateKey(row.date)))
    .map((row) => ({
      documentId: document.id,
      employeeId: row.employeeId,
      date: row.date,
      data: row.data,
    }));

  const rowsToUpdate = generatedRows.reduce<Promise<unknown>[]>((acc, row) => {
      const existing = existingByDate.get(toDateKey(row.date));
      if (!existing) {
        return acc;
      }

      const merged = mergeColdEquipmentEntryData(
        syncColdEquipmentEntryDataWithConfig(
          normalizeColdEquipmentEntryData(existing.data),
          config
        ),
        buildColdEquipmentAutoFillEntryData({
          config,
          dateKey: toDateKey(row.date),
          responsibleTitle: document.responsibleTitle,
        })
      );

      acc.push(
        db.journalDocumentEntry.update({
          where: { id: existing.id },
          data: {
            employeeId: responsibleUserId,
            data: merged,
          },
        })
      );

      return acc;
    }, []);

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
