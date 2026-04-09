export const FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE = "finished_product";
export const FINISHED_PRODUCT_DOCUMENT_TITLE =
  "Журнал бракеража готовой пищевой продукции";

export type FinishedProductFieldNameMode = "dish" | "semi";
export type FinishedProductInspectorMode = "inspector_name" | "commission_signatures";

export type FinishedProductDocumentRow = {
  id: string;
  productionDateTime: string;
  rejectionTime: string;
  productName: string;
  organoleptic: string;
  productTemp: string;
  correctiveAction: string;
  releasePermissionTime: string;
  courierTransferTime: string;
  oxygenLevel: string;
  responsiblePerson: string;
  inspectorName: string;
  organolepticValue: string;
  organolepticResult: string;
  releaseAllowed: "yes" | "no";
};

export type FinishedProductDocumentConfig = {
  rows: FinishedProductDocumentRow[];
  fieldNameMode: FinishedProductFieldNameMode;
  inspectorMode: FinishedProductInspectorMode;
  showProductTemp: boolean;
  showCorrectiveAction: boolean;
  showOxygenLevel: boolean;
  showCourierTime: boolean;
  footerNote: string;
  productLists: Array<{ id: string; name: string; items: string[] }>;
  itemsCatalog: string[];
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

export function createFinishedProductRow(
  overrides: Partial<FinishedProductDocumentRow> = {}
): FinishedProductDocumentRow {
  return {
    id: overrides.id || createId("finished-product-row"),
    productionDateTime: normalizeText(overrides.productionDateTime),
    rejectionTime: normalizeText(overrides.rejectionTime),
    productName: normalizeText(overrides.productName),
    organoleptic: normalizeText(overrides.organoleptic),
    productTemp: normalizeText(overrides.productTemp),
    correctiveAction: normalizeText(overrides.correctiveAction),
    releasePermissionTime: normalizeText(overrides.releasePermissionTime),
    courierTransferTime: normalizeText(overrides.courierTransferTime),
    oxygenLevel: normalizeText(overrides.oxygenLevel),
    responsiblePerson: normalizeText(overrides.responsiblePerson),
    inspectorName: normalizeText(overrides.inspectorName),
    organolepticValue: normalizeText(overrides.organolepticValue),
    organolepticResult: normalizeText(overrides.organolepticResult),
    releaseAllowed: overrides.releaseAllowed === "no" ? "no" : "yes",
  };
}

export function getDefaultFinishedProductDocumentConfig(): FinishedProductDocumentConfig {
  return {
    rows: [createFinishedProductRow()],
    fieldNameMode: "dish",
    inspectorMode: "inspector_name",
    showProductTemp: false,
    showCorrectiveAction: false,
    showOxygenLevel: false,
    showCourierTime: false,
    footerNote: "Рекомендации по организации контроля за доброкачественностью готовой пищи",
    productLists: [
      { id: createId("finished-product-list"), name: "Понедельник", items: [] },
      { id: createId("finished-product-list"), name: "Вторник", items: [] },
    ],
    itemsCatalog: [],
  };
}

export function buildFinishedProductConfigFromUsers(
  users: Array<{ name: string; role?: string | null }>
): FinishedProductDocumentConfig {
  const cfg = getDefaultFinishedProductDocumentConfig();
  const primaryUser = users[0]?.name || "";
  const inspectorUser = users[1]?.name || users[0]?.name || "";
  cfg.rows = [
    createFinishedProductRow({
      responsiblePerson: primaryUser,
      inspectorName: inspectorUser,
    }),
  ];
  return cfg;
}

export function normalizeFinishedProductDocumentConfig(
  value: unknown
): FinishedProductDocumentConfig {
  const defaults = getDefaultFinishedProductDocumentConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? record.rows
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return createFinishedProductRow(item as Partial<FinishedProductDocumentRow>);
        })
        .filter((item): item is FinishedProductDocumentRow => item !== null)
    : [];

  return {
    rows: rows.length > 0 ? rows : defaults.rows,
    fieldNameMode: record.fieldNameMode === "semi" ? "semi" : defaults.fieldNameMode,
    inspectorMode:
      record.inspectorMode === "commission_signatures"
        ? "commission_signatures"
        : defaults.inspectorMode,
    showProductTemp: record.showProductTemp === true,
    showCorrectiveAction: record.showCorrectiveAction === true,
    showOxygenLevel: record.showOxygenLevel === true,
    showCourierTime: record.showCourierTime === true,
    footerNote:
      typeof record.footerNote === "string" && record.footerNote.trim() !== ""
        ? record.footerNote
        : defaults.footerNote,
    productLists: Array.isArray(record.productLists)
      ? (record.productLists as Array<Record<string, unknown>>)
          .map((list) => ({
            id:
              typeof list.id === "string" && list.id.trim() !== ""
                ? list.id
                : createId("finished-product-list"),
            name:
              typeof list.name === "string" && list.name.trim() !== ""
                ? list.name
                : "Новый список",
            items: Array.isArray(list.items)
              ? (list.items as unknown[])
                  .filter((item) => typeof item === "string")
                  .map((item) => item.trim())
                  .filter((item) => item.length > 0)
              : [],
          }))
          .filter((list) => list.name.length > 0)
      : defaults.productLists,
    itemsCatalog: Array.isArray(record.itemsCatalog)
      ? (record.itemsCatalog as unknown[])
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : defaults.itemsCatalog,
  };
}

export function getFinishedProductDocumentTitle() {
  return FINISHED_PRODUCT_DOCUMENT_TITLE;
}

export function getFinishedProductCreatePeriodBounds(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return {
    dateFrom: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    dateTo: `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function getFinishedProductPeriodLabel(
  dateFrom: Date | string,
  dateTo: Date | string
) {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  return `${from.toLocaleDateString("ru-RU")} - ${to.toLocaleDateString("ru-RU")}`;
}

export function getFinishedProductFilePrefix() {
  return "finished-product-journal";
}
