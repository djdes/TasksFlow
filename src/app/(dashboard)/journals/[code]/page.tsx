import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { HygieneDocumentsClient } from "@/components/journals/hygiene-documents-client";
import {
  buildDateKeys,
  buildExampleHygieneEntryMap,
  buildHygieneExampleEmployees,
  getHygieneDemoTeamUsers,
  getHealthSeedDocumentConfigs,
  getHygieneDefaultResponsibleTitle,
  getHygieneSeedDocumentConfigs,
} from "@/lib/hygiene-document";
import {
  getJournalDocumentDefaultTitle,
  getJournalDocumentPeriodLabel,
  isDocumentTemplate,
} from "@/lib/journal-document-helpers";
import { FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE } from "@/lib/finished-product-document";
import { FinishedProductDocumentsClient } from "@/components/journals/finished-product-documents-client";
import { CLIMATE_DOCUMENT_TEMPLATE_CODE } from "@/lib/climate-document";
import { COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE } from "@/lib/cold-equipment-document";
import {
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  defaultCleaningDocumentConfig,
  buildCleaningAutoFillEntries,
} from "@/lib/cleaning-document";
import { TrackedDocumentsClient } from "@/components/journals/tracked-documents-client";
import {
  getTrackedDocumentCreateMode,
  isSourceStyleTrackedTemplate,
  isTrackedDocumentTemplate,
} from "@/lib/tracked-document";
import { UvLampRuntimeDocumentsClient } from "@/components/journals/uv-lamp-runtime-documents-client";
import { resolveJournalCodeAlias } from "@/lib/source-journal-map";
import { MedBookDocumentsClient } from "@/components/journals/med-book-documents-client";
import {
  MED_BOOK_TEMPLATE_CODE,
  MED_BOOK_DOCUMENT_TITLE,
  getDefaultMedBookConfig,
  emptyMedBookEntry,
} from "@/lib/med-book-document";
import { ACCEPTANCE_DOCUMENT_TEMPLATE_CODE } from "@/lib/acceptance-document";
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
import {
  DISINFECTANT_TEMPLATE_CODE,
  DISINFECTANT_SOURCE_SLUG,
  DISINFECTANT_DOCUMENT_TITLE,
  getDisinfectantDefaultConfig,
} from "@/lib/disinfectant-document";
import { DisinfectantDocumentsClient } from "@/components/journals/disinfectant-documents-client";
import { PestControlDocumentsClient } from "@/components/journals/pest-control-documents-client";
import {
  buildDailyRange,
  UV_LAMP_RUNTIME_TEMPLATE_CODE,
  buildUvRuntimeDocumentTitle,
  defaultUvSpecification,
  formatRuDateDash,
  normalizeUvRuntimeDocumentConfig,
} from "@/lib/uv-lamp-runtime-document";
import { FryerOilDocumentsClient } from "@/components/journals/fryer-oil-documents-client";
import { FRYER_OIL_TEMPLATE_CODE } from "@/lib/fryer-oil-document";
import {
  PEST_CONTROL_DOCUMENT_TITLE,
  PEST_CONTROL_PAGE_TITLE,
  PEST_CONTROL_TEMPLATE_CODE,
} from "@/lib/pest-control-document";
import { PerishableRejectionDocumentsClient } from "@/components/journals/perishable-rejection-documents-client";
import {
  PERISHABLE_REJECTION_TEMPLATE_CODE,
  getDefaultPerishableRejectionConfig,
} from "@/lib/perishable-rejection-document";
import { ProductWriteoffDocumentsClient } from "@/components/journals/product-writeoff-documents-client";
import {
  PRODUCT_WRITEOFF_TEMPLATE_CODE,
  PRODUCT_WRITEOFF_DOCUMENT_TITLE,
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
import {
  GLASS_CONTROL_DEFAULT_FREQUENCY,
  GLASS_CONTROL_DOCUMENT_TITLE,
  GLASS_CONTROL_PAGE_TITLE,
  GLASS_CONTROL_SOURCE_SLUG,
  GLASS_CONTROL_TEMPLATE_CODE,
  getDefaultGlassControlConfig,
} from "@/lib/glass-control-document";
import { StaffTrainingDocumentsClient } from "@/components/journals/staff-training-documents-client";
import {
  STAFF_TRAINING_TEMPLATE_CODE,
  STAFF_TRAINING_DOCUMENT_TITLE,
  getDefaultStaffTrainingConfig,
  buildStaffTrainingSeedRows,
} from "@/lib/staff-training-document";
import { EquipmentMaintenanceDocumentsClient } from "@/components/journals/equipment-maintenance-documents-client";
import {
  EQUIPMENT_MAINTENANCE_TEMPLATE_CODE,
  getDefaultEquipmentMaintenanceConfig,
} from "@/lib/equipment-maintenance-document";
import { SanitaryDayChecklistDocumentsClient } from "@/components/journals/sanitary-day-checklist-documents-client";
import {
  SANITARY_DAY_CHECKLIST_TEMPLATE_CODE,
  SANITARY_DAY_CHECKLIST_TITLE,
  defaultSdcConfig,
} from "@/lib/sanitary-day-checklist-document";
import { EquipmentCalibrationDocumentsClient } from "@/components/journals/equipment-calibration-documents-client";
import {
  buildEquipmentCalibrationConfigFromEquipment,
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
  formatScanJournalDate,
  getScanJournalConfig,
  isScanOnlyDocumentTemplate,
} from "@/lib/scan-journal-config";
import { getScanJournalPageCount } from "@/lib/scan-journal-pages";
import { ScanJournalDocumentsClient } from "@/components/journals/scan-journal-documents-client";
import { EquipmentCleaningDocumentsClient } from "@/components/journals/equipment-cleaning-documents-client";
import {
  emptyEquipmentCleaningRow,
  EQUIPMENT_CLEANING_DOCUMENT_TITLE,
  EQUIPMENT_CLEANING_TEMPLATE_CODE,
  normalizeEquipmentCleaningConfig,
} from "@/lib/equipment-cleaning-document";
import { ComplaintDocumentsClient } from "@/components/journals/complaint-documents-client";
import {
  buildComplaintRow,
  type ComplaintDocumentConfig,
  COMPLAINT_REGISTER_TEMPLATE_CODE,
  COMPLAINT_REGISTER_TITLE,
} from "@/lib/complaint-document";
import {
  createIntensiveCoolingRow,
  getDefaultIntensiveCoolingConfig,
  getResponsibleTitleByRole,
  INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME,
  INTENSIVE_COOLING_SOURCE_SLUG,
  INTENSIVE_COOLING_TEMPLATE_CODE,
} from "@/lib/intensive-cooling-document";

export const dynamic = "force-dynamic";
const SOURCE_STYLE_TRACKED_DEMO_CODES = new Set([
  "daily_rejection",
  "raw_storage_control",
  "defrosting_control",
  "uv_lamp_runtime",
  "fryer_oil",
]);

type TrackedTemplateField = {
  key: string;
  type?: string;
  label?: string;
  options?: Array<{ value: string; label: string }>;
};

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

  const responsibleUser =
    users.find((user) => user.role === "owner") ||
    users.find((user) => user.role === "technologist") ||
    users[0] ||
    null;

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

function userRoleLabel(role: string) {
  if (role === "owner") return "Управляющий";
  if (role === "technologist") return "Технолог";
  return "Оператор";
}

function getTrackedMeta(templateCode: string, dateFrom: Date, dateTo: Date) {
  if (templateCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE) {
    return {
      metaLabel: "Р”Р°С‚Р° РЅР°С‡Р°Р»Р°",
      metaValue: toSourceDateLabel(dateFrom),
    };
  }

  if (templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE) {
    return {
      metaLabel: "Р”Р°С‚Р° РЅР°С‡Р°Р»Р°",
      metaValue: toSourceDateLabel(dateFrom),
    };
  }

  if (!isSourceStyleTrackedTemplate(templateCode)) {
    return {
      metaLabel: "РџРµСЂРёРѕРґ",
      metaValue: getJournalDocumentPeriodLabel(templateCode, dateFrom, dateTo),
    };
  }

  const mode = getTrackedDocumentCreateMode(templateCode);
  if (mode === "staff") {
    return {
      metaLabel: "РџРµСЂРёРѕРґ",
      metaValue: getJournalDocumentPeriodLabel(templateCode, dateFrom, dateTo),
    };
  }

  if (mode === "uv") {
    return {
      metaLabel: "Р”Р°С‚Р° РЅР°С‡Р°Р»Р°",
      metaValue: toSourceDateLabel(dateFrom),
    };
  }

  return {
    metaLabel: "Р”Р°С‚Р° РґРѕРєСѓРјРµРЅС‚Р°",
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

  const activeUser =
    users.find((user) => user.role === "owner") ||
    users.find((user) => user.role === "technologist") ||
    users[0];

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

async function ensurePestControlSampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
  users: { id: string; name: string; role: string }[];
}) {
  const { templateId, organizationId, createdById, users } = params;
  const existing = await db.journalDocument.findMany({
    where: {
      templateId,
      organizationId,
    },
    select: {
      id: true,
      status: true,
      _count: { select: { entries: true } },
    },
  });

  const statuses = new Set(existing.map((item) => item.status));
  const responsibleUser =
    users.find((user) => user.role === "owner") ||
    users.find((user) => user.role === "technologist") ||
    users[0];

  if (!responsibleUser) return;

  const secondaryUser =
    users.find((user) => user.id !== responsibleUser.id) || responsibleUser;

  const activeFrom = new Date("2025-03-05T00:00:00.000Z");
  const closedFrom = new Date("2025-02-05T00:00:00.000Z");

  if (!statuses.has("active")) {
    const activeDocument = await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: PEST_CONTROL_DOCUMENT_TITLE,
        status: "active",
        dateFrom: activeFrom,
        dateTo: activeFrom,
        createdById,
      },
      select: { id: true },
    });

    await db.journalDocumentEntry.createMany({
      data: [
        {
          documentId: activeDocument.id,
          employeeId: responsibleUser.id,
          date: new Date("2025-03-17T18:00:00.000Z"),
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
            acceptedRole: "Управляющий",
            acceptedEmployeeId: responsibleUser.id,
          },
        },
        {
          documentId: activeDocument.id,
          employeeId: secondaryUser.id,
          date: new Date("2025-03-25T11:00:01.000Z"),
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
            acceptedRole: "Управляющий",
            acceptedEmployeeId: secondaryUser.id,
          },
        },
      ],
      skipDuplicates: true,
    });
  }

  if (!statuses.has("closed")) {
    await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: PEST_CONTROL_DOCUMENT_TITLE,
        status: "closed",
        dateFrom: closedFrom,
        dateTo: new Date("2025-02-28T00:00:00.000Z"),
        createdById,
      },
    });
  }
}

async function ensureSanitationDaySampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
}) {
  const { templateId, organizationId, createdById } = params;
  const currentYearDate = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const previousYearDate = new Date(
    Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)
  );

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
    await db.journalDocument.create({
      data: {
        templateId,
        organizationId,
        title: SANITATION_DAY_DOCUMENT_TITLE,
        status: doc.status,
        dateFrom: doc.date,
        dateTo: doc.date,
        createdById,
        config: getSanitationDayDefaultConfig(doc.date),
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
  const closedFrom2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));

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
    {
      status: "closed" as const,
      dateFrom: closedFrom2,
      config: buildPpeIssuanceDemoConfig(users, closedFrom2),
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

async function ensureComplaintSampleDocuments(params: {
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

  const products = await db.product.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    select: { name: true },
    orderBy: { name: "asc" },
    take: 2,
  });

  const applicantName = users[0]?.name || "Иванов И.И.";
  const productName = products[0]?.name || "готовой продукции";

  await db.journalDocument.create({
    data: {
      templateId,
      organizationId,
      title: COMPLAINT_REGISTER_TITLE,
      status: "active",
      dateFrom: new Date("2021-10-01"),
      dateTo: new Date("2021-10-01"),
      createdById,
      responsibleUserId: users[0]?.id || null,
      responsibleTitle: getHygieneDefaultResponsibleTitle(users),
      config: {
        rows: [
          buildComplaintRow({
            receiptDate: "2021-10-29",
            applicantName,
            complaintReceiptForm: "по электронной почте",
            applicantDetails: `Контактные данные заявителя для ответа по жалобе на ${productName}.`,
            complaintContent: `Жалоба на качество ${productName}: нарушены ожидания по органолептическим показателям и сроку ответа.`,
            decisionDate: "2021-10-29",
            decisionSummary: `Проведена проверка партии ${productName}, заявителю направлен ответ, корректирующие действия назначены.`,
          }),
        ],
        defaultResponsibleUserId: users[0]?.id || null,
        defaultResponsibleTitle: getHygieneDefaultResponsibleTitle(users),
        finishedAt: null,
      },
    },
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
        where: {
          templateId,
          organizationId,
        },
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

  const responsibleUser =
    users.find((user) => user.role === "owner") ||
    users.find((user) => user.role === "technologist") ||
    users[0] ||
    null;
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
        responsibleTitle: responsibleTitle,
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

async function ensureTraceabilitySampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
}) {
  const { templateId, organizationId, createdById, users } = params;

  const activeCount = await db.journalDocument.count({
    where: {
      templateId,
      organizationId,
      status: "active",
    },
  });

  if (activeCount > 0) return;

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

  const responsibleUser =
    users.find((user) => user.role === "owner") ||
    users.find((user) => user.role === "technologist") ||
    users[0] ||
    null;
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
      responsibleEmployee: "",
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
      responsibleEmployee: responsibleUser?.name || "Иванов И.И.",
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
      responsibleEmployee: responsibleUser?.name || "Иванов И.И.",
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
    defaultResponsibleEmployee: responsibleUser?.name || "Иванов И.И.",
  });

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

async function ensureGlassControlSampleDocuments(params: {
  templateId: string;
  organizationId: string;
  createdById: string;
  users: { id: string; name: string; role: string; email?: string | null }[];
}) {
  const { templateId, organizationId, createdById, users } = params;

  const existingDocuments = await db.journalDocument.findMany({
    where: { templateId, organizationId },
    select: { id: true, status: true },
  });

  if (existingDocuments.length > 0) return;

  const responsibleUser =
    users.find((user) => user.role === "owner") ||
    users.find((user) => user.role === "technologist") ||
    users[0] ||
    null;

  if (!responsibleUser) return;

  const itemNames = [
    ...(await db.equipment.findMany({
      where: {
        area: {
          organizationId,
        },
      },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 6,
    })).map((item) => item.name.trim()),
    ...(await db.product.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 6,
    })).map((item) => item.name.trim()),
  ].filter((item) => item.length > 0);

  const now = new Date();
  const createRowsForRange = (from: Date, to: Date, withDamage = false) => {
    const rows = buildDailyRange(
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10)
    );

    return rows.map((dateKey, index) => ({
      employeeId: responsibleUser.id,
      date: new Date(`${dateKey}T00:00:00.000Z`),
      data:
        withDamage && index === Math.max(0, rows.length - 2)
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
            },
    }));
  };

  const activeFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const activeTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const closedFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const closedTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

  const activeDocument = await db.journalDocument.create({
    data: {
      templateId,
      organizationId,
      title: GLASS_CONTROL_DOCUMENT_TITLE,
      status: "active",
      dateFrom: activeFrom,
      dateTo: activeFrom,
      responsibleUserId: responsibleUser.id,
      responsibleTitle: "Управляющий",
      autoFill: true,
      createdById,
      config: {
        ...getDefaultGlassControlConfig(),
        documentName: GLASS_CONTROL_DOCUMENT_TITLE,
        controlFrequency: GLASS_CONTROL_DEFAULT_FREQUENCY,
      } as Prisma.InputJsonValue,
    },
  });

  const closedDocument = await db.journalDocument.create({
    data: {
      templateId,
      organizationId,
      title: GLASS_CONTROL_DOCUMENT_TITLE,
      status: "closed",
      dateFrom: closedFrom,
      dateTo: closedTo,
      responsibleUserId: responsibleUser.id,
      responsibleTitle: "Управляющий",
      createdById,
      config: {
        ...getDefaultGlassControlConfig(),
        documentName: GLASS_CONTROL_DOCUMENT_TITLE,
        controlFrequency: GLASS_CONTROL_DEFAULT_FREQUENCY,
      } as Prisma.InputJsonValue,
    },
  });

  await db.journalDocumentEntry.createMany({
    data: createRowsForRange(activeFrom, activeTo, true).map((row) => ({
      documentId: activeDocument.id,
      employeeId: row.employeeId,
      date: row.date,
      data: row.data as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });

  await db.journalDocumentEntry.createMany({
    data: createRowsForRange(closedFrom, closedTo, false).map((row) => ({
      documentId: closedDocument.id,
      employeeId: row.employeeId,
      date: row.date,
      data: row.data as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
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

  const activeTab = tab === "closed" ? "closed" : "active";

  const orgUsers = await db.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    select: { id: true, name: true, role: true, email: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const organization = await db.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { name: true },
  });

  if (resolvedCode === "hygiene" || resolvedCode === "health_check") {
    await ensureStaffJournalSampleDocuments({
      templateCode: resolvedCode,
      organizationId: session.user.organizationId,
      templateId: template.id,
      users: orgUsers,
      createdById: session.user.id,
    });

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    return (
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

  if (isScanOnlyDocumentTemplate(resolvedCode)) {
    const pageCount = await getScanJournalPageCount(resolvedCode);
    if (pageCount === 0) {
      notFound();
    }

    const scanConfig = getScanJournalConfig(resolvedCode);
    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { createdAt: "desc" },
    });

    return (
      <ScanJournalDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={scanConfig?.title || template.name}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || (scanConfig?.title || template.name),
          status: document.status as "active" | "closed",
          dateLabel: scanConfig?.dateLabel || "Дата документа",
          dateValue: formatScanJournalDate(document.dateFrom),
          responsibleLabel: scanConfig?.showResponsible
            ? scanConfig.defaultResponsibleTitle || "Ответственный"
            : null,
          responsibleValue: scanConfig?.showResponsible
            ? document.responsibleTitle || null
            : null,
        }))}
      />
    );
  }

  if (resolvedCode === EQUIPMENT_CLEANING_TEMPLATE_CODE) {
    const existingCount = await db.journalDocument.count({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
      },
    });

    const equipment = await db.equipment.findMany({
      where: {
        area: {
          organizationId: session.user.organizationId,
        },
      },
      select: {
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    if (existingCount === 0) {
      const defaultDate = new Date("2025-03-05T00:00:00.000Z");
      const washer =
        orgUsers.find((user) => user.role === "operator") ||
        orgUsers.find((user) => user.role === "technologist") ||
        orgUsers[0] ||
        null;
      const controller =
        orgUsers.find((user) => user.role === "owner") ||
        orgUsers.find((user) => user.role === "technologist") ||
        orgUsers[0] ||
        null;

      const document = await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: EQUIPMENT_CLEANING_DOCUMENT_TITLE,
          status: "active",
          dateFrom: defaultDate,
          dateTo: defaultDate,
          createdById: session.user.id,
          config: {
            fieldVariant: "rinse_completeness",
          },
        },
      });

      if (washer && controller) {
        const sampleRow = emptyEquipmentCleaningRow({
          washDate: "2025-03-18",
          washTime: "22:30",
          equipmentName: equipment[0]?.name || "Тестомес",
          detergentName: "Ника",
          detergentConcentration: "5 %",
          disinfectantName: "Ника",
          disinfectantConcentration: "1 %",
          rinseResult: "compliant",
          rinseTemperature: "85",
          washerPosition: "Мойщик",
          washerName: washer.name,
          washerUserId: washer.id,
          controllerPosition: userRoleLabel(controller.role),
          controllerName: controller.name,
          controllerUserId: controller.id,
        });

        await db.journalDocumentEntry.create({
          data: {
            documentId: document.id,
            employeeId: washer.id,
            date: new Date("2025-03-18T22:30:00.000Z"),
            data: sampleRow,
          },
        });
      }
    }

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    return (
      <EquipmentCleaningDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((document) => ({
          id: document.id,
          title: document.title || EQUIPMENT_CLEANING_DOCUMENT_TITLE,
          status: document.status as "active" | "closed",
          startedAtLabel: document.dateFrom.toLocaleDateString("ru-RU").replaceAll(".", "-"),
          dateFrom: document.dateFrom.toISOString().slice(0, 10),
          fieldVariant: normalizeEquipmentCleaningConfig(document.config).fieldVariant,
        }))}
      />
    );
  }

  if (resolvedCode === MED_BOOK_TEMPLATE_CODE) {
    // Auto-seed one active sample document if none exist
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

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { createdAt: "asc" },
    });

    return (
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

  if (resolvedCode === PERISHABLE_REJECTION_TEMPLATE_CODE) {
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
          title: "Журнал бракеража",
          status: "active",
          dateFrom,
          dateTo,
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

    return (
      <PerishableRejectionDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || "Журнал бракеража",
          status: doc.status as "active" | "closed",
          startedAtLabel: doc.dateFrom.toLocaleDateString("ru-RU").replaceAll(".", "-"),
          dateFrom: doc.dateFrom.toISOString().slice(0, 10),
          config: doc.config,
        }))}
      />
    );
  }

  if (resolvedCode === PRODUCT_WRITEOFF_TEMPLATE_CODE) {
    const existingStatuses = new Set(
      (
        await db.journalDocument.findMany({
          where: {
            organizationId: session.user.organizationId,
            templateId: template.id,
          },
          select: { status: true },
        })
      ).map((item) => item.status)
    );

    const products = await db.product.findMany({
      where: { organizationId: session.user.organizationId, isActive: true },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    const batches = await db.batch.findMany({
      where: { organizationId: session.user.organizationId },
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
    });

    if (!existingStatuses.has("active")) {
      const activeConfig = buildProductWriteoffConfigFromData({
        users: orgUsers,
        products,
        batches,
        referenceDate: new Date(),
      });

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: activeConfig.documentName,
          status: "active",
          dateFrom: new Date(activeConfig.documentDate),
          dateTo: new Date(activeConfig.documentDate),
          createdById: session.user.id,
          config: activeConfig as Prisma.InputJsonValue,
        },
      });
    }

    if (!existingStatuses.has("closed")) {
      const previousDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 5));
      const closedConfig = buildProductWriteoffConfigFromData({
        users: orgUsers,
        products,
        batches,
        referenceDate: previousDate,
      });

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: closedConfig.documentName,
          status: "closed",
          dateFrom: new Date(closedConfig.documentDate),
          dateTo: new Date(closedConfig.documentDate),
          createdById: session.user.id,
          config: closedConfig as Prisma.InputJsonValue,
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

    return (
      <ProductWriteoffDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || PRODUCT_WRITEOFF_DOCUMENT_TITLE,
          status: doc.status as "active" | "closed",
          dateFrom: doc.dateFrom.toISOString().slice(0, 10),
          config: normalizeProductWriteoffConfig(doc.config),
        }))}
      />
    );
  }

  if (resolvedCode === GLASS_LIST_TEMPLATE_CODE) {
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

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "desc" },
    });

    return (
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

  if (resolvedCode === GLASS_CONTROL_TEMPLATE_CODE) {
    await ensureGlassControlSampleDocuments({
      templateId: template.id,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
      users: orgUsers,
    });

    const glassDocuments = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    return (
      <GlassControlDocumentsClient
        activeTab={activeTab}
        routeCode={code === GLASS_CONTROL_SOURCE_SLUG ? code : resolvedCode}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={glassDocuments.map((document) => ({
          id: document.id,
          title: document.title || GLASS_CONTROL_DOCUMENT_TITLE,
          status: document.status as "active" | "closed",
          responsibleTitle: document.responsibleTitle,
          responsibleUserId: document.responsibleUserId,
          dateFrom: document.dateFrom.toISOString().slice(0, 10),
          config: document.config,
        }))}
      />
    );
  }

  if (resolvedCode === STAFF_TRAINING_TEMPLATE_CODE) {
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

    const documents = await db.journalDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
        status: activeTab,
      },
      orderBy: { dateFrom: "asc" },
    });

    return (
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

  if (resolvedCode === EQUIPMENT_MAINTENANCE_TEMPLATE_CODE) {
    const existingCount = await db.journalDocument.count({
      where: {
        organizationId: session.user.organizationId,
        templateId: template.id,
      },
    });

    if (existingCount === 0) {
      const year = new Date().getUTCFullYear();
      const cfg = getDefaultEquipmentMaintenanceConfig(year);
      const owner = orgUsers.find((u) => u.role === "owner");
      const tech = orgUsers.find((u) => u.role === "technologist");
      if (owner) cfg.approveEmployee = owner.name;
      if (tech) cfg.responsibleEmployee = tech.name;

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: "График",
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

    return (
      <EquipmentMaintenanceDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || "График",
          status: doc.status as "active" | "closed",
          dateFrom: doc.dateFrom.toISOString().slice(0, 10),
          config: doc.config,
        }))}
      />
    );
  }

  if (resolvedCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE) {
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
      const owner = orgUsers.find((u) => u.role === "owner");
      if (owner) cfg.approveEmployee = owner.name;

      await db.journalDocument.create({
        data: {
          templateId: template.id,
          organizationId: session.user.organizationId,
          title: "График поверки",
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

    return (
      <EquipmentCalibrationDocumentsClient
        activeTab={activeTab}
        templateCode={resolvedCode}
        templateName={template.name}
        users={orgUsers}
        documents={documents.map((doc) => ({
          id: doc.id,
          title: doc.title || "График поверки",
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

    await ensureSourceStyleTrackedSampleDocuments({
      templateCode: resolvedCode,
      templateId: template.id,
      organizationId: session.user.organizationId,
      users: orgUsers,
      createdById: session.user.id,
      templateFields: parsedTemplateFields,
    });

    if (resolvedCode === CLEANING_DOCUMENT_TEMPLATE_CODE) {
      const existingCleaningCount = await db.journalDocument.count({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
        },
      });

      if (existingCleaningCount === 0) {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth();
        const dateFrom = new Date(Date.UTC(year, month, 1));
        const dateTo = new Date(Date.UTC(year, month + 1, 0));

        const cleaningConfig = defaultCleaningDocumentConfig(orgUsers);
        const responsibleUser =
          orgUsers.find((u) => u.role === "owner") ||
          orgUsers.find((u) => u.role === "technologist") ||
          orgUsers[0];

        const created = await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: getJournalDocumentDefaultTitle(resolvedCode),
            status: "active",
            dateFrom,
            dateTo,
            createdById: session.user.id,
            responsibleUserId: responsibleUser?.id || null,
            responsibleTitle: responsibleUser
              ? (responsibleUser.role === "owner" ? "Управляющий" : "Управляющий")
              : null,
            config: cleaningConfig,
          },
        });

        // Seed sample entries for past dates
        const sampleEntries = buildCleaningAutoFillEntries({
          config: cleaningConfig,
          dateFrom: `${year}-${String(month + 1).padStart(2, "0")}-01`,
          dateTo: `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(Date.UTC(year, month + 1, 0)).getUTCDate()).padStart(2, "0")}`,
          users: orgUsers.map((u) => ({ id: u.id, name: u.name })),
        });

        if (sampleEntries.length > 0) {
          await db.journalDocumentEntry.createMany({
            data: sampleEntries.map((e) => ({
              documentId: created.id,
              employeeId: responsibleUser?.id || "system",
              date: new Date(e.date),
              data: e.data,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    if (resolvedCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
      const existingDocument = await db.journalDocument.findFirst({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { dateFrom: "asc" },
      });

      if (!existingDocument && activeTab === "active") {
        const currentDate = new Date();
        const year = currentDate.getUTCFullYear();
        const month = currentDate.getUTCMonth();
        const dateFrom = new Date(Date.UTC(year, month, 1));
        const dateTo = new Date(Date.UTC(year, month + 1, 0));

        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: getJournalDocumentDefaultTitle(resolvedCode),
            dateFrom,
            dateTo,
            createdById: session.user.id,
          },
        });
      }
    }

    if (resolvedCode === TRACEABILITY_DOCUMENT_TEMPLATE_CODE) {
      await ensureTraceabilitySampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        users: orgUsers,
      });
    }

    if (resolvedCode === INTENSIVE_COOLING_TEMPLATE_CODE) {
      await ensureIntensiveCoolingSampleDocuments({
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

      return (
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

    if (resolvedCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
      return (
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

    if (resolvedCode === SANITATION_DAY_TEMPLATE_CODE) {
      await ensureSanitationDaySampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
      });

      const sanitationDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return (
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
            config: getDisinfectantDefaultConfig() as Prisma.InputJsonValue,
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

      return (
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

    if (resolvedCode === PEST_CONTROL_TEMPLATE_CODE) {
      await ensurePestControlSampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        users: orgUsers,
      });

      const pestDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { dateFrom: "asc" },
      });

      return (
        <PestControlDocumentsClient
          activeTab={activeTab}
          routeCode={code}
          templateCode={resolvedCode}
          users={orgUsers}
          documents={pestDocuments.map((document) => ({
            id: document.id,
            title: document.title || PEST_CONTROL_DOCUMENT_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
          }))}
        />
      );
    }

    if (resolvedCode === TRAINING_PLAN_TEMPLATE_CODE) {
      // Auto-seed sample documents
      const existingTP = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        select: { status: true },
      });
      const tpStatuses = new Set(existingTP.map((d) => d.status));
      if (!tpStatuses.has("active")) {
        const now = new Date();
        await db.journalDocument.create({
          data: {
            templateId: template.id,
            organizationId: session.user.organizationId,
            title: `${TRAINING_PLAN_DOCUMENT_TITLE} ${now.getUTCFullYear()}`,
            status: "active",
            dateFrom: new Date(Date.UTC(now.getUTCFullYear(), 0, 11)),
            dateTo: new Date(Date.UTC(now.getUTCFullYear(), 0, 11)),
            createdById: session.user.id,
            config: getTrainingPlanDefaultConfig(now),
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

      return (
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

    if (resolvedCode === AUDIT_PLAN_TEMPLATE_CODE) {
      const existingAuditPlans = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        select: { status: true },
      });
      const auditPlanStatuses = new Set(existingAuditPlans.map((document) => document.status));

      if (!auditPlanStatuses.has("active")) {
        const defaultConfig = getAuditPlanDefaultConfig({
          organizationName: organization?.name || 'ООО "Тест"',
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

      const auditPlanDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return (
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
              organizationName: organization?.name || 'ООО "Тест"',
              users: orgUsers,
            }),
          }))}
        />
      );
    }

    if (resolvedCode === BREAKDOWN_HISTORY_TEMPLATE_CODE) {
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

      const bhDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return (
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

    if (resolvedCode === ACCIDENT_DOCUMENT_TEMPLATE_CODE) {
      const existingAccidents = await db.journalDocument.findMany({
        where: { templateId: template.id, organizationId: session.user.organizationId },
        select: { status: true },
      });
      const accidentStatuses = new Set(existingAccidents.map((d) => d.status));
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

      const accidentDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { createdAt: "asc" },
      });

      return (
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

    if (resolvedCode === COMPLAINT_REGISTER_TEMPLATE_CODE) {
      await ensureComplaintSampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        users: orgUsers,
      });

      const complaintDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { dateFrom: "asc" },
      });

      return (
        <ComplaintDocumentsClient
          activeTab={activeTab}
          routeCode={code}
          documents={complaintDocuments.map((document) => ({
            id: document.id,
            title: document.title || COMPLAINT_REGISTER_TITLE,
            status: document.status as "active" | "closed",
            dateFrom: document.dateFrom.toISOString().slice(0, 10),
            config:
              document.config && typeof document.config === "object" && !Array.isArray(document.config)
                ? (document.config as ComplaintDocumentConfig)
                : null,
          }))}
        />
      );
    }

    if (resolvedCode === PPE_ISSUANCE_TEMPLATE_CODE) {
      await ensurePpeIssuanceSampleDocuments({
        templateId: template.id,
        organizationId: session.user.organizationId,
        createdById: session.user.id,
        users: orgUsers,
      });

      const ppeDocuments = await db.journalDocument.findMany({
        where: {
          organizationId: session.user.organizationId,
          templateId: template.id,
          status: activeTab,
        },
        orderBy: { dateFrom: "asc" },
      });

      return (
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

    if (resolvedCode === SANITARY_DAY_CHECKLIST_TEMPLATE_CODE) {
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
            title: SANITARY_DAY_CHECKLIST_TITLE,
            status: "active",
            dateFrom: today,
            dateTo: today,
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

      return (
        <SanitaryDayChecklistDocumentsClient
          routeCode={code}
          templateCode={resolvedCode}
          activeTab={activeTab}
          users={orgUsers}
          documents={sdcDocuments.map((document) => ({
            id: document.id,
            title: document.title || SANITARY_DAY_CHECKLIST_TITLE,
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
      return (
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
      if (resolvedCode === FRYER_OIL_TEMPLATE_CODE) {
        return (
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

      if (resolvedCode === UV_LAMP_RUNTIME_TEMPLATE_CODE) {
        return (
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
        resolvedCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE
          ? "Р–СѓСЂРЅР°Р» РїСЂРёРµРјРєРё Рё РІС…РѕРґРЅРѕРіРѕ РєРѕРЅС‚СЂРѕР»СЏ РїСЂРѕРґСѓРєС†РёРё"
          : template.name;

      return (
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

    return (
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          {template.description ? (
            <p className="mt-1 text-muted-foreground">{template.description}</p>
          ) : null}
        </div>
        <Link
          href={`/journals/${resolvedCode}/new`}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Новая запись
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-muted-foreground">
          Записей пока нет
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Link
              key={entry.id}
              href={`/journals/${resolvedCode}/${entry.id}`}
              className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {entry.createdAt.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Заполнил: {entry.filledBy?.name || "—"}
                  </div>
                </div>
                <div className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {entry.status}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
