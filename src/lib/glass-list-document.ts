import { pickPrimaryManager } from "@/lib/user-roles";

export const GLASS_LIST_TEMPLATE_CODE = "glass_items_list";
export const GLASS_LIST_SOURCE_SLUG = "glasslist";
export const GLASS_LIST_PAGE_TITLE =
  "Перечень изделий из стекла и хрупкого пластика";
export const GLASS_LIST_DOCUMENT_TITLE = "Перечень изделий";

export type GlassListRow = {
  id: string;
  location: string;
  itemName: string;
  quantity: string;
};

export type GlassListConfig = {
  documentName: string;
  location: string;
  documentDate: string;
  responsibleTitle: string;
  responsibleUserId: string;
  rows: GlassListRow[];
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

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function formatGlassListDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU").replaceAll(".", "-");
}

export function formatGlassListDateLong(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function createGlassListRow(
  overrides: Partial<GlassListRow> = {}
): GlassListRow {
  return {
    id: overrides.id || createId("glass-list-row"),
    location: normalizeText(overrides.location),
    itemName: normalizeText(overrides.itemName),
    quantity: normalizeText(overrides.quantity),
  };
}

export function getDefaultGlassListConfig(referenceDate = new Date()): GlassListConfig {
  return {
    documentName: GLASS_LIST_DOCUMENT_TITLE,
    location: "Производство",
    documentDate: toIsoDate(referenceDate),
    responsibleTitle: "Управляющий",
    responsibleUserId: "",
    rows: [],
  };
}

export function normalizeGlassListConfig(value: unknown): GlassListConfig {
  const defaults = getDefaultGlassListConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? record.rows
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return createGlassListRow(item as Partial<GlassListRow>);
        })
        .filter((item): item is GlassListRow => item !== null)
    : defaults.rows;

  return {
    documentName: normalizeText(record.documentName) || defaults.documentName,
    location: normalizeText(record.location) || defaults.location,
    documentDate: normalizeText(record.documentDate) || defaults.documentDate,
    responsibleTitle:
      normalizeText(record.responsibleTitle) || defaults.responsibleTitle,
    responsibleUserId:
      normalizeText(record.responsibleUserId) || defaults.responsibleUserId,
    rows,
  };
}

export function buildGlassListConfigFromData(params: {
  users: Array<{ id: string; name: string; role?: string | null }>;
  areas: Array<{ name: string }>;
  equipment: Array<{ name: string }>;
  products: Array<{ name: string }>;
  referenceDate?: Date;
}) {
  const { users, areas, equipment, products, referenceDate = new Date() } = params;
  const defaults = getDefaultGlassListConfig(referenceDate);
  const responsibleUser = pickPrimaryManager(users);

  const location =
    areas.find((area) => area.name.toLowerCase().includes("производ"))?.name ||
    areas[0]?.name ||
    defaults.location;

  const itemNames = Array.from(
    new Set(
      [...equipment.map((item) => item.name), ...products.map((item) => item.name)]
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  const fallbackItems = [
    "Лампы освещения производственного цеха",
    "Пластиковые ящики",
    "Столы",
  ];

  const quantities = ["20", "6", "15"];
  const sourceItems = (itemNames.length > 0 ? itemNames : fallbackItems).slice(0, 3);

  return {
    documentName: defaults.documentName,
    location,
    documentDate: defaults.documentDate,
    responsibleTitle: defaults.responsibleTitle,
    responsibleUserId: responsibleUser?.id || "",
    rows: sourceItems.map((itemName, index) =>
      createGlassListRow({
        location,
        itemName,
        quantity: quantities[index] || String(index + 1),
      })
    ),
  } satisfies GlassListConfig;
}

export function getGlassListDocumentListTitle(config: GlassListConfig) {
  return config.documentName || GLASS_LIST_DOCUMENT_TITLE;
}

export function getGlassListFilePrefix() {
  return "glass-items-list";
}
