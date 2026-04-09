export const SANITATION_DAY_TEMPLATE_CODE = "general_cleaning";
export const SANITATION_DAY_SOURCE_SLUG = "sanitationdayjournal";

export const SANITATION_DAY_HEADING = "График и учет генеральных уборок";
export const SANITATION_DAY_DOCUMENT_TITLE = "График ген. уборок";

export const SANITATION_MONTHS = [
  { key: "jan", short: "Янв", label: "Январь" },
  { key: "feb", short: "Фев", label: "Февраль" },
  { key: "mar", short: "Мар", label: "Март" },
  { key: "apr", short: "Апр", label: "Апрель" },
  { key: "may", short: "Май", label: "Май" },
  { key: "jun", short: "Июн", label: "Июнь" },
  { key: "jul", short: "Июл", label: "Июль" },
  { key: "aug", short: "Авг", label: "Август" },
  { key: "sep", short: "Сен", label: "Сентябрь" },
  { key: "oct", short: "Окт", label: "Октябрь" },
  { key: "nov", short: "Ноя", label: "Ноябрь" },
  { key: "dec", short: "Дек", label: "Декабрь" },
] as const;

export type SanitationMonthKey = (typeof SANITATION_MONTHS)[number]["key"];

export type SanitationMonthValues = Record<SanitationMonthKey, string>;

export type SanitationRoomRow = {
  id: string;
  roomName: string;
  plan: SanitationMonthValues;
  fact: SanitationMonthValues;
};

export type SanitationDayConfig = {
  year: number;
  documentDate: string;
  approveRole: string;
  approveEmployee: string;
  responsibleRole: string;
  responsibleEmployee: string;
  rows: SanitationRoomRow[];
};

function createMonthValues(fill = ""): SanitationMonthValues {
  return {
    jan: fill,
    feb: fill,
    mar: fill,
    apr: fill,
    may: fill,
    jun: fill,
    jul: fill,
    aug: fill,
    sep: fill,
    oct: fill,
    nov: fill,
    dec: fill,
  };
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeYear(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function normalizeMonthValues(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    jan: safeText(source.jan),
    feb: safeText(source.feb),
    mar: safeText(source.mar),
    apr: safeText(source.apr),
    may: safeText(source.may),
    jun: safeText(source.jun),
    jul: safeText(source.jul),
    aug: safeText(source.aug),
    sep: safeText(source.sep),
    oct: safeText(source.oct),
    nov: safeText(source.nov),
    dec: safeText(source.dec),
  };
}

function normalizeRows(value: unknown): SanitationRoomRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const source = row as Record<string, unknown>;
      return {
        id:
          typeof source.id === "string" && source.id.length > 0
            ? source.id
            : `row-${index + 1}`,
        roomName: safeText(source.roomName),
        plan: normalizeMonthValues(source.plan),
        fact: normalizeMonthValues(source.fact),
      };
    })
    .filter((item): item is SanitationRoomRow => item !== null);
}

export function getSanitationDayDefaultConfig(date = new Date()): SanitationDayConfig {
  const year = date.getUTCFullYear();
  const d = new Date(Date.UTC(year, 0, 1));

  return {
    year,
    documentDate: toDateKey(d),
    approveRole: "Управляющий",
    approveEmployee: "Иванов И.И.",
    responsibleRole: "Управляющий",
    responsibleEmployee: "Иванов И.И.",
    rows: [
      {
        id: "row-1",
        roomName: "Производство 1 этаж",
        plan: {
          ...createMonthValues("10"),
          jun: "-",
          apr: "10, 17, 24",
        },
        fact: {
          ...createMonthValues("10"),
          feb: "01",
          apr: "01",
          jun: "",
        },
      },
      {
        id: "row-2",
        roomName: "сухой склад",
        plan: {
          ...createMonthValues("-"),
          apr: "14",
        },
        fact: {
          ...createMonthValues(""),
          apr: "14",
        },
      },
    ],
  };
}

export function normalizeSanitationDayConfig(config: unknown): SanitationDayConfig {
  const fallback = getSanitationDayDefaultConfig();
  if (!config || typeof config !== "object" || Array.isArray(config)) return fallback;
  const source = config as Record<string, unknown>;

  return {
    year: safeYear(source.year, fallback.year),
    documentDate: safeText(source.documentDate) || fallback.documentDate,
    approveRole: safeText(source.approveRole) || fallback.approveRole,
    approveEmployee: safeText(source.approveEmployee) || fallback.approveEmployee,
    responsibleRole: safeText(source.responsibleRole) || fallback.responsibleRole,
    responsibleEmployee:
      safeText(source.responsibleEmployee) || fallback.responsibleEmployee,
    rows: normalizeRows(source.rows),
  };
}

export function getSanitationYearLabel(year: number) {
  return String(year);
}

export function getSanitationDocumentDateLabel(dateKey: string) {
  if (!dateKey) return "—";
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  return `${day}-${month}-${year}`;
}

export function getSanitationApproveLabel(role: string, employee: string) {
  const rolePart = role ? `${role}: ` : "";
  return `${rolePart}${employee || ""}`.trim();
}

export function createEmptySanitationRow(name = ""): SanitationRoomRow {
  return {
    id: `row-${Math.random().toString(36).slice(2, 9)}`,
    roomName: name,
    plan: createMonthValues(""),
    fact: createMonthValues(""),
  };
}
