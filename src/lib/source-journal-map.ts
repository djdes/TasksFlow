export type SourceJournalMapItem = {
  sourceSlug: string;
  localCode: string | null;
  status: "mapped" | "candidate" | "new";
  notes?: string;
};

export const SOURCE_JOURNAL_MAP: SourceJournalMapItem[] = [
  { sourceSlug: "healthjournal", localCode: "hygiene", status: "mapped" },
  { sourceSlug: "health1journal", localCode: "health_check", status: "mapped" },
  { sourceSlug: "storageconditionjournal", localCode: "climate_control", status: "mapped" },
  { sourceSlug: "temprefrigerationjournal", localCode: "cold_equipment_control", status: "mapped" },
  { sourceSlug: "sanitation1journal", localCode: "inventory_sanitation", status: "candidate" },
  { sourceSlug: "cleaning1journal", localCode: "cleaning", status: "mapped" },
  { sourceSlug: "sanitationdayjournal", localCode: "general_cleaning", status: "mapped" },
  { sourceSlug: "bactericiplantjournal", localCode: "uv_lamp_runtime", status: "mapped" },
  { sourceSlug: "brakeryjournal", localCode: "finished_product", status: "mapped" },
  { sourceSlug: "brakery1journal", localCode: null, status: "new", notes: "separate perishables rejection journal" },
  { sourceSlug: "acceptance1journal", localCode: "incoming_control", status: "mapped" },
  { sourceSlug: "deepfatjournal", localCode: "fryer_oil", status: "mapped" },
  { sourceSlug: "medbook", localCode: "med_books", status: "mapped" },
  { sourceSlug: "eduplan", localCode: null, status: "new" },
  { sourceSlug: "edujournal", localCode: null, status: "new" },
  { sourceSlug: "disinfectjournal", localCode: "disinfectant_usage", status: "mapped" },
  { sourceSlug: "sanitationdaycheklist", localCode: "sanitary_day_control", status: "mapped" },
  { sourceSlug: "preventiveequipment", localCode: "equipment_maintenance", status: "mapped" },
  { sourceSlug: "breakdownhistoryjournal", localCode: null, status: "new" },
  { sourceSlug: "instrumentcalibration", localCode: "equipment_calibration", status: "mapped" },
  { sourceSlug: "acceptance2journal", localCode: "receiving_temperature_control", status: "candidate" },
  { sourceSlug: "issuancesizjournal", localCode: null, status: "new" },
  { sourceSlug: "accidentjournal", localCode: null, status: "new" },
  { sourceSlug: "complaintjournal", localCode: null, status: "new" },
  { sourceSlug: "defectjournal", localCode: "product_writeoff", status: "mapped" },
  { sourceSlug: "auditplan", localCode: null, status: "new" },
  { sourceSlug: "auditprotocol", localCode: null, status: "new" },
  { sourceSlug: "auditreport", localCode: null, status: "new" },
  { sourceSlug: "traceabilityjournal", localCode: "traceability_test", status: "mapped" },
  { sourceSlug: "metalimpurityjournal", localCode: "critical_limit_check", status: "candidate" },
  { sourceSlug: "equipcleanjournal", localCode: "inventory_sanitation", status: "candidate" },
  { sourceSlug: "intensivecoolingjournal", localCode: "critical_limit_check", status: "candidate" },
  { sourceSlug: "glasslist", localCode: null, status: "new" },
  { sourceSlug: "glassjournal", localCode: "allergen_control", status: "candidate" },
  { sourceSlug: "deratization1journal", localCode: "pest_control", status: "mapped" },
];

export function getSourceJournalMapBySlug(sourceSlug: string) {
  return SOURCE_JOURNAL_MAP.find((item) => item.sourceSlug === sourceSlug);
}

const SHORT_ALIASES: Record<string, string> = {
  uv: "uv_lamp_runtime",
};

export function resolveJournalCodeAlias(codeOrSlug: string) {
  if (SHORT_ALIASES[codeOrSlug]) return SHORT_ALIASES[codeOrSlug];
  const sourceItem = getSourceJournalMapBySlug(codeOrSlug);
  if (!sourceItem) return codeOrSlug;
  if (!sourceItem.localCode) return codeOrSlug;
  return sourceItem.localCode;
}
