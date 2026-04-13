export const DISINFECTANT_TEMPLATE_CODE = "disinfectant_usage";
export const DISINFECTANT_SOURCE_SLUG = "disinfectjournal";
export const DISINFECTANT_HEADING =
  "Журнал учета получения, расхода дезинфицирующих средств и проведения дезинфекционных работ на объекте";
export const DISINFECTANT_DOCUMENT_TITLE = "Журнал учета дез. средств";

export type MeasureUnit = "kg" | "l" | "bottle";

export const MEASURE_UNIT_LABELS: Record<MeasureUnit, string> = {
  kg: "кг.",
  l: "л.",
  bottle: "фл.",
};

export type SubdivisionRow = {
  id: string;
  name: string;
  area: number | null;
  byCapacity: boolean;
  treatmentType: "current" | "general";
  frequencyPerMonth: number;
  disinfectantName: string;
  concentration: number;
  solutionConsumptionPerSqm: number;
  solutionPerTreatment: number;
};

export type ReceiptRow = {
  id: string;
  date: string;
  disinfectantName: string;
  quantity: number;
  unit: MeasureUnit;
  expiryDate: string;
  responsibleRole: string;
  responsibleEmployeeId?: string | null;
  responsibleEmployee: string;
};

export type ConsumptionRow = {
  id: string;
  periodFrom: string;
  periodTo: string;
  disinfectantName: string;
  totalReceived: number;
  totalReceivedUnit: MeasureUnit;
  totalConsumed: number;
  totalConsumedUnit: MeasureUnit;
  remainder: number;
  remainderUnit: MeasureUnit;
  responsibleRole: string;
  responsibleEmployeeId?: string | null;
  responsibleEmployee: string;
};

export type DisinfectantDocumentConfig = {
  responsibleRole: string;
  responsibleEmployeeId?: string | null;
  responsibleEmployee: string;
  subdivisions: SubdivisionRow[];
  receipts: ReceiptRow[];
  consumptions: ConsumptionRow[];
};

function createId() {
  return `dis-${Math.random().toString(36).slice(2, 9)}`;
}

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function safeMeasureUnit(value: unknown): MeasureUnit {
  if (value === "kg" || value === "l" || value === "bottle") return value;
  return "kg";
}

// --- Computed helpers ---

export function computeNeedPerTreatment(row: SubdivisionRow): number {
  return row.solutionPerTreatment * (row.concentration / 100);
}

export function computeNeedPerMonth(row: SubdivisionRow): number {
  return computeNeedPerTreatment(row) * row.frequencyPerMonth;
}

export function computeNeedPerYear(row: SubdivisionRow): number {
  return computeNeedPerMonth(row) * 12;
}

export function formatNumber(value: number, decimals = 3): string {
  if (value === 0) return "";
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

export function formatQuantityWithUnit(quantity: number, unit: MeasureUnit): string {
  if (quantity === 0) return "";
  return `${formatNumber(quantity)} ${MEASURE_UNIT_LABELS[unit]}`;
}

// --- Normalization ---

function normalizeSubdivision(value: unknown): SubdivisionRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  return {
    id: safeText(s.id) || createId(),
    name: safeText(s.name),
    area: s.byCapacity === true ? null : safeNumber(s.area),
    byCapacity: s.byCapacity === true,
    treatmentType: s.treatmentType === "general" ? "general" : "current",
    frequencyPerMonth: safeNumber(s.frequencyPerMonth),
    disinfectantName: safeText(s.disinfectantName),
    concentration: safeNumber(s.concentration),
    solutionConsumptionPerSqm: safeNumber(s.solutionConsumptionPerSqm),
    solutionPerTreatment: safeNumber(s.solutionPerTreatment),
  };
}

function normalizeReceipt(value: unknown): ReceiptRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  return {
    id: safeText(s.id) || createId(),
    date: safeText(s.date),
    disinfectantName: safeText(s.disinfectantName),
    quantity: safeNumber(s.quantity),
    unit: safeMeasureUnit(s.unit),
    expiryDate: safeText(s.expiryDate),
    responsibleRole: safeText(s.responsibleRole),
    responsibleEmployeeId: safeText(s.responsibleEmployeeId) || null,
    responsibleEmployee: safeText(s.responsibleEmployee),
  };
}

function normalizeConsumption(value: unknown): ConsumptionRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  return {
    id: safeText(s.id) || createId(),
    periodFrom: safeText(s.periodFrom),
    periodTo: safeText(s.periodTo),
    disinfectantName: safeText(s.disinfectantName),
    totalReceived: safeNumber(s.totalReceived),
    totalReceivedUnit: safeMeasureUnit(s.totalReceivedUnit),
    totalConsumed: safeNumber(s.totalConsumed),
    totalConsumedUnit: safeMeasureUnit(s.totalConsumedUnit),
    remainder: safeNumber(s.remainder),
    remainderUnit: safeMeasureUnit(s.remainderUnit),
    responsibleRole: safeText(s.responsibleRole),
    responsibleEmployeeId: safeText(s.responsibleEmployeeId) || null,
    responsibleEmployee: safeText(s.responsibleEmployee),
  };
}

export function normalizeDisinfectantConfig(
  config: unknown
): DisinfectantDocumentConfig {
  const fallback = getDisinfectantDefaultConfig();
  if (!config || typeof config !== "object" || Array.isArray(config))
    return fallback;
  const source = config as Record<string, unknown>;

  return {
    responsibleRole: safeText(source.responsibleRole) || fallback.responsibleRole,
    responsibleEmployeeId:
      safeText(source.responsibleEmployeeId) || fallback.responsibleEmployeeId || null,
    responsibleEmployee: safeText(source.responsibleEmployee) || fallback.responsibleEmployee,
    subdivisions: Array.isArray(source.subdivisions)
      ? source.subdivisions
          .map(normalizeSubdivision)
          .filter((s): s is SubdivisionRow => s !== null)
      : [],
    receipts: Array.isArray(source.receipts)
      ? source.receipts
          .map(normalizeReceipt)
          .filter((r): r is ReceiptRow => r !== null)
      : [],
    consumptions: Array.isArray(source.consumptions)
      ? source.consumptions
          .map(normalizeConsumption)
          .filter((c): c is ConsumptionRow => c !== null)
      : [],
  };
}

// --- Defaults ---

export function getDisinfectantDefaultConfig(): DisinfectantDocumentConfig {
  return {
    responsibleRole: "Управляющий",
    responsibleEmployeeId: null,
    responsibleEmployee: "",
    subdivisions: [
      {
        id: "sub-1",
        name: "Поверхности в помещениях для гостей (пол)",
        area: 50,
        byCapacity: false,
        treatmentType: "current",
        frequencyPerMonth: 31,
        disinfectantName: "Ph средство дезинфицирующее",
        concentration: 0.5,
        solutionConsumptionPerSqm: 0.7,
        solutionPerTreatment: 35,
      },
      {
        id: "sub-2",
        name: "Мебель в помещениях для гостей (столы, стулья, диваны, полки), стационарные официантов в торговом зале",
        area: null,
        byCapacity: true,
        treatmentType: "current",
        frequencyPerMonth: 31,
        disinfectantName: "Ph средство дезинфицирующее",
        concentration: 0.5,
        solutionConsumptionPerSqm: 0,
        solutionPerTreatment: 5,
      },
      {
        id: "sub-3",
        name: "Поверхности в производственных и складских помещениях, в баре (пол, фартуки над рабочими поверхностями)",
        area: 50,
        byCapacity: false,
        treatmentType: "current",
        frequencyPerMonth: 31,
        disinfectantName: "Ph средство дезинфицирующее",
        concentration: 0.5,
        solutionConsumptionPerSqm: 0.1,
        solutionPerTreatment: 5,
      },
    ],
    receipts: [
      {
        id: "rec-1",
        date: "2025-02-13",
        disinfectantName: "Ph средство дезинфицирующее",
        quantity: 30,
        unit: "l",
        expiryDate: "2026-05-01",
        responsibleRole: "Управляющий",
        responsibleEmployee: "",
      },
      {
        id: "rec-2",
        date: "2023-12-01",
        disinfectantName: "Ph средство дезинфицирующее",
        quantity: 30,
        unit: "l",
        expiryDate: "2025-04-25",
        responsibleRole: "Управляющий",
        responsibleEmployee: "",
      },
    ],
    consumptions: [
      {
        id: "con-1",
        periodFrom: "2024-03-07",
        periodTo: "2024-12-05",
        disinfectantName: "Ph средство дезинфицирующее",
        totalReceived: 30,
        totalReceivedUnit: "kg",
        totalConsumed: 19.976,
        totalConsumedUnit: "kg",
        remainder: 11,
        remainderUnit: "kg",
        responsibleRole: "Управляющий",
        responsibleEmployee: "",
      },
    ],
  };
}

export function createEmptySubdivision(): SubdivisionRow {
  return {
    id: createId(),
    name: "",
    area: null,
    byCapacity: false,
    treatmentType: "current",
    frequencyPerMonth: 0,
    disinfectantName: "",
    concentration: 0,
    solutionConsumptionPerSqm: 0,
    solutionPerTreatment: 0,
  };
}

export function createEmptyReceipt(
  defaultRole: string,
  defaultEmployee: string,
  defaultEmployeeId?: string | null
): ReceiptRow {
  return {
    id: createId(),
    date: new Date().toISOString().slice(0, 10),
    disinfectantName: "",
    quantity: 0,
    unit: "kg",
    expiryDate: new Date().toISOString().slice(0, 10),
    responsibleRole: defaultRole,
    responsibleEmployeeId: defaultEmployeeId || null,
    responsibleEmployee: defaultEmployee,
  };
}

export function createEmptyConsumption(
  defaultRole: string,
  defaultEmployee: string,
  defaultEmployeeId?: string | null
): ConsumptionRow {
  return {
    id: createId(),
    periodFrom: "",
    periodTo: "",
    disinfectantName: "",
    totalReceived: 0,
    totalReceivedUnit: "kg",
    totalConsumed: 0,
    totalConsumedUnit: "kg",
    remainder: 0,
    remainderUnit: "kg",
    responsibleRole: defaultRole,
    responsibleEmployeeId: defaultEmployeeId || null,
    responsibleEmployee: defaultEmployee,
  };
}
