export const CLEANING_VENTILATION_CHECKLIST_TEMPLATE_CODE =
  "cleaning_ventilation_checklist";

export const CLEANING_VENTILATION_CHECKLIST_TITLE =
  "Чек-лист уборки и проветривания помещений";

export type CleaningVentilationResponsible = {
  id: string;
  title: string;
  userId: string;
};

export type CleaningVentilationProcedureConfig = {
  id: "disinfection" | "ventilation" | "wet_cleaning";
  label: string;
  enabled: boolean;
  times: string[];
  responsibleUserId: string;
};

export type CleaningVentilationChecklistConfig = {
  autoFillEnabled: boolean;
  skipWeekends: boolean;
  mainResponsibleTitle: string;
  mainResponsibleUserId: string;
  ventilationEnabled: boolean;
  customDates: string[];
  hiddenDates: string[];
  responsibles: CleaningVentilationResponsible[];
  procedures: CleaningVentilationProcedureConfig[];
};

export type CleaningVentilationChecklistEntryData = {
  procedures: Partial<Record<CleaningVentilationProcedureConfig["id"], string[]>>;
  responsibleUserId?: string;
};

type BasicUser = {
  id: string;
  name: string;
  role: string;
};

function createId() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_DESCRIPTION = [
  {
    label: "Обрабатываемые поверхности при дезинфекции",
    text: "дверные ручки, выключатели, стены, поверхности столов, спинки стульев, меню, кассовый аппарат, орг.техника",
  },
  {
    label: "Рабочие помещения при проветривании",
    text: "производственный цех",
  },
  {
    label: "Помещения, подлежащие влажной уборке",
    text: "заготовочный цех, мясной цех, холодный цех, горячий цех, обеденный зал, бар",
  },
  {
    label: "Используемое дез. средство, концентрация",
    text: "Ph Средство дезинфицирующее - 0,5%",
  },
];

export function getCleaningVentilationDescriptionLines() {
  return DEFAULT_DESCRIPTION.map((item) => ({ ...item }));
}

export function getCleaningVentilationPeriodicityLines(enabledVentilation: boolean) {
  return [
    "Дезинфекция – 3 раз(а) в день",
    ...(enabledVentilation ? ["Проветривание – 3 раз(а) в день"] : []),
    "Влажная уборка – 2 раз(а) в день",
  ];
}

export function getRoleLabel(role: string) {
  if (role === "owner" || role === "technologist") {
    return "Управляющий";
  }
  return "Сотрудник";
}

export function getPreferredResponsibleUserId(users: BasicUser[]) {
  return (
    users.find((user) => user.role === "owner")?.id ||
    users.find((user) => user.role === "technologist")?.id ||
    users[0]?.id ||
    ""
  );
}

export function getDefaultCleaningVentilationConfig(
  users: BasicUser[] = []
): CleaningVentilationChecklistConfig {
  const mainResponsibleUserId = getPreferredResponsibleUserId(users);
  const fallbackTitle = getRoleLabel(
    users.find((user) => user.id === mainResponsibleUserId)?.role || "owner"
  );

  const defaultResponsibles = users
    .filter((user) => ["owner", "technologist", "operator"].includes(user.role))
    .slice(0, 3)
    .map((user) => ({
      id: createId(),
      title: getRoleLabel(user.role),
      userId: user.id,
    }));

  return {
    autoFillEnabled: true,
    skipWeekends: false,
    mainResponsibleTitle: fallbackTitle,
    mainResponsibleUserId,
    ventilationEnabled: true,
    customDates: [],
    hiddenDates: [],
    responsibles: defaultResponsibles,
    procedures: [
      {
        id: "disinfection",
        label: "Дезинфекция",
        enabled: true,
        times: ["14:00", "12:00", "23:00"],
        responsibleUserId: mainResponsibleUserId,
      },
      {
        id: "ventilation",
        label: "Проветривание",
        enabled: true,
        times: ["12:00", "10:00", "23:00"],
        responsibleUserId: mainResponsibleUserId,
      },
      {
        id: "wet_cleaning",
        label: "Влажная уборка",
        enabled: true,
        times: ["12:00", "18:00"],
        responsibleUserId: mainResponsibleUserId,
      },
    ],
  };
}

function normalizeProcedure(
  procedure: unknown,
  fallback: CleaningVentilationProcedureConfig,
  mainResponsibleUserId: string
): CleaningVentilationProcedureConfig {
  if (!procedure || typeof procedure !== "object" || Array.isArray(procedure)) {
    return { ...fallback };
  }

  const record = procedure as Record<string, unknown>;
  const times = Array.isArray(record.times)
    ? record.times.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : fallback.times;

  return {
    id:
      record.id === "disinfection" ||
      record.id === "ventilation" ||
      record.id === "wet_cleaning"
        ? record.id
        : fallback.id,
    label: typeof record.label === "string" && record.label.trim() ? record.label : fallback.label,
    enabled: typeof record.enabled === "boolean" ? record.enabled : fallback.enabled,
    times: times.length > 0 ? times : fallback.times,
    responsibleUserId:
      typeof record.responsibleUserId === "string" && record.responsibleUserId
        ? record.responsibleUserId
        : mainResponsibleUserId || fallback.responsibleUserId,
  };
}

export function normalizeCleaningVentilationConfig(
  value: unknown,
  users: BasicUser[] = []
): CleaningVentilationChecklistConfig {
  const fallback = getDefaultCleaningVentilationConfig(users);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const mainResponsibleUserId =
    typeof record.mainResponsibleUserId === "string" && record.mainResponsibleUserId
      ? record.mainResponsibleUserId
      : fallback.mainResponsibleUserId;

  const procedureList = Array.isArray(record.procedures)
    ? (record.procedures as unknown[])
    : null;

  const procedures = procedureList
    ? fallback.procedures.map((item) => {
        const matched = procedureList.find(
          (candidate: unknown) =>
            candidate &&
            typeof candidate === "object" &&
            (candidate as Record<string, unknown>).id === item.id
        );
        return normalizeProcedure(matched, item, mainResponsibleUserId);
      })
    : fallback.procedures.map((item) => ({ ...item }));

  const ventilationEnabled =
    typeof record.ventilationEnabled === "boolean"
      ? record.ventilationEnabled
      : fallback.ventilationEnabled;

  return {
    autoFillEnabled:
      typeof record.autoFillEnabled === "boolean"
        ? record.autoFillEnabled
        : fallback.autoFillEnabled,
    skipWeekends:
      typeof record.skipWeekends === "boolean"
        ? record.skipWeekends
        : fallback.skipWeekends,
    mainResponsibleTitle:
      typeof record.mainResponsibleTitle === "string" && record.mainResponsibleTitle.trim()
        ? record.mainResponsibleTitle
        : fallback.mainResponsibleTitle,
    mainResponsibleUserId,
    ventilationEnabled,
    customDates: Array.isArray(record.customDates)
      ? record.customDates.filter(
          (item): item is string => typeof item === "string" && item.length > 0
        )
      : [],
    hiddenDates: Array.isArray(record.hiddenDates)
      ? record.hiddenDates.filter(
          (item): item is string => typeof item === "string" && item.length > 0
        )
      : [],
    responsibles: Array.isArray(record.responsibles)
      ? record.responsibles
          .filter(
            (item) =>
              item &&
              typeof item === "object" &&
              typeof (item as Record<string, unknown>).userId === "string"
          )
          .map((item) => {
            const responsible = item as Record<string, unknown>;
            return {
              id:
                typeof responsible.id === "string" && responsible.id
                  ? responsible.id
                  : createId(),
              title:
                typeof responsible.title === "string" && responsible.title.trim()
                  ? responsible.title
                  : "Сотрудник",
              userId: responsible.userId as string,
            };
          })
      : fallback.responsibles.map((item) => ({ ...item })),
    procedures: procedures
      .filter((item) => item.id !== "ventilation" || ventilationEnabled)
      .map((item) => ({ ...item })),
  };
}

export function normalizeCleaningVentilationEntryData(
  value: unknown
): CleaningVentilationChecklistEntryData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { procedures: {} };
  }

  const record = value as Record<string, unknown>;
  const procedures: CleaningVentilationChecklistEntryData["procedures"] = {};

  if (record.procedures && typeof record.procedures === "object" && !Array.isArray(record.procedures)) {
    for (const [key, rawValue] of Object.entries(record.procedures as Record<string, unknown>)) {
      if (
        (key === "disinfection" || key === "ventilation" || key === "wet_cleaning") &&
        Array.isArray(rawValue)
      ) {
        procedures[key] = rawValue.filter(
          (item): item is string => typeof item === "string"
        );
      }
    }
  }

  return {
    procedures,
    responsibleUserId:
      typeof record.responsibleUserId === "string" ? record.responsibleUserId : undefined,
  };
}

export function getMonthBoundsFromDate(isoDate: string) {
  const baseDate = new Date(`${isoDate}T00:00:00`);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const dateFrom = new Date(year, month, 1);
  const dateTo = new Date(year, month + 1, 0);
  return {
    dateFrom: dateFrom.toISOString().slice(0, 10),
    dateTo: dateTo.toISOString().slice(0, 10),
  };
}

export function buildChecklistDateKeys(
  dateFrom: string,
  skipWeekends: boolean,
  customDates: string[] = [],
  hiddenDates: string[] = []
) {
  const { dateFrom: monthStart, dateTo: monthEnd } = getMonthBoundsFromDate(dateFrom);
  const keys: string[] = [];
  const cursor = new Date(`${monthStart}T00:00:00`);
  const endDate = new Date(`${monthEnd}T00:00:00`);

  while (cursor <= endDate) {
    const weekday = cursor.getDay();
    if (!skipWeekends || (weekday !== 0 && weekday !== 6)) {
      keys.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const customDate of customDates) {
    if (!keys.includes(customDate)) {
      keys.push(customDate);
    }
  }

  return keys.filter((item) => !hiddenDates.includes(item)).sort();
}

export function getCleaningVentilationFilePrefix() {
  return "cleaning-ventilation-checklist";
}
