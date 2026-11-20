/**
 * Должностная инструкция сотрудника → задачи.
 *
 * Руководитель при добавлении человека даёт инструкцию текстом, файлом
 * Word, Excel или PDF — или просто просит «подобрать по должности», или
 * берёт задачи коллеги на той же должности. Сервер отдаёт текст на разбор
 * диспетчеру Ralph через шлюз ProjectsFlow (локальный Codex) и получает
 * предложения задач. Руководитель отмечает нужные и создаёт их; задачи
 * прошлой инструкции, которых нет в новой, можно сразу убрать.
 *
 * Общие для кабинета и сервера лимиты, статусы, формы данных и тексты — здесь.
 */

/**
 * text / docx / xlsx / txt / pdf — инструкция текстом или файлом;
 * position — инструкции нет, задачи подбираются по названию должности;
 * copy     — задачи взяты у коллеги на той же должности, без нового разбора.
 */
export const JOB_DESCRIPTION_SOURCES = ["text", "docx", "xlsx", "txt", "pdf", "position", "copy"] as const;
export type JobDescriptionSource = (typeof JOB_DESCRIPTION_SOURCES)[number];

/**
 * queued     — ждёт отправки диспетчеру (или шлюз ещё не настроен);
 * processing — отправлено, диспетчер разбирает;
 * review     — предложения готовы, руководитель выбирает, что создать;
 * done       — задачи созданы;
 * failed     — не получилось, можно повторить.
 */
export const JOB_DESCRIPTION_STATUSES = ["queued", "processing", "review", "done", "failed"] as const;
export type JobDescriptionStatus = (typeof JOB_DESCRIPTION_STATUSES)[number];

/** Длиннее инструкция не бывает: дальше идёт приложение или мусор из файла. */
export const JOB_DESCRIPTION_MAX_CHARS = 30_000;
/** Слишком короткий текст — это не инструкция, а одна задача. */
export const JOB_DESCRIPTION_MIN_CHARS = 20;
/** Файл больше — почти наверняка с картинками; текста в нём столько же. */
export const JOB_DESCRIPTION_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Сколько задач максимум предлагаем из одной инструкции (с задачами первой недели). */
export const JOB_DESCRIPTION_MAX_TASKS = 12;
/** Разовые задачи первой недели — не дальше двух недель от приёма. */
export const JOB_ONBOARDING_MAX_DAYS = 14;
/** Название должности для «Подобрать по должности». */
export const JOB_POSITION_MIN_CHARS = 2;

/** Что принимает поле файла во вкладках «Word», «Excel» и «PDF». */
export const JOB_DESCRIPTION_ACCEPT = {
  docx: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: ".pdf,application/pdf",
} as const;

/** Источник по имени файла; старые .doc/.xls — не поддерживаем, честно скажем об этом. */
export function sourceFromFileName(name: string): JobDescriptionSource | "legacy" | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "docx") return "docx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "txt") return "txt";
  if (ext === "pdf") return "pdf";
  if (ext === "doc" || ext === "xls" || ext === "rtf" || ext === "odt" || ext === "ods") return "legacy";
  return null;
}

/** Пункт чек-листа предложения: обычный или вопрос с вариантами. */
export type ProposalChecklistItem = { title: string; options?: string[] };

/** Одна предложенная задача — до того, как руководитель её создаст. */
export type JobProposal = {
  id: string;
  title: string;
  description: string | null;
  requiresPhoto: boolean;
  category: string | null;
  isRecurring: boolean;
  weekDays: number[] | null;
  monthDay: number | null;
  /** Разовая задача первой недели: срок через столько дней от разбора. */
  dueInDays: number | null;
  checklist: ProposalChecklistItem[];
  confidence: number | null;
};

/** Состояние для строки сотрудника в «Сотрудниках». */
export type JobDescriptionState = {
  userId: number;
  status: JobDescriptionStatus;
  source: JobDescriptionSource;
  fileName: string | null;
  tasksCreated: number;
  /** Сколько задач предложено — для «Проверьте задачи: N» и «как у коллеги». */
  proposalsCount: number;
  autoApply: boolean;
  error: string | null;
  updatedAt: number;
};

/** Предложение с отметкой «у сотрудника уже есть такая задача». */
export type JobProposalView = JobProposal & { exists: boolean };
/** Задача, созданная из инструкции, и что с ней стало потом. */
export type CreatedTaskView = { taskId: number; title: string; state: "active" | "edited" | "deleted"; currentTitle: string | null };
/** Всё для окна «Задачи из инструкции». */
export type JobDescriptionDetails = {
  gatewayReady: boolean;
  state: JobDescriptionState;
  proposals: JobProposalView[];
  /** Задачи прошлой инструкции, которых нет среди новых предложений. */
  stale: Array<{ taskId: number; title: string }>;
  created: CreatedTaskView[];
};

/** «Создать выбранные»: какие предложения, с какими названиями, что убрать. */
export type JobDescriptionApply = {
  include: string[];
  titles?: Record<string, string>;
  remove?: number[];
};

/** Подпись статуса: два-три слова, как остальной кабинет. */
export function jobDescriptionLabel(state: Pick<JobDescriptionState, "status" | "tasksCreated"> & { proposalsCount?: number }, gatewayReady = true): string {
  switch (state.status) {
    case "queued":
      return gatewayReady ? "Инструкция в очереди" : "Инструкция ждёт диспетчера";
    case "processing":
      return "Разбираем инструкцию";
    case "review":
      return `Проверьте задачи: ${state.proposalsCount ?? 0}`;
    case "done":
      return state.tasksCreated > 0
        ? `Задач из инструкции: ${state.tasksCreated}`
        : "Новых задач в инструкции нет";
    case "failed":
      return "Инструкцию не разобрали";
  }
}

const DAY_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Расписание предложения словами: «Каждый день», «По пн, пт», «5-го числа», «Разово · через 3 дн.». */
export function proposalScheduleLabel(p: Pick<JobProposal, "isRecurring" | "weekDays" | "monthDay" | "dueInDays">): string {
  if (!p.isRecurring) {
    return p.dueInDays ? `Разово · за ${p.dueInDays} ${p.dueInDays === 1 ? "день" : p.dueInDays < 5 ? "дня" : "дней"}` : "Разово";
  }
  if (p.monthDay) return `Каждое ${p.monthDay} число`;
  if (p.weekDays && p.weekDays.length > 0 && p.weekDays.length < 7) {
    const days = [...p.weekDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "По будням";
    return `По ${days.map((d) => DAY_SHORT[d]).join(", ")}`;
  }
  return "Каждый день";
}

/** Сравнение названий без регистра, «ё» и знаков — чтобы не задвоить задачу. */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
}

/** Должность для «как у коллеги»: «Повар», «повар » и «ПОВАР» — одна должность. */
export function positionKey(position: string | null | undefined): string {
  return titleKey(position ?? "");
}
