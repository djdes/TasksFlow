/**
 * Должностная инструкция сотрудника → задачи.
 *
 * Руководитель при добавлении человека даёт инструкцию текстом, файлом
 * Word (.docx) или Excel (.xlsx). Сервер вынимает из неё текст и отдаёт
 * на разбор диспетчеру Ralph через шлюз ProjectsFlow (локальный Codex),
 * а по ответу сам создаёт сотруднику регулярные задачи.
 *
 * Общие для кабинета и сервера лимиты, статусы и тексты — здесь.
 */

export const JOB_DESCRIPTION_SOURCES = ["text", "docx", "xlsx", "txt"] as const;
export type JobDescriptionSource = (typeof JOB_DESCRIPTION_SOURCES)[number];

/**
 * queued     — ждёт отправки диспетчеру (или шлюз ещё не настроен);
 * processing — отправлено, диспетчер разбирает;
 * done       — задачи созданы;
 * failed     — не получилось, можно повторить.
 */
export const JOB_DESCRIPTION_STATUSES = ["queued", "processing", "done", "failed"] as const;
export type JobDescriptionStatus = (typeof JOB_DESCRIPTION_STATUSES)[number];

/** Длиннее инструкция не бывает: дальше идёт приложение или мусор из файла. */
export const JOB_DESCRIPTION_MAX_CHARS = 30_000;
/** Слишком короткий текст — это не инструкция, а одна задача. */
export const JOB_DESCRIPTION_MIN_CHARS = 20;
/** Файл больше — почти наверняка с картинками; текста в нём столько же. */
export const JOB_DESCRIPTION_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Сколько задач максимум создаём из одной инструкции. */
export const JOB_DESCRIPTION_MAX_TASKS = 10;

/** Что принимает поле файла во вкладках «Word» и «Excel». */
export const JOB_DESCRIPTION_ACCEPT = {
  docx: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

/** Источник по имени файла; старые .doc/.xls — не поддерживаем, честно скажем об этом. */
export function sourceFromFileName(name: string): JobDescriptionSource | "legacy" | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "docx") return "docx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "txt") return "txt";
  if (ext === "doc" || ext === "xls" || ext === "rtf" || ext === "odt" || ext === "ods") return "legacy";
  return null;
}

/** Состояние для строки сотрудника в «Сотрудниках». */
export type JobDescriptionState = {
  userId: number;
  status: JobDescriptionStatus;
  source: JobDescriptionSource;
  fileName: string | null;
  tasksCreated: number;
  error: string | null;
  updatedAt: number;
};

/** Подпись статуса: два-три слова, как остальной кабинет. */
export function jobDescriptionLabel(state: Pick<JobDescriptionState, "status" | "tasksCreated">, gatewayReady = true): string {
  switch (state.status) {
    case "queued":
      return gatewayReady ? "Инструкция в очереди" : "Инструкция ждёт диспетчера";
    case "processing":
      return "Разбираем инструкцию";
    case "done":
      return state.tasksCreated > 0
        ? `Задач из инструкции: ${state.tasksCreated}`
        : "Новых задач в инструкции нет";
    case "failed":
      return "Инструкцию не разобрали";
  }
}
