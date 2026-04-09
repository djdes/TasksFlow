export const ACCEPTANCE_DOCUMENT_TEMPLATE_CODE = "incoming_control";

export type AcceptanceDecision = "accept" | "reject";

export type AcceptanceRow = {
  id: string;
  dateSupply: string;
  productName: string;
  expiryDate: string;
  manufacturer: string;
  supplier: string;
  ttnDocs: string;
  batchVolume: string;
  batchNumber: string;
  productionDate: string;
  innerTemperature: string;
  docsCompliance: "yes" | "no";
  packagingCompliance: "yes" | "no";
  decision: AcceptanceDecision;
  correctiveAction: string;
  responsibleUserId: string;
};

export type AcceptanceDocumentConfig = {
  rows: AcceptanceRow[];
  products: string[];
  manufacturers: string[];
  suppliers: string[];
  sortByExpiry: boolean;
  showPackagingComplianceField: boolean;
  defaultResponsibleTitle: string | null;
  defaultResponsibleUserId: string | null;
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

function normalizeBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeYesNo(value: unknown, fallback: "yes" | "no"): "yes" | "no" {
  if (value === "yes" || value === "no") return value;
  return fallback;
}

function normalizeDecision(
  value: unknown,
  fallback: AcceptanceDecision
): AcceptanceDecision {
  if (value === "accept" || value === "reject") return value;
  return fallback;
}

export function createAcceptanceRow(
  overrides?: Partial<AcceptanceRow>
): AcceptanceRow {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: overrides?.id || createId("acceptance-row"),
    dateSupply: normalizeText(overrides?.dateSupply) || today,
    productName: normalizeText(overrides?.productName),
    expiryDate: normalizeText(overrides?.expiryDate),
    manufacturer: normalizeText(overrides?.manufacturer),
    supplier: normalizeText(overrides?.supplier),
    ttnDocs: normalizeText(overrides?.ttnDocs),
    batchVolume: normalizeText(overrides?.batchVolume),
    batchNumber: normalizeText(overrides?.batchNumber),
    productionDate: normalizeText(overrides?.productionDate),
    innerTemperature: normalizeText(overrides?.innerTemperature),
    docsCompliance: normalizeYesNo(overrides?.docsCompliance, "yes"),
    packagingCompliance: normalizeYesNo(overrides?.packagingCompliance, "yes"),
    decision: normalizeDecision(overrides?.decision, "accept"),
    correctiveAction: normalizeText(overrides?.correctiveAction),
    responsibleUserId: normalizeText(overrides?.responsibleUserId),
  };
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => normalizeText(item))
    .filter((item, index, array) => item !== "" && array.indexOf(item) === index);
}

export function getAcceptanceDocumentDefaultConfig(
  users: Array<{ id: string; role?: string | null }>
): AcceptanceDocumentConfig {
  return {
    rows: [],
    products: [],
    manufacturers: [],
    suppliers: [],
    sortByExpiry: false,
    showPackagingComplianceField: false,
    defaultResponsibleTitle: null,
    defaultResponsibleUserId: users[0]?.id || null,
  };
}

export function normalizeAcceptanceDocumentConfig(
  value: unknown,
  users: Array<{ id: string; role?: string | null }> = []
): AcceptanceDocumentConfig {
  const fallback = getAcceptanceDocumentDefaultConfig(users);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? record.rows
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return createAcceptanceRow(item as Partial<AcceptanceRow>);
        })
        .filter((item): item is AcceptanceRow => item !== null)
    : [];

  const defaultResponsibleUserId = normalizeText(record.defaultResponsibleUserId);
  const defaultResponsibleTitle = normalizeText(record.defaultResponsibleTitle);

  return {
    rows,
    products: normalizeStringList(record.products),
    manufacturers: normalizeStringList(record.manufacturers),
    suppliers: normalizeStringList(record.suppliers),
    sortByExpiry: normalizeBool(record.sortByExpiry, fallback.sortByExpiry),
    showPackagingComplianceField: normalizeBool(
      record.showPackagingComplianceField,
      fallback.showPackagingComplianceField
    ),
    defaultResponsibleUserId:
      defaultResponsibleUserId || fallback.defaultResponsibleUserId,
    defaultResponsibleTitle: defaultResponsibleTitle || null,
  };
}
