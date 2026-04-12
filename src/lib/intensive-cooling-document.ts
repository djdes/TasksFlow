import { getUserRoleLabel, normalizeUserRole, pickPrimaryManager } from "@/lib/user-roles";

export const INTENSIVE_COOLING_TEMPLATE_CODE = "intensive_cooling";
export const INTENSIVE_COOLING_SOURCE_SLUG = "intensivecoolingjournal";
export const INTENSIVE_COOLING_DOCUMENT_TITLE =
  "Журнал контроля интенсивного охлаждения горячих блюд";
export const INTENSIVE_COOLING_DEFAULT_DOCUMENT_NAME = "Журнал контроля";

export type IntensiveCoolingRow = {
  id: string;
  productionDate: string;
  productionHour: string;
  productionMinute: string;
  dishName: string;
  startTemperature: string;
  endTemperature: string;
  correctiveAction: string;
  comment: string;
  responsibleTitle: string;
  responsibleUserId: string;
};

export type IntensiveCoolingConfig = {
  rows: IntensiveCoolingRow[];
  dishSuggestions: string[];
  defaultResponsibleTitle: string | null;
  defaultResponsibleUserId: string | null;
  finishedAt: string | null;
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

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => normalizeText(item))
    .filter((item, index, array) => item !== "" && array.indexOf(item) === index);
}

export function getResponsibleTitleByRole(role?: string | null) {
  const normalized = normalizeUserRole(role);
  if (
    normalized === "manager" ||
    normalized === "head_chef" ||
    normalized === "cook" ||
    normalized === "waiter"
  ) {
    return getUserRoleLabel(normalized);
  }
  return "Управляющий";
}

export function createIntensiveCoolingRow(
  overrides?: Partial<IntensiveCoolingRow>
): IntensiveCoolingRow {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: overrides?.id || createId("intensive-cooling-row"),
    productionDate: normalizeText(overrides?.productionDate) || today,
    productionHour: normalizeText(overrides?.productionHour),
    productionMinute: normalizeText(overrides?.productionMinute),
    dishName: normalizeText(overrides?.dishName),
    startTemperature: normalizeText(overrides?.startTemperature),
    endTemperature: normalizeText(overrides?.endTemperature),
    correctiveAction: normalizeText(overrides?.correctiveAction),
    comment: normalizeText(overrides?.comment),
    responsibleTitle: normalizeText(overrides?.responsibleTitle),
    responsibleUserId: normalizeText(overrides?.responsibleUserId),
  };
}

export function getDefaultIntensiveCoolingConfig(
  users: Array<{ id: string; name: string; role?: string | null }>,
  dishSuggestions: string[] = []
): IntensiveCoolingConfig {
  const defaultResponsibleUser = pickPrimaryManager(users);

  return {
    rows: [],
    dishSuggestions: normalizeStringList(dishSuggestions),
    defaultResponsibleTitle: getResponsibleTitleByRole(defaultResponsibleUser?.role),
    defaultResponsibleUserId: defaultResponsibleUser?.id || null,
    finishedAt: null,
  };
}

export function normalizeIntensiveCoolingConfig(
  value: unknown,
  users: Array<{ id: string; name: string; role?: string | null }> = []
): IntensiveCoolingConfig {
  const fallback = getDefaultIntensiveCoolingConfig(users);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? record.rows
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return createIntensiveCoolingRow(item as Partial<IntensiveCoolingRow>);
        })
        .filter((item): item is IntensiveCoolingRow => item !== null)
    : [];

  const defaultResponsibleUserId = normalizeText(record.defaultResponsibleUserId);
  const defaultResponsibleTitle = normalizeText(record.defaultResponsibleTitle);
  const finishedAt = normalizeText(record.finishedAt);

  return {
    rows,
    dishSuggestions: normalizeStringList(record.dishSuggestions),
    defaultResponsibleTitle:
      defaultResponsibleTitle || fallback.defaultResponsibleTitle,
    defaultResponsibleUserId:
      defaultResponsibleUserId || fallback.defaultResponsibleUserId,
    finishedAt: finishedAt || null,
  };
}

export function formatIntensiveCoolingDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

export function formatIntensiveCoolingTime(hour: string, minute: string) {
  if (!hour && !minute) return "";
  return `${hour || "00"}:${minute || "00"}`;
}

export function formatIntensiveCoolingDateTime(row: IntensiveCoolingRow) {
  const dateLabel = formatIntensiveCoolingDate(row.productionDate);
  const timeLabel = formatIntensiveCoolingTime(
    row.productionHour,
    row.productionMinute
  );
  return timeLabel ? `${dateLabel}\n${timeLabel}` : dateLabel;
}

export function formatTemperatureLabel(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return "—";
  return `${normalized} °C`;
}

export function getIntensiveCoolingFilePrefix() {
  return "intensive-cooling-journal";
}
