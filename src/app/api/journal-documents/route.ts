import type { Prisma } from "@prisma/client";
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
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  defaultCleaningDocumentConfig,
  getDefaultCleaningResponsibleIds,
  normalizeCleaningDocumentConfig,
} from "@/lib/cleaning-document";
import {
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  buildFinishedProductConfigFromUsers,
} from "@/lib/finished-product-document";
import {
  PRODUCT_WRITEOFF_TEMPLATE_CODE,
  buildProductWriteoffConfigFromData,
} from "@/lib/product-writeoff-document";
import {
  GLASS_LIST_TEMPLATE_CODE,
  buildGlassListConfigFromData,
} from "@/lib/glass-list-document";
import { getHygienePositionLabel } from "@/lib/hygiene-document";
import {
  getAcceptanceDocumentDefaultConfig,
  isAcceptanceDocumentTemplate,
} from "@/lib/acceptance-document";
import {
  PPE_ISSUANCE_TEMPLATE_CODE,
  getPpeIssuanceDefaultConfig,
} from "@/lib/ppe-issuance-document";
import {
  SANITATION_DAY_TEMPLATE_CODE,
  getSanitationDayDefaultConfig,
  normalizeSanitationDayConfig,
} from "@/lib/sanitation-day-document";
import {
  buildRegisterDocumentConfigFromUsers,
  isRegisterDocumentTemplate,
} from "@/lib/register-document";
import { TRAINING_PLAN_TEMPLATE_CODE, getTrainingPlanDefaultConfig } from "@/lib/training-plan-document";
import { BREAKDOWN_HISTORY_TEMPLATE_CODE, getBreakdownHistoryDefaultConfig } from "@/lib/breakdown-history-document";
import {
  ACCIDENT_DOCUMENT_TEMPLATE_CODE,
  getAccidentDocumentDefaultConfig,
} from "@/lib/accident-document";
import {
  AUDIT_PROTOCOL_TEMPLATE_CODE,
  getDefaultAuditProtocolConfig,
} from "@/lib/audit-protocol-document";
import {
  AUDIT_REPORT_TEMPLATE_CODE,
  getDefaultAuditReportConfig,
} from "@/lib/audit-report-document";
import {
  METAL_IMPURITY_TEMPLATE_CODE,
  getDefaultMetalImpurityConfig,
} from "@/lib/metal-impurity-document";
import { resolveJournalCodeAlias } from "@/lib/source-journal-map";
import {
  buildEquipmentCalibrationConfigFromEquipment,
  EQUIPMENT_CALIBRATION_TEMPLATE_CODE,
  normalizeEquipmentCalibrationConfig,
} from "@/lib/equipment-calibration-document";
import {
  CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE,
  getDefaultCleaningVentilationConfig,
  normalizeCleaningVentilationConfig,
} from "@/lib/cleaning-ventilation-checklist-document";
import {
  defaultSdcConfig,
  isSanitaryDayChecklistTemplate,
} from "@/lib/sanitary-day-checklist-document";
import { isManagementRole, pickPrimaryManager } from "@/lib/user-roles";
import {
  normalizeJournalStaffBoundConfig,
  reconcileResponsibleAssignment,
} from "@/lib/journal-staff-binding";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const templateCode = searchParams.get("templateCode");
  const status = searchParams.get("status") || "active";

  if (!templateCode) {
    return NextResponse.json({ error: "templateCode обязателен" }, { status: 400 });
  }

  const resolvedTemplateCode = resolveJournalCodeAlias(templateCode);
  const template = await db.journalTemplate.findUnique({ where: { code: resolvedTemplateCode } });
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

  if (!isManagementRole(session.user.role)) {
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

  const resolvedTemplateCode = resolveJournalCodeAlias(templateCode);
  const template = await db.journalTemplate.findUnique({ where: { code: resolvedTemplateCode } });
  if (!template) return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });

  const coldEquipmentConfig =
    resolvedTemplateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
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
    resolvedTemplateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
      ? await db.user.findMany({
          where: {
            organizationId: session.user.organizationId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            role: true,
            positionTitle: true,
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
      positionTitle: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const allProducts =
    resolvedTemplateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE ||
    resolvedTemplateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE ||
    resolvedTemplateCode === GLASS_LIST_TEMPLATE_CODE ||
    resolvedTemplateCode === METAL_IMPURITY_TEMPLATE_CODE
      ? await db.product.findMany({
          where: {
            organizationId: session.user.organizationId,
            isActive: true,
          },
          select: {
            name: true,
          },
          orderBy: { name: "asc" },
        })
      : [];

  const metalSuppliers =
    resolvedTemplateCode === METAL_IMPURITY_TEMPLATE_CODE
      ? await db.batch.findMany({
          where: {
            organizationId: session.user.organizationId,
            supplier: { not: null },
          },
          select: {
            supplier: true,
          },
          orderBy: { supplier: "asc" },
          distinct: ["supplier"],
        })
      : [];

  const recentBatches =
    resolvedTemplateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE
      ? await db.batch.findMany({
          where: {
            organizationId: session.user.organizationId,
          },
          select: {
            code: true,
            productName: true,
            supplier: true,
            quantity: true,
            unit: true,
            receivedAt: true,
          },
          orderBy: { receivedAt: "desc" },
          take: 10,
        })
      : [];

  const allAreas =
    resolvedTemplateCode === GLASS_LIST_TEMPLATE_CODE
      ? await db.area.findMany({
          where: {
            organizationId: session.user.organizationId,
          },
          select: {
            name: true,
          },
          orderBy: { name: "asc" },
        })
      : [];

  const allEquipment =
    resolvedTemplateCode === GLASS_LIST_TEMPLATE_CODE
      ? await db.equipment.findMany({
          where: {
            area: {
              organizationId: session.user.organizationId,
            },
          },
          select: {
            name: true,
          },
          orderBy: { name: "asc" },
        })
      : [];

  const cleaningAreas =
    resolvedTemplateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
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
    resolvedTemplateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
      ? getDefaultCleaningResponsibleIds(cleaningUsers)
      : null;

  const equipmentCalibrationSource =
    resolvedTemplateCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE
      ? await db.equipment.findMany({
          where: {
            area: {
              organizationId: session.user.organizationId,
            },
          },
          select: {
            id: true,
            name: true,
            type: true,
            serialNumber: true,
            tempMin: true,
            tempMax: true,
            area: {
              select: {
                name: true,
              },
            },
          },
          orderBy: [{ area: { name: "asc" } }, { name: "asc" }],
        })
      : [];

  const rawConfig =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : undefined;

  const calibrationYear = Number(String(dateFrom).slice(0, 4)) || new Date().getUTCFullYear();
  const calibrationOwner = pickPrimaryManager(allUsers);
  const calibrationProvidedRows =
    rawConfig && Array.isArray(rawConfig.rows) && rawConfig.rows.length > 0
      ? normalizeEquipmentCalibrationConfig(rawConfig).rows
      : null;
  const equipmentCalibrationConfig =
    resolvedTemplateCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE
      ? (() => {
          const built = buildEquipmentCalibrationConfigFromEquipment(
            equipmentCalibrationSource,
            {
              ...rawConfig,
              year: calibrationYear,
            }
          );

          return {
            ...built,
            year: calibrationYear,
            approveEmployee: built.approveEmployee || calibrationOwner?.name || "",
            rows: calibrationProvidedRows || built.rows,
          };
        })()
      : undefined;

  const initialConfig =
    resolvedTemplateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
      ? coldEquipmentConfig
      : resolvedTemplateCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE
      ? equipmentCalibrationConfig
      : resolvedTemplateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE
      ? getDefaultClimateDocumentConfig()
      : resolvedTemplateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
      ? normalizeCleaningDocumentConfig(rawConfig ?? defaultCleaningDocumentConfig(cleaningUsers, cleaningAreas), {
          users: cleaningUsers,
          areas: cleaningAreas,
        })
      : resolvedTemplateCode === CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE
      ? normalizeCleaningVentilationConfig(
          rawConfig ?? getDefaultCleaningVentilationConfig(allUsers),
          allUsers
        )
      : resolvedTemplateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE
      ? buildFinishedProductConfigFromUsers(
          allUsers,
          allProducts.map((product) => product.name)
        )
      : resolvedTemplateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE
      ? buildProductWriteoffConfigFromData({
          users: allUsers,
          products: allProducts,
          batches: recentBatches,
          referenceDate: new Date(dateFrom),
        })
      : resolvedTemplateCode === GLASS_LIST_TEMPLATE_CODE
      ? buildGlassListConfigFromData({
          users: allUsers,
          areas: allAreas,
          equipment: allEquipment,
          products: allProducts,
          referenceDate: new Date(dateFrom),
        })
      : isAcceptanceDocumentTemplate(resolvedTemplateCode)
      ? getAcceptanceDocumentDefaultConfig(allUsers)
      : resolvedTemplateCode === PPE_ISSUANCE_TEMPLATE_CODE
      ? getPpeIssuanceDefaultConfig(allUsers)
      : resolvedTemplateCode === SANITATION_DAY_TEMPLATE_CODE
      ? getSanitationDayDefaultConfig(new Date(dateFrom))
      : resolvedTemplateCode === TRAINING_PLAN_TEMPLATE_CODE
      ? getTrainingPlanDefaultConfig()
      : resolvedTemplateCode === BREAKDOWN_HISTORY_TEMPLATE_CODE
      ? getBreakdownHistoryDefaultConfig()
      : resolvedTemplateCode === ACCIDENT_DOCUMENT_TEMPLATE_CODE
      ? getAccidentDocumentDefaultConfig()
      : resolvedTemplateCode === AUDIT_PROTOCOL_TEMPLATE_CODE
      ? getDefaultAuditProtocolConfig()
      : resolvedTemplateCode === AUDIT_REPORT_TEMPLATE_CODE
      ? getDefaultAuditReportConfig()
      : resolvedTemplateCode === METAL_IMPURITY_TEMPLATE_CODE
      ? getDefaultMetalImpurityConfig({
          users: allUsers,
          materials: allProducts.map((item) => item.name).filter(Boolean),
          suppliers: metalSuppliers
            .map((item) => item.supplier || "")
            .filter(Boolean),
          date: typeof dateFrom === "string" ? dateFrom : new Date(dateFrom).toISOString().slice(0, 10),
          responsibleName:
            rawConfig && typeof rawConfig.responsibleEmployee === "string"
              ? rawConfig.responsibleEmployee
              : undefined,
          responsiblePosition:
            rawConfig && typeof rawConfig.responsiblePosition === "string"
              ? rawConfig.responsiblePosition
              : undefined,
        })
      : isSanitaryDayChecklistTemplate(resolvedTemplateCode)
      ? rawConfig ?? defaultSdcConfig()
      : isRegisterDocumentTemplate(resolvedTemplateCode)
      ? buildRegisterDocumentConfigFromUsers(allUsers)
      : undefined;

  const normalizedStaffConfig = normalizeJournalStaffBoundConfig(
    resolvedTemplateCode,
    config ?? initialConfig ?? undefined,
    allUsers
  );

  const cleaningControlRole =
    resolvedTemplateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
      ? cleaningUsers.find(
          (user) =>
            user.id ===
            (responsibleUserId ||
              (initialConfig as { controlResponsibles?: Array<{ userId?: string }> } | undefined)
                ?.controlResponsibles?.[0]?.userId ||
              cleaningDefaults?.responsibleControlUserId)
        )?.role || null
      : null;

  const responsible = reconcileResponsibleAssignment(allUsers, {
    responsibleUserId,
    responsibleTitle:
      responsibleTitle ||
      (resolvedTemplateCode === GLASS_LIST_TEMPLATE_CODE
        ? ((initialConfig as { responsibleTitle?: string } | undefined)?.responsibleTitle || null)
        : null) ||
      (resolvedTemplateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
        ? ((initialConfig as { controlResponsibles?: Array<{ title?: string }> } | undefined)
            ?.controlResponsibles?.[0]?.title ||
          getHygienePositionLabel(cleaningControlRole || "owner"))
        : null),
  });

  const doc = await db.journalDocument.create({
    data: {
      templateId: template.id,
      organizationId: session.user.organizationId,
      title: title || template.name,
      config: (
        resolvedTemplateCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE
          ? equipmentCalibrationConfig
          : resolvedTemplateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
          ? normalizeCleaningDocumentConfig(rawConfig ?? initialConfig, {
              users: cleaningUsers,
              areas: cleaningAreas,
            })
          : resolvedTemplateCode === CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE
          ? normalizeCleaningVentilationConfig(rawConfig ?? initialConfig, allUsers)
          : resolvedTemplateCode === SANITATION_DAY_TEMPLATE_CODE
          ? normalizedStaffConfig
          : resolvedTemplateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE
          ? normalizeJournalStaffBoundConfig(
              resolvedTemplateCode,
              {
                ...(((initialConfig as Record<string, unknown>) || {}) as Record<string, unknown>),
                ...((rawConfig || {}) as Record<string, unknown>),
              },
              allUsers
            )
          : resolvedTemplateCode === GLASS_LIST_TEMPLATE_CODE
          ? {
              ...(((initialConfig as Record<string, unknown>) || {}) as Record<string, unknown>),
              ...((rawConfig || {}) as Record<string, unknown>),
            }
          : normalizedStaffConfig
      ) as Prisma.InputJsonValue | undefined,
      dateFrom: new Date(dateFrom),
      dateTo: new Date(dateTo),
      responsibleUserId:
        responsible.responsibleUserId ||
        (resolvedTemplateCode === GLASS_LIST_TEMPLATE_CODE
          ? ((initialConfig as { responsibleUserId?: string } | undefined)?.responsibleUserId || null)
          : null) ||
        (resolvedTemplateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
          ? ((initialConfig as { controlResponsibles?: Array<{ userId?: string }> } | undefined)
              ?.controlResponsibles?.[0]?.userId ||
            cleaningDefaults?.responsibleControlUserId ||
            null)
          : null),
      responsibleTitle: responsible.responsibleTitle,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
