export type CatalogRow = {
  rowKey: string;
  label: string;
  sublabel?: string;
  responsibleUserId: string | null;
  existingTasksflowTaskId: number | null;
};

export type CatalogDocument = {
  documentId: string;
  documentTitle: string;
  period: { from: string; to: string };
  rows: CatalogRow[];
};

export type CatalogJournalUi = {
  subjectLabel?: string;
  subjectPlural?: string;
  modeRowLabel?: string;
  modeRowHint?: string;
  modeFreeLabel?: string;
  modeFreeHint?: string;
  rowSearchPlaceholder?: string;
  rowListTitle?: string;
  rowEmptyState?: string;
  titleLabel?: string;
  titlePlaceholder?: string;
  titleHint?: string;
  documentLabel?: string;
  documentPlaceholder?: string;
  workerLabel?: string;
  workerPlaceholder?: string;
  workerHint?: string;
  submitLabel?: string;
  reviewTitle?: string;
  reviewRowHint?: string;
  reviewFreeHint?: string;
};

export type TaskFormFieldOption = {
  value: string;
  label: string;
  code?: string;
};

export type TaskFormField =
  | {
      type: "text";
      key: string;
      label: string;
      required?: boolean;
      placeholder?: string;
      multiline?: boolean;
      maxLength?: number;
    }
  | {
      type: "number";
      key: string;
      label: string;
      required?: boolean;
      unit?: string;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      type: "boolean";
      key: string;
      label: string;
      defaultValue?: boolean;
    }
  | {
      type: "select";
      key: string;
      label: string;
      required?: boolean;
      options: TaskFormFieldOption[];
      defaultValue?: string;
    }
  | {
      type: "date";
      key: string;
      label: string;
      required?: boolean;
    };

export type TaskFormSchema = {
  intro?: string;
  fields: TaskFormField[];
  submitLabel?: string;
};

export type CatalogJournal = {
  templateCode: string;
  label: string;
  description: string | null;
  iconName: string | null;
  hasAdapter?: boolean;
  /** Declarative form the employee fills on completion. Null when the
   *  journal has no adapter or no structured form — employee sees a
   *  plain «Выполнено» button. */
  taskForm?: TaskFormSchema | null;
  ui?: CatalogJournalUi;
  documents: CatalogDocument[];
};

export type CatalogAssignableUser = {
  userId: string;
  name: string;
  positionTitle: string | null;
  tasksflowUserId: number;
};

export type WesetupCatalog = {
  journals: CatalogJournal[];
  assignableUsers?: CatalogAssignableUser[];
};

export type FlattenedJournalRow = {
  journal: CatalogJournal;
  document: CatalogDocument;
  row: CatalogRow;
};

export type JournalRowGroup = {
  document: CatalogDocument;
  rows: FlattenedJournalRow[];
};

export type ResolvedCatalogJournalUi = Required<CatalogJournalUi>;

const DEFAULT_JOURNAL_UI: ResolvedCatalogJournalUi = {
  subjectLabel: "Строка журнала",
  subjectPlural: "строкам",
  modeRowLabel: "По строке журнала",
  modeRowHint:
    "Привязка к существующей строке журнала с уже заданным контекстом.",
  modeFreeLabel: "Свободная задача",
  modeFreeHint:
    "Произвольная задача, которая после выполнения попадет в выбранный документ журнала.",
  rowSearchPlaceholder: "Поиск по строкам, документам и журналу…",
  rowListTitle: "Строки журнала",
  rowEmptyState: "По строкам ничего не найдено.",
  titleLabel: "Название задачи",
  titlePlaceholder: "Например: Проверить запись в журнале",
  titleHint: "Можно оставить стандартный текст или задать свой.",
  documentLabel: "Документ журнала",
  documentPlaceholder: "Выберите документ журнала",
  workerLabel: "Сотрудник",
  workerPlaceholder: "Кому назначить задачу",
  workerHint: "Сотрудник получит задачу в TasksFlow.",
  submitLabel: "Создать журнальную задачу",
  reviewTitle: "Проверка перед созданием",
  reviewRowHint:
    "Исполнитель и расписание подтянутся автоматически из строки журнала.",
  reviewFreeHint:
    "После выполнения WeSetup добавит запись в выбранный документ журнала.",
};

export function flattenJournalRows(
  catalog: WesetupCatalog | null | undefined
): FlattenedJournalRow[] {
  if (!catalog) return [];
  const items: FlattenedJournalRow[] = [];
  for (const journal of catalog.journals) {
    for (const document of journal.documents) {
      for (const row of document.rows) {
        items.push({ journal, document, row });
      }
    }
  }
  return items;
}

export function filterJournals(
  journals: CatalogJournal[],
  rawSearch: string
): CatalogJournal[] {
  const query = rawSearch.trim().toLowerCase();
  if (!query) return journals;
  return journals.filter((journal) => {
    return (
      journal.label.toLowerCase().includes(query) ||
      (journal.description ?? "").toLowerCase().includes(query) ||
      journal.templateCode.toLowerCase().includes(query)
    );
  });
}

export function resolveActiveJournal(
  journals: CatalogJournal[],
  activeJournal: string
): string {
  if (journals.length === 0) return "";
  if (journals.some((journal) => journal.templateCode === activeJournal)) {
    return activeJournal;
  }
  return journals[0].templateCode;
}

export function filterJournalRows(
  rows: FlattenedJournalRow[],
  activeJournal: string,
  rawSearch: string
): FlattenedJournalRow[] {
  const query = rawSearch.trim().toLowerCase();
  return rows.filter((item) => {
    if (activeJournal && item.journal.templateCode !== activeJournal) {
      return false;
    }
    if (!query) return true;
    return (
      item.row.label.toLowerCase().includes(query) ||
      (item.row.sublabel ?? "").toLowerCase().includes(query) ||
      item.document.documentTitle.toLowerCase().includes(query) ||
      item.journal.label.toLowerCase().includes(query)
    );
  });
}

export function groupJournalRowsByDocument(
  rows: FlattenedJournalRow[],
  activeJournal: string
): JournalRowGroup[] {
  const groups = new Map<string, JournalRowGroup>();
  for (const item of rows) {
    if (activeJournal && item.journal.templateCode !== activeJournal) {
      continue;
    }
    const existing = groups.get(item.document.documentId);
    if (existing) {
      existing.rows.push(item);
      continue;
    }
    groups.set(item.document.documentId, {
      document: item.document,
      rows: [item],
    });
  }
  return Array.from(groups.values());
}

export function resolveJournalUi(
  journal: CatalogJournal | null | undefined
): ResolvedCatalogJournalUi {
  return {
    ...DEFAULT_JOURNAL_UI,
    ...(journal?.ui ?? {}),
  };
}

export function isTaskFormSchema(value: unknown): value is TaskFormSchema {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { fields?: unknown };
  if (!Array.isArray(candidate.fields)) return false;
  return candidate.fields.every((field) => {
    if (!field || typeof field !== "object") return false;
    const item = field as { type?: unknown; key?: unknown; label?: unknown };
    return (
      typeof item.type === "string" &&
      typeof item.key === "string" &&
      typeof item.label === "string"
    );
  });
}

/**
 * WeSetup historically returned task form payloads in a few compatible
 * shapes while the integration was moving from catalog-based forms to a
 * dedicated /task-form endpoint. Normalize all of them to the frontend
 * contract so older journals do not fail just because the wrapper differs.
 */
export function normalizeTaskFormPayload(
  payload: unknown
): { form: TaskFormSchema | null } | null {
  if (payload === null) return { form: null };
  if (!payload || typeof payload !== "object") return null;

  const maybeWrapped = payload as { form?: unknown; taskForm?: unknown };
  if ("form" in maybeWrapped) {
    return maybeWrapped.form === null || isTaskFormSchema(maybeWrapped.form)
      ? { form: maybeWrapped.form }
      : null;
  }
  if ("taskForm" in maybeWrapped) {
    return maybeWrapped.taskForm === null || isTaskFormSchema(maybeWrapped.taskForm)
      ? { form: maybeWrapped.taskForm }
      : null;
  }
  if (isTaskFormSchema(payload)) {
    return { form: payload };
  }
  return null;
}

export function journalKindToTemplateCode(kind: string): string {
  return kind.replace(/^wesetup-/i, "");
}

export function findTaskFormInCatalog(
  catalog: WesetupCatalog | null | undefined,
  journalKindOrTemplateCode: string | null | undefined
): TaskFormSchema | null {
  if (!catalog || !journalKindOrTemplateCode) return null;
  const templateCode = journalKindToTemplateCode(journalKindOrTemplateCode);
  const journal = catalog.journals.find(
    (item) =>
      item.templateCode === templateCode ||
      `wesetup-${item.templateCode}` === journalKindOrTemplateCode
  );
  return journal?.taskForm ?? null;
}
