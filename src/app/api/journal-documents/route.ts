import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildColdEquipmentConfigFromEquipment,
  COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE,
} from "@/lib/cold-equipment-document";
import {
  CLIMATE_DOCUMENT_TEMPLATE_CODE,
  getDefaultClimateDocumentConfig,
} from "@/lib/climate-document";
import {
  buildCleaningConfigFromAreas,
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  getDefaultCleaningResponsibleIds,
} from "@/lib/cleaning-document";
import {
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  buildFinishedProductConfigFromUsers,
} from "@/lib/finished-product-document";
import { getHygienePositionLabel } from "@/lib/hygiene-document";
import { ACCEPTANCE_DOCUMENT_TEMPLATE_CODE, getAcceptanceDocumentDefaultConfig } from "@/lib/acceptance-document";
import {
  PPE_ISSUANCE_TEMPLATE_CODE,
  getPpeIssuanceDefaultConfig,
} from "@/lib/ppe-issuance-document";
import {
  buildRegisterDocumentConfigFromUsers,
  isRegisterDocumentTemplate,
} from "@/lib/register-document";
import { SANITATION_DAY_TEMPLATE_CODE, getSanitationDayDefaultConfig } from "@/lib/sanitation-day-document";
import { TRAINING_PLAN_TEMPLATE_CODE, getTrainingPlanDefaultConfig } from "@/lib/training-plan-document";
import { BREAKDOWN_HISTORY_TEMPLATE_CODE, getBreakdownHistoryDefaultConfig } from "@/lib/breakdown-history-document";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const templateCode = searchParams.get("templateCode");
  const status = searchParams.get("status") || "active";

  if (!templateCode) {
    return NextResponse.json({ error: "templateCode обязателен" }, { status: 400 });
  }

  const template = await db.journalTemplate.findUnique({ where: { code: templateCode } });
  if (!template) return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });

  const documents = await db.journalDocument.findMany({
    where: {
      organizationId: session.user.organizationId,
      templateId: template.id,
      status,
    },
    orderBy: { dateFrom: "desc" },
    include: {
      _count: { select: { entries: true } },
    },
  });

  return NextResponse.json({ documents, template });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  if (!["owner", "technologist"].includes(session.user.role)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json();
  const { templateCode, title, dateFrom, dateTo, responsibleUserId, responsibleTitle, config } = body;

  if (!templateCode || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "templateCode, dateFrom, dateTo обязательны" },
      { status: 400 }
    );
  }

  const template = await db.journalTemplate.findUnique({ where: { code: templateCode } });
  if (!template) return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });

  const coldEquipmentConfig =
    templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
      ? buildColdEquipmentConfigFromEquipment(
          await db.equipment.findMany({
            where: {
              area: {
                organizationId: session.user.organizationId,
              },
            },
            select: {
              id: true,
              name: true,
              type: true,
              tempMin: true,
              tempMax: true,
            },
            orderBy: { name: "asc" },
          })
        )
      : undefined;

  const cleaningUsers =
    templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
      ? await db.user.findMany({
          where: {
            organizationId: session.user.organizationId,
            isActive: true,
          },
          select: {
            id: true,
            role: true,
          },
          orderBy: [{ role: "asc" }, { id: "asc" }],
        })
      : [];

  const allUsers = await db.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      role: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const cleaningAreas =
    templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
      ? await db.area.findMany({
          where: {
            organizationId: session.user.organizationId,
          },
          select: {
            id: true,
            name: true,
          },
          orderBy: { name: "asc" },
        })
      : [];

  const cleaningDefaults =
    templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
      ? getDefaultCleaningResponsibleIds(cleaningUsers)
      : null;

  const initialConfig =
    templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
      ? coldEquipmentConfig
      : templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE
      ? getDefaultClimateDocumentConfig()
      : templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
      ? buildCleaningConfigFromAreas(cleaningAreas, cleaningDefaults || undefined)
      : templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE
      ? buildFinishedProductConfigFromUsers(allUsers)
      : templateCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE
      ? getAcceptanceDocumentDefaultConfig(allUsers)
      : templateCode === PPE_ISSUANCE_TEMPLATE_CODE
      ? getPpeIssuanceDefaultConfig(allUsers)
      : templateCode === SANITATION_DAY_TEMPLATE_CODE
      ? getSanitationDayDefaultConfig()
      : templateCode === TRAINING_PLAN_TEMPLATE_CODE
      ? getTrainingPlanDefaultConfig()
      : templateCode === BREAKDOWN_HISTORY_TEMPLATE_CODE
      ? getBreakdownHistoryDefaultConfig()
      : isRegisterDocumentTemplate(templateCode)
      ? buildRegisterDocumentConfigFromUsers(allUsers)
      : undefined;

  const cleaningControlRole =
    templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
      ? cleaningUsers.find(
          (user) => user.id === (responsibleUserId || cleaningDefaults?.responsibleControlUserId)
        )?.role || null
      : null;

  const doc = await db.journalDocument.create({
    data: {
      templateId: template.id,
      organizationId: session.user.organizationId,
      title: title || template.name,
      config: config ?? initialConfig ?? undefined,
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
      responsibleUserId:
        responsibleUserId ||
        (templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
          ? cleaningDefaults?.responsibleControlUserId || null
          : null),
      responsibleTitle:
        responsibleTitle ||
        (templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
          ? getHygienePositionLabel(cleaningControlRole || "owner")
          : null),
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
