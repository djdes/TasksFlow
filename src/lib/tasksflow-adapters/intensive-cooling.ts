/**
 * TasksFlow adapter for «Журнал контроля интенсивного охлаждения
 * горячих блюд» (intensive_cooling).
 *
 * В отличие от cleaning/hygiene/cold_equipment, этот журнал хранит
 * данные НЕ в JournalDocumentEntry, а внутри document.config.rows[].
 * Каждое «охлаждение» = новая запись в этом массиве.
 *
 * Mapping:
 *   • adapter row  = employee (rowKey = `employee-<userId>`)
 *   • completion   = append to config.rows внутри journalDocument.config;
 *                    dishName / productionDate / hour / minute /
 *                    startTemperature / endTemperature / comment /
 *                    responsibleTitle / responsibleUserId берутся из
 *                    полей формы.
 *   • form         = текст блюда + 2 числа (t° начальная и конечная) +
 *                    текст времени «ЧЧ:ММ» + комментарий.
 */
import { db } from "@/lib/db";
import {
  INTENSIVE_COOLING_TEMPLATE_CODE,
  type IntensiveCoolingRow,
} from "@/lib/intensive-cooling-document";
import {
  EMPTY_SYNC_REPORT,
  type AdapterDocument,
  type AdapterRow,
  type JournalAdapter,
  type TaskSchedule,
} from "./types";
import type { TaskFormSchema } from "./task-form";

const TEMPLATE_CODE = INTENSIVE_COOLING_TEMPLATE_CODE;

function rowKeyForEmployee(id: string) {
  return `employee-${id}`;
}
function employeeIdFromRowKey(rowKey: string): string | null {
  return rowKey.startsWith("employee-")
    ? rowKey.slice("employee-".length)
    : null;
}
const toDateKey = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

function splitTime(raw: unknown): { hour: string; minute: string } {
  if (typeof raw !== "string") return { hour: "", minute: "" };
  const m = /^(\d{1,2})[:.]?(\d{0,2})$/.exec(raw.trim());
  if (!m) return { hour: "", minute: "" };
  const hh = Math.min(23, Math.max(0, Number(m[1]) || 0));
  const mm = Math.min(59, Math.max(0, Number(m[2] || 0) || 0));
  return {
    hour: String(hh).padStart(2, "0"),
    minute: String(mm).padStart(2, "0"),
  };
}

function buildForm(employeeName: string | null): TaskFormSchema {
  return {
    intro:
      (employeeName ? `${employeeName}, ` : "") +
      "запишите контроль интенсивного охлаждения горячего блюда. " +
      "Начальная температура должна быть 75 °C и выше, конечная — не " +
      "более 6 °C через 90 минут.",
    submitLabel: "Сохранить замер",
    fields: [
      {
        type: "text",
        key: "dishName",
        label: "Блюдо",
        required: true,
        placeholder: "Например: борщ",
        maxLength: 120,
      },
      {
        type: "text",
        key: "productionTime",
        label: "Время выпуска (ЧЧ:ММ)",
        required: true,
        placeholder: "14:00",
        maxLength: 5,
      },
      {
        type: "number",
        key: "startTemperature",
        label: "Температура в начале охлаждения",
        unit: "°C",
        required: true,
        min: 0,
        max: 120,
        step: 0.5,
      },
      {
        type: "number",
        key: "endTemperature",
        label: "Температура в конце охлаждения",
        unit: "°C",
        required: true,
        min: -20,
        max: 120,
        step: 0.5,
      },
      {
        type: "text",
        key: "comment",
        label: "Комментарий / корректирующие действия",
        multiline: true,
        maxLength: 300,
      },
    ],
  };
}

export const intensiveCoolingAdapter: JournalAdapter = {
  meta: {
    templateCode: TEMPLATE_CODE,
    label: "Интенсивное охлаждение горячих блюд",
    description:
      "Записать замер начальной и конечной температуры после охлаждения.",
    iconName: "thermometer-snowflake",
  },

  scheduleForRow(): TaskSchedule {
    return { weekDays: [0, 1, 2, 3, 4, 5, 6] };
  },

  titleForRow(row) {
    return `Интенсивное охлаждение · ${row.label}`;
  },

  descriptionForRow(_row, doc) {
    return [
      `Журнал: ${doc.documentTitle}`,
      `Период: ${doc.period.from} — ${doc.period.to}`,
      "После охлаждения блюда запишите t° начала и конца.",
    ].join("\n");
  },

  async listDocumentsForOrg(organizationId): Promise<AdapterDocument[]> {
    const [docs, employees] = await Promise.all([
      db.journalDocument.findMany({
        where: {
          organizationId,
          status: "active",
          template: { code: TEMPLATE_CODE },
        },
        select: { id: true, title: true, dateFrom: true, dateTo: true },
        orderBy: { dateFrom: "desc" },
      }),
      db.user.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true, role: true, positionTitle: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      }),
    ]);
    return docs.map<AdapterDocument>((doc) => ({
      documentId: doc.id,
      documentTitle: doc.title,
      period: { from: toDateKey(doc.dateFrom), to: toDateKey(doc.dateTo) },
      rows: employees.map<AdapterRow>((emp) => ({
        rowKey: rowKeyForEmployee(emp.id),
        label: emp.name,
        sublabel: emp.positionTitle ?? undefined,
        responsibleUserId: emp.id,
      })),
    }));
  },

  async syncDocument() {
    return EMPTY_SYNC_REPORT;
  },

  async getTaskForm({ rowKey }) {
    const employeeId = employeeIdFromRowKey(rowKey);
    if (!employeeId) return buildForm(null);
    const emp = await db.user.findUnique({
      where: { id: employeeId },
      select: { name: true },
    });
    return buildForm(emp?.name ?? null);
  },

  async applyRemoteCompletion({ documentId, rowKey, completed, todayKey, values }) {
    if (!completed) return false;
    const employeeId = employeeIdFromRowKey(rowKey);
    if (!employeeId) return false;

    const doc = await db.journalDocument.findUnique({
      where: { id: documentId },
      select: { config: true, template: { select: { code: true } } },
    });
    if (!doc || doc.template.code !== TEMPLATE_CODE) return false;
    const currentConfig = (doc.config as { rows?: IntensiveCoolingRow[] }) ?? {};
    const existingRows = Array.isArray(currentConfig.rows)
      ? currentConfig.rows
      : [];

    const employee = await db.user.findUnique({
      where: { id: employeeId },
      select: { name: true, role: true, positionTitle: true },
    });

    const { hour, minute } = splitTime(values?.productionTime);
    const newRow: IntensiveCoolingRow = {
      id: `cooling-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productionDate: todayKey,
      productionHour: hour,
      productionMinute: minute,
      dishName:
        typeof values?.dishName === "string" ? values.dishName.trim() : "",
      startTemperature:
        values?.startTemperature !== null && values?.startTemperature !== undefined
          ? String(values.startTemperature)
          : "",
      endTemperature:
        values?.endTemperature !== null && values?.endTemperature !== undefined
          ? String(values.endTemperature)
          : "",
      correctiveAction:
        typeof values?.comment === "string" ? values.comment : "",
      comment: typeof values?.comment === "string" ? values.comment : "",
      responsibleTitle: employee?.positionTitle ?? "",
      responsibleUserId: employeeId,
    };

    const nextConfig = {
      ...currentConfig,
      rows: [...existingRows, newRow],
    };

    await db.journalDocument.update({
      where: { id: documentId },
      data: { config: nextConfig },
    });
    return true;
  },
};
