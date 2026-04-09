export const FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE = "finished_product";
export const FINISHED_PRODUCT_DOCUMENT_TITLE =
  "Журнал бракеража готовой пищевой продукции";

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
  responsiblePerson: string;
  inspectorName: string;
};

export type FinishedProductDocumentConfig = {
  rows: FinishedProductDocumentRow[];
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
    responsiblePerson: normalizeText(overrides.responsiblePerson),
    inspectorName: normalizeText(overrides.inspectorName),
  };
}

export function getDefaultFinishedProductDocumentConfig(): FinishedProductDocumentConfig {
  return {
    rows: [createFinishedProductRow()],
  };
}

export function buildFinishedProductConfigFromUsers(
  users: Array<{ name: string; role?: string | null }>
): FinishedProductDocumentConfig {
  const primaryUser = users[0]?.name || "";
  const inspectorUser = users[1]?.name || users[0]?.name || "";

  return {
    rows: [
      createFinishedProductRow({
        responsiblePerson: primaryUser,
        inspectorName: inspectorUser,
      }),
    ],
  };
}

export function normalizeFinishedProductDocumentConfig(
  value: unknown
): FinishedProductDocumentConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getDefaultFinishedProductDocumentConfig();
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
    rows: rows.length > 0 ? rows : getDefaultFinishedProductDocumentConfig().rows,
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
