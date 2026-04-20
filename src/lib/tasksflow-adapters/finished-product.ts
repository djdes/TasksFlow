/**
 * TasksFlow adapter for «Бракеражный журнал готовой пищевой продукции»
 * (finished_product).
 *
 * Хранит строки в config.rows[]. Каждый бракераж блюда — новая
 * FinishedProductDocumentRow.
 *
 * Mapping:
 *   • adapter row  = employee (rowKey = `employee-<userId>`)
 *   • completion   = append new row to config.rows[]
 *   • form         = блюдо + дата/время производства + органолептика
 *                    (text) + температура (number, если включено) +
 *                    результат (select yes/no) + коментарий.
 */
import { db } from "@/lib/db";
import {
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  type FinishedProductDocumentConfig,
  type FinishedProductDocumentRow,
  normalizeFinishedProductDocumentConfig,
} from "@/lib/finished-product-document";
import {
  EMPTY_SYNC_REPORT,
  type AdapterDocument,
  type AdapterRow,
  type JournalAdapter,
  type TaskSchedule,
} from "./types";
import type { TaskFormField, TaskFormSchema } from "./task-form";

const TEMPLATE_CODE = FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE;

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

function buildForm(
  config: FinishedProductDocumentConfig,
  employeeName: string | null
): TaskFormSchema {
  const fields: TaskFormField[] = [
    {
      type: "text",
      key: "productName",
      label:
        config.fieldNameMode === "semi"
          ? "Наименование полуфабриката"
          : "Наименование блюда",
      required: true,
      maxLength: 200,
      placeholder: "Например: куриный суп",
    },
    {
      type: "text",
      key: "productionTime",
      label: "Время производства (ЧЧ:ММ)",
      required: true,
      placeholder: "14:00",
      maxLength: 5,
    },
    {
      type: "text",
      key: "organoleptic",
      label: "Органолептическая оценка",
      required: true,
      placeholder: "Например: цвет, запах, вкус — без отклонений",
      multiline: true,
      maxLength: 400,
    },
  ];
  if (config.showProductTemp) {
    fields.push({
      type: "number",
      key: "productTemp",
      label: "Температура",
      unit: "°C",
      min: -20,
      max: 120,
      step: 0.5,
      required: true,
    });
  }
  fields.push({
    type: "select",
    key: "releaseAllowed",
    label: "Разрешить к выпуску?",
    required: true,
    options: [
      { value: "yes", label: "Да, соответствует" },
      { value: "no", label: "Нет, брак" },
    ],
    defaultValue: "yes",
  });
  if (config.showCorrectiveAction) {
    fields.push({
      type: "text",
      key: "correctiveAction",
      label: "Корректирующее действие (если брак)",
      multiline: true,
      maxLength: 400,
    });
  }
  return {
    intro:
      (employeeName ? `${employeeName}, ` : "") +
      "запишите бракераж блюда — органолептическую оценку и решение.",
    submitLabel: "Сохранить бракераж",
    fields,
  };
}

export const finishedProductAdapter: JournalAdapter = {
  meta: {
    templateCode: TEMPLATE_CODE,
    label: "Бракеражный журнал",
    description:
      "Бракераж готовой продукции — органолептическая оценка, решение о выпуске.",
    iconName: "chef-hat",
  },

  scheduleForRow(): TaskSchedule {
    return { weekDays: [0, 1, 2, 3, 4, 5, 6] };
  },

  titleForRow(row) {
    return `Бракераж · ${row.label}`;
  },

  descriptionForRow(_row, doc) {
    return [
      `Журнал: ${doc.documentTitle}`,
      `Период: ${doc.period.from} — ${doc.period.to}`,
      "После выпуска блюда заполните оценку.",
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

  async getTaskForm({ documentId, rowKey }) {
    const [doc, employee] = await Promise.all([
      db.journalDocument.findUnique({
        where: { id: documentId },
        select: { config: true },
      }),
      (async () => {
        const empId = employeeIdFromRowKey(rowKey);
        if (!empId) return null;
        return db.user.findUnique({
          where: { id: empId },
          select: { name: true },
        });
      })(),
    ]);
    if (!doc) return null;
    const config = normalizeFinishedProductDocumentConfig(doc.config);
    return buildForm(config, employee?.name ?? null);
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
    const currentConfig = normalizeFinishedProductDocumentConfig(doc.config);
    const employee = await db.user.findUnique({
      where: { id: employeeId },
      select: { name: true, positionTitle: true },
    });

    const productionTime =
      typeof values?.productionTime === "string"
        ? values.productionTime
        : "";
    const productionDateTime = `${todayKey} ${productionTime}`.trim();
    const tempRaw = values?.productTemp;

    const newRow: FinishedProductDocumentRow = {
      id: `bracerage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productionDateTime,
      rejectionTime: "",
      productName:
        typeof values?.productName === "string" ? values.productName : "",
      organoleptic:
        typeof values?.organoleptic === "string" ? values.organoleptic : "",
      productTemp:
        typeof tempRaw === "number"
          ? String(tempRaw)
          : typeof tempRaw === "string"
          ? tempRaw
          : "",
      correctiveAction:
        typeof values?.correctiveAction === "string"
          ? values.correctiveAction
          : "",
      releasePermissionTime: "",
      courierTransferTime: "",
      oxygenLevel: "",
      responsiblePerson: employee?.name ?? "",
      inspectorName: employee?.name ?? "",
      organolepticValue: "",
      organolepticResult: "",
      releaseAllowed:
        values?.releaseAllowed === "no" ? "no" : "yes",
    };

    const nextConfig: FinishedProductDocumentConfig = {
      ...currentConfig,
      rows: [...currentConfig.rows, newRow],
    };
    await db.journalDocument.update({
      where: { id: documentId },
      data: { config: nextConfig },
    });
    return true;
  },
};
