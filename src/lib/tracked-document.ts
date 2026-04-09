export const TRACKED_DOCUMENT_TEMPLATE_CODES = [
  "incoming_control",
  "pest_control",
  "equipment_calibration",
  "product_writeoff",
  "cooking_temp",
  "shipment",
  "hand_hygiene_control",
  "waste_disposal_control",
  "uv_lamp_runtime",
  "uv_lamp_control",
  "fryer_oil",
  "general_cleaning",
  "disinfectant_usage",
  "equipment_maintenance",
  "staff_training",
  "daily_rejection",
  "raw_storage_control",
  "defrosting_control",
  "sanitary_day_control",
  "water_temperature_control",
  "dishwashing_control",
  "inventory_sanitation",
  "critical_limit_check",
  "supplier_audit",
  "traceability_test",
] as const;

export type TrackedDocumentTemplateCode =
  (typeof TRACKED_DOCUMENT_TEMPLATE_CODES)[number];

export const SOURCE_STYLE_TRACKED_TEMPLATE_CODES = [
  "incoming_control",
  "hand_hygiene_control",
  "waste_disposal_control",
  "uv_lamp_runtime",
  "daily_rejection",
  "raw_storage_control",
  "defrosting_control",
  "fryer_oil",
] as const;

export type SourceStyleTrackedTemplateCode =
  (typeof SOURCE_STYLE_TRACKED_TEMPLATE_CODES)[number];

export function isTrackedDocumentTemplate(templateCode: string) {
  return TRACKED_DOCUMENT_TEMPLATE_CODES.includes(
    templateCode as TrackedDocumentTemplateCode
  );
}

export function isSourceStyleTrackedTemplate(templateCode: string) {
  return SOURCE_STYLE_TRACKED_TEMPLATE_CODES.includes(
    templateCode as SourceStyleTrackedTemplateCode
  );
}

const TRACKED_DOCUMENT_TITLES: Partial<Record<TrackedDocumentTemplateCode, string>> = {
  incoming_control: "Р–СѓСЂРЅР°Р» РїСЂРёРµРјРєРё",
  pest_control: "Журнал учета дезинфекции, дезинсекции и дератизации",
  equipment_calibration: "График поверки средств измерений",
  product_writeoff: "Акт забраковки",
  cooking_temp: "Журнал термической обработки",
  shipment: "Журнал отгрузки",
  hand_hygiene_control: "Журнал контроля гигиены рук",
  waste_disposal_control: "Журнал контроля утилизации отходов",
  uv_lamp_runtime: "Журнал учета наработки УФ-ламп",
  uv_lamp_control: "Журнал контроля УФ-ламп",
  fryer_oil: "Журнал учета использования фритюрных жиров",
  general_cleaning: "Журнал генеральной уборки",
  disinfectant_usage: "Журнал учета дезинфицирующих средств",
  equipment_maintenance: "График ППО оборудования",
  staff_training: "Журнал инструктажей",
  daily_rejection: "Журнал ежедневного бракеража блюд",
  raw_storage_control: "Журнал контроля хранения сырья",
  defrosting_control: "Журнал контроля размораживания",
  sanitary_day_control: "Журнал санитарного дня",
  water_temperature_control: "Журнал контроля температуры воды",
  dishwashing_control: "Журнал контроля мойки посуды",
  inventory_sanitation: "Журнал санобработки инвентаря",
};

export function getTrackedDocumentTitle(templateCode: string) {
  return TRACKED_DOCUMENT_TITLES[templateCode as TrackedDocumentTemplateCode] || "Журнал";
}

export function getTrackedDocumentCreateMode(templateCode: string) {
  if (templateCode === "incoming_control") return "acceptance";
  if (templateCode === "hand_hygiene_control") return "staff";
  if (templateCode === "uv_lamp_runtime") return "uv";
  if (
    templateCode === "waste_disposal_control" ||
    templateCode === "daily_rejection" ||
    templateCode === "raw_storage_control" ||
    templateCode === "defrosting_control"
  ) {
    return "dated";
  }
  if (templateCode === "fryer_oil") return "fryer_oil";
  return "default";
}
