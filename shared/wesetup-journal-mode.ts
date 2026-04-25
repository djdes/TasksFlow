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

export type TaskFormField = {
  type: string;
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: TaskFormFieldOption[];
  defaultValue?: unknown;
  helpText?: string;
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
  return normalizeTaskFormSchema(value) !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeFieldType(type: string, hasOptions: boolean): string {
  const normalized = type.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (["string", "input", "short-text"].includes(normalized)) return "text";
  if (["textarea", "long-text", "multiline", "comment", "comments"].includes(normalized)) {
    return "textarea";
  }
  if (["int", "integer", "float", "decimal", "numeric", "currency", "money"].includes(normalized)) {
    return "number";
  }
  if (["bool", "checkbox", "switch", "yes-no", "yesno"].includes(normalized)) {
    return hasOptions ? "checkbox-group" : "boolean";
  }
  if (["dropdown", "enum", "choice", "choices"].includes(normalized)) return "select";
  if (["multi-select", "multiple", "multiple-select", "checklist"].includes(normalized)) {
    return "multiselect";
  }
  if (["datetime-local", "date-time", "datetime"].includes(normalized)) return "datetime";
  return normalized || "text";
}

function normalizeTaskFormOption(option: unknown): TaskFormFieldOption | null {
  if (typeof option === "string" || typeof option === "number" || typeof option === "boolean") {
    const value = String(option);
    return { value, label: value };
  }
  if (!option || typeof option !== "object") return null;

  const item = option as Record<string, unknown>;
  const rawValue =
    item.value ??
    item.id ??
    item.key ??
    item.code ??
    item.name ??
    item.label ??
    item.title;
  const rawLabel =
    item.label ??
    item.title ??
    item.name ??
    item.text ??
    item.value ??
    item.code ??
    rawValue;
  const value =
    rawValue === undefined || rawValue === null ? undefined : String(rawValue);
  const label =
    rawLabel === undefined || rawLabel === null ? undefined : String(rawLabel);
  if (!value || !label) return null;
  const code = stringValue(item.code);
  return { value, label, ...(code ? { code } : {}) };
}

function normalizeTaskFormField(field: unknown): TaskFormField | null {
  if (!field || typeof field !== "object") return null;
  const item = field as Record<string, unknown>;
  const rawKey = item.key ?? item.name ?? item.id ?? item.field ?? item.fieldName;
  const key = rawKey === undefined || rawKey === null ? undefined : String(rawKey).trim();
  if (!key) return null;

  const rawOptions = Array.isArray(item.options)
    ? item.options
    : Array.isArray(item.choices)
      ? item.choices
      : Array.isArray(item.values)
        ? item.values
        : [];
  const options = rawOptions
    .map(normalizeTaskFormOption)
    .filter((option): option is TaskFormFieldOption => Boolean(option));
  const rawType = stringValue(item.type) ?? (options.length > 0 ? "select" : "text");
  const type = normalizeFieldType(rawType, options.length > 0);
  const label =
    stringValue(item.label) ??
    stringValue(item.title) ??
    stringValue(item.caption) ??
    stringValue(item.name) ??
    key;
  const defaultValue = item.defaultValue ?? item.default ?? item.value;
  const maxLength = numberValue(item.maxLength ?? item.max_length);
  const min = numberValue(item.min);
  const max = numberValue(item.max);
  const step = numberValue(item.step);
  const unit = stringValue(item.unit);
  const placeholder = stringValue(item.placeholder);
  const helpText = stringValue(item.helpText ?? item.hint ?? item.description);

  return {
    type,
    key,
    label,
    ...(typeof item.required === "boolean" ? { required: item.required } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(item.multiline === true || type === "textarea" ? { multiline: true } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(unit ? { unit } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(step !== undefined ? { step } : {}),
    ...(options.length > 0 ? { options } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(helpText ? { helpText } : {}),
  };
}

export function normalizeTaskFormSchema(value: unknown): TaskFormSchema | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const rawFields = Array.isArray(candidate.fields)
    ? candidate.fields
    : Array.isArray(candidate.items)
      ? candidate.items
      : [];
  if (!rawFields.length) return null;
  const fields = rawFields
    .map(normalizeTaskFormField)
    .filter((field): field is TaskFormField => Boolean(field));
  if (fields.length !== rawFields.length || fields.length === 0) return null;
  const intro = stringValue(candidate.intro ?? candidate.description ?? candidate.hint);
  const submitLabel = stringValue(candidate.submitLabel ?? candidate.submit_label);
  return {
    ...(intro ? { intro } : {}),
    fields,
    ...(submitLabel ? { submitLabel } : {}),
  };
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
    if (maybeWrapped.form === null) return { form: null };
    const form = normalizeTaskFormSchema(maybeWrapped.form);
    return form ? { form } : null;
  }
  if ("taskForm" in maybeWrapped) {
    if (maybeWrapped.taskForm === null) return { form: null };
    const form = normalizeTaskFormSchema(maybeWrapped.taskForm);
    return form ? { form } : null;
  }
  const form = normalizeTaskFormSchema(payload);
  return form ? { form } : null;
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
