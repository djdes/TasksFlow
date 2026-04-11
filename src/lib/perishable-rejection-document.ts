export const PERISHABLE_REJECTION_TEMPLATE_CODE = "perishable_rejection";
export const PERISHABLE_REJECTION_DOCUMENT_TITLE =
  "Журнал бракеража скоропортящейся пищевой продукции";

export type PerishableRejectionRow = {
  id: string;
  arrivalDate: string;
  arrivalTime: string;
  productName: string;
  productionDate: string;
  manufacturer: string;
  supplier: string;
  packaging: string;
  quantity: string;
  documentNumber: string;
  organolepticResult: "compliant" | "non_compliant";
  storageCondition: "2_6" | "minus18" | "minus2_2";
  expiryDate: string;
  actualSaleDate: string;
  actualSaleTime: string;
  responsiblePerson: string;
  note: string;
};

export type PerishableRejectionConfig = {
  rows: PerishableRejectionRow[];
  productLists: Array<{ id: string; name: string; items: string[] }>;
  manufacturers: string[];
  suppliers: string[];
};

function createId(prefix: string) {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomPart}`;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function createPerishableRejectionRow(
  overrides: Partial<PerishableRejectionRow> = {}
): PerishableRejectionRow {
  return {
    id: overrides.id || createId("perishable-row"),
    arrivalDate: normalizeText(overrides.arrivalDate),
    arrivalTime: normalizeText(overrides.arrivalTime),
    productName: normalizeText(overrides.productName),
    productionDate: normalizeText(overrides.productionDate),
    manufacturer: normalizeText(overrides.manufacturer),
    supplier: normalizeText(overrides.supplier),
    packaging: normalizeText(overrides.packaging),
    quantity: normalizeText(overrides.quantity),
    documentNumber: normalizeText(overrides.documentNumber),
    organolepticResult: overrides.organolepticResult === "non_compliant" ? "non_compliant" : "compliant",
    storageCondition:
      overrides.storageCondition === "minus18"
        ? "minus18"
        : overrides.storageCondition === "minus2_2"
          ? "minus2_2"
          : "2_6",
    expiryDate: normalizeText(overrides.expiryDate),
    actualSaleDate: normalizeText(overrides.actualSaleDate),
    actualSaleTime: normalizeText(overrides.actualSaleTime),
    responsiblePerson: normalizeText(overrides.responsiblePerson),
    note: normalizeText(overrides.note),
  };
}

export function getDefaultPerishableRejectionConfig(): PerishableRejectionConfig {
  return {
    rows: [],
    productLists: [
      { id: createId("perishable-list"), name: "Изделия", items: ["Пельмени"] },
    ],
    manufacturers: ['ООО "Ромашка"'],
    suppliers: ["ИП Бубнов Б.Б."],
  };
}

export function normalizePerishableRejectionConfig(
  value: unknown
): PerishableRejectionConfig {
  const defaults = getDefaultPerishableRejectionConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? record.rows
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return createPerishableRejectionRow(item as Partial<PerishableRejectionRow>);
        })
        .filter((item): item is PerishableRejectionRow => item !== null)
    : [];

  return {
    rows,
    productLists: Array.isArray(record.productLists)
      ? (record.productLists as Array<Record<string, unknown>>)
          .map((list) => ({
            id:
              typeof list.id === "string" && list.id.trim() !== ""
                ? list.id
                : createId("perishable-list"),
            name:
              typeof list.name === "string" && list.name.trim() !== ""
                ? list.name
                : "Новый список",
            items: Array.isArray(list.items)
              ? (list.items as unknown[])
                  .filter((item) => typeof item === "string")
                  .map((item) => (item as string).trim())
                  .filter((item) => item.length > 0)
              : [],
          }))
          .filter((list) => list.name.length > 0)
      : defaults.productLists,
    manufacturers: Array.isArray(record.manufacturers)
      ? (record.manufacturers as unknown[])
          .filter((item) => typeof item === "string")
          .map((item) => (item as string).trim())
          .filter((item) => item.length > 0)
      : defaults.manufacturers,
    suppliers: Array.isArray(record.suppliers)
      ? (record.suppliers as unknown[])
          .filter((item) => typeof item === "string")
          .map((item) => (item as string).trim())
          .filter((item) => item.length > 0)
      : defaults.suppliers,
  };
}

export function getPerishableRejectionDocumentTitle() {
  return PERISHABLE_REJECTION_DOCUMENT_TITLE;
}

export function getPerishableRejectionFilePrefix() {
  return "perishable-rejection-journal";
}

export function getPerishableRejectionCreatePeriodBounds(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return {
    dateFrom: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    dateTo: `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export const STORAGE_CONDITION_LABELS: Record<string, string> = {
  "2_6": "+2°С до +6°С",
  "minus18": "-18°С и ниже",
  "minus2_2": "-2°С до +2°С",
};

export const ORGANOLEPTIC_LABELS: Record<string, string> = {
  compliant: "Соответствует",
  non_compliant: "Не соответствует",
};
