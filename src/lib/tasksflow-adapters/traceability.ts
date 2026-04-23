/**
 * TasksFlow adapter for «Журнал прослеживаемости продукции» (traceability_test).
 *
 * Mapping:
 *   • adapter row  = employee (rowKey = employee-<userId>)
 *   • completion   = append a new TraceabilityRow to config.rows[]
 */
import { db } from "@/lib/db";
import {
  TRACEABILITY_DOCUMENT_TEMPLATE_CODE,
  type TraceabilityDocumentConfig,
  type TraceabilityRow,
  createTraceabilityRow,
} from "@/lib/traceability-document";
import { toDateKey } from "@/lib/hygiene-document";
import {
  EMPTY_SYNC_REPORT,
  type AdapterDocument,
  type AdapterRow,
  type JournalAdapter,
  type TaskSchedule,
} from "./types";
import type { TaskFormField, TaskFormSchema } from "./task-form";
import { extractEmployeeId as employeeIdFromRowKey, rowKeyForEmployee } from "./row-key";

const TEMPLATE_CODE = TRACEABILITY_DOCUMENT_TEMPLATE_CODE;

function buildForm(config: TraceabilityDocumentConfig): TaskFormSchema {
  const rawMaterialOptions = config.rawMaterialList.map((m) => ({ value: m, label: m }));
  const productOptions = config.productList.map((p) => ({ value: p, label: p }));
  const fields: TaskFormField[] = [
    { type: "select", key: "rawMaterialName", label: "Наименование сырья", required: true, options: rawMaterialOptions.length > 0 ? rawMaterialOptions : [{ value: "", label: "Не выбрано" }] },
    { type: "text", key: "batchNumber", label: "Номер партии ПФ", required: true, maxLength: 100 },
    { type: "date", key: "packagingDate", label: "Дата фасовки", required: true },
    { type: "text", key: "quantityPieces", label: "Кол-во, шт.", required: false, maxLength: 50 },
    { type: "text", key: "quantityKg", label: "Кол-во, кг", required: false, maxLength: 50 },
    { type: "select", key: "productName", label: "Наименование ПФ", required: true, options: productOptions.length > 0 ? productOptions : [{ value: "", label: "Не выбрано" }] },
    { type: "text", key: "quantityPacksPieces", label: "Кол-во фасовок, шт.", required: false, maxLength: 50 },
    { type: "text", key: "quantityPacksKg", label: "Кол-во фасовок, кг", required: false, maxLength: 50 },
  ];
  if (config.showShockTempField) {
    fields.push({ type: "text", key: "shockTemp", label: "T °C после шоковой заморозки", required: false, maxLength: 50 });
  }
  return {
    intro: "Заполните запись прослеживаемости продукции.",
    submitLabel: "Сохранить запись",
    fields,
  };
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export const traceabilityAdapter: JournalAdapter = {
  meta: {
    templateCode: TEMPLATE_CODE,
    label: "Прослеживаемость",
    description: "Журнал прослеживаемости продукции",
    iconName: "route",
  },

  scheduleForRow(): TaskSchedule {
    return { weekDays: [0, 1, 2, 3, 4, 5, 6] };
  },

  titleForRow(row): string {
    return `Прослеживаемость · ${row.label}`;
  },

  descriptionForRow(_row, doc): string {
    return [`Журнал: ${doc.documentTitle}`, `Период: ${doc.period.from} — ${doc.period.to}`, "Заполните запись прослеживаемости."].join("\n");
  },

  async listDocumentsForOrg(organizationId): Promise<AdapterDocument[]> {
    const [docs, employees] = await Promise.all([
      db.journalDocument.findMany({
        where: { organizationId, status: "active", template: { code: TEMPLATE_CODE } },
        select: { id: true, title: true, dateFrom: true, dateTo: true, config: true },
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

  async getTaskForm({ documentId }) {
    const doc = await db.journalDocument.findUnique({
      where: { id: documentId },
      select: { config: true },
    });
    if (!doc) return null;
    const config = doc.config as TraceabilityDocumentConfig;
    return buildForm(config);
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

    const currentConfig = doc.config as TraceabilityDocumentConfig;
    const employee = await db.user.findUnique({ where: { id: employeeId }, select: { name: true, positionTitle: true } });

    const newRow: TraceabilityRow = createTraceabilityRow({
      date: todayKey,
      incoming: {
        rawMaterialName: typeof values?.rawMaterialName === "string" ? values.rawMaterialName : "",
        batchNumber: typeof values?.batchNumber === "string" ? values.batchNumber : "",
        packagingDate: typeof values?.packagingDate === "string" ? values.packagingDate : todayKey,
        quantityPieces: safeNumber(values?.quantityPieces),
        quantityKg: safeNumber(values?.quantityKg),
      },
      outgoing: {
        productName: typeof values?.productName === "string" ? values.productName : "",
        quantityPacksPieces: safeNumber(values?.quantityPacksPieces),
        quantityPacksKg: safeNumber(values?.quantityPacksKg),
        shockTemp: safeNumber(values?.shockTemp),
      },
      responsibleRole: employee?.positionTitle ?? currentConfig.defaultResponsibleRole,
      responsibleEmployeeId: employeeId,
      responsibleEmployee: employee?.name ?? "",
    });

    const nextConfig: TraceabilityDocumentConfig = { ...currentConfig, rows: [...currentConfig.rows, newRow] };
    await db.journalDocument.update({ where: { id: documentId }, data: { config: nextConfig } });
    return true;
  },
};
