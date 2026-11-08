/**
 * «Умный» UX задач, вторая волна (08.11.2026). Чистые функции — тесты в
 * tests/smart-ux-2.test.ts:
 *   • «Как в прошлый раз» — настройки последней задачи с тем же названием;
 *   • срок из названия: «завтра», «к пятнице», «в понедельник»;
 *   • черновик формы «Новая задача» на устройстве;
 *   • «Новая» — задачи, появившиеся с прошлого захода;
 *   • «Дальше» — следующая задача после выполненной;
 *   • «Слушать список» — задачи на сегодня одним текстом.
 */
import type { ChecklistItem } from "@shared/schema";
import { sortByUrgency } from "@/lib/task-suggestions";
import { toDateInputValue } from "@/lib/task-schedule";

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();

type PastTask = {
  id: number;
  title: string;
  createdAt?: number | null;
  description?: string | null;
  workerId?: number | null;
  requiresPhoto?: boolean | null;
  price?: number | null;
  category?: string | null;
  isRecurring?: boolean | null;
  dueDate?: number | null;
  weekDays?: number[] | null;
  monthDay?: number | null;
  remindAt?: string | null;
  checklist?: ChecklistItem[] | null;
};

/** Последняя задача с тем же названием (без учёта регистра, «ё» и пробелов). */
export function findLastTaskByTitle<T extends PastTask>(tasks: readonly T[], title: string): T | null {
  const key = norm(title);
  if (key.length < 3) return null;
  let best: T | null = null;
  for (const t of tasks) {
    if (norm(t.title) !== key) continue;
    if (!best || (t.createdAt ?? 0) > (best.createdAt ?? 0)) best = t;
  }
  return best;
}

/** Что копирует «Как в прошлый раз»: всё, кроме срока и отметок исполнителя. */
export type PastPreset = {
  kind: "once" | "recurring";
  description: string;
  requiresPhoto: boolean;
  price: string;
  category: string;
  weekDays: number[] | null;
  monthDay: string | undefined;
  isRecurring: boolean;
  remindAt: string;
  workerId: number | null;
  checklist: ChecklistItem[];
};

export function pastTaskPreset(t: PastTask): PastPreset {
  // Разовая — та, что была со сроком или без повтора; иначе регулярная.
  const recurring = t.isRecurring !== false && !t.dueDate;
  return {
    kind: recurring ? "recurring" : "once",
    description: t.description ?? "",
    requiresPhoto: Boolean(t.requiresPhoto),
    price: t.price ? String(t.price) : "0",
    category: t.category ?? "",
    weekDays: recurring && t.weekDays?.length ? [...t.weekDays] : null,
    monthDay: recurring && t.monthDay ? String(t.monthDay) : undefined,
    isRecurring: recurring,
    remindAt: t.remindAt ?? "",
    workerId: t.workerId ?? null,
    checklist: t.checklist ?? [],
  };
}

// Границы слова для кириллицы: \b в JS понимает только латиницу.
const B = "(?:^|[^а-яё])";
const E = "(?=$|[^а-яё])";
const WEEKDAY_STEMS: [RegExp, number][] = [
  [/понедельник[а-я]*/, 1],
  [/вторник[а-я]*/, 2],
  [/сред[уыае]/, 3],
  [/четверг[а-я]*/, 4],
  [/пятниц[уыае]/, 5],
  [/суббот[уыае]/, 6],
  [/воскресень[яеюи]/, 0],
];

/**
 * Срок из названия разовой задачи: «сегодня», «завтра», «послезавтра»,
 * «в/во/к/ко/до/на + день недели» (ближайший такой день, сегодняшний —
 * сегодня). Ничего не нашли — null. Возвращает YYYY-MM-DD.
 */
export function dueFromTitle(title: string, now: Date = new Date()): string | null {
  const t = title.toLocaleLowerCase("ru").replace(/ё/g, "е");
  const day = (offset: number) => toDateInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  if (new RegExp(`${B}послезавтра${E}`).test(t)) return day(2);
  if (new RegExp(`${B}завтра${E}`).test(t)) return day(1);
  if (new RegExp(`${B}сегодня${E}`).test(t)) return day(0);
  for (const [stem, dow] of WEEKDAY_STEMS) {
    if (new RegExp(`${B}(?:в|во|к|ко|до|на)\\s+${stem.source}${E}`).test(t)) {
      return day((dow - now.getDay() + 7) % 7);
    }
  }
  return null;
}

/** Черновик формы «Новая задача» — что можно сохранить без файлов. */
export type TaskDraft = {
  savedAt: number;
  kind: "once" | "recurring";
  values: Record<string, unknown>;
  workerIds: number[];
  checklist: { id: string; title: string; requiresPhoto: boolean }[];
  questions: { id: string; title: string; options: string[] }[];
};

export const DRAFT_KEY = "tf_task_draft_v1";
export const DRAFT_MAX_AGE_SEC = 3 * 24 * 60 * 60;

/** Черновик стоит хранить, только если в нём что-то набрано. */
export function draftHasContent(d: Pick<TaskDraft, "values" | "checklist" | "questions">): boolean {
  const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  return text(d.values.title) || text(d.values.description) || d.checklist.some((c) => c.title.trim()) || d.questions.some((q) => q.title.trim());
}

/** Разобрать сохранённый черновик: битый, пустой или старше 3 дней — null. */
export function parseDraft(raw: string | null, nowSec: number): TaskDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<TaskDraft>;
    if (!d || typeof d !== "object" || typeof d.savedAt !== "number") return null;
    if (nowSec - d.savedAt > DRAFT_MAX_AGE_SEC) return null;
    const draft: TaskDraft = {
      savedAt: d.savedAt,
      kind: d.kind === "recurring" ? "recurring" : "once",
      values: d.values && typeof d.values === "object" ? d.values : {},
      workerIds: Array.isArray(d.workerIds) ? d.workerIds.filter((x) => Number.isInteger(x)) : [],
      checklist: Array.isArray(d.checklist) ? d.checklist.filter((c) => c && typeof c.title === "string") : [],
      questions: Array.isArray(d.questions)
        ? d.questions.filter((q) => q && typeof q.title === "string" && Array.isArray(q.options))
        : [],
    };
    return draftHasContent(draft) ? draft : null;
  } catch {
    return null;
  }
}

/** Задачи, появившиеся после прошлого захода. Первый заход — ничего не отмечаем. */
export function newTaskIds(
  tasks: readonly { id: number; createdAt?: number | null; isCompleted?: boolean | null }[],
  seenBefore: number | null,
): Set<number> {
  if (!seenBefore) return new Set();
  return new Set(tasks.filter((t) => !t.isCompleted && (t.createdAt ?? 0) > seenBefore).map((t) => t.id));
}

type NextTask = {
  id: number;
  isCompleted?: boolean | null;
  verificationStatus?: string | null;
  dueDate?: number | null;
  remindAt?: string | null;
};

/** Следующая задача после выполненной: первая несделанная по срочности. */
export function nextTaskAfter<T extends NextTask>(tasks: readonly T[], doneId: number, nowSec?: number): T | null {
  const open = tasks.filter((t) => t.id !== doneId && !t.isCompleted && t.verificationStatus !== "submitted");
  return sortByUrgency(open, nowSec)[0] ?? null;
}

/** «Слушать список»: «Задач на сегодня: 3. Первая: … Вторая: …». */
export function listSpeechText(titles: readonly string[]): string {
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return "На сегодня задач нет.";
  const n = clean.length;
  const word = n % 10 === 1 && n % 100 !== 11 ? "задача" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "задачи" : "задач";
  return `На сегодня ${n} ${word}. ${clean.map((t, i) => `${i + 1}. ${t.replace(/[.!?…]+$/, "")}.`).join(" ")}`;
}
