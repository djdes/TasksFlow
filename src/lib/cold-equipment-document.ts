import {
  buildDateKeys,
  coerceUtcDate,
  formatMonthLabel,
  isWeekend,
  toDateKey,
} from "@/lib/hygiene-document";

export const COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE = "cold_equipment_control";
export const COLD_EQUIPMENT_DOCUMENT_TITLE =
  "Журнал контроля температурного режима холодильного и морозильного оборудования";

type EquipmentSeed = {
  name: string;
  min: number | null;
  max: number | null;
};

const DEFAULT_EQUIPMENT_SEEDS: EquipmentSeed[] = [
  { name: "Холодильная камера", min: 2, max: 4 },
  { name: "Морозильный ларь", min: -20, max: -18 },
  { name: "Холодильник плюсовой", min: -2, max: 2 },
  { name: "Винный шкаф", min: 6, max: 12 },
  { name: "Икорный холодильник", min: -4, max: -2 },
  { name: "Охлаждаемая витрина", min: 0, max: 2 },
  { name: "Холодильник для масла", min: -6, max: -3 },
  { name: "Витрина", min: 2, max: 6 },
];

export type ColdEquipmentConfigItem = {
  id: string;
  sourceEquipmentId: string | null;
  name: string;
  min: number | null;
  max: number | null;
};

export type ColdEquipmentDocumentConfig = {
  equipment: ColdEquipmentConfigItem[];
  skipWeekends: boolean;
};

export type ColdEquipmentEntryData = {
  responsibleTitle: string | null;
  temperatures: Record<string, number | null>;
};

type EquipmentSource = {
  id: string;
  name: string;
  type?: string | null;
  tempMin?: number | null;
  tempMax?: number | null;
};

function createId(prefix: string) {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${randomPart}`;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function createColdEquipmentConfigItem(
  overrides: Partial<ColdEquipmentConfigItem> = {}
): ColdEquipmentConfigItem {
  return {
    id: overrides.id || createId("cold-equipment"),
    sourceEquipmentId: overrides.sourceEquipmentId || null,
    name: overrides.name?.trim() || "Холодильное оборудование",
    min: normalizeNumber(overrides.min),
    max: normalizeNumber(overrides.max),
  };
}

function buildDefaultSeedItems() {
  return DEFAULT_EQUIPMENT_SEEDS.map((item) =>
    createColdEquipmentConfigItem({
      name: item.name,
      min: item.min,
      max: item.max,
    })
  );
}

export function buildColdEquipmentConfigFromEquipment(
  equipment: EquipmentSource[]
): ColdEquipmentDocumentConfig {
  const relevantEquipment = equipment.filter((item) => {
    const normalizedType = item.type?.toLowerCase();
    const looksColdType =
      normalizedType === "refrigerator" || normalizedType === "freezer";

    return looksColdType || item.tempMin != null || item.tempMax != null;
  });

  const configItems =
    relevantEquipment.length > 0
      ? relevantEquipment.map((item) =>
          createColdEquipmentConfigItem({
            sourceEquipmentId: item.id,
            name: item.name,
            min: item.tempMin ?? null,
            max: item.tempMax ?? null,
          })
        )
      : buildDefaultSeedItems();

  return {
    equipment: configItems,
    skipWeekends: false,
  };
}

export function getDefaultColdEquipmentDocumentConfig() {
  return {
    equipment: buildDefaultSeedItems(),
    skipWeekends: false,
  };
}

export function normalizeColdEquipmentDocumentConfig(
  value: unknown
): ColdEquipmentDocumentConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getDefaultColdEquipmentDocumentConfig();
  }

  const record = value as Record<string, unknown>;
  const equipment = Array.isArray(record.equipment)
    ? record.equipment
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const itemRecord = item as Record<string, unknown>;

          return createColdEquipmentConfigItem({
            id:
              typeof itemRecord.id === "string" && itemRecord.id.trim() !== ""
                ? itemRecord.id
                : undefined,
            sourceEquipmentId:
              typeof itemRecord.sourceEquipmentId === "string" &&
              itemRecord.sourceEquipmentId.trim() !== ""
                ? itemRecord.sourceEquipmentId
                : null,
            name:
              typeof itemRecord.name === "string" ? itemRecord.name : undefined,
            min: normalizeNumber(itemRecord.min),
            max: normalizeNumber(itemRecord.max),
          });
        })
        .filter((item): item is ColdEquipmentConfigItem => item !== null)
    : [];

  return {
    equipment:
      equipment.length > 0
        ? equipment
        : getDefaultColdEquipmentDocumentConfig().equipment,
    skipWeekends:
      typeof record.skipWeekends === "boolean" ? record.skipWeekends : false,
  };
}

export function createEmptyColdEquipmentEntryData(
  config: ColdEquipmentDocumentConfig,
  responsibleTitle: string | null = null
): ColdEquipmentEntryData {
  const temperatures: Record<string, number | null> = {};

  config.equipment.forEach((item) => {
    temperatures[item.id] = null;
  });

  return {
    responsibleTitle,
    temperatures,
  };
}

export function normalizeColdEquipmentEntryData(
  value: unknown
): ColdEquipmentEntryData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      responsibleTitle: null,
      temperatures: {},
    };
  }

  const record = value as Record<string, unknown>;
  const temperatureValues = record.temperatures;
  const temperatures: Record<string, number | null> = {};

  if (
    temperatureValues &&
    typeof temperatureValues === "object" &&
    !Array.isArray(temperatureValues)
  ) {
    Object.entries(temperatureValues as Record<string, unknown>).forEach(
      ([key, itemValue]) => {
        temperatures[key] = normalizeNumber(itemValue);
      }
    );
  }

  return {
    responsibleTitle:
      typeof record.responsibleTitle === "string" ? record.responsibleTitle : null,
    temperatures,
  };
}

export function syncColdEquipmentEntryDataWithConfig(
  entryData: ColdEquipmentEntryData,
  config: ColdEquipmentDocumentConfig
): ColdEquipmentEntryData {
  const next = createEmptyColdEquipmentEntryData(config, entryData.responsibleTitle);

  config.equipment.forEach((item) => {
    next.temperatures[item.id] = entryData.temperatures[item.id] ?? null;
  });

  return next;
}

function hashToUnit(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return (hash % 1000) / 999;
}

function buildGeneratedTemperature(
  min: number | null,
  max: number | null,
  seed: string
): number | null {
  if (min == null && max == null) return null;
  if (min != null && max == null) return min;
  if (min == null && max != null) return max;
  if (min === max) return min;

  const low = Math.min(min as number, max as number);
  const high = Math.max(min as number, max as number);
  const unit = hashToUnit(seed);
  return Math.round(low + (high - low) * unit);
}

export function buildColdEquipmentAutoFillEntryData(params: {
  config: ColdEquipmentDocumentConfig;
  dateKey: string;
  responsibleTitle: string | null;
}): ColdEquipmentEntryData {
  const { config, dateKey, responsibleTitle } = params;
  const data = createEmptyColdEquipmentEntryData(config, responsibleTitle);

  config.equipment.forEach((item) => {
    data.temperatures[item.id] = buildGeneratedTemperature(
      item.min,
      item.max,
      `${dateKey}:${item.id}`
    );
  });

  return data;
}

export function mergeColdEquipmentEntryData(
  currentData: ColdEquipmentEntryData,
  generatedData: ColdEquipmentEntryData
): ColdEquipmentEntryData {
  const next: ColdEquipmentEntryData = {
    responsibleTitle: currentData.responsibleTitle || generatedData.responsibleTitle,
    temperatures: {},
  };

  Object.keys(generatedData.temperatures).forEach((equipmentId) => {
    next.temperatures[equipmentId] =
      currentData.temperatures[equipmentId] ??
      generatedData.temperatures[equipmentId] ??
      null;
  });

  return next;
}

export function buildColdEquipmentAutoFillRows(params: {
  config: ColdEquipmentDocumentConfig;
  dateFrom: Date | string;
  dateTo: Date | string;
  responsibleTitle: string | null;
  responsibleUserId: string;
}) {
  const { config, dateFrom, dateTo, responsibleTitle, responsibleUserId } = params;

  return buildDateKeys(dateFrom, dateTo)
    .filter((dateKey) => !(config.skipWeekends && isWeekend(dateKey)))
    .map((dateKey) => ({
      employeeId: responsibleUserId,
      date: new Date(dateKey),
      data: buildColdEquipmentAutoFillEntryData({
        config,
        dateKey,
        responsibleTitle,
      }),
    }));
}

export function getColdEquipmentDocumentTitle() {
  return COLD_EQUIPMENT_DOCUMENT_TITLE;
}

export function getColdEquipmentCreatePeriodBounds(referenceDate = new Date()) {
  const date = coerceUtcDate(referenceDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const currentDay = date.getUTCDate();
  const isFirstHalf = currentDay <= 15;

  return {
    dateFrom: `${year}-${String(month + 1).padStart(2, "0")}-${isFirstHalf ? "01" : "16"}`,
    dateTo: `${year}-${String(month + 1).padStart(2, "0")}-${String(isFirstHalf ? 15 : lastDay).padStart(2, "0")}`,
  };
}

export function getColdEquipmentPeriodLabel(
  dateFrom: Date | string,
  dateTo: Date | string
) {
  return formatMonthLabel(dateFrom, dateTo);
}

export function getColdEquipmentDateLabel(date: Date | string) {
  const dateKey = toDateKey(date);
  const [year, month, day] = dateKey.split("-");
  return `${day}.${month}.${year}`;
}

export function getColdEquipmentFilePrefix() {
  return "cold-equipment-journal";
}
