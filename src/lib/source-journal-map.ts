import { SCAN_JOURNALS } from "@/lib/scan-journal-config";

export type SourceJournalMapItem = {
  sourceSlug: string;
  localCode: string | null;
  status: "mapped" | "candidate" | "new";
  notes?: string;
};

const LEGACY_SOURCE_JOURNAL_MAP: SourceJournalMapItem[] = [
  { sourceSlug: "healthjournal", localCode: "hygiene", status: "mapped" },
  { sourceSlug: "health1journal", localCode: "health_check", status: "mapped" },
  { sourceSlug: "storageconditionjournal", localCode: "climate_control", status: "mapped" },
  { sourceSlug: "temprefrigerationjournal", localCode: "cold_equipment_control", status: "mapped" },
  { sourceSlug: "sanitation1journal", localCode: "inventory_sanitation", status: "candidate" },
  { sourceSlug: "cleaning1journal", localCode: "cleaning", status: "mapped" },
  { sourceSlug: "sanitationdayjournal", localCode: "general_cleaning", status: "mapped" },
  { sourceSlug: "bactericiplantjournal", localCode: "uv_lamp_runtime", status: "mapped" },
  { sourceSlug: "brakeryjournal", localCode: "finished_product", status: "mapped" },
  { sourceSlug: "brakery1journal", localCode: "perishable_rejection", status: "mapped", notes: "separate perishables rejection journal" },
  { sourceSlug: "acceptance1journal", localCode: "incoming_control", status: "mapped" },
  { sourceSlug: "deepfatjournal", localCode: "fryer_oil", status: "mapped" },
  { sourceSlug: "medbook", localCode: "med_books", status: "mapped" },
  { sourceSlug: "eduplan", localCode: null, status: "new" },
  { sourceSlug: "edujournal", localCode: "training_plan", status: "mapped" },
  { sourceSlug: "disinfectjournal", localCode: "disinfectant_usage", status: "mapped" },
  { sourceSlug: "sanitationdaycheklist", localCode: "sanitary_day_control", status: "mapped" },
  { sourceSlug: "preventiveequipment", localCode: "equipment_maintenance", status: "mapped" },
  { sourceSlug: "breakdownhistoryjournal", localCode: "breakdown_history", status: "mapped" },
  { sourceSlug: "instrumentcalibration", localCode: "equipment_calibration", status: "mapped" },
  { sourceSlug: "acceptance2journal", localCode: "receiving_temperature_control", status: "candidate" },
  { sourceSlug: "issuancesizjournal", localCode: "ppe_issuance", status: "mapped" },
  { sourceSlug: "accidentjournal", localCode: "accident_journal", status: "mapped" },
  { sourceSlug: "complaintjournal", localCode: "complaint_register", status: "mapped" },
  { sourceSlug: "defectjournal", localCode: "product_writeoff", status: "mapped" },
  { sourceSlug: "auditplan", localCode: "audit_plan", status: "mapped" },
  { sourceSlug: "auditprotocol", localCode: "audit_protocol", status: "mapped" },
  { sourceSlug: "auditreport", localCode: "audit_report", status: "mapped" },
  { sourceSlug: "metalimpurityjournal", localCode: "metal_impurity", status: "mapped" },
  { sourceSlug: "traceabilityjournal", localCode: "traceability_test", status: "mapped" },
  { sourceSlug: "equipcleanjournal", localCode: "equipment_cleaning", status: "mapped" },
  { sourceSlug: "intensivecoolingjournal", localCode: "intensive_cooling", status: "mapped" },
  { sourceSlug: "glasslist", localCode: "glass_items_list", status: "mapped" },
  { sourceSlug: "glassjournal", localCode: "glass_control", status: "mapped" },
  { sourceSlug: "deratization1journal", localCode: "pest_control", status: "mapped" },
];

const SCAN_SOURCE_JOURNAL_MAP: SourceJournalMapItem[] = SCAN_JOURNALS.flatMap((journal) =>
  journal.sourceSlugs.map((sourceSlug) => ({
    sourceSlug,
    localCode: journal.code,
    status: "mapped" as const,
  }))
);

export const SOURCE_JOURNAL_MAP: SourceJournalMapItem[] = [
  ...LEGACY_SOURCE_JOURNAL_MAP,
  ...SCAN_SOURCE_JOURNAL_MAP,
];

export function getSourceJournalMapBySlug(sourceSlug: string) {
  return SOURCE_JOURNAL_MAP.find((item) => item.sourceSlug === sourceSlug);
}

export function resolveJournalCodeAlias(codeOrSlug: string) {
  const sourceItem = getSourceJournalMapBySlug(codeOrSlug);
  if (!sourceItem) return codeOrSlug;
  if (!sourceItem.localCode) return codeOrSlug;
  return sourceItem.localCode;
}
