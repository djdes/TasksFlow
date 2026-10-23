import type { Task } from "@shared/schema";

type Completion = Pick<Task, "id"> & Partial<Record<(typeof STATUS_FIELDS)[number], unknown>>;

// Поля, по которым список решает, где и как показать задачу.
const STATUS_FIELDS = ["isCompleted", "completedAt", "verificationStatus", "rejectReason"] as const;

/**
 * Ответ POST /api/tasks/:id/complete — строка задачи из БД без нормализации
 * списка (weekDays/photoUrls там бывают строками). Поэтому в кэш списка
 * переносим только статус: выполнено, ушло на проверку или снят возврат.
 * Карточка сразу встаёт на место, остальное придёт с перезапросом списка.
 */
export function applyCompletionToList(list: Task[] | undefined, done: Completion | null | undefined): Task[] | undefined {
  if (!list || !done || typeof done.isCompleted !== "boolean") return list;
  const patch: Record<string, unknown> = {};
  for (const field of STATUS_FIELDS) if (field in done) patch[field] = done[field];
  return list.map((task) => (task.id === done.id ? ({ ...task, ...patch } as Task) : task));
}
