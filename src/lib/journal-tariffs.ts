// Tariff catalogue for journal templates.
// Source of truth: product decision documented in .agent/tasks/journals-external-api/plan.md.
// Basic tariff covers daily SanPiN/HACCP essentials; Extended adds audit,
// training, calibration, traceability and equipment-maintenance journals.

export type JournalTariff = "basic" | "extended";

export const JOURNAL_TARIFF_ORDER: JournalTariff[] = ["basic", "extended"];

export const JOURNAL_TARIFF_LABELS: Record<JournalTariff, string> = {
  basic: "Базовый",
  extended: "Расширенный",
};

export const JOURNAL_TARIFF_DESCRIPTIONS: Record<JournalTariff, string> = {
  basic:
    "Ежедневные журналы санитарной безопасности и ХАССП — гигиена, температуры, уборки, приёмка, бракераж, фритюр, медкнижки.",
  extended:
    "Всё из Базового плюс обучение, аудиты, поверки, прослеживаемость, обслуживание оборудования, учёт жалоб и СИЗ.",
};

export const BASIC_JOURNAL_CODES: readonly string[] = [
  "hygiene",
  "health_check",
  "climate_control",
  "cold_equipment_control",
  "cleaning_ventilation_checklist",
  "cleaning",
  "general_cleaning",
  "uv_lamp_runtime",
  "finished_product",
  "perishable_rejection",
  "incoming_control",
  "fryer_oil",
  "med_books",
];

export const EXTENDED_JOURNAL_CODES: readonly string[] = [
  "training_plan",
  "staff_training",
  "disinfectant_usage",
  "sanitary_day_control",
  "equipment_maintenance",
  "breakdown_history",
  "equipment_calibration",
  "incoming_raw_materials_control",
  "ppe_issuance",
  "accident_journal",
  "complaint_register",
  "product_writeoff",
  "audit_plan",
  "audit_protocol",
  "audit_report",
  "traceability_test",
  "metal_impurity",
  "equipment_cleaning",
  "intensive_cooling",
  "glass_items_list",
  "glass_control",
  "pest_control",
];

const BASIC_SET = new Set(BASIC_JOURNAL_CODES);
const EXTENDED_SET = new Set(EXTENDED_JOURNAL_CODES);

export function getJournalTariff(code: string): JournalTariff {
  if (EXTENDED_SET.has(code)) return "extended";
  // Unknown codes default to the cheaper plan so new templates never
  // accidentally gate behind the paid tier.
  return BASIC_SET.has(code) ? "basic" : "basic";
}

export function getJournalTariffSortOrder(code: string): number {
  const basicIndex = BASIC_JOURNAL_CODES.indexOf(code);
  if (basicIndex >= 0) return basicIndex;
  const extIndex = EXTENDED_JOURNAL_CODES.indexOf(code);
  if (extIndex >= 0) return BASIC_JOURNAL_CODES.length + extIndex;
  // Unknown: push to the end.
  return BASIC_JOURNAL_CODES.length + EXTENDED_JOURNAL_CODES.length + 1;
}

export type SubscriptionPlan = "trial" | "basic" | "extended";

export function canAccessTariff(
  plan: string | null | undefined,
  tariff: JournalTariff
): boolean {
  const normalized = (plan || "trial").toLowerCase();
  if (tariff === "basic") {
    // Trial, basic and extended all see basic journals.
    return true;
  }
  // Extended journals require the extended plan (or future "pro"/"enterprise").
  return normalized === "extended" || normalized === "pro" || normalized === "enterprise";
}
