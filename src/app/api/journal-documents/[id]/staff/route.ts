import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildDateKeys,
  getDefaultEntryDataForTemplate,
  isEntryDataEmpty,
} from "@/lib/hygiene-document";

type StaffAction =
  | "add_employee"
  | "fill_from_list"
  | "apply_auto_fill";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  if (!["owner", "technologist"].includes(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id: documentId } = await params;
  const document = await db.journalDocument.findUnique({
    where: { id: documentId },
    include: {
      template: true,
      entries: true,
    },
  });

  if (!document || document.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  }

  if (document.status === "closed") {
    return NextResponse.json({ error: "Документ закрыт" }, { status: 400 });
  }

  const body = (await request.json()) as {
    action?: StaffAction;
    employeeId?: string;
    category?: string;
  };

  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "Не указано действие" }, { status: 400 });
  }

  const users = await db.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    select: { id: true, role: true },
  });

  const dateKeys = buildDateKeys(document.dateFrom, document.dateTo);
  const defaultData = getDefaultEntryDataForTemplate(document.template.code);

  if (action === "apply_auto_fill") {
    const allRows = users.flatMap((user) =>
      dateKeys.map((dateKey) => ({
        documentId,
        employeeId: user.id,
        date: new Date(dateKey),
        data: defaultData,
      }))
    );

    const created = await db.journalDocumentEntry.createMany({
      data: allRows,
      skipDuplicates: true,
    });

    const rowsToUpdate = document.entries.filter((entry) => isEntryDataEmpty(entry.data));

    await Promise.all(
      rowsToUpdate.map((entry) =>
        db.journalDocumentEntry.update({
          where: { id: entry.id },
          data: { data: defaultData },
        })
      )
    );

    return NextResponse.json({ updated: rowsToUpdate.length, created: created.count });
  }

  let targetUserIds: string[] = [];

  if (action === "add_employee") {
    if (!body.employeeId) {
      return NextResponse.json({ error: "Не указан сотрудник" }, { status: 400 });
    }

    const user = users.find((item) => item.id === body.employeeId);
    if (!user) {
      return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
    }

    targetUserIds = [user.id];
  }

  if (action === "fill_from_list") {
    const category = body.category || "all";
    if (category === "all") {
      targetUserIds = users.map((user) => user.id);
    } else if (category.startsWith("role:")) {
      const role = category.replace("role:", "");
      targetUserIds = users.filter((user) => user.role === role).map((user) => user.id);
    }
  }

  if (targetUserIds.length === 0) {
    return NextResponse.json({ created: 0, skipped: true });
  }

  const rows = targetUserIds.flatMap((employeeId) =>
    dateKeys.map((dateKey) => ({
      documentId,
      employeeId,
      date: new Date(dateKey),
      data: document.autoFill ? defaultData : {},
    }))
  );

  const result = await db.journalDocumentEntry.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return NextResponse.json({ created: result.count });
}
