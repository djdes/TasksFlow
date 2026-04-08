import {
  buildDateKeys,
  coerceUtcDate,
  formatMonthLabel,
  getHygienePositionLabel,
  isWeekend,
  toDateKey,
} from "@/lib/hygiene-document";

export const CLEANING_DOCUMENT_TEMPLATE_CODE = "cleaning";
export const CLEANING_DOCUMENT_TITLE = "Журнал уборки";

export const CLEANING_MARK_OPTIONS = [
  { value: "routine", code: "Т", label: "Текущая" },
  { value: "general", code: "Г", label: "Генеральная" },
] as const;

export const CLEANING_LEGEND = [
  "Т - текущая уборка",
  "Г - генеральная уборка",
  "Пустая ячейка - уборка не отмечена",
] as const;

export type CleaningMark = (typeof CLEANING_MARK_OPTIONS)[number]["value"];

export type CleaningConfigItem = {
  id: string;
  sourceAreaId: string | null;
  name: string;
  detergent: string;
  routineScope: string;
  generalScope: string;
};

export type CleaningDocumentConfig = {
  rows: CleaningConfigItem[];
  skipWeekends: boolean;
  responsibleCleaningUserId: string | null;
  responsibleControlUserId: string | null;
};

export type CleaningEntryData = {
  mark: CleaningMark | null;
};

type AreaSource = {
  id: string;
  name: string;
};

type UserSource = {
  id: string;
  role: string;
};

const DEFAULT_ROW_SEEDS: Array<
  Omit<CleaningConfigItem, "id" | "sourceAreaId">
> = [
  {
    name: "гостевая зона",
    detergent: "Ph Multiclean - 1%",
    routineScope: "Пол, стеллажи, полки, двери",
    generalScope: "Пол, стеллажи, полки, двери, стоки",
  },
  {
    name: "помещение мойки",
    detergent: "Ph Multiclean - 1%, дезинфицирующее средство 0,5%",
    routineScope: "Производственные столы, пол, моечные ванны, стеллажи, инвентарь",
    generalScope:
      "Производственные столы, пол, моечные ванны, стеллажи, инвентарь, стены",
  },
  {
    name: "горячий цех/кухня",
    detergent: "Ph Multiclean - 1%, дезинфицирующее средство 0,5%",
    routineScope:
      "Производственные столы, пол, моечные ванны, инвентарь, полки, измельчители",
    generalScope:
      "Производственные столы, пол, моечные ванны, инвентарь, полки, стены, вытяжка",
  },
  {
    name: "бар",
    detergent: "Дезинфицирующее средство 0,5%",
    routineScope: "Столы, пол, стеллажи, холодильная камера, инвентарь",
    generalScope: "Столы, пол, стеллажи, холодильная камера, инвентарь, стены",
  },
];

function createId(prefix: string) {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${randomPart}`;
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function createCleaningConfigItem(
  overrides: Partial<CleaningConfigItem> = {}
): CleaningConfigItem {
  return {
    id: overrides.id || createId("cleaning-row"),
    sourceAreaId: overrides.sourceAreaId || null,
    name: normalizeText(overrides.name, "помещение"),
    detergent: normalizeText(overrides.detergent),
    routineScope: normalizeText(overrides.routineScope),
    generalScope: normalizeText(overrides.generalScope),
  };
}

function buildDefaultRows() {
  return DEFAULT_ROW_SEEDS.map((item) => createCleaningConfigItem(item));
}

export function buildCleaningConfigFromAreas(
  areas: AreaSource[],
  userDefaults?: Pick<
    CleaningDocumentConfig,
    "responsibleCleaningUserId" | "responsibleControlUserId"
  >
): CleaningDocumentConfig {
  const rows =
    areas.length > 0
      ? areas.map((area) =>
          createCleaningConfigItem({
            sourceAreaId: area.id,
            name: area.name,
            detergent: "",
            routineScope: "Пол, рабочие поверхности, двери",
            generalScope: "Пол, стены, рабочие поверхности, двери",
          })
        )
      : buildDefaultRows();

  return {
    rows,
    skipWeekends: false,
    responsibleCleaningUserId: userDefaults?.responsibleCleaningUserId || null,
    responsibleControlUserId: userDefaults?.responsibleControlUserId || null,
  };
}

export function getDefaultCleaningResponsibleIds(users: UserSource[]) {
  const responsibleCleaningUserId =
    users.find((user) => user.role === "operator")?.id ||
    users.find((user) => user.role === "technologist")?.id ||
    users[0]?.id ||
    null;

  const responsibleControlUserId =
    users.find((user) => user.role === "owner")?.id ||
    users.find((user) => user.role === "technologist")?.id ||
    users.find((user) => user.id !== responsibleCleaningUserId)?.id ||
    responsibleCleaningUserId;

  return {
    responsibleCleaningUserId,
    responsibleControlUserId,
  };
}

export function getDefaultCleaningDocumentConfig() {
  return {
    rows: buildDefaultRows(),
    skipWeekends: false,
    responsibleCleaningUserId: null,
    responsibleControlUserId: null,
  };
}

export function normalizeCleaningDocumentConfig(
  value: unknown
): CleaningDocumentConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getDefaultCleaningDocumentConfig();
  }

  const record = value as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? record.rows
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const itemRecord = item as Record<string, unknown>;

          return createCleaningConfigItem({
            id:
              typeof itemRecord.id === "string" && itemRecord.id.trim() !== ""
                ? itemRecord.id
                : undefined,
            sourceAreaId:
              typeof itemRecord.sourceAreaId === "string" &&
              itemRecord.sourceAreaId.trim() !== ""
                ? itemRecord.sourceAreaId
                : null,
            name: normalizeText(itemRecord.name, "помещение"),
            detergent: normalizeText(itemRecord.detergent),
            routineScope: normalizeText(itemRecord.routineScope),
            generalScope: normalizeText(itemRecord.generalScope),
          });
        })
        .filter((item): item is CleaningConfigItem => item !== null)
    : [];

  return {
    rows: rows.length > 0 ? rows : getDefaultCleaningDocumentConfig().rows,
    skipWeekends:
      typeof record.skipWeekends === "boolean" ? record.skipWeekends : false,
    responsibleCleaningUserId:
      typeof record.responsibleCleaningUserId === "string" &&
      record.responsibleCleaningUserId.trim() !== ""
        ? record.responsibleCleaningUserId
        : null,
    responsibleControlUserId:
      typeof record.responsibleControlUserId === "string" &&
      record.responsibleControlUserId.trim() !== ""
        ? record.responsibleControlUserId
        : null,
  };
}

export function createEmptyCleaningEntryData(
  mark: CleaningMark | null = null
): CleaningEntryData {
  return { mark };
}

export function normalizeCleaningEntryData(value: unknown): CleaningEntryData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyCleaningEntryData();
  }

  const record = value as Record<string, unknown>;
  const mark =
    typeof record.mark === "string" &&
    CLEANING_MARK_OPTIONS.some((option) => option.value === record.mark)
      ? (record.mark as CleaningMark)
      : null;

  return { mark };
}

export function getCleaningMarkCode(mark: CleaningMark | null | undefined) {
  return CLEANING_MARK_OPTIONS.find((option) => option.value === mark)?.code || "";
}

export function getCleaningDocumentTitle() {
  return CLEANING_DOCUMENT_TITLE;
}

export function getCleaningCreatePeriodBounds(referenceDate = new Date()) {
  const date = coerceUtcDate(referenceDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return {
    dateFrom: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    dateTo: `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function getCleaningPeriodLabel(
  dateFrom: Date | string,
  dateTo: Date | string
) {
  return formatMonthLabel(dateFrom, dateTo);
}

export function getCleaningFilePrefix() {
  return "cleaning-journal";
}

export function buildCleaningAutoFillRows(params: {
  config: CleaningDocumentConfig;
  dateFrom: Date | string;
  dateTo: Date | string;
  referenceDate?: Date | string;
}) {
  const { config, dateFrom, dateTo, referenceDate = new Date() } = params;
  const todayKey = toDateKey(referenceDate);

  return buildDateKeys(dateFrom, dateTo)
    .filter((dateKey) => dateKey <= todayKey)
    .filter((dateKey) => !(config.skipWeekends && isWeekend(dateKey)))
    .flatMap((dateKey) =>
      config.rows.map((row) => ({
        employeeId: row.id,
        date: new Date(dateKey),
        data: createEmptyCleaningEntryData("routine"),
      }))
    );
}

export function getCleaningResponsibleTitle(
  userRole: string | null | undefined,
  fallback = "Ответственный"
) {
  return userRole ? getHygienePositionLabel(userRole) : fallback;
}
