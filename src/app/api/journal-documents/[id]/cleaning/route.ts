import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  normalizeCleaningDocumentConfig,
  buildCleaningAutoFillEntries,
} from "@/lib/cleaning-document";
import { toDateKey } from "@/lib/hygiene-document";

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
    action?: string;
  };

  if (body.action !== "apply_auto_fill") {
    return NextResponse.json({ error: "Неверное действие" }, { status: 400 });
  }

  if (!["owner", "technologist"].includes(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const document = await db.journalDocument.findUnique({
    where: { id },
    include: {
      template: true,
      entries: {
        orderBy: [{ date: "asc" }],
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

  // Load org users for resolving responsible names
  const orgUsers = await db.user.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true, name: true },
  });

  const users = orgUsers.map((u) => ({ id: u.id, name: u.name ?? "" }));

  const generatedEntries = buildCleaningAutoFillEntries({
    config,
    dateFrom: toDateKey(document.dateFrom),
    dateTo: toDateKey(document.dateTo),
    users,
  });

  // Build a set of existing date keys
  const existingDateKeys = new Set(
    document.entries.map((entry) => toDateKey(entry.date))
  );

  const sentinelEmployeeId = users[0]?.id ?? "system";

  const toCreate = generatedEntries
    .filter((entry) => !existingDateKeys.has(entry.date))
    .map((entry) => ({
      documentId: document.id,
      employeeId: sentinelEmployeeId,
      date: new Date(entry.date),
      data: entry.data,
    }));

  if (toCreate.length > 0) {
    await db.journalDocumentEntry.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ created: toCreate.length });
}
