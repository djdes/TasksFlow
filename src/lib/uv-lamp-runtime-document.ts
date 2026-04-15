export const UV_LAMP_RUNTIME_TEMPLATE_CODE = "uv_lamp_runtime";

export const UV_LAMP_RUNTIME_PAGE_TITLE = "Журнал учета работы УФ бактерицидной установки";

export type UvSpecification = {
  disinfectionAir: boolean;
  disinfectionSurface: boolean;
  microorganismType: string;
  radiationMode: "continuous" | "intermittent";
  disinfectionCondition: "with_people" | "without_people";
  lampLifetimeHours: number;
  commissioningDate: string;
  minIntervalBetweenSessions: string;
  controlFrequency: string;
};

export type UvRuntimeDocumentConfig = {
  lampNumber: string;
  areaName: string;
  spec: UvSpecification;
};

export type UvRuntimeEntryData = {
  startTime: string;
  endTime: string;
};

export function defaultUvSpecification(): UvSpecification {
  return {
    disinfectionAir: true,
    disinfectionSurface: true,
    microorganismType: "санитарно-показательный",
    radiationMode: "continuous",
    disinfectionCondition: "with_people",
    lampLifetimeHours: 10000,
    commissioningDate: "",
    minIntervalBetweenSessions: "",
    controlFrequency: "1 раз(а) в смену",
  };
}

export function normalizeUvSpecification(value: unknown): UvSpecification {
  const defaults = defaultUvSpecification();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaults;
  }

  const item = value as Record<string, unknown>;
  return {
    disinfectionAir: typeof item.disinfectionAir === "boolean" ? item.disinfectionAir : defaults.disinfectionAir,
    disinfectionSurface: typeof item.disinfectionSurface === "boolean" ? item.disinfectionSurface : defaults.disinfectionSurface,
    microorganismType: typeof item.microorganismType === "string" && item.microorganismType.trim() ? item.microorganismType.trim() : defaults.microorganismType,
    radiationMode: item.radiationMode === "intermittent" ? "intermittent" : "continuous",
    disinfectionCondition: item.disinfectionCondition === "without_people" ? "without_people" : "with_people",
    lampLifetimeHours: typeof item.lampLifetimeHours === "number" && item.lampLifetimeHours > 0 ? item.lampLifetimeHours : defaults.lampLifetimeHours,
    commissioningDate: typeof item.commissioningDate === "string" ? item.commissioningDate : "",
    minIntervalBetweenSessions: typeof item.minIntervalBetweenSessions === "string" ? item.minIntervalBetweenSessions : "",
    controlFrequency: typeof item.controlFrequency === "string" && item.controlFrequency.trim() ? item.controlFrequency.trim() : defaults.controlFrequency,
  };
}

export function normalizeUvRuntimeDocumentConfig(value: unknown): UvRuntimeDocumentConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      lampNumber: "1",
      areaName: "Журнал учета работы",
      spec: defaultUvSpecification(),
    };
  }

  const item = value as Record<string, unknown>;
  return {
    lampNumber:
      typeof item.lampNumber === "string" && item.lampNumber.trim()
        ? item.lampNumber.trim()
        : "1",
    areaName:
      typeof item.areaName === "string" && item.areaName.trim()
        ? item.areaName.trim()
        : "Журнал учета работы",
    spec: normalizeUvSpecification(item.spec),
  };
}

export function normalizeUvRuntimeEntryData(value: unknown): UvRuntimeEntryData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      startTime: "",
      endTime: "",
    };
  }

  const item = value as Record<string, unknown>;
  return {
    startTime: typeof item.startTime === "string" ? item.startTime : "",
    endTime: typeof item.endTime === "string" ? item.endTime : "",
  };
}

export function buildUvRuntimeDocumentTitle(config: UvRuntimeDocumentConfig) {
  return `Бактерицидная установка №${config.lampNumber} | ${config.areaName}`.trim();
}

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function formatRuDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("ru-RU");
}

export function formatRuDateDash(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("ru-RU").replaceAll(".", "-");
}

export function buildDailyRange(from: string, to: string) {
  const result: string[] = [];
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (current <= end) {
    result.push(toIsoDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

export function getUvResponsibleOptions(users: { id: string; name: string; role: string }[]) {
  const managementRoles = new Set(["owner", "technologist"]);
  const management = users.filter((user) => managementRoles.has(user.role));
  const staff = users.filter((user) => !managementRoles.has(user.role));
  return { management, staff };
}

/**
 * Distinct management titles for the "Должность ответственного" Select.
 * Radix Select concatenates trigger-text when multiple <SelectItem>s share
 * the same `value`, so iterating users here is wrong. Return one title per
 * unique role label.
 */
export function getUvResponsibleTitleOptions(
  users: { id: string; name: string; role: string }[]
): { management: string[]; staff: string[] } {
  const management = new Set<string>();
  const staff = new Set<string>();
  for (const user of users) {
    if (user.role === "owner") management.add("Руководитель");
    else if (user.role === "technologist" || user.role === "manager") management.add("Управляющий");
    else if (user.role === "head_chef") staff.add("Шеф-повар");
    else if (user.role === "cook") staff.add("Повар");
    else if (user.role === "waiter") staff.add("Официант");
  }
  return { management: [...management], staff: [...staff] };
}

export function calculateDurationMinutes(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

export function calculateMonthlyHours(
  entries: { date: string; data: UvRuntimeEntryData }[],
  lampLifetimeHours: number
): { month: string; hours: number; remaining: number }[] {
  const monthMap = new Map<string, number>();

  for (const entry of entries) {
    const duration = calculateDurationMinutes(entry.data.startTime, entry.data.endTime);
    if (duration === null || duration === 0) continue;

    const date = new Date(`${entry.date}T00:00:00.000Z`);
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + duration);
  }

  const sortedMonths = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  let totalUsed = 0;
  return sortedMonths.map(([monthKey, minutes]) => {
    const hours = Math.round((minutes / 60) * 100) / 100;
    totalUsed += hours;
    const remaining = Math.round((lampLifetimeHours - totalUsed) * 100) / 100;
    return { month: monthKey, hours, remaining };
  });
}

export function formatMonthLabel(monthKey: string): string {
  const MONTH_NAMES = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];
  const [year, month] = monthKey.split("-");
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

export function getDisinfectionObjectLabel(spec: UvSpecification): string {
  const parts: string[] = [];
  if (spec.disinfectionAir) parts.push("воздух");
  if (spec.disinfectionSurface) parts.push("поверхность");
  return parts.join(" и ") || "—";
}

export function getRadiationModeLabel(mode: UvSpecification["radiationMode"]): string {
  return mode === "continuous" ? "непрерывный" : "повторно-кратковременный";
}

export function getDisinfectionConditionLabel(condition: UvSpecification["disinfectionCondition"]): string {
  return condition === "with_people" ? "в присутствии людей" : "в отсутствии людей";
}

export const CONTROL_FREQUENCY_OPTIONS = [
  "1 раз(а) в смену",
  "2 раз(а) в смену",
  "3 раз(а) в смену",
  "1 раз(а) в день",
  "2 раз(а) в день",
];
