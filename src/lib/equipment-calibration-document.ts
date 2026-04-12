export const EQUIPMENT_CALIBRATION_TEMPLATE_CODE = "equipment_calibration";
export const EQUIPMENT_CALIBRATION_DOCUMENT_TITLE = "График поверки средств измерений";

export type CalibrationRow = {
  id: string;
  equipmentName: string;
  equipmentNumber: string;
  location: string;
  purpose: string;
  measurementRange: string;
  calibrationInterval: number;
  lastCalibrationDate: string;
  note: string;
};

export type EquipmentCalibrationConfig = {
  rows: CalibrationRow[];
  year: number;
  documentDate: string;
  approveRole: string;
  approveEmployeeId?: string | null;
  approveEmployee: string;
};

export type EquipmentCalibrationEquipmentSource = {
  id: string;
  name: string;
  type: string;
  serialNumber?: string | null;
  tempMin?: number | null;
  tempMax?: number | null;
  area?: {
    name: string;
  } | null;
};

function createId() {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `cal-${randomPart}`;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function createCalibrationRow(
  overrides: Partial<CalibrationRow> = {}
): CalibrationRow {
  return {
    id: overrides.id || createId(),
    equipmentName: normalizeText(overrides.equipmentName),
    equipmentNumber: normalizeText(overrides.equipmentNumber),
    location: normalizeText(overrides.location),
    purpose: normalizeText(overrides.purpose),
    measurementRange: normalizeText(overrides.measurementRange),
    calibrationInterval:
      typeof overrides.calibrationInterval === "number" && overrides.calibrationInterval > 0
        ? overrides.calibrationInterval
        : 12,
    lastCalibrationDate: normalizeText(overrides.lastCalibrationDate),
    note: normalizeText(overrides.note),
  };
}

export function calculateNextCalibrationDate(lastDate: string, intervalMonths: number): string {
  if (!lastDate) return "";
  const d = new Date(`${lastDate}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return "";
  d.setUTCMonth(d.getUTCMonth() + intervalMonths);
  return d.toISOString().slice(0, 10);
}

export function isCalibrationOverdue(lastDate: string, intervalMonths: number): boolean {
  const next = calculateNextCalibrationDate(lastDate, intervalMonths);
  if (!next) return false;
  return new Date(`${next}T00:00:00.000Z`) < new Date();
}

export function getDefaultEquipmentCalibrationConfig(
  year = new Date().getUTCFullYear(),
  equipment: EquipmentCalibrationEquipmentSource[] = []
): EquipmentCalibrationConfig {
  const defaultConfig: EquipmentCalibrationConfig = {
    year,
    documentDate: `${year}-01-12`,
    approveRole: "Управляющий",
    approveEmployeeId: null,
    approveEmployee: "Иванов И.И.",
    rows: [
      createCalibrationRow({
        equipmentName: "Весы платформенные 012-В",
        equipmentNumber: "11231411",
        location: "склад",
        purpose: "Масса, кг",
        measurementRange: "20...500 кг",
        calibrationInterval: 12,
        lastCalibrationDate: "2022-10-14",
      }),
    ],
  };

  if (equipment.length === 0) {
    return defaultConfig;
  }

  return buildEquipmentCalibrationConfigFromEquipment(equipment, { year });
}

export function getEquipmentCalibrationDocumentTitle() {
  return EQUIPMENT_CALIBRATION_DOCUMENT_TITLE;
}

export function normalizeEquipmentCalibrationConfig(
  value: unknown
): EquipmentCalibrationConfig {
  const defaults = getDefaultEquipmentCalibrationConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  const rows = Array.isArray(record.rows)
    ? record.rows
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          return createCalibrationRow(item as Partial<CalibrationRow>);
        })
        .filter((item): item is CalibrationRow => item !== null)
    : defaults.rows;

  const year =
    typeof record.year === "number" && Number.isFinite(record.year)
      ? Math.trunc(record.year)
      : defaults.year;

  return {
    rows,
    year,
    documentDate: normalizeText(record.documentDate) || defaults.documentDate,
    approveRole: normalizeText(record.approveRole) || defaults.approveRole,
    approveEmployeeId:
      normalizeText(record.approveEmployeeId) || defaults.approveEmployeeId || null,
    approveEmployee: normalizeText(record.approveEmployee) || defaults.approveEmployee,
  };
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function getEquipmentPurpose(source: EquipmentCalibrationEquipmentSource) {
  const haystack = `${source.name} ${source.type}`.toLowerCase();
  if (haystack.includes("вес")) return "Масса, кг";
  if (
    haystack.includes("sensor") ||
    haystack.includes("термо") ||
    haystack.includes("холод") ||
    haystack.includes("мороз") ||
    haystack.includes("refrigerator") ||
    haystack.includes("freezer")
  ) {
    return "Температура, °C";
  }
  return "Контролируемый параметр";
}

function getEquipmentMeasurementRange(source: EquipmentCalibrationEquipmentSource) {
  if (
    typeof source.tempMin === "number" &&
    Number.isFinite(source.tempMin) &&
    typeof source.tempMax === "number" &&
    Number.isFinite(source.tempMax)
  ) {
    return `${formatNumber(source.tempMin)}...${formatNumber(source.tempMax)} °C`;
  }

  const haystack = `${source.name} ${source.type}`.toLowerCase();
  if (haystack.includes("вес")) return "20...500 кг";

  return "По технической документации";
}

export function buildEquipmentCalibrationConfigFromEquipment(
  equipment: EquipmentCalibrationEquipmentSource[],
  options: Partial<EquipmentCalibrationConfig> & { year?: number } = {}
): EquipmentCalibrationConfig {
  const defaults = getDefaultEquipmentCalibrationConfig(options.year, []);
  const normalized = normalizeEquipmentCalibrationConfig({
    ...defaults,
    ...options,
  });

  const year = options.year ?? normalized.year;
  const baseLastCalibrationDate = `${year - 1}-10-14`;

  const rows = equipment
    .map((item) =>
      createCalibrationRow({
        equipmentName: normalizeText(item.name),
        equipmentNumber:
          normalizeText(item.serialNumber) ||
          item.id.slice(-8).toUpperCase(),
        location: normalizeText(item.area?.name),
        purpose: getEquipmentPurpose(item),
        measurementRange: getEquipmentMeasurementRange(item),
        calibrationInterval: 12,
        lastCalibrationDate: baseLastCalibrationDate,
      })
    )
    .filter((row) => row.equipmentName);

  return {
    ...normalized,
    year,
    documentDate: normalized.documentDate || `${year}-01-12`,
    rows: rows.length > 0 ? rows : normalized.rows,
  };
}

export function formatCalibrationDate(dateKey: string): string {
  if (!dateKey) return "";
  const [year, month, day] = dateKey.split("-");
  return year && month && day ? `${day}-${month}-${year}` : dateKey;
}

export function formatCalibrationDateLong(dateKey: string): string {
  if (!dateKey) return "";
  const MONTHS = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return dateKey;
  return `« ${d.getUTCDate()} » ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} г.`;
}

export function getCalibrationCreatePeriodBounds(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
  };
}
