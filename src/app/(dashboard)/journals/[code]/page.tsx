import type React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Prisma } from "@prisma/client";
import { getActiveOrgId, requireAuth } from "@/lib/auth-helpers";
import { aclActorFromSession, hasJournalAccess } from "@/lib/journal-acl";
import { db } from "@/lib/db";
import { HygieneDocumentsClient } from "@/components/journals/hygiene-documents-client";
import { HealthDocumentsClient } from "@/components/journals/health-documents-client";
import { TodayPendingBanner } from "@/components/journals/today-pending-banner";
import { isTemplateFilledToday } from "@/lib/today-compliance";
import {
  buildDateKeys,
  buildExampleHygieneEntryMap,
  buildHygieneExampleEmployees,
  getHygieneDemoTeamUsers,
  getHygienePositionLabel,
  getHealthSeedDocumentConfigs,
  getHygieneDefaultResponsibleTitle,
  getHygieneSeedDocumentConfigs,
} from "@/lib/hygiene-document";
import {
  getJournalDocumentDefaultTitle,
  getJournalDocumentPeriodLabel,
  isDocumentTemplate,
} from "@/lib/journal-document-helpers";
import {
  buildFinishedProductArchiveSeed,
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
} from "@/lib/finished-product-document";
import { FinishedProductDocumentsClient } from "@/components/journals/finished-product-documents-client";
import { CLIMATE_DOCUMENT_TEMPLATE_CODE } from "@/lib/climate-document";
import {
  buildColdEquipmentConfigFromEquipment,
  COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE,
} from "@/lib/cold-equipment-document";
import { ColdEquipmentDocumentsClient } from "@/components/journals/cold-equipment-documents-client";
import {
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  applyCleaningAutoFillToConfig,
  getCleaningCreatePeriodBounds,
  defaultCleaningDocumentConfig,
} from "@/lib/cleaning-document";
import { CleaningDocumentsClient } from "@/components/journals/cleaning-documents-client";
import { ComplaintDocumentsClient } from "@/components/journals/complaint-documents-client";
import {
  EQUIPMENT_CLEANING_TEMPLATE_CODE,
  getDefaultEquipmentCleaningConfig,
  getEquipmentCleaningDocumentTitle,
  getEquipmentCleaningPeriodLabel,
  normalizeEquipmentCleaningConfig,
} from "@/lib/equipment-cleaning-document";
import { TrackedDocumentsClient } from "@/components/journals/tracked-documents-client";
import {
  getTrackedDocumentCreateMode,
  isSourceStyleTrackedTemplate,
  isTrackedDocumentTemplate,
} from "@/lib/tracked-document";
import {
  COMPLAINT_REGISTER_TEMPLATE_CODE,
  COMPLAINT_REGISTER_TITLE,
  normalizeComplaintConfig,
} from "@/lib/complaint-document";
import { UvLampRuntimeDocumentsClient } from "@/components/journals/uv-lamp-runtime-documents-client";
import { resolveJournalCodeAlias } from "@/lib/source-journal-map";
import { MedBookDocumentsClient } from "@/components/journals/med-book-documents-client";
import { IncomingControlDocumentsClient } from "@/components/journals/incoming-control-documents-client";
import {
  MED_BOOK_TEMPLATE_CODE,
  MED_BOOK_DOCUMENT_TITLE,
  getDefaultMedBookConfig,
  emptyMedBookEntry,
} from "@/lib/med-book-document";
import {
  ACCEPTANCE_DOCUMENT_TEMPLATE_CODE,
  buildAcceptanceDocumentConfigFromData,
  getAcceptanceDocumentTitle,
  isAcceptanceDocumentTemplate,
  normalizeAcceptanceDocumentConfig,
} from "@/lib/acceptance-document";
import {
  PPE_ISSUANCE_DOCUMENT_TITLE,
  PPE_ISSUANCE_TEMPLATE_CODE,
  PPE_ISSUANCE_SOURCE_SLUG,
  buildPpeIssuanceDemoConfig,
} from "@/lib/ppe-issuance-document";
import {
  SANITATION_DAY_SOURCE_SLUG,
  SANITATION_DAY_TEMPLATE_CODE,
  SANITATION_DAY_DOCUMENT_TITLE,
  getSanitationDayDefaultConfig,
  getSanitationDocumentDateLabel,
  getSanitationApproveLabel,
} from "@/lib/sanitation-day-document";
import { SanitationDayDocumentsClient } from "@/components/journals/sanitation-day-documents-client";
import { PpeIssuanceDocumentsClient } from "@/components/journals/ppe-issuance-documents-client";
import {
  BREAKDOWN_HISTORY_TEMPLATE_CODE,
  BREAKDOWN_HISTORY_SOURCE_SLUG,
  BREAKDOWN_HISTORY_DOCUMENT_TITLE,
  getBreakdownHistoryDefaultConfig,
} from "@/lib/breakdown-history-document";
import { BreakdownHistoryDocumentsClient } from "@/components/journals/breakdown-history-documents-client";
import {
  ACCIDENT_DOCUMENT_TEMPLATE_CODE,
  ACCIDENT_DOCUMENT_SOURCE_SLUG,
  ACCIDENT_DOCUMENT_TITLE,
  buildAccidentDocumentDemoConfig,
} from "@/lib/accident-document";
import { AccidentDocumentsClient } from "@/components/journals/accident-documents-client";
import { EquipmentCleaningDocumentsClient } from "@/components/journals/equipment-cleaning-documents-client";
import { IntensiveCoolingDocumentsClient } from "@/components/journals/intensive-cooling-documents-client";
import {
  TRAINING_PLAN_TEMPLATE_CODE,
  TRAINING_PLAN_SOURCE_SLUG,
  TRAINING_PLAN_DOCUMENT_TITLE,
  getTrainingPlanDefaultConfig,
} from "@/lib/training-plan-document";
import { TrainingPlanDocumentsClient } from "@/components/journals/training-plan-documents-client";
import {
  AUDIT_PLAN_DOCUMENT_TITLE,
  AUDIT_PLAN_SOURCE_SLUG,
  AUDIT_PLAN_TEMPLATE_CODE,
  getAuditPlanDefaultConfig,
  normalizeAuditPlanConfig,
} from "@/lib/audit-plan-document";
import { AuditPlanDocumentsClient } from "@/components/journals/audit-plan-documents-client";
import { AuditProtocolDocumentsClient } from "@/components/journals/audit-protocol-documents-client";
import { AuditReportDocumentsClient } from "@/components/journals/audit-report-documents-client";
import {
  AUDIT_PROTOCOL_DOCUMENT_TITLE,
  AUDIT_PROTOCOL_TEMPLATE_CODE,
} from "@/lib/audit-protocol-document";
import {
  AUDIT_REPORT_DOCUMENT_TITLE,
  AUDIT_REPORT_TEMPLATE_CODE,
} from "@/lib/audit-report-document";
import {
  DISINFECTANT_TEMPLATE_CODE,
  DISINFECTANT_SOURCE_SLUG,
  DISINFECTANT_DOCUMENT_TITLE,
  getDisinfectantDefaultConfig,
} from "@/lib/disinfectant-document";
import { DisinfectantDocumentsClient } from "@/components/journals/disinfectant-documents-client";
import {
  UV_LAMP_RUNTIME_TEMPLATE_CODE,
  buildUvRuntimeDocumentTitle,
  defaultUvSpecification,
  formatRuDateDash,
  normalizeUvRuntimeDocumentConfig,
} from "@/lib/uv-lamp-runtime-document";
import { FryerOilDocumentsClient } from "@/components/journals/fryer-oil-documents-client";
import { FRYER_OIL_TEMPLATE_CODE } from "@/lib/fryer-oil-document";
import { PerishableRejectionDocumentsClient } from "@/components/journals/perishable-rejection-documents-client";
import {
  PERISHABLE_REJECTION_TEMPLATE_CODE,
  PERISHABLE_REJECTION_DOCUMENT_TITLE,
  getDefaultPerishableRejectionConfig,
} from "@/lib/perishable-rejection-document";
import { ProductWriteoffDocumentsClient } from "@/components/journals/product-writeoff-documents-client";
import {
  PRODUCT_WRITEOFF_DOCUMENT_TITLE,
  PRODUCT_WRITEOFF_TEMPLATE_CODE,
  buildProductWriteoffConfigFromData,
  normalizeProductWriteoffConfig,
} from "@/lib/product-writeoff-document";
import { GlassListDocumentsClient } from "@/components/journals/glass-list-documents-client";
import {
  GLASS_LIST_DOCUMENT_TITLE,
  GLASS_LIST_TEMPLATE_CODE,
  buildGlassListConfigFromData,
  normalizeGlassListConfig,
} from "@/lib/glass-list-document";
import { GlassControlDocumentsClient } from "@/components/journals/glass-control-documents-client";
import * as glassControlDocument from "@/lib/glass-control-document";
import { StaffTrainingDocumentsClient } from "@/components/journals/staff-training-documents-client";
import {
  STAFF_TRAINING_TEMPLATE_CODE,
  STAFF_TRAINING_DOCUMENT_TITLE,
  getDefaultStaffTrainingConfig,
  buildStaffTrainingSeedRows,
} from "@/lib/staff-training-document";
import { EquipmentMaintenanceDocumentsClient } from "@/components/journals/equipment-maintenance-documents-client";
import {
  EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE,
  EQUIPMENT_MAINTENANCE_TEMPLATE_CODE,
  getDefaultEquipmentMaintenanceConfig,
} from "@/lib/equipment-maintenance-document";
import { SanitaryDayChecklistDocumentsClient } from "@/components/journals/sanitary-day-checklist-documents-client";
import { CleaningVentilationChecklistDocumentsClient } from "@/components/journals/cleaning-ventilation-checklist-documents-client";
import {
  CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE,
  CLEANING_VENTILATION_CHECKLIST_TITLE,
  getDefaultCleaningVentilationConfig,
  getMonthBoundsFromDate as getCleaningVentilationMonthBounds,
  normalizeCleaningVentilationConfig,
} from "@/lib/cleaning-ventilation-checklist-document";
import {
  getSanitaryDayChecklistTitle,
  isSanitaryDayChecklistTemplate,
  defaultSdcConfig,
} from "@/lib/sanitary-day-checklist-document";
import { EquipmentCalibrationDocumentsClient } from "@/components/journals/equipment-calibration-documents-client";
import {
  buildEquipmentCalibrationConfigFromEquipment,
  EQUIPMENT_CALIBRATION_DOCUMENT_TITLE,
  EQUIPMENT_CALIBRATION_TEMPLATE_CODE,
} from "@/lib/equipment-calibration-document";
import { TraceabilityDocumentsClient } from "@/components/journals/traceability-documents-client";
import {
  TRACEABILITY_DOCUMENT_SOURCE_SLUG,
  TRACEABILITY_DOCUMENT_TEMPLATE_CODE,
  createTraceabilityRow,
  getDefaultTraceabilityDocumentConfig,
  normalizeTraceabilityDocumentConfig,
} from "@/lib/traceability-document";
import {
  getScanJournalConfig,
  isScanOnlyDocumentTemplate,
} from "@/lib/scan-journal-config";
import { getScanJournalPageCount } from "@/lib/scan-journal-pages";
import { ScanJournalDocumentsClient } from "@/components/journals/scan-journal-documents-client";
import {
  METAL_IMPURITY_DOCUMENT_TITLE,
  METAL_IMPURITY_SOURCE_SLUG,
  METAL_IMPURITY_TEMPLATE_CODE,
  getDefaultMetalImpurityConfig,
  normalizeMetalImpurityConfig,
} from "@/lib/metal-impurity-document";
import { MetalImpurityDocumentsClient } from "@/components/journals/metal-impurity-documents-client";
import {
  createIntensiveCoolingRow,
  getDefaultIntensiveCoolingConfig,
  getResponsibleTitleByRole,
  INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
  INTENSIVE_COOLING_SOURCE_SLUG,
  INTENSIVE_COOLING_TEMPLATE_CODE,
} from "@/lib/intensive-cooling-document";
import {
  PEST_CONTROL_DOCUMENT_TITLE,
  PEST_CONTROL_TEMPLATE_CODE,
} from "@/lib/pest-control-document";
import { getUserRoleLabel, pickPrimaryManager } from "@/lib/user-roles";

export const dynamic = "force-dynamic";
const SOURCE_STYLE_TRACKED_DEMO_CODES = new Set([
  "daily_rejection",
  "raw_storage_control",
  "defrosting_control",
  "uv_lamp_runtime",
  "fryer_oil",
]);
const DEMO_ADMIN_EMAIL = "admin@haccp.local";

type TrackedTemplateField = {
  key: string;
  type?: string;
  label?: string;
  options?: Array<{ value: string; label: string }>;
};

function isDemoSeedOrganization(users: { email?: string | null }[]) {
  return users.some((user) => user.email?.trim().toLowerCase() === DEMO_ADMIN_EMAIL);
}

function getCurrentAndPreviousMonthBounds(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();

  return {
    activeFrom: new Date(Date.UTC(year, month, 1)),
    activeTo: new Date(Date.UTC(year, month + 1, 0)),
    closedFrom: new Date(Date.UTC(year, month - 1, 1)),
    closedTo: new Date(Date.UTC(year, month, 0)),
  };
}

async function normalizeDemoJournalSampleCorpus(params: {
  templateId: string;
  organizationId: string;
  enabled: boolean;
}) {
  const { templateId, organizationId, enabled } = params;
  if (!enabled) return;

  const existing = await db.journalDocument.findMany({
    where: { templateId, organizationId },
    select: { status: true },
  });

  if (existing.length === 0) return;

  const activeCount = existing.filter((document) => document.status === "active").length;
  const closedCount = existing.filter((document) => document.status === "closed").length;

  if (existing.length === 2 && activeCount === 1 && closedCount === 1) {
    return;
  }

  // Demo normalization must never wipe user-created documents from the shared list route.
  // The downstream seeders can add missing samples without destructive resets.
  return;
}

async function ensureScanOnlySampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
  title: string;
  defaultResponsibleTitle: string | null;
  responsibleUserId: string | null;
}) {
  const {
    templateId,
    organizationId,
    createdById,
    title,
    defaultResponsibleTitle,
    responsibleUserId,
  } = params;

  const existingCount = await db.journalDocument.count({
    where: { templateId, organizationId },
  });

  if (existingCount > 0) return;

  const { activeFrom, activeTo, closedFrom, closedTo } = getCurrentAndPreviousMonthBounds();

  await db.journalDocument.createMany({
    data: [
      {
        templateId,
        organizationId,
        title,
        status: "active",
        dateFrom: activeFrom,
        dateTo: activeTo,
        responsibleTitle: defaultResponsibleTitle,
        responsibleUserId,
        createdById,
      },
      {
        templateId,
        organizationId,
        title,
        status: "closed",
        dateFrom: closedFrom,
        dateTo: closedTo,
        responsibleTitle: defaultResponsibleTitle,
        responsibleUserId,
        createdById,
      },
    ],
  });
}

async function ensureStaffJournalSampleDocuments({
  templateCode,
  organizationId,
  templateId,
  users,
  createdById,
}: {
  templateCode: string;
  organizationId: string;
  templateId: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
  createdById: string;
}) {
  const configs =
    templateCode === "health_check"
      ? getHealthSeedDocumentConfigs()
      : getHygieneSeedDocumentConfigs();

  const existingDocuments = await db.journalDocument.findMany({
    where: {
      organizationId,
      templateId,
    },
    select: {
      status: true,
      dateFrom: true,
      dateTo: true,
    },
  });

  const existingKeys = new Set(
    existingDocuments.map((document) => {
      const from = document.dateFrom.toISOString().slice(0, 10);
      const to = document.dateTo.toISOString().slice(0, 10);
      return `${document.status}:${from}:${to}`;
    })
  );

  const responsibleUser = pickPrimaryManager(users);

  for (const config of configs) {
    const key = `${config.status}:${config.dateFrom}:${config.dateTo}`;
    if (existingKeys.has(key)) continue;

    const document = await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: config.title,
        status: config.status,
        dateFrom: new Date(config.dateFrom),
        dateTo: new Date(config.dateTo),
        responsibleUserId: responsibleUser?.id || null,
        responsibleTitle: getHygieneDefaultResponsibleTitle(users),
        createdById,
      },
    });

    const sourceUsers =
      templateCode === "hygiene" && config.variant === "demo_team"
        ? getHygieneDemoTeamUsers(users)
        : users;

    const employeeIds = buildHygieneExampleEmployees(
      sourceUsers,
      templateCode === "health_check" ? 5 : 7
    )
      .filter((employee) => !employee.id.startsWith("blank-"))
      .map((employee) => employee.id);

    if (employeeIds.length === 0) continue;

    const dateKeys = buildDateKeys(config.dateFrom, config.dateTo);

    if (templateCode === "hygiene") {
      const entryMap = buildExampleHygieneEntryMap(employeeIds, dateKeys);
      const entries = Object.entries(entryMap).map(([compoundKey, data]) => {
        const separatorIndex = compoundKey.lastIndexOf(":");
        const employeeId = compoundKey.slice(0, separatorIndex);
        const dateKey = compoundKey.slice(separatorIndex + 1);

        return {
          documentId: document.id,
          employeeId,
          date: new Date(dateKey),
          data,
        };
      });

      if (entries.length > 0) {
        await db.journalDocumentEntry.createMany({ data: entries });
      }
      continue;
    }

    await db.journalDocumentEntry.createMany({
      data: employeeIds.flatMap((employeeId) =>
        dateKeys.map((dateKey) => ({
          documentId: document.id,
          employeeId,
          date: new Date(dateKey),
          data: {},
        }))
      ),
      skipDuplicates: true,
    });
  }
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toSourceDateLabel(value: Date) {
  return value.toLocaleDateString("ru-RU").replaceAll(".", "-");
}

function buildTrackedDemoValue(field: TrackedTemplateField, rowIndex: number) {
  switch (field.type) {
    case "boolean":
      return true;
    case "number":
      return rowIndex + 1;
    case "date":
      return toDateKey(new Date());
    case "select":
      return field.options?.[0]?.value ?? "";
    default:
      return `${field.label || field.key} ${rowIndex + 1}`.trim();
  }
}

function getTrackedMeta(templateCode: string, dateFrom: Date, dateTo: Date) {
  if (isAcceptanceDocumentTemplate(templateCode)) {
    return {
      metaLabel: "Дата начала",
      metaValue: toSourceDateLabel(dateFrom),
    };
  }

  if (templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE) {
    return {
      metaLabel: "Дата начала",
      metaValue: toSourceDateLabel(dateFrom),
    };
  }

  if (!isSourceStyleTrackedTemplate(templateCode)) {
    return {
      metaLabel: "Период",
      metaValue: getJournalDocumentPeriodLabel(templateCode, dateFrom, dateTo),
    };
  }

  const mode = getTrackedDocumentCreateMode(templateCode);
  if (mode === "staff") {
    return {
      metaLabel: "Период",
      metaValue: getJournalDocumentPeriodLabel(templateCode, dateFrom, dateTo),
    };
  }

  if (mode === "uv") {
    return {
      metaLabel: "Дата начала",
      metaValue: toSourceDateLabel(dateFrom),
    };
  }

  return {
    metaLabel: "Дата документа",
    metaValue: toSourceDateLabel(dateFrom),
  };
}

async function ensureSourceStyleTrackedSampleDocuments({
  templateCode,
  templateId,
  organizationId,
  users,
  createdById,
  templateFields,
}: {
  templateCode: string;
  templateId: string;
  organizationId: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
  createdById: string;
  templateFields: TrackedTemplateField[];
}) {
  if (!SOURCE_STYLE_TRACKED_DEMO_CODES.has(templateCode)) return;

  const activeUser = pickPrimaryManager(users) || users[0];

  if (!activeUser) return;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const activeFrom = new Date(Date.UTC(year, month, 1));
  const activeTo = new Date(Date.UTC(year, month + 1, 0));
  const closedFrom = new Date(Date.UTC(year, month - 1, 1));
  const closedTo = new Date(Date.UTC(year, month, 0));

  const existing = await db.journalDocument.findMany({
    where: {
      organizationId,
      templateId,
      status: {
        in: ["active", "closed"],
      },
    },
    select: {
      status: true,
    },
  });

  const hasStatus = new Set(existing.map((item) => item.status));
  const baseData = Object.fromEntries(
    templateFields.map((field, index) => [field.key, buildTrackedDemoValue(field, index)])
  );
  const defaultTitle = getJournalDocumentDefaultTitle(templateCode);

  const configs = [
    { status: "active" as const, dateFrom: activeFrom, dateTo: activeTo },
    { status: "closed" as const, dateFrom: closedFrom, dateTo: closedTo },
  ];

  const isUv = templateCode === UV_LAMP_RUNTIME_TEMPLATE_CODE;
  const isFryerOil = templateCode === FRYER_OIL_TEMPLATE_CODE;
  const uvConfig = isUv
    ? {
        lampNumber: "1",
        areaName: "Журнал учета работы",
        spec: {
          ...defaultUvSpecification(),
          commissioningDate: `${year}-07-01`,
        },
      }
    : undefined;

  for (const config of configs) {
    if (hasStatus.has(config.status)) continue;

    const docTitle = isUv && uvConfig
      ? buildUvRuntimeDocumentTitle(uvConfig)
      : defaultTitle;

    const created = await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: docTitle,
        status: config.status,
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        responsibleUserId: activeUser.id,
        responsibleTitle: getHygieneDefaultResponsibleTitle(users),
        createdById,
        ...(uvConfig ? { config: uvConfig } : isFryerOil ? { config: { lists: { fatTypes: ["Подсолнечное масло", "Пальмовое масло", "Рапсовое масло", "Фритюрный жир"], equipmentTypes: ["Фритюрница настольная", "Фритюрница напольная", "Жарочный шкаф"], productTypes: ["Картофель фри", "Пельмени", "Вареники", "Рыба в кляре", "Куриные наггетсы"] } } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (isUv) {
      // Create UV sample entries - daily entries for the period
      const entryData: { documentId: string; employeeId: string; date: Date; data: object }[] = [];
      const d = new Date(config.dateFrom);
      const end = new Date(config.dateTo);
      while (d <= end) {
        entryData.push({
          documentId: created.id,
          employeeId: activeUser.id,
          date: new Date(d),
          data: {
            startTime: `10:0${Math.floor(Math.random() * 6)}`,
            endTime: `18:0${Math.floor(Math.random() * 6)}`,
          },
        });
        d.setUTCDate(d.getUTCDate() + 1);
      }
      await db.journalDocumentEntry.createMany({
        data: entryData,
        skipDuplicates: true,
      });
    } else if (isFryerOil) {
      const sampleEntries = [
        {
          documentId: created.id,
          employeeId: activeUser.id,
          date: config.dateFrom,
          data: {
            startDate: config.dateFrom.toISOString().slice(0, 10),
            startHour: 9, startMinute: 0,
            fatType: "Подсолнечное масло",
            qualityStart: 5,
            equipmentType: "Фритюрница настольная",
            productType: "Картофель фри",
            endHour: 11, endMinute: 30,
            qualityEnd: 4,
            carryoverKg: 2.5,
            disposedKg: 0,
            controllerName: activeUser.name,
          },
        },
      ];
      await db.journalDocumentEntry.createMany({ data: sampleEntries, skipDuplicates: true });
    } else {
      await db.journalDocumentEntry.createMany({
        data: [
          {
            documentId: created.id,
            employeeId: activeUser.id,
            date: config.dateFrom,
            data: baseData,
          },
        ],
        skipDuplicates: true,
      });
    }
  }
}

async function ensureSanitationDaySampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
}) {
  const { templateId, organizationId, createdById, users } = params;
  const currentYearDate = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const previousYearDate = new Date(
    Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)
  );
  const responsibleUser = pickPrimaryManager(users) || users[0] || null;

  const existing = await db.journalDocument.findMany({
    where: {
      templateId,
      organizationId,
    },
    select: {
      status: true,
    },
  });

  const statuses = new Set(existing.map((item) => item.status));
  const docsToCreate: Array<{ status: "active" | "closed"; date: Date }> = [];

  if (!statuses.has("active")) {
    docsToCreate.push({ status: "active", date: currentYearDate });
  }
  if (!statuses.has("closed")) {
    docsToCreate.push({ status: "closed", date: previousYearDate });
  }

  for (const doc of docsToCreate) {
    const config = getSanitationDayDefaultConfig(doc.date);
    if (responsibleUser) {
      config.approveEmployeeId = responsibleUser.id;
      config.approveEmployee = responsibleUser.name;
      config.responsibleEmployeeId = responsibleUser.id;
      config.responsibleEmployee = responsibleUser.name;
    }

    await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: SANITATION_DAY_DOCUMENT_TITLE,
        status: doc.status,
        dateFrom: doc.date,
        dateTo: doc.date,
        createdById,
        responsibleUserId: responsibleUser?.id || null,
        responsibleTitle: config.responsibleRole,
        config,
      },
    });
  }
}

async function ensurePpeIssuanceSampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
}) {
  const { templateId, organizationId, createdById, users } = params;
  const existingCount = await db.journalDocument.count({
    where: {
      templateId,
      organizationId,
    },
  });

  if (existingCount > 0) return;

  const now = new Date();
  const activeFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const closedFrom1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const configs = [
    {
      status: "active" as const,
      dateFrom: activeFrom,
      config: buildPpeIssuanceDemoConfig(users, activeFrom),
    },
    {
      status: "closed" as const,
      dateFrom: closedFrom1,
      config: buildPpeIssuanceDemoConfig(users, closedFrom1),
    },
  ];

  for (const item of configs) {
    await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: PPE_ISSUANCE_DOCUMENT_TITLE,
        status: item.status,
        dateFrom: item.dateFrom,
        dateTo: item.dateFrom,
        createdById,
        config: item.config,
      },
    });
  }
}

async function ensureTraceabilitySampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
}) {
  const { templateId, organizationId, createdById, users } = params;

  const existingStatuses = new Set(
    (
      await db.journalDocument.findMany({
        where: {
          templateId,
          organizationId,
        },
        select: { status: true },
      })
    ).map((document) => document.status)
  );

  if (existingStatuses.has("active") && existingStatuses.has("closed")) return;

  const products = await db.product.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: { name: true },
    orderBy: { name: "asc" },
    take: 12,
  });

  const orgItemNames = products
    .map((item) => item.name.trim())
    .filter((name) => name.length > 0);
  const rawMaterialList = orgItemNames.length > 0 ? orgItemNames.slice(0, 8) : ["Мука"];
  const productList = orgItemNames.length > 0 ? orgItemNames.slice(0, 8) : ["Пельмени"];

  const responsibleUser = pickPrimaryManager(users);
  const defaultResponsibleRole =
    responsibleUser?.role === "technologist"
      ? "Технолог"
      : responsibleUser
        ? "Управляющий"
        : "Управляющий";

  const sampleRows = [
    createTraceabilityRow({
      date: "2022-04-04",
      incoming: {
        rawMaterialName: rawMaterialList[0] || "Мука",
        batchNumber: "150",
        packagingDate: "2022-04-01",
        quantityPieces: null,
        quantityKg: 20.5,
      },
      outgoing: {
        productName: productList[0] || "Пельмени",
        quantityPacksPieces: null,
        quantityPacksKg: 0.5,
        shockTemp: 3.5,
      },
      responsibleRole: defaultResponsibleRole,
      responsibleEmployeeId: responsibleUser?.id || null,
      responsibleEmployee: responsibleUser?.name || "",
    }),
    createTraceabilityRow({
      date: "2024-02-12",
      incoming: {
        rawMaterialName: rawMaterialList[0] || "Мука",
        batchNumber: "1112",
        packagingDate: "2024-02-10",
        quantityPieces: null,
        quantityKg: 5,
      },
      outgoing: {
        productName: productList[0] || "Пельмени",
        quantityPacksPieces: 20,
        quantityPacksKg: null,
        shockTemp: null,
      },
      responsibleRole: defaultResponsibleRole,
      responsibleEmployeeId: responsibleUser?.id || null,
      responsibleEmployee: responsibleUser?.name || "",
    }),
    createTraceabilityRow({
      date: "2024-02-13",
      incoming: {
        rawMaterialName: rawMaterialList[0] || "Мука",
        batchNumber: "1114",
        packagingDate: "2024-02-10",
        quantityPieces: null,
        quantityKg: 20,
      },
      outgoing: {
        productName: productList[0] || "Пельмени",
        quantityPacksPieces: 30,
        quantityPacksKg: null,
        shockTemp: 2,
      },
      responsibleRole: defaultResponsibleRole,
      responsibleEmployeeId: responsibleUser?.id || null,
      responsibleEmployee: responsibleUser?.name || "",
    }),
  ];

  const config = normalizeTraceabilityDocumentConfig({
    ...getDefaultTraceabilityDocumentConfig(),
    documentTitle: "Журнал прослеживаемости",
    dateFrom: "2025-01-01",
    showShockTempField: true,
    showShipmentBlock: false,
    rawMaterialList,
    productList,
    rows: sampleRows,
    defaultResponsibleRole,
    defaultResponsibleEmployeeId: responsibleUser?.id || null,
    defaultResponsibleEmployee: responsibleUser?.name || "",
  });

  if (!existingStatuses.has("active")) {
    await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: config.documentTitle,
        status: "active",
        dateFrom: new Date(`${config.dateFrom}T00:00:00.000Z`),
        dateTo: new Date(`${config.dateFrom}T00:00:00.000Z`),
        createdById,
        responsibleUserId: responsibleUser?.id || null,
        responsibleTitle: defaultResponsibleRole,
        config,
      },
    });
  }

  if (!existingStatuses.has("closed")) {
    await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: config.documentTitle,
        status: "closed",
        dateFrom: new Date("2024-12-01T00:00:00.000Z"),
        dateTo: new Date("2024-12-01T00:00:00.000Z"),
        createdById,
        responsibleUserId: responsibleUser?.id || null,
        responsibleTitle: defaultResponsibleRole,
        config: {
          ...config,
          dateFrom: "2024-12-01",
        } as Prisma.InputJsonValue,
      },
    });
  }
}

async function ensureGlassControlSampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
}) {
  const { templateId, organizationId, createdById, users } = params;

  const existingDocuments = await db.journalDocument.count({
    where: { templateId, organizationId },
  });

  if (existingDocuments > 0) return;

  const responsibleUser = pickPrimaryManager(users);

  if (!responsibleUser) return;

  const equipment = await db.equipment.findMany({
    where: {
      area: {
        organizationId,
      },
    },
    select: { name: true },
    orderBy: { name: "asc" },
    take: 4,
  });

  const products = await db.product.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: { name: true },
    orderBy: { name: "asc" },
    take: 4,
  });

  const itemNames = [...equipment, ...products]
    .map((item) => item.name.trim())
    .filter((item) => item.length > 0);

  const now = new Date();
  const activeFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const activeTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const closedFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const closedTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

  const baseConfig = {
    ...glassControlDocument.getDefaultGlassControlConfig(),
    documentName: glassControlDocument.GLASS_CONTROL_DOCUMENT_TITLE,
    controlFrequency: glassControlDocument.GLASS_CONTROL_DEFAULT_FREQUENCY,
  } as Prisma.InputJsonValue;

  const activeDocument = await db.journalDocument.create({
    data: {
      templateId,
      organizationId,
      title: glassControlDocument.GLASS_CONTROL_DOCUMENT_TITLE,
      status: "active",
      dateFrom: activeFrom,
      dateTo: activeFrom,
      responsibleUserId: responsibleUser.id,
      responsibleTitle: "Управляющий",
      autoFill: true,
      createdById,
      config: baseConfig,
    },
  });

  const closedDocument = await db.journalDocument.create({
    data: {
      templateId,
      organizationId,
      title: glassControlDocument.GLASS_CONTROL_DOCUMENT_TITLE,
      status: "closed",
      dateFrom: closedFrom,
      dateTo: closedTo,
      responsibleUserId: responsibleUser.id,
      responsibleTitle: "Управляющий",
      createdById,
      config: baseConfig,
    },
  });

  const activeRows = glassControlDocument.buildDailyRange(
    activeFrom.toISOString().slice(0, 10),
    activeTo.toISOString().slice(0, 10)
  );
  const closedRows = glassControlDocument.buildDailyRange(
    closedFrom.toISOString().slice(0, 10),
    closedTo.toISOString().slice(0, 10)
  );

  await db.journalDocumentEntry.createMany({
    data: activeRows.map((dateKey: string, index: number) => ({
      documentId: activeDocument.id,
      employeeId: responsibleUser.id,
      date: new Date(`${dateKey}T00:00:00.000Z`),
      data: (index === Math.max(0, activeRows.length - 2)
        ? {
            damagesDetected: true,
            itemName: itemNames[0] || "Стеклянная емкость",
            quantity: "1",
            damageInfo: "Скол. Изделие заменено.",
          }
        : {
            damagesDetected: false,
            itemName: "",
            quantity: "",
            damageInfo: "",
          }) as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });

  await db.journalDocumentEntry.createMany({
    data: closedRows.map((dateKey: string) => ({
      documentId: closedDocument.id,
      employeeId: responsibleUser.id,
      date: new Date(`${dateKey}T00:00:00.000Z`),
      data: {
        damagesDetected: false,
        itemName: "",
        quantity: "",
        damageInfo: "",
      } as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });
}

async function ensureIntensiveCoolingSampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
}) {
  const { templateId, organizationId, createdById, users } = params;
  const existingStatuses = new Set(
    (
      await db.journalDocument.findMany({
        where: { templateId, organizationId },
        select: { status: true },
      })
    ).map((item) => item.status)
  );

  if (existingStatuses.has("active") && existingStatuses.has("closed")) return;

  const products = await db.product.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: { name: true },
    orderBy: { name: "asc" },
    take: 12,
  });

  const dishSuggestions = products
    .map((item) => item.name.trim())
    .filter((name) => name.length > 0);
  const fallbackDishes =
    dishSuggestions.length > 0
      ? dishSuggestions
      : ["Пельмени", "Котлеты жареные", "Гуляш", "Плов"];

  const responsibleUser = pickPrimaryManager(users);
  const responsibleTitle = getResponsibleTitleByRole(responsibleUser?.role);
  const activeDate = "2021-10-01";

  if (!existingStatuses.has("active")) {
    const activeConfig = getDefaultIntensiveCoolingConfig(users, fallbackDishes);
    activeConfig.defaultResponsibleTitle = responsibleTitle;
    activeConfig.defaultResponsibleUserId = responsibleUser?.id || null;
    activeConfig.rows = [
      createIntensiveCoolingRow({
        productionDate: "2021-10-29",
        productionHour: "10",
        productionMinute: "00",
        dishName: fallbackDishes[0] || "Пельмени",
        startTemperature: "86",
        endTemperature: "5",
        correctiveAction: "-",
        comment: "-",
        responsibleTitle: "",
        responsibleUserId: "",
      }),
      createIntensiveCoolingRow({
        productionDate: "2021-10-30",
        productionHour: "20",
        productionMinute: "09",
        dishName: fallbackDishes[1] || "Котлеты жареные",
        startTemperature: "95",
        endTemperature: "8",
        correctiveAction:
          "Проведена настройка шокера. Уменьшено количество загрузки шокера",
        comment: "Утилизировано",
        responsibleTitle,
        responsibleUserId: responsibleUser?.id || "",
      }),
    ];

    await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
        status: "active",
        dateFrom: new Date(activeDate),
        dateTo: new Date(activeDate),
        createdById,
        config: activeConfig as Prisma.InputJsonValue,
      },
    });
  }

  if (!existingStatuses.has("closed")) {
    const closedConfig = getDefaultIntensiveCoolingConfig(users, fallbackDishes);
    closedConfig.defaultResponsibleTitle = responsibleTitle;
    closedConfig.defaultResponsibleUserId = responsibleUser?.id || null;
    closedConfig.finishedAt = new Date("2021-10-31").toISOString();

    await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
        status: "closed",
        dateFrom: new Date(activeDate),
        dateTo: new Date(activeDate),
        createdById,
        config: closedConfig as Prisma.InputJsonValue,
      },
    });
  }
}

async function ensurePestControlSampleDocuments({
  organizationId,
  templateId,
  users,
  createdById,
}: {
  organizationId: string;
  templateId: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
  createdById: string;
}) {
  const existingCount = await db.journalDocument.count({
    where: { organizationId, templateId },
  });

  if (existingCount > 0) return;

  const acceptedUser = pickPrimaryManager(users);

  const acceptedRole = acceptedUser
    ? getHygienePositionLabel(acceptedUser.role)
    : "Управляющий";

  const activeDocument = await db.journalDocument.create({
    data: {
      templateId,
      organizationId,
      title: PEST_CONTROL_DOCUMENT_TITLE,
      status: "active",
      dateFrom: new Date("2025-03-05T00:00:00.000Z"),
      dateTo: new Date("2025-03-05T00:00:00.000Z"),
      responsibleTitle: acceptedRole,
      responsibleUserId: acceptedUser?.id || null,
      createdById,
    },
  });

  if (acceptedUser) {
    await db.journalDocumentEntry.createMany({
      data: [
        {
          documentId: activeDocument.id,
          employeeId: acceptedUser.id,
          date: new Date("2025-03-17T18:00:11.000Z"),
          data: {
            performedDate: "2025-03-17",
            performedHour: "18",
            performedMinute: "00",
            timeSpecified: true,
            event: "Дезинсекция",
            areaOrVolume: "200",
            treatmentProduct: "Раствор",
            note: "Не мыть полы 24 -48 часов. Добавочно расставить ловушки.",
            performedBy: "ИП",
            acceptedRole,
            acceptedEmployeeId: acceptedUser.id,
          } satisfies Prisma.InputJsonValue,
        },
        {
          documentId: activeDocument.id,
          employeeId: acceptedUser.id,
          date: new Date("2025-03-25T11:00:22.000Z"),
          data: {
            performedDate: "2025-03-25",
            performedHour: "11",
            performedMinute: "00",
            timeSpecified: true,
            event: "Дезинсекция",
            areaOrVolume: "84,9",
            treatmentProduct: "пропан",
            note: "",
            performedBy: "ИП Хижняк",
            acceptedRole,
            acceptedEmployeeId: acceptedUser.id,
          } satisfies Prisma.InputJsonValue,
        },
      ],
    });
  }

  await db.journalDocument.create({
    data: {
      templateId,
      organizationId,
      title: PEST_CONTROL_DOCUMENT_TITLE,
      status: "closed",
      dateFrom: new Date("2025-02-05T00:00:00.000Z"),
      dateTo: new Date("2025-02-28T00:00:00.000Z"),
      responsibleTitle: acceptedRole,
      responsibleUserId: acceptedUser?.id || null,
      createdById,
    },
  });
}

export default async function JournalDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { code } = await params;
  const resolvedCode = resolveJournalCodeAlias(code);
  const { tab } = await searchParams;
  const session = await requireAuth();

  const template = await db.journalTemplate.findUnique({
    where: { code: resolvedCode },
  });

  if (!template) {
    notFound();
  }

  // Per-user journal ACL. Root, managers, and unmigrated users bypass;
  // employees need an explicit UserJournalAccess row. See src/lib/journal-acl.ts.
  const allowed = await hasJournalAccess(
    aclActorFromSession(session),
    resolvedCode
  );
  if (!allowed) {
    notFound();
  }

  const activeTab = tab === "closed" ? "closed" : "active";

  const orgUsers = await db.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    select: { id: true, name: true, role: true, email: true, positionTitle: true, jobPosition: { select: { name: true, categoryKey: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const isFilledToday = await isTemplateFilledToday(
    session.user.organizationId,
    template.id
  );
  const isMandatoryTemplate =
    template.isMandatorySanpin || template.isMandatoryHaccp;
  const todayBanner = (
    <TodayPendingBanner
      filled={isFilledToday}
      isMandatory={isMandatoryTemplate}
      templateName={template.name}
    />
  );
  function withBanner(children: React.ReactNode) {
    return (
      <div className="space-y-5">
        {todayBanner}
        {children}
      </div>
    );
  }
  const shouldNormalizeDemoSamples = isDemoSeedOrganization(orgUsers);

  await normalizeDemoJournalSampleCorpus({
    templateId: template.id,
    organizationId: session.user.organizationId,
    enabled: shouldNormalizeDemoSamples,
  });

  if (resolvedCode === "hygiene" || resolvedCode === "health_check") {
    // Only seed the sample grid for the demo org. Real customer orgs start
    // completely empty — the owner creates documents manually.
    if (shouldNormalizeDemoSamples) {
      await ensureStaffJournalSampleDocuments({
        templateCode: resolvedCode,
        organizationId: session.user.organizationId,
        templateId: template.id,
        users: orgUsers,
        createdById: session.user.id,
      });
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    const mappedDocuments = documents.map((document) => {
      const config = (document.config && typeof document.config === "object" && !Array.isArray(document.config))
        ? (document.config as Record<string, unknown>)
        : {};
      return {
        id: document.id,
        title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
        status: document.status as "active" | "closed",
        responsibleTitle: document.responsibleTitle,
        periodLabel: getJournalDocumentPeriodLabel(resolvedCode, document.dateFrom, document.dateTo),
        printEmptyRows: typeof config.printEmptyRows === "number" ? config.printEmptyRows : 0,
      };
    });

    if (resolvedCode === "health_check") {
      return withBanner(
        <HealthDocumentsClient
          activeTab={activeTab}
          templateCode={resolvedCode}
          templateName={template.name}
          users={orgUsers}
          documents={mappedDocuments}
        />
      );
    }

    return withBanner(
      <HygieneDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={mappedDocuments}
      />
    );
  }

  if (isScanOnlyDocumentTemplate(resolvedCode)) {
    const pageCount = await getScanJournalPageCount(resolvedCode);
    if (pageCount === 0) {
      notFound();
    }

    const scanConfig = getScanJournalConfig(resolvedCode);
    await ensureScanOnlySampleDocuments({
      templateId: template.id,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
      title: scanConfig?.title || template.name,
      defaultResponsibleTitle: scanConfig?.defaultResponsibleTitle || null,
      responsibleUserId: pickPrimaryManager(orgUsers)?.id || null,
    });

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { createdAt: "desc" },
    });

    return withBanner(
      <ScanJournalDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={scanConfig?.title || template.name}
        defaultResponsibleTitle={scanConfig?.defaultResponsibleTitle || null}
        defaultResponsibleUserId={pickPrimaryManager(orgUsers)?.id || null}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || (scanConfig?.title || template.name),
          status: document.status as "active" | "closed",
          dateLabel: scanConfig?.dateLabel || "Период",
          dateValue:
            document.dateFrom.toISOString().slice(0, 10) ===
            document.dateTo.toISOString().slice(0, 10)
              ? document.dateFrom.toISOString().slice(0, 10)
              : `${document.dateFrom.toISOString().slice(0, 10)} — ${document.dateTo.toISOString().slice(0, 10)}`,
          responsibleLabel:
            document.responsibleTitle ||
            (scanConfig?.showResponsible ? scanConfig.defaultResponsibleTitle || null : null),
          responsibleValue: document.responsibleUserId
            ? orgUsers.find((user) => user.id === document.responsibleUserId)?.name || null
            : null,
        }))}
      />
    );
  }

  if (shouldNormalizeDemoSamples && resolvedCode === MED_BOOK_TEMPLATE_CODE) {
    // Auto-seed one active sample document if none exist (demo org only)
    const existingCount = await db.journalDocument.count({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
      },
    });

    if (existingCount === 0) {
      const now = new Date();
      const doc = await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: MED_BOOK_DOCUMENT_TITLE,
          status: "active",
          dateFrom: now,
          dateTo: now,
          createdById: session.user.id,
          config: getDefaultMedBookConfig(),
        },
      });

      // Add sample entries for each org user
      if (orgUsers.length > 0) {
        const positionLabels: Record<string, string> = {
          owner: "Управляющий",
          technologist: "Шеф-повар",
          operator: "Повар",
        };

        const sampleExamDate = "2025-04-19";
        const sampleExamExpiry = "2026-04-19";
        const expiredExamDate = "2025-03-25";
        const expiredExamExpiry = "2026-03-25";

        await db.journalDocumentEntry.createMany({
          data: orgUsers.slice(0, 5).map((user) => ({
            documentId: doc.id,
            employeeId: user.id,
            date: now,
            data: {
              ...emptyMedBookEntry(positionLabels[user.role] || "Сотрудник"),
              birthDate: "2010-03-19",
              gender: "female" as const,
              hireDate: "2025-03-19",
              examinations: {
                "Гинеколог": { date: sampleExamDate, expiryDate: sampleExamExpiry },
                "Стоматолог": { date: null, expiryDate: null },
                "Психиатр": { date: expiredExamDate, expiryDate: expiredExamExpiry },
                "Оториноларинголог": { date: null, expiryDate: null },
                "Терапевт": { date: "2025-06-14", expiryDate: "2026-06-14" },
                "Невролог": { date: "2025-06-14", expiryDate: "2026-06-14" },
                "Нарколог": { date: "2025-06-14", expiryDate: "2026-06-14" },
                "Флюорография": { date: expiredExamDate, expiryDate: expiredExamExpiry },
              },
              vaccinations: {
                "Дифтерия": { type: "refusal" as const },
                "Дизентерия Зонне": { type: "done" as const, dose: "V1", date: "2024-01-01", expiryDate: "2025-01-01" },
                "Краснуха": { type: "refusal" as const },
                "Гепатит B": { type: "refusal" as const },
                "Гепатит A": { type: "refusal" as const },
                "Грипп": { type: "refusal" as const },
                "Коронавирус": { type: "done" as const, dose: "V1", date: "2025-04-01", expiryDate: null },
              },
              note: null,
            },
          })),
          skipDuplicates: true,
        });
      }
    }

    const medBookStatuses = new Set(
      (
        await db.journalDocument.findMany({
          where: {
            organizationId: session.user.organizationId,
            templateId: template.id,
          },
          select: { status: true },
        })
      ).map((document) => document.status)
    );

    if (!medBookStatuses.has("closed")) {
      const { closedFrom } = getCurrentAndPreviousMonthBounds();
      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: MED_BOOK_DOCUMENT_TITLE,
          status: "closed",
          dateFrom: closedFrom,
          dateTo: closedFrom,
          createdById: session.user.id,
          config: getDefaultMedBookConfig(),
        },
      });
    }


    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { createdAt: "asc" },
    });

    return withBanner(
      <MedBookDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || MED_BOOK_DOCUMENT_TITLE,
          status: doc.status as "active" | "closed",
        }))}
      />
    );
  }

  if (shouldNormalizeDemoSamples && resolvedCode === PERISHABLE_REJECTION_TEMPLATE_CODE) {
    const existingCount = await db.journalDocument.count({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
      },
    });

    if (existingCount === 0) {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const dateFrom = new Date(Date.UTC(year, month, 1));
      const dateTo = new Date(Date.UTC(year, month + 1, 0));

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: PERISHABLE_REJECTION_DOCUMENT_TITLE,
          status: "active",
          dateFrom,
          dateTo,
          createdById: session.user.id,
          config: getDefaultPerishableRejectionConfig(),
        },
      });
    }

    const perishableStatuses = new Set(
      (
        await db.journalDocument.findMany({
          where: {
            organizationId: session.user.organizationId,
            templateId: template.id,
          },
          select: { status: true },
        })
      ).map((document) => document.status)
    );

    if (!perishableStatuses.has("closed")) {
      const { closedFrom, closedTo } = getCurrentAndPreviousMonthBounds();
      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: PERISHABLE_REJECTION_DOCUMENT_TITLE,
          status: "closed",
          dateFrom: closedFrom,
          dateTo: closedTo,
          createdById: session.user.id,
          config: getDefaultPerishableRejectionConfig(),
        },
      });
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    return withBanner(
      <PerishableRejectionDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || PERISHABLE_REJECTION_DOCUMENT_TITLE,
          status: doc.status as "active" | "closed",
          startedAtLabel: doc.dateFrom.toLocaleDateString("ru-RU").replaceAll(".", "-"),
          dateFrom: doc.dateFrom.toISOString().slice(0, 10),
          config: doc.config,
        }))}
      />
    );
  }

    if (shouldNormalizeDemoSamples && resolvedCode === GLASS_LIST_TEMPLATE_CODE) {
    const existingCount = await db.journalDocument.count({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
      },
    });

    if (existingCount === 0) {
      const [areas, equipment, products] = await Promise.all([
        db.area.findMany({
          where: { organizationId: session.user.organizationId },
          select: { name: true },
          orderBy: { name: "asc" },
        }),
        db.equipment.findMany({
          where: {
            area: {
              organizationId: session.user.organizationId,
            },
          },
          select: { name: true },
          orderBy: { name: "asc" },
          take: 10,
        }),
        db.product.findMany({
          where: { organizationId: session.user.organizationId, isActive: true },
          select: { name: true },
          orderBy: { name: "asc" },
          take: 10,
        }),
      ]);

      const glassListConfig = buildGlassListConfigFromData({
        users: orgUsers,
        areas,
        equipment,
        products,
        referenceDate: new Date(Date.UTC(2025, 1, 1)),
      });

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: glassListConfig.documentName || GLASS_LIST_DOCUMENT_TITLE,
          status: "active",
          dateFrom: new Date(glassListConfig.documentDate),
          dateTo: new Date(glassListConfig.documentDate),
          responsibleTitle: glassListConfig.responsibleTitle || null,
          responsibleUserId: glassListConfig.responsibleUserId || null,
          createdById: session.user.id,
          config: glassListConfig as Prisma.InputJsonValue,
        },
      });
    }

    const glassListStatuses = new Set(
      (
        await db.journalDocument.findMany({
          where: {
            organizationId: session.user.organizationId,
            templateId: template.id,
          },
          select: { status: true },
        })
      ).map((document) => document.status)
    );

    if (!glassListStatuses.has("closed")) {
      const [areas, equipment, products] = await Promise.all([
        db.area.findMany({
          where: { organizationId: session.user.organizationId },
          select: { name: true },
          orderBy: { name: "asc" },
        }),
        db.equipment.findMany({
          where: {
            area: {
              organizationId: session.user.organizationId,
            },
          },
          select: { name: true },
          orderBy: { name: "asc" },
          take: 10,
        }),
        db.product.findMany({
          where: { organizationId: session.user.organizationId, isActive: true },
          select: { name: true },
          orderBy: { name: "asc" },
          take: 10,
        }),
      ]);

      const closedGlassListConfig = buildGlassListConfigFromData({
        users: orgUsers,
        areas,
        equipment,
        products,
        referenceDate: new Date(Date.UTC(2025, 0, 1)),
      });

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: closedGlassListConfig.documentName || GLASS_LIST_DOCUMENT_TITLE,
          status: "closed",
          dateFrom: new Date(closedGlassListConfig.documentDate),
          dateTo: new Date(closedGlassListConfig.documentDate),
          responsibleTitle: closedGlassListConfig.responsibleTitle || null,
          responsibleUserId: closedGlassListConfig.responsibleUserId || null,
          createdById: session.user.id,
          config: closedGlassListConfig as Prisma.InputJsonValue,
        },
      });
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "desc" },
    });

    return withBanner(
      <GlassListDocumentsClient
        activeTab={activeTab}
        routeCode={code}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => {
          const config = normalizeGlassListConfig(doc.config);
          return {
            id: doc.id,
            title: doc.title || GLASS_LIST_DOCUMENT_TITLE,
            status: doc.status as "active" | "closed",
            dateFrom: doc.dateFrom.toISOString().slice(0, 10),
            responsibleTitle: doc.responsibleTitle || config.responsibleTitle || null,
            responsibleUserId: doc.responsibleUserId || config.responsibleUserId || null,
            config,
          };
        })}
      />
    );
  }

  if (resolvedCode === glassControlDocument.GLASS_CONTROL_TEMPLATE_CODE) {
    if (shouldNormalizeDemoSamples) {
      await ensureGlassControlSampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        users: orgUsers,
      });
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    return withBanner(
      <GlassControlDocumentsClient
        activeTab={activeTab}
        routeCode={code === glassControlDocument.GLASS_CONTROL_SOURCE_SLUG ? code : resolvedCode}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || glassControlDocument.GLASS_CONTROL_DOCUMENT_TITLE,
          status: doc.status as "active" | "closed",
          responsibleTitle: doc.responsibleTitle,
          responsibleUserId: doc.responsibleUserId,
          dateFrom: doc.dateFrom.toISOString().slice(0, 10),
          config: doc.config,
        }))}
      />
    );
  }

    if (shouldNormalizeDemoSamples && resolvedCode === STAFF_TRAINING_TEMPLATE_CODE) {
    const existingCount = await db.journalDocument.count({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
      },
    });

    if (existingCount === 0) {
      const now = new Date();
      const year = now.getUTCFullYear();
      const dateFrom = new Date(Date.UTC(year, 0, 1));
      const dateTo = new Date(Date.UTC(year, 11, 31));

      const seedRows = buildStaffTrainingSeedRows(
        orgUsers,
        `${year}-01-01`
      );

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: STAFF_TRAINING_DOCUMENT_TITLE,
          status: "active",
          dateFrom,
          dateTo,
          createdById: session.user.id,
          config: {
            ...getDefaultStaffTrainingConfig(),
            rows: seedRows,
          },
        },
      });
    }

    const staffTrainingStatuses = new Set(
      (
        await db.journalDocument.findMany({
          where: {
            organizationId: session.user.organizationId,
            templateId: template.id,
          },
          select: { status: true },
        })
      ).map((document) => document.status)
    );

    if (!staffTrainingStatuses.has("closed")) {
      const previousYear = new Date().getUTCFullYear() - 1;
      const closedRows = buildStaffTrainingSeedRows(orgUsers, `${previousYear}-01-01`);
      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: STAFF_TRAINING_DOCUMENT_TITLE,
          status: "closed",
          dateFrom: new Date(Date.UTC(previousYear, 0, 1)),
          dateTo: new Date(Date.UTC(previousYear, 11, 31)),
          createdById: session.user.id,
          config: {
            ...getDefaultStaffTrainingConfig(),
            rows: closedRows,
          },
        },
      });
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    return withBanner(
      <StaffTrainingDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || STAFF_TRAINING_DOCUMENT_TITLE,
          status: doc.status as "active" | "closed",
          startedAtLabel: doc.dateFrom.toLocaleDateString("ru-RU").replaceAll(".", "-"),
          dateFrom: doc.dateFrom.toISOString().slice(0, 10),
          config: doc.config,
        }))}
      />
    );
  }

  if (shouldNormalizeDemoSamples && resolvedCode === EQUIPMENT_MAINTENANCE_TEMPLATE_CODE) {
    const existingCount = await db.journalDocument.count({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
      },
    });

    if (existingCount === 0) {
      const year = new Date().getUTCFullYear();
      const cfg = getDefaultEquipmentMaintenanceConfig(year);
      const manager = pickPrimaryManager(orgUsers);
      const headChef = orgUsers.find((u) => getUserRoleLabel(u.role) === "???-?????") || manager;
      if (manager) {
        cfg.approveEmployeeId = manager.id;
        cfg.approveEmployee = manager.name;
      }
      if (headChef) {
        cfg.responsibleEmployeeId = headChef.id;
        cfg.responsibleEmployee = headChef.name;
      }

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE,
          status: "active",
          dateFrom: new Date(Date.UTC(year, 0, 1)),
          dateTo: new Date(Date.UTC(year, 11, 31)),
          createdById: session.user.id,
          config: cfg,
        },
      });
    }

    const equipmentMaintenanceStatuses = new Set(
      (
        await db.journalDocument.findMany({
          where: {
            organizationId: session.user.organizationId,
            templateId: template.id,
          },
          select: { status: true },
        })
      ).map((document) => document.status)
    );

    if (!equipmentMaintenanceStatuses.has("closed")) {
      const previousYear = new Date().getUTCFullYear() - 1;
      const cfg = getDefaultEquipmentMaintenanceConfig(previousYear);
      const manager = pickPrimaryManager(orgUsers);
      const headChef = orgUsers.find((u) => getUserRoleLabel(u.role) === "???-?????") || manager;
      if (manager) {
        cfg.approveEmployeeId = manager.id;
        cfg.approveEmployee = manager.name;
      }
      if (headChef) {
        cfg.responsibleEmployeeId = headChef.id;
        cfg.responsibleEmployee = headChef.name;
      }

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE,
          status: "closed",
          dateFrom: new Date(Date.UTC(previousYear, 0, 1)),
          dateTo: new Date(Date.UTC(previousYear, 11, 31)),
          createdById: session.user.id,
          config: cfg,
        },
      });
    }

    const equipmentCalibrationStatuses = new Set(
      (
        await db.journalDocument.findMany({
          where: {
            organizationId: session.user.organizationId,
            templateId: template.id,
          },
          select: { status: true },
        })
      ).map((document) => document.status)
    );

    if (!equipmentCalibrationStatuses.has("closed")) {
      const previousYear = new Date().getUTCFullYear() - 1;
      const equipmentSource = await db.equipment.findMany({
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
      });
      const cfg = buildEquipmentCalibrationConfigFromEquipment(equipmentSource, { year: previousYear });
      const manager = pickPrimaryManager(orgUsers);
      if (manager) {
        cfg.approveEmployeeId = manager.id;
        cfg.approveEmployee = manager.name;
      }

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: EQUIPMENT_CALIBRATION_DOCUMENT_TITLE,
          status: "closed",
          dateFrom: new Date(Date.UTC(previousYear, 0, 1)),
          dateTo: new Date(Date.UTC(previousYear, 11, 31)),
          createdById: session.user.id,
          config: cfg,
        },
      });
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "desc" },
    });

    return withBanner(
      <EquipmentMaintenanceDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE,
          status: doc.status as "active" | "closed",
          dateFrom: doc.dateFrom.toISOString().slice(0, 10),
          config: doc.config,
        }))}
      />
    );
  }

  if (shouldNormalizeDemoSamples && resolvedCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE) {
    const existingCount = await db.journalDocument.count({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
      },
    });

    if (existingCount === 0) {
      const year = new Date().getUTCFullYear();
      const equipmentSource = await db.equipment.findMany({
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
      });
      const cfg = buildEquipmentCalibrationConfigFromEquipment(equipmentSource, { year });
      const manager = pickPrimaryManager(orgUsers);
      if (manager) {
        cfg.approveEmployeeId = manager.id;
        cfg.approveEmployee = manager.name;
      }

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: EQUIPMENT_CALIBRATION_DOCUMENT_TITLE,
          status: "active",
          dateFrom: new Date(Date.UTC(year, 0, 1)),
          dateTo: new Date(Date.UTC(year, 11, 31)),
          createdById: session.user.id,
          config: cfg,
        },
      });
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "desc" },
    });

    return withBanner(
      <EquipmentCalibrationDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || EQUIPMENT_CALIBRATION_DOCUMENT_TITLE,
          status: doc.status as "active" | "closed",
          dateFrom: doc.dateFrom.toISOString().slice(0, 10),
          config: doc.config,
        }))}
      />
    );
  }

  if (isDocumentTemplate(resolvedCode)) {
    const parsedTemplateFields = Array.isArray(template.fields)
      ? (template.fields as TrackedTemplateField[])
      : [];

    // All auto-seeded sample documents below are only for the demo org —
    // real customer orgs start empty and build their own corpus.
    if (shouldNormalizeDemoSamples) {
      await ensureSourceStyleTrackedSampleDocuments({
        templateCode: resolvedCode,
        templateId: template.id,
        organizationId: session.user.organizationId,
        users: orgUsers,
        createdById: session.user.id,
        templateFields: parsedTemplateFields,
      });
    }

    if (
      shouldNormalizeDemoSamples &&
      (resolvedCode === CLIMATE_DOCUMENT_TEMPLATE_CODE ||
        resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE)
    ) {
      const existingBasicDocumentCount = await db.journalDocument.count({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
        },
      });

      if (existingBasicDocumentCount === 0) {
        const { activeFrom, activeTo, closedFrom, closedTo } = getCurrentAndPreviousMonthBounds();
        const coldEquipmentConfig =
          resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
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
        const primaryUser = pickPrimaryManager(orgUsers) || orgUsers[0];
        const defaultResponsibleTitle = primaryUser
          ? getUserRoleLabel(primaryUser.role)
          : null;
        await db.journalDocument.createMany({
          data: [
            {
              templateId: template.id,
              organizationId: session.user.organizationId,
              title: getJournalDocumentDefaultTitle(resolvedCode),
              status: "active",
              dateFrom: activeFrom,
              dateTo: activeTo,
              createdById: session.user.id,
              responsibleUserId:
                resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
                  ? primaryUser?.id || null
                  : null,
              responsibleTitle:
                resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
                  ? defaultResponsibleTitle
                  : null,
              config:
                resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
                  ? (coldEquipmentConfig as Prisma.InputJsonValue)
                  : undefined,
            },
            {
              templateId: template.id,
              organizationId: session.user.organizationId,
              title: getJournalDocumentDefaultTitle(resolvedCode),
              status: "closed",
              dateFrom: closedFrom,
              dateTo: closedTo,
              createdById: session.user.id,
              responsibleUserId:
                resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
                  ? primaryUser?.id || null
                  : null,
              responsibleTitle:
                resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
                  ? defaultResponsibleTitle
                  : null,
              config:
                resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
                  ? (coldEquipmentConfig as Prisma.InputJsonValue)
                  : undefined,
            },
          ],
        });
      }
    }

    if (shouldNormalizeDemoSamples && resolvedCode === CLEANING_DOCUMENT_TEMPLATE_CODE) {
      const existingCleaningCount = await db.journalDocument.count({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
        },
      });

      if (existingCleaningCount === 0) {
        const period = getCleaningCreatePeriodBounds();
        const cleaningAreas = await db.area.findMany({
          where: {
            organizationId: session.user.organizationId,
          },
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: "asc",
          },
        });
        const cleaningConfig = applyCleaningAutoFillToConfig({
          config: defaultCleaningDocumentConfig(orgUsers, cleaningAreas),
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
        });
        const responsibleUser = pickPrimaryManager(orgUsers) || orgUsers[0];

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: getJournalDocumentDefaultTitle(resolvedCode),
            status: "active",
            dateFrom: new Date(`${period.dateFrom}T00:00:00.000Z`),
            dateTo: new Date(`${period.dateTo}T00:00:00.000Z`),
            createdById: session.user.id,
            responsibleUserId: responsibleUser?.id || null,
            responsibleTitle: responsibleUser
              ? (responsibleUser.role === "owner" ? "Управляющий" : "Управляющий")
              : null,
            config: cleaningConfig,
          },
        });

      }

      const cleaningStatuses = new Set(
        (
          await db.journalDocument.findMany({
            where: {
              organizationId: session.user.organizationId,
              templateId: template.id,
            },
            select: { status: true },
          })
        ).map((document) => document.status)
      );

      if (!cleaningStatuses.has("closed")) {
        const closedReferenceDate = new Date();
        closedReferenceDate.setUTCMonth(closedReferenceDate.getUTCMonth() - 1);
        const period = getCleaningCreatePeriodBounds(closedReferenceDate);
        const cleaningAreas = await db.area.findMany({
          where: {
            organizationId: session.user.organizationId,
          },
          select: {
            id: true,
            name: true,
          },
          orderBy: {
            name: "asc",
          },
        });
        const cleaningConfig = applyCleaningAutoFillToConfig({
          config: defaultCleaningDocumentConfig(orgUsers, cleaningAreas),
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
        });
        const responsibleUser = pickPrimaryManager(orgUsers) || orgUsers[0];

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: getJournalDocumentDefaultTitle(resolvedCode),
            status: "closed",
            dateFrom: new Date(`${period.dateFrom}T00:00:00.000Z`),
            dateTo: new Date(`${period.dateTo}T00:00:00.000Z`),
            createdById: session.user.id,
            responsibleUserId: responsibleUser?.id || null,
            responsibleTitle: responsibleUser ? "Управляющий" : null,
            config: cleaningConfig,
          },
        });
      }
    }

    if (shouldNormalizeDemoSamples && resolvedCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
      const existingDocument = await db.journalDocument.findFirst({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
        },
        orderBy: { dateFrom: "asc" },
      });

      if (!existingDocument) {
        const seed = buildFinishedProductArchiveSeed(new Date());

        await db.journalDocument.createMany({
          data: [
            {
              templateId: template.id,
              organizationId: session.user.organizationId,
              title: seed.active.title,
              status: "active",
              dateFrom: seed.active.dateFrom,
              dateTo: seed.active.dateTo,
              createdById: session.user.id,
            },
            ...seed.closed.map((item) => ({
              templateId: template.id,
              organizationId: session.user.organizationId,
              title: item.title,
              status: "closed" as const,
              dateFrom: item.dateFrom,
              dateTo: item.dateTo,
              createdById: session.user.id,
            })),
          ],
        });
      }
    }

    if (shouldNormalizeDemoSamples && resolvedCode === TRACEABILITY_DOCUMENT_TEMPLATE_CODE) {
      await ensureTraceabilitySampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        users: orgUsers,
      });
    }

    if (shouldNormalizeDemoSamples && resolvedCode === INTENSIVE_COOLING_TEMPLATE_CODE) {
      await ensureIntensiveCoolingSampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        users: orgUsers,
      });
    }

    if (shouldNormalizeDemoSamples && resolvedCode === PRODUCT_WRITEOFF_TEMPLATE_CODE) {
      const [products, batches, existingDocuments] = await Promise.all([
        db.product.findMany({
          where: {
            organizationId: session.user.organizationId,
            isActive: true,
          },
          select: { name: true },
          orderBy: { name: "asc" },
        }),
        db.batch.findMany({
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
          orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
          take: 10,
        }),
        db.journalDocument.findMany({
          where: {
            organizationId: session.user.organizationId,
            templateId: template.id,
          },
          select: {
            status: true,
          },
        }),
      ]);

      const existingStatuses = new Set(existingDocuments.map((item) => item.status));
      const sampleDate = new Date("2025-08-05T00:00:00.000Z");

      if (!existingStatuses.has("active")) {
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: PRODUCT_WRITEOFF_DOCUMENT_TITLE,
            status: "active",
            dateFrom: sampleDate,
            dateTo: sampleDate,
            createdById: session.user.id,
            config: buildProductWriteoffConfigFromData({
              users: orgUsers,
              products,
              batches,
              referenceDate: sampleDate,
            }) as Prisma.InputJsonValue,
          },
        });
      }

      if (!existingStatuses.has("closed")) {
        const closedConfig = buildProductWriteoffConfigFromData({
          users: orgUsers,
          products,
          batches,
          referenceDate: sampleDate,
        });
        closedConfig.actNumber = "2";
        closedConfig.comment = "Архивный тестовый документ";

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: PRODUCT_WRITEOFF_DOCUMENT_TITLE,
            status: "closed",
            dateFrom: sampleDate,
            dateTo: sampleDate,
            createdById: session.user.id,
            config: closedConfig as Prisma.InputJsonValue,
          },
        });
      }
    }

    if (shouldNormalizeDemoSamples && resolvedCode === PEST_CONTROL_TEMPLATE_CODE) {
      await ensurePestControlSampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        users: orgUsers,
      });
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    if (resolvedCode === INTENSIVE_COOLING_TEMPLATE_CODE) {
      const products = await db.product.findMany({
        where: {
          organizationId: session.user.organizationId,
          isActive: true,
        },
        select: { name: true },
        orderBy: { name: "asc" },
        take: 20,
      });

      return withBanner(
        <IntensiveCoolingDocumentsClient
          activeTab={activeTab}
          routeCode={code === INTENSIVE_COOLING_SOURCE_SLUG ? code : resolvedCode}
          users={orgUsers}
          dishSuggestions={products.map((item) => item.name)}
          documents={documents.map((document) => ({
            id: document.id,
            title: document.title || INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config: document.config,
          }))}
        />
      );
    }

    if (resolvedCode === PRODUCT_WRITEOFF_TEMPLATE_CODE) {
      return withBanner(
        <ProductWriteoffDocumentsClient
          activeTab={activeTab}
          templateCode={resolvedCode}
          templateName={template.name}
          users={orgUsers}
          documents={documents.map((document) => ({
            id: document.id,
            title: document.title || PRODUCT_WRITEOFF_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config: normalizeProductWriteoffConfig(document.config),
          }))}
        />
      );
    }

    if (resolvedCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
      return withBanner(
        <FinishedProductDocumentsClient
          activeTab={activeTab}
          templateCode={resolvedCode}
          templateName={template.name}
          users={orgUsers}
          documents={documents.map((document) => ({
            id: document.id,
            title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
            status: document.status as "active" | "closed",
            responsibleTitle: document.responsibleTitle,
            periodLabel: getJournalDocumentPeriodLabel(resolvedCode, document.dateFrom, document.dateTo),
            startedAtLabel: document.dateFrom.toLocaleDateString("ru-RU"),
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            dateTo: document.dateTo.toISOString().slice(0, 10),
            config: document.config,
          }))}
        />
      );
    }

    if (shouldNormalizeDemoSamples && resolvedCode === SANITATION_DAY_TEMPLATE_CODE) {
      await ensureSanitationDaySampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        users: orgUsers,
      });

      const sanitationDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return withBanner(
        <SanitationDayDocumentsClient
          routeCode={code === SANITATION_DAY_SOURCE_SLUG ? code : resolvedCode}
          templateCode={resolvedCode}
          activeTab={activeTab}
          users={orgUsers}
          documents={sanitationDocuments.map((document) => ({
            id: document.id,
            title: document.title || SANITATION_DAY_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            dateTo: document.dateTo.toISOString().slice(0, 10),
            config: document.config,
            periodLabel: getSanitationDocumentDateLabel(
              document.dateFrom.toISOString().slice(0, 10)
            ),
            responsibleTitle: getSanitationApproveLabel("", ""),
            metaLabel: "",
            metaValue: "",
          }))}
        />
      );
    }

    if (resolvedCode === DISINFECTANT_TEMPLATE_CODE) {
      const existingDis = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        select: { status: true },
      });
      const disStatuses = new Set(existingDis.map((d) => d.status));
      const disinfectantResponsibleUser = pickPrimaryManager(orgUsers) || orgUsers[0] || null;
      const disinfectantConfig = (() => {
        const cfg = getDisinfectantDefaultConfig();
        if (!disinfectantResponsibleUser) return cfg;
        return {
          ...cfg,
          responsibleEmployeeId: disinfectantResponsibleUser.id,
          responsibleEmployee: disinfectantResponsibleUser.name,
          receipts: cfg.receipts.map((row) => ({
            ...row,
            responsibleEmployeeId: disinfectantResponsibleUser.id,
            responsibleEmployee: disinfectantResponsibleUser.name,
          })),
          consumptions: cfg.consumptions.map((row) => ({
            ...row,
            responsibleEmployeeId: disinfectantResponsibleUser.id,
            responsibleEmployee: disinfectantResponsibleUser.name,
          })),
        };
      })();
      if (!disStatuses.has("active")) {
        const now = new Date();
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: DISINFECTANT_DOCUMENT_TITLE,
            status: "active",
            dateFrom: now,
            dateTo: now,
            createdById: session.user.id,
            responsibleUserId: disinfectantResponsibleUser?.id || null,
            responsibleTitle: disinfectantConfig.responsibleRole,
            config: disinfectantConfig as Prisma.InputJsonValue,
          },
        });
      }
      if (!disStatuses.has("closed")) {
        const { closedFrom } = getCurrentAndPreviousMonthBounds();
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: DISINFECTANT_DOCUMENT_TITLE,
            status: "closed",
            dateFrom: closedFrom,
            dateTo: closedFrom,
            createdById: session.user.id,
            responsibleUserId: disinfectantResponsibleUser?.id || null,
            responsibleTitle: disinfectantConfig.responsibleRole,
            config: disinfectantConfig as Prisma.InputJsonValue,
          },
        });
      }

      const disDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return withBanner(
        <DisinfectantDocumentsClient
          routeCode={code === DISINFECTANT_SOURCE_SLUG ? code : resolvedCode}
          templateCode={resolvedCode}
          activeTab={activeTab}
          users={orgUsers}
          documents={disDocuments.map((document) => ({
            id: document.id,
            title: document.title || DISINFECTANT_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            config: document.config,
          }))}
        />
      );
    }

    if (shouldNormalizeDemoSamples && resolvedCode === TRAINING_PLAN_TEMPLATE_CODE) {
      const existingTP = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        select: { status: true },
      });

      if (existingTP.length === 0) {
        const now = new Date();
        const approveUser = pickPrimaryManager(orgUsers) || orgUsers[0] || null;
        const activeConfig = getTrainingPlanDefaultConfig(now);
        if (approveUser) {
          activeConfig.approveEmployeeId = approveUser.id;
          activeConfig.approveEmployee = approveUser.name;
        }
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: `${TRAINING_PLAN_DOCUMENT_TITLE} ${now.getUTCFullYear()}`,
            status: "active",
            dateFrom: new Date(Date.UTC(now.getUTCFullYear(), 0, 11)),
            dateTo: new Date(Date.UTC(now.getUTCFullYear(), 0, 11)),
            createdById: session.user.id,
            responsibleUserId: approveUser?.id || null,
            responsibleTitle: activeConfig.approveRole,
            config: activeConfig,
          },
        });

        const previousYear = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 11));
        const closedConfig = getTrainingPlanDefaultConfig(previousYear);
        if (approveUser) {
          closedConfig.approveEmployeeId = approveUser.id;
          closedConfig.approveEmployee = approveUser.name;
        }
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: `${TRAINING_PLAN_DOCUMENT_TITLE} ${previousYear.getUTCFullYear()}`,
            status: "closed",
            dateFrom: previousYear,
            dateTo: previousYear,
            createdById: session.user.id,
            responsibleUserId: approveUser?.id || null,
            responsibleTitle: closedConfig.approveRole,
            config: closedConfig,
          },
        });
      }

      const tpDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return withBanner(
        <TrainingPlanDocumentsClient
          routeCode={code === TRAINING_PLAN_SOURCE_SLUG ? code : resolvedCode}
          templateCode={resolvedCode}
          activeTab={activeTab}
          users={orgUsers}
          documents={tpDocuments.map((document) => ({
            id: document.id,
            title: document.title || TRAINING_PLAN_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            dateTo: document.dateTo.toISOString().slice(0, 10),
            config: document.config,
          }))}
        />
      );
    }

    if (shouldNormalizeDemoSamples && resolvedCode === AUDIT_PLAN_TEMPLATE_CODE) {
      const existingAuditPlans = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        select: { status: true },
      });
      const auditPlanStatuses = new Set(existingAuditPlans.map((document) => document.status));

      if (!auditPlanStatuses.has("active")) {
        const defaultConfig = getAuditPlanDefaultConfig({
          organizationName: 'ООО "Тест"',
          users: orgUsers,
        });

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: AUDIT_PLAN_DOCUMENT_TITLE,
            status: "active",
            dateFrom: new Date(defaultConfig.documentDate),
            dateTo: new Date(defaultConfig.documentDate),
            createdById: session.user.id,
            config: defaultConfig,
          },
        });
      }
      if (!auditPlanStatuses.has("closed")) {
        const defaultConfig = getAuditPlanDefaultConfig({
          organizationName: 'ООО "Тест"',
          users: orgUsers,
        });
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: AUDIT_PLAN_DOCUMENT_TITLE,
            status: "closed",
            dateFrom: new Date("2025-01-15T00:00:00.000Z"),
            dateTo: new Date("2025-01-15T00:00:00.000Z"),
            createdById: session.user.id,
            config: defaultConfig,
          },
        });
      }

      const auditPlanDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return withBanner(
        <AuditPlanDocumentsClient
          routeCode={code === AUDIT_PLAN_SOURCE_SLUG ? code : resolvedCode}
          templateCode={resolvedCode}
          activeTab={activeTab}
          users={orgUsers}
          documents={auditPlanDocuments.map((document) => ({
            id: document.id,
            title: document.title || AUDIT_PLAN_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            dateTo: document.dateTo.toISOString().slice(0, 10),
            config: normalizeAuditPlanConfig(document.config, {
              organizationName: 'ООО "Тест"',
              users: orgUsers,
            }),
          }))}
        />
      );
    }

    if (resolvedCode === EQUIPMENT_CLEANING_TEMPLATE_CODE) {
      const existingEquipmentCleaningCount = await db.journalDocument.count({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
        },
      });

      if (existingEquipmentCleaningCount === 0) {
        const { activeFrom, closedFrom } = getCurrentAndPreviousMonthBounds();
        await db.journalDocument.createMany({
          data: [
            {
              templateId: template.id,
              organizationId: session.user.organizationId,
              title: getEquipmentCleaningDocumentTitle(),
              status: "active",
              dateFrom: activeFrom,
              dateTo: activeFrom,
              createdById: session.user.id,
              config: getDefaultEquipmentCleaningConfig(),
            },
            {
              templateId: template.id,
              organizationId: session.user.organizationId,
              title: getEquipmentCleaningDocumentTitle(),
              status: "closed",
              dateFrom: closedFrom,
              dateTo: closedFrom,
              createdById: session.user.id,
              config: getDefaultEquipmentCleaningConfig(),
            },
          ],
        });
      }

      const equipmentCleaningDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return withBanner(
        <EquipmentCleaningDocumentsClient
          activeTab={activeTab}
          templateCode={resolvedCode}
          templateName={template.name}
          users={orgUsers}
          documents={equipmentCleaningDocuments.map((document) => {
            const config = normalizeEquipmentCleaningConfig(document.config);
            return {
              id: document.id,
              title: document.title || getEquipmentCleaningDocumentTitle(),
              status: document.status as "active" | "closed",
              startedAtLabel: getEquipmentCleaningPeriodLabel(document.dateFrom),
              dateFrom: document.dateFrom.toISOString().slice(0, 10),
              fieldVariant: config.fieldVariant,
            };
          })}
        />
      );
    }

    if (shouldNormalizeDemoSamples && resolvedCode === METAL_IMPURITY_TEMPLATE_CODE) {
      const [allMetalDocuments, metalUsers, metalProducts, metalSuppliers] = await Promise.all([
        db.journalDocument.findMany({
          where: {
            organizationId: session.user.organizationId,
            templateId: template.id,
          },
          orderBy: { createdAt: "asc" },
        }),
        db.user.findMany({
          where: {
            organizationId: session.user.organizationId,
            isActive: true,
          },
          select: { id: true, name: true, role: true, positionTitle: true, jobPosition: { select: { name: true, categoryKey: true } } },
          orderBy: [{ role: "asc" }, { name: "asc" }],
        }),
        db.product.findMany({
          where: {
            organizationId: session.user.organizationId,
            isActive: true,
          },
          select: { name: true },
          orderBy: { name: "asc" },
          take: 25,
        }),
        db.batch.findMany({
          where: {
            organizationId: session.user.organizationId,
            supplier: { not: null },
          },
          select: { supplier: true },
          orderBy: { supplier: "asc" },
          distinct: ["supplier"],
          take: 25,
        }),
      ]);

      const metalStatuses = new Set(allMetalDocuments.map((document) => document.status));
      const materialNames = metalProducts.map((item) => item.name).filter(Boolean);
      const supplierNames = metalSuppliers
        .map((item) => item.supplier || "")
        .filter(Boolean);
      const responsibleUser = pickPrimaryManager(metalUsers) || metalUsers[0] || null;

      if (!metalStatuses.has("active")) {
        const config = getDefaultMetalImpurityConfig({
          users: metalUsers,
          materials: materialNames,
          suppliers: supplierNames,
          date: "2025-02-01",
          responsibleName: responsibleUser?.name,
          responsiblePosition: responsibleUser
            ? getUserRoleLabel(responsibleUser.role)
            : undefined,
        });

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: METAL_IMPURITY_DOCUMENT_TITLE,
            status: "active",
            dateFrom: new Date(config.startDate),
            dateTo: new Date(config.startDate),
            responsibleUserId: responsibleUser?.id || null,
            responsibleTitle: config.responsiblePosition,
            createdById: session.user.id,
            config,
          },
        });
      }

      if (!metalStatuses.has("closed")) {
        const config = getDefaultMetalImpurityConfig({
          users: metalUsers,
          materials: materialNames,
          suppliers: supplierNames,
          date: "2025-01-01",
          responsibleName: responsibleUser?.name,
          responsiblePosition: responsibleUser
            ? getUserRoleLabel(responsibleUser.role)
            : undefined,
        });
        config.endDate = "2025-01-31";

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: METAL_IMPURITY_DOCUMENT_TITLE,
            status: "closed",
            dateFrom: new Date(config.startDate),
            dateTo: new Date(config.endDate),
            responsibleUserId: responsibleUser?.id || null,
            responsibleTitle: config.responsiblePosition,
            createdById: session.user.id,
            config,
          },
        });
      }

      const metalDocuments = metalStatuses.has("active") && metalStatuses.has("closed")
        ? allMetalDocuments.filter((document) => document.status === activeTab)
        : await db.journalDocument.findMany({
            where: {
              organizationId: session.user.organizationId,
              templateId: template.id,
              status: activeTab,
            },
            orderBy: { createdAt: "asc" },
          });

      return withBanner(
        <MetalImpurityDocumentsClient
          routeCode={code === METAL_IMPURITY_SOURCE_SLUG ? code : resolvedCode}
          activeTab={activeTab}
          users={metalUsers}
          availableMaterials={materialNames}
          availableSuppliers={supplierNames}
          documents={metalDocuments.map((document) => ({
            id: document.id,
            title: document.title || METAL_IMPURITY_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config: normalizeMetalImpurityConfig(document.config ?? getDefaultMetalImpurityConfig()),
          }))}
        />
      );
    }

    if (isAcceptanceDocumentTemplate(resolvedCode)) {
      const [allAcceptanceDocuments, acceptanceUsers, acceptanceProducts, acceptanceSuppliers] =
        await Promise.all([
          db.journalDocument.findMany({
            where: {
              organizationId: session.user.organizationId,
              templateId: template.id,
            },
            orderBy: { createdAt: "asc" },
          }),
          db.user.findMany({
            where: {
              organizationId: session.user.organizationId,
              isActive: true,
            },
            select: { id: true, name: true, role: true, positionTitle: true, jobPosition: { select: { name: true, categoryKey: true } } },
            orderBy: [{ role: "asc" }, { name: "asc" }],
          }),
          db.product.findMany({
            where: {
              organizationId: session.user.organizationId,
              isActive: true,
            },
            select: { name: true },
            orderBy: { name: "asc" },
            take: 50,
          }),
          db.batch.findMany({
            where: {
              organizationId: session.user.organizationId,
              supplier: { not: null },
            },
            select: { supplier: true },
            orderBy: { supplier: "asc" },
            distinct: ["supplier"],
            take: 50,
          }),
        ]);

      const acceptanceStatuses = new Set(allAcceptanceDocuments.map((document) => document.status));
      const productNames = acceptanceProducts.map((item) => item.name).filter(Boolean);
      const supplierNames = acceptanceSuppliers
        .map((item) => item.supplier || "")
        .filter(Boolean);
      const manufacturerNames = supplierNames;
      const responsibleUser = pickPrimaryManager(acceptanceUsers) || acceptanceUsers[0] || null;

      // Sample docs only for the demo org — real customer orgs start empty.
      if (shouldNormalizeDemoSamples && !acceptanceStatuses.has("active")) {
        const config = buildAcceptanceDocumentConfigFromData({
          users: acceptanceUsers,
          products: productNames,
          manufacturers: manufacturerNames,
          suppliers: supplierNames,
          date: "2025-03-01",
          responsibleTitle: responsibleUser ? getUserRoleLabel(responsibleUser.role) : null,
          responsibleUserId: responsibleUser?.id || null,
          includeSampleRows: true,
        });

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: getAcceptanceDocumentTitle(resolvedCode),
            status: "active",
            dateFrom: new Date("2025-03-01"),
            dateTo: new Date("2025-03-01"),
            responsibleUserId: responsibleUser?.id || null,
            responsibleTitle: config.defaultResponsibleTitle,
            createdById: session.user.id,
            config,
          },
        });
      }

      if (shouldNormalizeDemoSamples && !acceptanceStatuses.has("closed")) {
        const config = buildAcceptanceDocumentConfigFromData({
          users: acceptanceUsers,
          products: productNames,
          manufacturers: manufacturerNames,
          suppliers: supplierNames,
          date: "2025-02-01",
          responsibleTitle: responsibleUser ? getUserRoleLabel(responsibleUser.role) : null,
          responsibleUserId: responsibleUser?.id || null,
          includeSampleRows: true,
        });

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: getAcceptanceDocumentTitle(resolvedCode),
            status: "closed",
            dateFrom: new Date("2025-02-01"),
            dateTo: new Date("2025-02-28"),
            responsibleUserId: responsibleUser?.id || null,
            responsibleTitle: config.defaultResponsibleTitle,
            createdById: session.user.id,
            config,
          },
        });
      }

      const acceptanceDocuments =
        acceptanceStatuses.has("active") && acceptanceStatuses.has("closed")
          ? allAcceptanceDocuments.filter((document) => document.status === activeTab)
          : await db.journalDocument.findMany({
              where: {
                organizationId: session.user.organizationId,
                templateId: template.id,
                status: activeTab,
              },
              orderBy: { createdAt: "asc" },
            });

      return withBanner(
        <IncomingControlDocumentsClient
          templateCode={resolvedCode}
          routeCode={code === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE ? code : resolvedCode}
          activeTab={activeTab}
          users={acceptanceUsers}
          availableProducts={productNames}
          availableManufacturers={manufacturerNames}
          availableSuppliers={supplierNames}
          documents={acceptanceDocuments.map((document) => ({
            id: document.id,
            title: document.title || getAcceptanceDocumentTitle(resolvedCode),
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config: normalizeAcceptanceDocumentConfig(document.config ?? {}, acceptanceUsers),
          }))}
        />
      );
    }

    if (shouldNormalizeDemoSamples && resolvedCode === BREAKDOWN_HISTORY_TEMPLATE_CODE) {
      const existingBH = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        select: { status: true },
      });
      const bhStatuses = new Set(existingBH.map((d) => d.status));
      if (!bhStatuses.has("active")) {
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: BREAKDOWN_HISTORY_DOCUMENT_TITLE,
            status: "active",
            dateFrom: new Date("2021-10-28"),
            dateTo: new Date("2021-10-28"),
            createdById: session.user.id,
            config: getBreakdownHistoryDefaultConfig(),
          },
        });
      }
      if (!bhStatuses.has("closed")) {
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: BREAKDOWN_HISTORY_DOCUMENT_TITLE,
            status: "closed",
            dateFrom: new Date("2021-09-28"),
            dateTo: new Date("2021-09-28"),
            createdById: session.user.id,
            config: getBreakdownHistoryDefaultConfig(),
          },
        });
      }

      const bhDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return withBanner(
        <BreakdownHistoryDocumentsClient
          routeCode={code === BREAKDOWN_HISTORY_SOURCE_SLUG ? code : resolvedCode}
          templateCode={resolvedCode}
          activeTab={activeTab}
          documents={bhDocuments.map((document) => ({
            id: document.id,
            title: document.title || BREAKDOWN_HISTORY_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config: document.config,
          }))}
        />
      );
    }

    if (shouldNormalizeDemoSamples && resolvedCode === ACCIDENT_DOCUMENT_TEMPLATE_CODE) {
      const existingAccidentDocuments = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        select: { status: true },
      });
      const accidentStatuses = new Set(existingAccidentDocuments.map((d) => d.status));

      if (!accidentStatuses.has("active")) {
        const areaNames = (
          await db.area.findMany({
            where: { organizationId: session.user.organizationId },
            select: { name: true },
            orderBy: { name: "asc" },
          })
        ).map((item) => item.name);

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: ACCIDENT_DOCUMENT_TITLE,
            status: "active",
            dateFrom: new Date("2021-10-01"),
            dateTo: new Date("2021-10-01"),
            createdById: session.user.id,
            config: buildAccidentDocumentDemoConfig({
              areaNames,
              userNames: orgUsers.map((user) => user.name),
            }),
          },
        });
      }
      if (!accidentStatuses.has("closed")) {
        const areaNames = (
          await db.area.findMany({
            where: { organizationId: session.user.organizationId },
            select: { name: true },
            orderBy: { name: "asc" },
          })
        ).map((item) => item.name);

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: ACCIDENT_DOCUMENT_TITLE,
            status: "closed",
            dateFrom: new Date("2021-09-01"),
            dateTo: new Date("2021-09-01"),
            createdById: session.user.id,
            config: buildAccidentDocumentDemoConfig({
              areaNames,
              userNames: orgUsers.map((user) => user.name),
            }),
          },
        });
      }

      const accidentDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return withBanner(
        <AccidentDocumentsClient
          routeCode={code === ACCIDENT_DOCUMENT_SOURCE_SLUG ? code : resolvedCode}
          templateCode={resolvedCode}
          activeTab={activeTab}
          documents={accidentDocuments.map((document) => ({
            id: document.id,
            title: document.title || ACCIDENT_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
          }))}
        />
      );
    }

    if (resolvedCode === PPE_ISSUANCE_TEMPLATE_CODE) {
      if (shouldNormalizeDemoSamples) {
        await ensurePpeIssuanceSampleDocuments({
          templateId: template.id,
          organizationId: session.user.organizationId,
          createdById: session.user.id,
          users: orgUsers,
        });
      }

      const ppeDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { dateFrom: "asc" },
      });

      return withBanner(
        <PpeIssuanceDocumentsClient
          routeCode={code === PPE_ISSUANCE_SOURCE_SLUG ? code : resolvedCode}
          templateCode={resolvedCode}
          activeTab={activeTab}
          users={orgUsers}
          documents={ppeDocuments.map((document) => ({
            id: document.id,
            title: document.title || PPE_ISSUANCE_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config: document.config,
          }))}
        />
      );
    }

    if (shouldNormalizeDemoSamples && resolvedCode === CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE) {
      const existingChecklistDocuments = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        orderBy: { dateFrom: "desc" },
      });

      const statuses = new Set(existingChecklistDocuments.map((document) => document.status));
      if (!statuses.has("active")) {
        const { dateFrom: activeDateFrom, dateTo: activeDateTo } =
          getCleaningVentilationMonthBounds(new Date().toISOString().slice(0, 10));
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: CLEANING_VENTILATION_CHECKLIST_TITLE,
            status: "active",
            dateFrom: new Date(activeDateFrom),
            dateTo: new Date(activeDateTo),
            createdById: session.user.id,
            config: getDefaultCleaningVentilationConfig(orgUsers),
          },
        });
      }

      if (!statuses.has("closed")) {
        const previousMonth = new Date();
        previousMonth.setMonth(previousMonth.getMonth() - 1);
        const { dateFrom: closedDateFrom, dateTo: closedDateTo } =
          getCleaningVentilationMonthBounds(previousMonth.toISOString().slice(0, 10));
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: CLEANING_VENTILATION_CHECKLIST_TITLE,
            status: "closed",
            dateFrom: new Date(closedDateFrom),
            dateTo: new Date(closedDateTo),
            createdById: session.user.id,
            config: getDefaultCleaningVentilationConfig(orgUsers),
          },
        });
      }

      const checklistDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { dateFrom: "desc" },
      });

      return withBanner(
        <CleaningVentilationChecklistDocumentsClient
          routeCode={code}
          templateCode={resolvedCode}
          activeTab={activeTab}
          users={orgUsers}
          documents={checklistDocuments.map((document) => ({
            id: document.id,
            title: document.title || CLEANING_VENTILATION_CHECKLIST_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config:
              document.config && typeof document.config === "object" && !Array.isArray(document.config)
                ? normalizeCleaningVentilationConfig(document.config, orgUsers)
                : null,
          }))}
        />
      );
    }

    if (isSanitaryDayChecklistTemplate(resolvedCode)) {
      const existingSdc = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        select: { status: true },
      });

      if (existingSdc.length === 0) {
        const today = new Date();
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: getSanitaryDayChecklistTitle(resolvedCode),
            status: "active",
            dateFrom: today,
            dateTo: today,
            createdById: session.user.id,
            config: defaultSdcConfig(),
          },
        });
      }

      const sdcStatuses = new Set(existingSdc.map((document) => document.status));
      if (!sdcStatuses.has("closed")) {
        const { closedFrom } = getCurrentAndPreviousMonthBounds();
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: getSanitaryDayChecklistTitle(resolvedCode),
            status: "closed",
            dateFrom: closedFrom,
            dateTo: closedFrom,
            createdById: session.user.id,
            config: defaultSdcConfig(),
          },
        });
      }

      const sdcDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { dateFrom: "desc" },
      });

      return withBanner(
        <SanitaryDayChecklistDocumentsClient
          routeCode={code}
          templateCode={resolvedCode}
          activeTab={activeTab}
          users={orgUsers}
          documents={sdcDocuments.map((document) => ({
            id: document.id,
            title: document.title || getSanitaryDayChecklistTitle(resolvedCode),
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config:
              document.config && typeof document.config === "object" && !Array.isArray(document.config)
                ? (document.config as Record<string, unknown>)
                : null,
          }))}
        />
      );
    }

    if (resolvedCode === TRACEABILITY_DOCUMENT_TEMPLATE_CODE) {
      return withBanner(
        <TraceabilityDocumentsClient
          activeTab={activeTab}
          routeCode={code === TRACEABILITY_DOCUMENT_SOURCE_SLUG ? code : resolvedCode}
          templateCode={resolvedCode}
          templateName={template.name}
          documents={documents.map((document) => ({
            id: document.id,
            title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config:
              document.config && typeof document.config === "object" && !Array.isArray(document.config)
                ? (document.config as Record<string, unknown>)
                : null,
          }))}
        />
      );
    }

    if (
      resolvedCode === CLIMATE_DOCUMENT_TEMPLATE_CODE ||
      resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE ||
      resolvedCode === CLEANING_DOCUMENT_TEMPLATE_CODE ||
      isTrackedDocumentTemplate(resolvedCode)
    ) {
      if (resolvedCode === CLEANING_DOCUMENT_TEMPLATE_CODE) {
        return withBanner(
          <CleaningDocumentsClient
            activeTab={activeTab}
            routeCode={code}
            templateCode={resolvedCode}
            users={orgUsers}
            documents={documents.map((document) => ({
              id: document.id,
              title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
              status: document.status as "active" | "closed",
              dateFrom: document.dateFrom.toISOString().slice(0, 10),
              dateTo: document.dateTo.toISOString().slice(0, 10),
              config: document.config,
            }))}
          />
        );
      }

      if (shouldNormalizeDemoSamples && resolvedCode === FRYER_OIL_TEMPLATE_CODE) {
        return withBanner(
          <FryerOilDocumentsClient
            activeTab={activeTab}
            routeCode={code}
            templateCode={resolvedCode}
            templateName={template.name}
            users={orgUsers}
            documents={documents.map((document) => ({
              id: document.id,
              title: document.title || "Журнал учета использования фритюрных жиров",
              status: document.status as "active" | "closed",
              responsibleTitle: document.responsibleTitle,
              dateFrom: document.dateFrom.toISOString().slice(0, 10),
            }))}
          />
        );
      }

      if (resolvedCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE) {
        return withBanner(
          <ColdEquipmentDocumentsClient
            activeTab={activeTab}
            routeCode={code}
            templateCode={resolvedCode}
            templateName={template.name}
            users={orgUsers}
            documents={documents.map((document) => ({
              id: document.id,
              title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
              status: document.status as "active" | "closed",
              responsibleTitle: document.responsibleTitle,
              responsibleUserName: document.responsibleUserId
                ? orgUsers.find((user) => user.id === document.responsibleUserId)?.name || null
                : null,
              periodLabel: getJournalDocumentPeriodLabel(
                resolvedCode,
                document.dateFrom,
                document.dateTo
              ),
              dateFrom: document.dateFrom.toISOString().slice(0, 10),
              dateTo: document.dateTo.toISOString().slice(0, 10),
            }))}
          />
        );
      }

      if (shouldNormalizeDemoSamples && resolvedCode === UV_LAMP_RUNTIME_TEMPLATE_CODE) {
        return withBanner(
          <UvLampRuntimeDocumentsClient
            activeTab={activeTab}
            routeCode={code}
            templateCode={resolvedCode}
            templateName={template.name}
            users={orgUsers}
            documents={documents.map((document) => {
              const config = normalizeUvRuntimeDocumentConfig(document.config);
              return {
                id: document.id,
                title: document.title || buildUvRuntimeDocumentTitle(config),
                status: document.status as "active" | "closed",
                responsibleTitle: document.responsibleTitle,
                responsibleUserId: document.responsibleUserId,
                dateFrom: document.dateFrom.toISOString().slice(0, 10),
                config:
                  document.config && typeof document.config === "object" && !Array.isArray(document.config)
                    ? (document.config as Record<string, unknown>)
                    : null,
                periodLabel: formatRuDateDash(document.dateFrom),
              };
            })}
          />
        );
      }

      const trackedHeading =
        isAcceptanceDocumentTemplate(resolvedCode)
          ? "Журнал приемки и входного контроля продукции"
          : template.name;

      return withBanner(
        <TrackedDocumentsClient
          activeTab={activeTab}
          templateCode={resolvedCode}
          templateName={template.name}
          heading={trackedHeading}
          users={orgUsers}
          documents={documents.map((document) => ({
            id: document.id,
            title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
            status: document.status as "active" | "closed",
            responsibleTitle: document.responsibleTitle,
            responsibleUserName: document.responsibleUserId
              ? orgUsers.find((user) => user.id === document.responsibleUserId)?.name || null
              : null,
            periodLabel: getJournalDocumentPeriodLabel(resolvedCode, document.dateFrom, document.dateTo),
            ...getTrackedMeta(resolvedCode, document.dateFrom, document.dateTo),
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            dateTo: document.dateTo.toISOString().slice(0, 10),
            config:
              document.config && typeof document.config === "object" && !Array.isArray(document.config)
                ? (document.config as Record<string, unknown>)
                : null,
          }))}
        />
      );
    }

    return withBanner(
      <HygieneDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || getJournalDocumentDefaultTitle(resolvedCode),
          status: document.status as "active" | "closed",
          responsibleTitle: document.responsibleTitle,
          periodLabel: getJournalDocumentPeriodLabel(resolvedCode, document.dateFrom, document.dateTo),
        }))}
      />
    );
  }

  if (resolvedCode === COMPLAINT_REGISTER_TEMPLATE_CODE) {
    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { createdAt: "asc" },
    });

    return withBanner(
      <ComplaintDocumentsClient
        activeTab={activeTab}
        routeCode={code}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || COMPLAINT_REGISTER_TITLE,
          status: document.status as "active" | "closed",
          dateFrom: document.dateFrom.toISOString().slice(0, 10),
          config: normalizeComplaintConfig(document.config as never),
        }))}
      />
    );
  }

  if (resolvedCode === AUDIT_PROTOCOL_TEMPLATE_CODE) {
    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { createdAt: "asc" },
    });

    return withBanner(
      <AuditProtocolDocumentsClient
        activeTab={activeTab}
        routeCode={code}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || AUDIT_PROTOCOL_DOCUMENT_TITLE,
          status: document.status as "active" | "closed",
          dateFrom: document.dateFrom.toISOString().slice(0, 10),
          config: document.config,
        }))}
      />
    );
  }

  if (resolvedCode === AUDIT_REPORT_TEMPLATE_CODE) {
    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { createdAt: "asc" },
    });

    return withBanner(
      <AuditReportDocumentsClient
        activeTab={activeTab}
        routeCode={code}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || AUDIT_REPORT_DOCUMENT_TITLE,
          status: document.status as "active" | "closed",
          dateFrom: document.dateFrom.toISOString().slice(0, 10),
          config: document.config,
        }))}
      />
    );
  }

  const entries = await db.journalEntry.findMany({
    where: {
      organizationId: session.user.organizationId,
      templateId: template.id,
    },
    orderBy: { createdAt: "desc" },
    include: {
      filledBy: {
        select: {
          name: true,
        },
      },
    },
  });

  return withBanner(
    <div className="space-y-8">
      {/* Hero — mirrors /journals index styling for a consistent journey */}
      <section className="relative overflow-hidden rounded-3xl border border-[#ececf4] bg-[#0b1024] text-white shadow-[0_20px_60px_-30px_rgba(11,16,36,0.55)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[380px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-32 -right-32 size-[420px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
          <div className="absolute left-1/3 top-1/2 size-[240px] rounded-full bg-[#3d4efc] opacity-25 blur-[100px]" />
        </div>
        <div className="relative z-10 flex flex-col gap-6 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-8 md:p-10">
          <div className="max-w-[640px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] uppercase tracking-[0.18em] text-white/80 backdrop-blur">
              Журнал
            </div>
            <h1 className="mt-4 text-[clamp(1.625rem,1.5vw+1.2rem,2rem)] font-semibold leading-tight tracking-[-0.02em]">
              {template.name}
            </h1>
            {template.description ? (
              <p className="mt-2 text-[15px] leading-[1.55] text-white/70">
                {template.description}
              </p>
            ) : null}
            <div className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-2.5 text-[13px] text-white/80 backdrop-blur ring-1 ring-white/10">
              <span className="text-[22px] font-semibold leading-none tabular-nums">
                {entries.length}
              </span>
              <span className="text-white/60">
                {entries.length === 1 ? "запись" : "записей"}
              </span>
            </div>
          </div>
          <Link
            href={`/journals/${resolvedCode}/new`}
            className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-[14px] font-medium text-[#0b1024] shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)] transition-colors hover:bg-white/90 sm:w-auto sm:self-start sm:justify-start"
          >
            <Plus className="size-4 text-[#5566f6]" />
            Новая запись
          </Link>
        </div>
      </section>

      {entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#dcdfed] bg-[#fafbff] px-4 py-14 text-center sm:px-6">
          <div className="text-[15px] font-medium text-[#0b1024]">
            Записей пока нет
          </div>
          <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] text-[#6f7282]">
            Первая запись появится здесь сразу после сохранения на
            странице «Новая запись».
          </p>
          <Link
            href={`/journals/${resolvedCode}/new`}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-2xl bg-[#5566f6] px-4 text-[13px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0]"
          >
            <Plus className="size-4" />
            Создать запись
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {entries.map((entry) => {
            const statusLabel =
              entry.status === "submitted"
                ? "Отправлено"
                : entry.status === "draft"
                ? "Черновик"
                : entry.status === "finalized"
                ? "Закрыто"
                : entry.status;
            return (
              <li key={entry.id}>
                <Link
                  href={`/journals/${resolvedCode}/${entry.id}`}
                  className="group flex h-full flex-col gap-3 rounded-2xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] transition-all hover:-translate-y-0.5 hover:border-[#5566f6]/40 hover:shadow-[0_16px_40px_-24px_rgba(85,102,246,0.35)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold leading-tight text-[#0b1024]">
                        {entry.createdAt.toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="mt-1.5 text-[13px] text-[#6f7282]">
                        Заполнил: {entry.filledBy?.name || "—"}
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-[#f5f6ff] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[#3848c7]">
                      {statusLabel}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
