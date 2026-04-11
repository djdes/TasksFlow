import { getUserRoleLabel } from "@/lib/user-roles";

export const ACCEPTANCE_DOCUMENT_TEMPLATE_CODE = "incoming_control";
export const RAW_MATERIAL_ACCEPTANCE_TEMPLATE_CODE =
  "incoming_raw_materials_control";
export const ACCEPTANCE_PAGE_TITLE =
  "Журнал входного контроля сырья, ингредиентов, упаковочных материалов";
export const ACCEPTANCE_DOCUMENT_TITLE = "Журнал входного контроля сырья";

export const PRODUCT_ACCEPTANCE_PAGE_TITLE =
  "Журнал приемки и входного контроля продукции";
export const PRODUCT_ACCEPTANCE_DOCUMENT_TITLE =
  "Журнал приемки и входного контроля продукции";

export const ACCEPTANCE_DOCUMENT_TEMPLATE_CODES = [
  ACCEPTANCE_DOCUMENT_TEMPLATE_CODE,
  RAW_MATERIAL_ACCEPTANCE_TEMPLATE_CODE,
] as const;

export function isAcceptanceDocumentTemplate(templateCode: string) {
  return ACCEPTANCE_DOCUMENT_TEMPLATE_CODES.includes(
    templateCode as (typeof ACCEPTANCE_DOCUMENT_TEMPLATE_CODES)[number]
  );
}

export function getAcceptancePageTitle(templateCode: string) {
  if (templateCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE) {
    return PRODUCT_ACCEPTANCE_PAGE_TITLE;
  }

  return ACCEPTANCE_PAGE_TITLE;
}

export function getAcceptanceDocumentTitle(templateCode: string) {
  if (templateCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE) {
    return PRODUCT_ACCEPTANCE_DOCUMENT_TITLE;
  }

  return ACCEPTANCE_DOCUMENT_TITLE;
}

export type AcceptanceRow = {
  id: string;
  deliveryDate: string;
  deliveryHour: string;
  deliveryMinute: string;
  productName: string;
  manufacturer: string;
  supplier: string;
  transportCondition: "satisfactory" | "unsatisfactory";
  packagingCompliance: "compliant" | "non_compliant";
  organolepticResult: "satisfactory" | "unsatisfactory";
  expiryDate: string;
  expiryHour: string;
  expiryMinute: string;
  note: string;
  responsibleTitle: string;
  responsibleUserId: string;
};

export type AcceptanceDocumentConfig = {
  rows: AcceptanceRow[];
  products: string[];
  manufacturers: string[];
  suppliers: string[];
  expiryFieldLabel: "expiry_deadline" | "shelf_life";
  showPackagingComplianceField: boolean;
  defaultResponsibleTitle: string | null;
  defaultResponsibleUserId: string | null;
};

type AcceptanceUser = { id: string; name?: string | null; role?: string | null };
type BuildAcceptanceDocumentConfigParams = {
  users?: AcceptanceUser[];
  products?: string[];
  manufacturers?: string[];
  suppliers?: string[];
  date?: string;
  responsibleTitle?: string | null;
  responsibleUserId?: string | null;
  includeSampleRows?: boolean;
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

function normalizeTransport(value: unknown): "satisfactory" | "unsatisfactory" {
  if (value === "unsatisfactory") return "unsatisfactory";
  return "satisfactory";
}

function normalizeCompliance(value: unknown): "compliant" | "non_compliant" {
  if (value === "non_compliant") return "non_compliant";
  // backward compat: old "no" → non_compliant
  if (value === "no") return "non_compliant";
  return "compliant";
}

function normalizeOrganoleptic(value: unknown): "satisfactory" | "unsatisfactory" {
  if (value === "unsatisfactory") return "unsatisfactory";
  // backward compat: old "reject" → unsatisfactory
  if (value === "reject") return "unsatisfactory";
  return "satisfactory";
}

export function createAcceptanceRow(
  overrides?: Partial<AcceptanceRow>
): AcceptanceRow {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: overrides?.id || createId("acceptance-row"),
    deliveryDate: normalizeText(overrides?.deliveryDate) || normalizeText((overrides as Record<string, unknown>)?.dateSupply) || today,
    deliveryHour: normalizeText(overrides?.deliveryHour),
    deliveryMinute: normalizeText(overrides?.deliveryMinute),
    productName: normalizeText(overrides?.productName),
    manufacturer: normalizeText(overrides?.manufacturer),
    supplier: normalizeText(overrides?.supplier),
    transportCondition: normalizeTransport(overrides?.transportCondition),
    packagingCompliance: normalizeCompliance(overrides?.packagingCompliance),
    organolepticResult: normalizeOrganoleptic(overrides?.organolepticResult || (overrides as Record<string, unknown>)?.decision),
    expiryDate: normalizeText(overrides?.expiryDate),
    expiryHour: normalizeText(overrides?.expiryHour),
    expiryMinute: normalizeText(overrides?.expiryMinute),
    note: normalizeText(overrides?.note) || normalizeText((overrides as Record<string, unknown>)?.correctiveAction),
    responsibleTitle: normalizeText(overrides?.responsibleTitle),
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
    expiryFieldLabel: "expiry_deadline",
    showPackagingComplianceField: true,
    defaultResponsibleTitle: null,
    defaultResponsibleUserId: users[0]?.id || null,
  };
}

function pickAcceptanceResponsibleUser(users: AcceptanceUser[]) {
  return (
    users.find((user) => user.role === "owner") ||
    users.find((user) => user.role === "technologist") ||
    users[0] ||
    null
  );
}

function addDays(date: string, delta: number) {
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  value.setDate(value.getDate() + delta);
  return value.toISOString().slice(0, 10);
}

function sanitizeList(values: string[]) {
  return values
    .map((item) => normalizeText(item))
    .filter((item, index, array) => item !== "" && array.indexOf(item) === index);
}

function buildAcceptanceSampleRows(params: {
  date: string;
  products: string[];
  manufacturers: string[];
  suppliers: string[];
  responsibleTitle: string;
  responsibleUserId: string;
}) {
  const productA = params.products[0] || "Гастрономия";
  const productB = params.products[1] || params.products[0] || "Молочная продукция";
  const manufacturerA = params.manufacturers[0] || "ООО \"Агро-Юг\"";
  const manufacturerB = params.manufacturers[1] || manufacturerA || "ООО \"Запад-Восток\"";
  const supplierA = params.suppliers[0] || "ООО \"Метро\"";
  const supplierB = params.suppliers[1] || supplierA || "ООО \"Агро-Юг\"";

  return [
    createAcceptanceRow({
      deliveryDate: params.date,
      deliveryHour: "11",
      deliveryMinute: "00",
      productName: productA,
      manufacturer: manufacturerA,
      supplier: supplierA,
      transportCondition: "satisfactory",
      packagingCompliance: "compliant",
      organolepticResult: "satisfactory",
      expiryDate: params.date,
      note: "",
      responsibleTitle: params.responsibleTitle,
      responsibleUserId: params.responsibleUserId,
    }),
    createAcceptanceRow({
      deliveryDate: addDays(params.date, 1),
      deliveryHour: "12",
      deliveryMinute: "15",
      productName: productB,
      manufacturer: manufacturerB,
      supplier: supplierB,
      transportCondition: "satisfactory",
      packagingCompliance: "compliant",
      organolepticResult: "satisfactory",
      expiryDate: addDays(params.date, 1),
      note: "",
      responsibleTitle: params.responsibleTitle,
      responsibleUserId: params.responsibleUserId,
    }),
  ];
}

export function buildAcceptanceDocumentConfigFromData(
  params: BuildAcceptanceDocumentConfigParams = {}
): AcceptanceDocumentConfig {
  const users = params.users || [];
  const fallback = getAcceptanceDocumentDefaultConfig(users);
  const responsibleUser =
    users.find((user) => user.id === params.responsibleUserId) ||
    pickAcceptanceResponsibleUser(users);
  const responsibleTitle =
    normalizeText(params.responsibleTitle) ||
    (responsibleUser?.role ? getUserRoleLabel(responsibleUser.role) : "") ||
    fallback.defaultResponsibleTitle ||
    "Управляющий";
  const responsibleUserId =
    normalizeText(params.responsibleUserId) || responsibleUser?.id || fallback.defaultResponsibleUserId || "";
  const date = normalizeText(params.date) || new Date().toISOString().slice(0, 10);
  const products = sanitizeList(params.products || []);
  const manufacturers = sanitizeList(params.manufacturers || []);
  const suppliers = sanitizeList(params.suppliers || []);

  return {
    rows: params.includeSampleRows
      ? buildAcceptanceSampleRows({
          date,
          products,
          manufacturers,
          suppliers,
          responsibleTitle,
          responsibleUserId,
        })
      : [],
    products,
    manufacturers,
    suppliers,
    expiryFieldLabel: "expiry_deadline",
    showPackagingComplianceField: true,
    defaultResponsibleTitle: responsibleTitle || null,
    defaultResponsibleUserId: responsibleUserId || null,
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
    expiryFieldLabel: record.expiryFieldLabel === "shelf_life" ? "shelf_life" : "expiry_deadline",
    showPackagingComplianceField:
      typeof record.showPackagingComplianceField === "boolean"
        ? record.showPackagingComplianceField
        : true,
    defaultResponsibleUserId:
      defaultResponsibleUserId || fallback.defaultResponsibleUserId,
    defaultResponsibleTitle: defaultResponsibleTitle || null,
  };
}

export function formatAcceptanceDateDash(date: string): string {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}-${month}-${year}` : date;
}

export function formatDeliveryDateTime(row: AcceptanceRow): string {
  let s = formatAcceptanceDateDash(row.deliveryDate);
  if (row.deliveryHour) {
    s += `\n${row.deliveryHour}:${row.deliveryMinute || "00"}`;
  }
  return s;
}

export function formatExpiryDateTime(row: AcceptanceRow): string {
  let s = formatAcceptanceDateDash(row.expiryDate);
  if (row.expiryHour) {
    s += `\n${row.expiryHour}:${row.expiryMinute || "00"}`;
  }
  return s;
}

export const TRANSPORT_LABELS = {
  satisfactory: "Удовл.",
  unsatisfactory: "Не удовл.",
} as const;

export const COMPLIANCE_LABELS = {
  compliant: "Соответствует",
  non_compliant: "Не соотв.",
} as const;

export const ORGANOLEPTIC_LABELS = {
  satisfactory: "Удовл.",
  unsatisfactory: "Не удовл.",
} as const;

export function getExpiryFieldDisplayLabel(mode: AcceptanceDocumentConfig["expiryFieldLabel"]): string {
  return mode === "shelf_life" ? "Срок годности" : "Предельный срок реализации (дата, час)";
}
