/**
 * TasksFlow adapter for «План обучения персонала» (training_plan).
 *
 * Mapping:
 *   • adapter row  = position + topic (rowKey = position-<posId>-topic-<topicId>)
 *   • completion   = mark TrainingCell as required and set date
 */
import { db } from "@/lib/db";
import {
  TRAINING_PLAN_TEMPLATE_CODE,
  type TrainingPlanConfig,
  type TrainingPositionRow,
} from "@/lib/training-plan-document";
import { toDateKey } from "@/lib/hygiene-document";
import {
  EMPTY_SYNC_REPORT,
  type AdapterDocument,
  type AdapterRow,
  type JournalAdapter,
  type TaskSchedule,
} from "./types";
import type { TaskFormField, TaskFormSchema } from "./task-form";

const TEMPLATE_CODE = TRAINING_PLAN_TEMPLATE_CODE;

function buildForm(): TaskFormSchema {
  const fields: TaskFormField[] = [
    { type: "date", key: "plannedDate", label: "Плановая дата обучения", required: true },
  ];
  return {
    intro: "Установите плановую дату обучения по теме.",
    submitLabel: "Сохранить дату",
    fields,
  };
}

export const trainingPlanAdapter: JournalAdapter = {
  meta: {
    templateCode: TEMPLATE_CODE,
    label: "План обучения",
    description: "План обучения персонала",
    iconName: "calendar-check",
  },

  scheduleForRow(): TaskSchedule {
    return { weekDays: [0, 1, 2, 3, 4, 5, 6] };
  },

  titleForRow(row): string {
    return `План обучения · ${row.label}`;
  },

  descriptionForRow(_row, doc): string {
    return [`Журнал: ${doc.documentTitle}`, `Период: ${doc.period.from} — ${doc.period.to}`, "Установите дату обучения."].join("\n");
  },

  async listDocumentsForOrg(organizationId): Promise<AdapterDocument[]> {
    const docs = await db.journalDocument.findMany({
      where: { organizationId, status: "active", template: { code: TEMPLATE_CODE } },
      select: { id: true, title: true, dateFrom: true, dateTo: true, config: true },
      orderBy: { dateFrom: "desc" },
    });
    return docs.map<AdapterDocument>((doc) => {
      const config = doc.config as TrainingPlanConfig;
      const rows: AdapterRow[] = [];
      for (const position of config.rows ?? []) {
        for (const topic of config.topics ?? []) {
          const cell = position.cells?.[topic.id];
          rows.push({
            rowKey: `position-${position.id}-topic-${topic.id}`,
            label: `${position.positionName} — ${topic.name}`,
            sublabel: cell?.required ? `Дата: ${cell.date || "—"}` : "Не требуется",
            responsibleUserId: null,
          });
        }
      }
      return {
        documentId: doc.id,
        documentTitle: doc.title,
        period: { from: toDateKey(doc.dateFrom), to: toDateKey(doc.dateTo) },
        rows: rows.length > 0 ? rows : [{ rowKey: "default", label: "Общая запись", responsibleUserId: null }],
      };
    });
  },

  async syncDocument() {
    return EMPTY_SYNC_REPORT;
  },

  async getTaskForm() {
    return buildForm();
  },

  async applyRemoteCompletion({ documentId, rowKey, completed, values }) {
    if (!completed) return false;
    const match = rowKey.match(/^position-(.+)-topic-(.+)$/);
    if (!match) return false;
    const [, positionId, topicId] = match;

    const doc = await db.journalDocument.findUnique({
      where: { id: documentId },
      select: { config: true, template: { select: { code: true } } },
    });
    if (!doc || doc.template.code !== TEMPLATE_CODE) return false;

    const currentConfig = doc.config as TrainingPlanConfig;
    const nextRows = currentConfig.rows.map((pos: TrainingPositionRow) => {
      if (pos.id !== positionId) return pos;
      return {
        ...pos,
        cells: {
          ...pos.cells,
          [topicId]: { required: true, date: typeof values?.plannedDate === "string" ? values.plannedDate : "" },
        },
      };
    });

    const nextConfig: TrainingPlanConfig = { ...currentConfig, rows: nextRows };
    await db.journalDocument.update({ where: { id: documentId }, data: { config: nextConfig } });
    return true;
  },
};
