export const UV_LAMP_RUNTIME_TEMPLATE_CODE = "uv_lamp_runtime";

export const UV_LAMP_RUNTIME_PAGE_TITLE = "Журнал учета работы УФ бактерицидной установки";

export type UvRuntimeDocumentConfig = {
  lampNumber: string;
  areaName: string;
};

export type UvRuntimeEntryData = {
  startTime: string;
  endTime: string;
  counterValue: string;
};

export function normalizeUvRuntimeDocumentConfig(value: unknown): UvRuntimeDocumentConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      lampNumber: "1",
      areaName: "Журнал учета работы",
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
  };
}

export function normalizeUvRuntimeEntryData(value: unknown): UvRuntimeEntryData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      startTime: "",
      endTime: "",
      counterValue: "",
    };
  }

  const item = value as Record<string, unknown>;
  return {
    startTime: typeof item.startTime === "string" ? item.startTime : "",
    endTime: typeof item.endTime === "string" ? item.endTime : "",
    counterValue:
      typeof item.counterValue === "string"
        ? item.counterValue
        : typeof item.counterValue === "number"
          ? String(item.counterValue)
          : "",
  };
}

export function buildUvRuntimeDocumentTitle(config: UvRuntimeDocumentConfig) {
  return `Бактерицидная установка №${config.lampNumber} ${config.areaName}`.trim();
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
