export const HYGIENE_STATUS_OPTIONS = [
  { value: "healthy", code: "Зд.", label: "Здоров" },
  { value: "day_off", code: "В", label: "Выходной / отгул" },
  { value: "sick_leave", code: "Б/л", label: "Больничный лист" },
  { value: "suspended", code: "От", label: "Отстранен от работы" },
  { value: "vacation", code: "Отп", label: "Отпуск" },
] as const;

export type HygieneStatus = (typeof HYGIENE_STATUS_OPTIONS)[number]["value"];

export type HygieneEntryData = {
  status?: HygieneStatus | null;
  temperatureAbove37?: boolean | null;
};

export const HYGIENE_REGISTER_PERIODICITY = [
  "Ежесменно перед началом смены для сотрудников производства.",
  "Для остальных сотрудников компании контроль проводится при посещении производственного участка.",
];

export const HYGIENE_REGISTER_NOTES = [
  "В журнал вносятся результаты осмотра и опроса сотрудников о состоянии здоровья, признаках респираторных и кишечных заболеваний.",
  "Отмечаются сведения об отсутствии гнойничковых заболеваний кожи рук, открытых поверхностей тела и других факторов недопуска.",
  "Список работников, отражённых в журнале на день осмотра, должен соответствовать числу работников, находящихся в смене.",
];

export const HYGIENE_REGISTER_LEGEND = [
  "Зд. — здоров",
  "В — выходной / отгул",
  "Б/л — больничный лист / отстранен от работы по причине болезни",
  "От — отстранен",
  "Отп — отпуск",
];

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export function coerceUtcDate(value: Date | string): Date {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
    );
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(value);
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  );
}

export function toDateKey(value: Date | string): string {
  const date = coerceUtcDate(value);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function fromDateKey(dateKey: string): Date {
  return coerceUtcDate(dateKey);
}

export function buildDateKeys(dateFrom: Date | string, dateTo: Date | string): string[] {
  const start = coerceUtcDate(dateFrom);
  const end = coerceUtcDate(dateTo);
  const dates: string[] = [];

  for (
    let cursor = new Date(start);
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    dates.push(toDateKey(cursor));
  }

  return dates;
}

export function formatMonthLabel(dateFrom: Date | string, dateTo: Date | string): string {
  const start = coerceUtcDate(dateFrom);
  const end = coerceUtcDate(dateTo);

  if (
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth()
  ) {
    return `${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()} г.`;
  }

  return `${toDateKey(start)} — ${toDateKey(end)}`;
}

export function getDayNumber(dateKey: string): number {
  return fromDateKey(dateKey).getUTCDate();
}

export function getWeekdayShort(dateKey: string): string {
  return WEEKDAY_SHORT[fromDateKey(dateKey).getUTCDay()] || "";
}

export function isWeekend(dateKey: string): boolean {
  const weekday = fromDateKey(dateKey).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    owner: "Руководитель",
    technologist: "Технолог",
    operator: "Оператор",
  };

  return labels[role] || "Сотрудник";
}

export function getStatusMeta(status?: string | null) {
  return HYGIENE_STATUS_OPTIONS.find((option) => option.value === status) || null;
}

export function normalizeHygieneEntryData(data: unknown): HygieneEntryData {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  const record = data as Record<string, unknown>;
  const status =
    typeof record.status === "string" &&
    HYGIENE_STATUS_OPTIONS.some((option) => option.value === record.status)
      ? (record.status as HygieneStatus)
      : undefined;

  const temperatureAbove37 =
    typeof record.temperatureAbove37 === "boolean"
      ? record.temperatureAbove37
      : null;

  return {
    status,
    temperatureAbove37,
  };
}
