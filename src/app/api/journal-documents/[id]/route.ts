import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CLIMATE_DOCUMENT_TEMPLATE_CODE,
  normalizeClimateDocumentConfig,
} from "@/lib/climate-document";
import {
  COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE,
  normalizeColdEquipmentDocumentConfig,
} from "@/lib/cold-equipment-document";
import {
  TRAINING_PLAN_TEMPLATE_CODE,
  normalizeTrainingPlanConfig,
} from "@/lib/training-plan-document";
import {
  SANITATION_DAY_TEMPLATE_CODE,
  normalizeSanitationDayConfig,
} from "@/lib/sanitation-day-document";
import {
  normalizeJournalStaffBoundConfig,
  reconcileResponsibleAssignment,
} from "@/lib/journal-staff-binding";

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

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
    select: { id: true, name: true, role: true, positionTitle: true },
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
  const needsTemplateLookup =
    doc.templateId &&
    (body.config !== undefined ||
      body.responsibleTitle !== undefined ||
      body.responsibleUserId !== undefined);
  const template = needsTemplateLookup
    ? await db.journalTemplate.findUnique({
        where: { id: doc.templateId },
        select: { code: true },
      })
    : null;
  const allUsers =
    needsTemplateLookup
      ? await db.user.findMany({
          where: {
            organizationId: session.user.organizationId,
            isActive: true,
          },
          select: { id: true, name: true, role: true, positionTitle: true },
          orderBy: [{ role: "asc" }, { name: "asc" }],
        })
      : [];

  if (
    doc.status === "closed" &&
    [
      "title",
      "autoFill",
      "responsibleTitle",
      "responsibleUserId",
      "config",
      "dateFrom",
      "dateTo",
    ].some((key) => body[key] !== undefined)
  ) {
    return NextResponse.json(
      { error: "Закрытый документ нельзя редактировать до перевода в активные" },
      { status: 400 }
    );
  }

  if (body.status !== undefined && !["active", "closed"].includes(body.status)) {
    return NextResponse.json({ error: "Некорректный статус документа" }, { status: 400 });
  }

  const nextDateFrom = body.dateFrom !== undefined ? new Date(body.dateFrom) : new Date(doc.dateFrom);
  const nextDateTo = body.dateTo !== undefined ? new Date(body.dateTo) : new Date(doc.dateTo);

  if (!isValidDate(nextDateFrom) || !isValidDate(nextDateTo)) {
    return NextResponse.json({ error: "Некорректный период документа" }, { status: 400 });
  }

  if (nextDateFrom > nextDateTo) {
    return NextResponse.json(
      { error: "Дата начала не может быть позже даты окончания" },
      { status: 400 }
    );
  }

  if (body.config !== undefined && template?.code) {
    if (template.code === CLIMATE_DOCUMENT_TEMPLATE_CODE) {
      data.config = normalizeClimateDocumentConfig(body.config);
    } else if (template.code === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE) {
      data.config = normalizeColdEquipmentDocumentConfig(body.config);
    } else if (template.code === TRAINING_PLAN_TEMPLATE_CODE) {
      data.config = normalizeJournalStaffBoundConfig(
        template.code,
        normalizeTrainingPlanConfig(body.config),
        allUsers
      );
    } else if (template.code === SANITATION_DAY_TEMPLATE_CODE) {
      const normalized = normalizeJournalStaffBoundConfig(
        template.code,
        normalizeSanitationDayConfig(body.config),
        allUsers
      ) as Record<string, unknown>;
      data.config = {
        ...normalized,
        year:
          typeof normalized.year === "number"
            ? normalized.year
            : nextDateFrom.getUTCFullYear(),
        documentDate:
          typeof normalized.documentDate === "string" && normalized.documentDate
            ? normalized.documentDate
            : nextDateFrom.toISOString().slice(0, 10),
      };
    } else {
      data.config = normalizeJournalStaffBoundConfig(
        template.code,
        body.config,
        allUsers
      );
    }
  }

  if (
    body.responsibleTitle !== undefined ||
    body.responsibleUserId !== undefined
  ) {
    const reconciled = reconcileResponsibleAssignment(allUsers, {
      responsibleUserId:
        body.responsibleUserId !== undefined
          ? body.responsibleUserId
          : doc.responsibleUserId,
      responsibleTitle:
        body.responsibleTitle !== undefined
          ? body.responsibleTitle
          : doc.responsibleTitle,
    });

    data.responsibleUserId = reconciled.responsibleUserId;
    data.responsibleTitle = reconciled.responsibleTitle;
  }

  if (body.title !== undefined) data.title = body.title;
  if (body.status !== undefined) data.status = body.status;
  if (body.autoFill !== undefined) data.autoFill = body.autoFill;
  if (body.config !== undefined && data.config === undefined) data.config = body.config;
  if (body.dateFrom !== undefined) data.dateFrom = nextDateFrom;
  if (body.dateTo !== undefined) data.dateTo = nextDateTo;

  const updated = await db.journalDocument.update({ where: { id }, data });
  return NextResponse.json({ document: updated });
}

export async function DELETE(
  _request: Request,
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

  await db.journalDocument.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
