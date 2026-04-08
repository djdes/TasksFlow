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
  "Ежесменно перед началом смены – всех для сотрудников производства;",
  "для других сотрудников компании – при визите на производственный участок (однократно перед проходом на участок)",
];

export const HYGIENE_REGISTER_NOTES = [
  "осмотра и опроса сотрудников о состоянии здоровья (проявлениях респираторных и кишечных заболеваний и инфекций);",
  "опроса сотрудников об отсутствии заболеваний верхних дыхательных путей и гнойничковых заболеваний кожи рук и открытых поверхностей тела;",
  "опроса сотрудников о контактах с людьми, перенесшими желудочно-кишечные инфекции, с больными и вернувшимися из другой страны или субъекта РФ;",
  "осмотра рук и открытых частей тела сотрудников на наличие гнойничковых заболеваний и нарушений целостности кожного покрова.",
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

export const HYGIENE_EXAMPLE_ORGANIZATION = 'ООО "Тест"';
export const HYGIENE_EXAMPLE_TITLE = "ГИГИЕНИЧЕСКИЙ ЖУРНАЛ";
export const HYGIENE_EXAMPLE_MONTH = "Апрель 2026 г.";
export const HYGIENE_EXAMPLE_DATE_FROM = "2026-04-01";
export const HYGIENE_EXAMPLE_DATE_TO = "2026-04-15";

export type HygieneExampleEmployee = {
  id: string;
  number: number;
  name: string;
  position: string;
};

export const HYGIENE_EXAMPLE_EMPLOYEES: HygieneExampleEmployee[] = [
  { id: "sample-1", number: 1, name: "Иванов И.И.", position: "Управляющий" },
  { id: "sample-2", number: 2, name: "Петров П.П.", position: "Шеф-повар" },
  { id: "sample-3", number: 3, name: "Сидоров С.С.", position: "Повар" },
  { id: "sample-4", number: 4, name: "Антонов А.А.", position: "Повар" },
  { id: "sample-5", number: 5, name: "Борисов Б.Б.", position: "Официант" },
];

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

export function buildFixedHygieneExampleDateKeys(): string[] {
  return buildDateKeys(HYGIENE_EXAMPLE_DATE_FROM, HYGIENE_EXAMPLE_DATE_TO);
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

export function buildExampleHygieneEntryMap(): Record<string, HygieneEntryData> {
  const dateKeys = buildFixedHygieneExampleDateKeys();
  const map: Record<string, HygieneEntryData> = {};

  function setEntry(
    employeeId: string,
    dayNumber: number,
    data: HygieneEntryData
  ) {
    const dateKey = dateKeys[dayNumber - 1];
    if (!dateKey) return;
    map[`${employeeId}:${dateKey}`] = data;
  }

  for (const employee of HYGIENE_EXAMPLE_EMPLOYEES) {
    for (let day = 1; day <= 8; day += 1) {
      setEntry(employee.id, day, {
        status: "healthy",
        temperatureAbove37: false,
      });
    }
  }

  setEntry("sample-1", 2, {
    status: "day_off",
    temperatureAbove37: null,
  });

  return map;
}
