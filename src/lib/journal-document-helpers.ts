import {
  getHealthDocumentTitle,
  getHygieneDocumentTitle,
  getHygienePeriodLabel,
} from "@/lib/hygiene-document";
import {
  COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE,
  getColdEquipmentDocumentTitle,
  getColdEquipmentPeriodLabel,
} from "@/lib/cold-equipment-document";
import {
  CLIMATE_DOCUMENT_TEMPLATE_CODE,
  getClimateDocumentTitle,
  getClimatePeriodLabel,
} from "@/lib/climate-document";
import {
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  getCleaningDocumentTitle,
  getCleaningPeriodLabel,
} from "@/lib/cleaning-document";
import {
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  getFinishedProductDocumentTitle,
  getFinishedProductPeriodLabel,
} from "@/lib/finished-product-document";
import {
  getTrackedDocumentTitle,
  isTrackedDocumentTemplate,
} from "@/lib/tracked-document";
import {
  SANITATION_DAY_TEMPLATE_CODE,
  SANITATION_DAY_DOCUMENT_TITLE,
} from "@/lib/sanitation-day-document";
import {
  MED_BOOK_TEMPLATE_CODE,
  MED_BOOK_DOCUMENT_TITLE,
} from "@/lib/med-book-document";
import {
  PERISHABLE_REJECTION_TEMPLATE_CODE,
  PERISHABLE_REJECTION_DOCUMENT_TITLE,
} from "@/lib/perishable-rejection-document";
import {
  STAFF_TRAINING_TEMPLATE_CODE,
  STAFF_TRAINING_FULL_TITLE,
} from "@/lib/staff-training-document";
import {
  TRAINING_PLAN_TEMPLATE_CODE,
  TRAINING_PLAN_DOCUMENT_TITLE,
} from "@/lib/training-plan-document";
import {
  BREAKDOWN_HISTORY_TEMPLATE_CODE,
  BREAKDOWN_HISTORY_DOCUMENT_TITLE,
} from "@/lib/breakdown-history-document";
import {
  EQUIPMENT_MAINTENANCE_TEMPLATE_CODE,
  EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE,
} from "@/lib/equipment-maintenance-document";
import {
  DISINFECTANT_TEMPLATE_CODE,
  DISINFECTANT_DOCUMENT_TITLE,
} from "@/lib/disinfectant-document";
import {
  PPE_ISSUANCE_DOCUMENT_TITLE,
  PPE_ISSUANCE_TEMPLATE_CODE,
} from "@/lib/ppe-issuance-document";
import {
  TRACEABILITY_DOCUMENT_TEMPLATE_CODE,
  getTraceabilityDocumentTitle,
} from "@/lib/traceability-document";
import {
  getScanJournalConfig,
  isScanOnlyDocumentTemplate as isScanOnlyDocumentTemplateFromConfig,
} from "@/lib/scan-journal-config";

const SCAN_ONLY_JOURNALS = [
  {
    code: "audit_plan_scan",
    folderName: "План внутреннего аудита",
    title: "Журнал аудита - План",
  },
  {
    code: "audit_protocol_scan",
    folderName: "Протокол внутреннего аудита",
    title: "Журнал аудита - Протокол",
  },
  {
    code: "audit_report_scan",
    folderName: "Отчет о внутреннем аудите",
    title: "Журнал аудита - Отчет",
  },
  {
    code: "critical_limit_check",
    folderName: "Журнал учета критических показателей",
    title: "Журнал учета критических показателей",
  },
] as const;

export type ScanOnlyJournalCode = (typeof SCAN_ONLY_JOURNALS)[number]["code"];

export function getScanOnlyJournalCodeMeta(code: string) {
  const configCode = getScanJournalConfig(code);
  if (configCode) {
    return {
      code: configCode.code,
      folderName: configCode.folderName,
      title: configCode.title,
    };
  }

  return SCAN_ONLY_JOURNALS.find((item) => item.code === code);
}

export function getScanOnlyJournalFolderName(code: string) {
  return getScanOnlyJournalCodeMeta(code)?.folderName ?? null;
}

export function isScanOnlyJournalTemplate(code: string) {
  return (
    isScanOnlyDocumentTemplateFromConfig(code) ||
    getScanOnlyJournalCodeMeta(code) != null
  );
}

export function isDocumentTemplate(templateCode: string) {
  return (
    templateCode === "hygiene" ||
    templateCode === "health_check" ||
    templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE ||
    templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE ||
    templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE ||
    templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE ||
    templateCode === EQUIPMENT_MAINTENANCE_TEMPLATE_CODE ||
    templateCode === STAFF_TRAINING_TEMPLATE_CODE ||
    templateCode === PERISHABLE_REJECTION_TEMPLATE_CODE ||
    templateCode === MED_BOOK_TEMPLATE_CODE ||
    templateCode === TRAINING_PLAN_TEMPLATE_CODE ||
    templateCode === BREAKDOWN_HISTORY_TEMPLATE_CODE ||
    templateCode === PPE_ISSUANCE_TEMPLATE_CODE ||
    templateCode === TRACEABILITY_DOCUMENT_TEMPLATE_CODE ||
    templateCode === DISINFECTANT_TEMPLATE_CODE ||
    isScanOnlyJournalTemplate(templateCode) ||
    isTrackedDocumentTemplate(templateCode)
  );
}

export function isStaffDocumentTemplate(templateCode: string) {
  return templateCode === "hygiene" || templateCode === "health_check";
}

export function getJournalDocumentDefaultTitle(templateCode: string) {
  const scanJournalConfig = getScanJournalConfig(templateCode);
  if (scanJournalConfig) {
    return scanJournalConfig.title;
  }

  if (templateCode === "health_check") return getHealthDocumentTitle();
  if (templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE) {
    return getColdEquipmentDocumentTitle();
  }
  if (templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
    return getFinishedProductDocumentTitle();
  }
  if (templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE) {
    return getClimateDocumentTitle();
  }
  if (templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE) {
    return getCleaningDocumentTitle();
  }
  if (templateCode === SANITATION_DAY_TEMPLATE_CODE) {
    return SANITATION_DAY_DOCUMENT_TITLE;
  }
  if (templateCode === EQUIPMENT_MAINTENANCE_TEMPLATE_CODE) {
    return EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE;
  }
  if (templateCode === STAFF_TRAINING_TEMPLATE_CODE) {
    return STAFF_TRAINING_FULL_TITLE;
  }
  if (templateCode === PERISHABLE_REJECTION_TEMPLATE_CODE) {
    return PERISHABLE_REJECTION_DOCUMENT_TITLE;
  }
  if (templateCode === MED_BOOK_TEMPLATE_CODE) {
    return MED_BOOK_DOCUMENT_TITLE;
  }
  if (templateCode === TRAINING_PLAN_TEMPLATE_CODE) {
    return TRAINING_PLAN_DOCUMENT_TITLE;
  }
  if (templateCode === BREAKDOWN_HISTORY_TEMPLATE_CODE) {
    return BREAKDOWN_HISTORY_DOCUMENT_TITLE;
  }
  if (templateCode === DISINFECTANT_TEMPLATE_CODE) {
    return DISINFECTANT_DOCUMENT_TITLE;
  }
  if (templateCode === PPE_ISSUANCE_TEMPLATE_CODE) {
    return PPE_ISSUANCE_DOCUMENT_TITLE;
  }
  if (templateCode === "critical_limit_check") {
    return "Журнал учета критических показателей";
  }
  if (templateCode === TRACEABILITY_DOCUMENT_TEMPLATE_CODE) {
    return getTraceabilityDocumentTitle();
  }
  if (isTrackedDocumentTemplate(templateCode)) {
    return getTrackedDocumentTitle(templateCode);
  }
  return getHygieneDocumentTitle();
}

export function getJournalDocumentHeading(templateCode: string, closed = false) {
  const base = getJournalDocumentDefaultTitle(templateCode);
  return closed ? `${base} (закрытые)` : base;
}

export function getJournalDocumentPeriodLabel(
  templateCode: string,
  dateFrom: Date | string,
  dateTo: Date | string
) {
  if (templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE) {
    return getColdEquipmentPeriodLabel(dateFrom, dateTo);
  }

  if (templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE) {
    return getClimatePeriodLabel(dateFrom, dateTo);
  }

  if (templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE) {
    return getFinishedProductPeriodLabel(dateFrom, dateTo);
  }

  if (templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE) {
    return getCleaningPeriodLabel(dateFrom, dateTo);
  }

  return getHygienePeriodLabel(dateFrom, dateTo);
}
