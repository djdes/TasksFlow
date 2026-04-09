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

export function isDocumentTemplate(templateCode: string) {
  return (
    templateCode === "hygiene" ||
    templateCode === "health_check" ||
    templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE ||
    templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE ||
    templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE ||
    templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE ||
    isTrackedDocumentTemplate(templateCode)
  );
}

export function isStaffDocumentTemplate(templateCode: string) {
  return templateCode === "hygiene" || templateCode === "health_check";
}

export function getJournalDocumentDefaultTitle(templateCode: string) {
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
