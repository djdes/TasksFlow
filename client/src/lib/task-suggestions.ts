/**
 * «Умные» подсказки в форме задачи — меньше набора руками:
 *   • названия прошлых задач компании (datalist у «Что сделать?»);
 *   • готовые вопросы: «Кто заполняет?» с именами людей, «Всё в порядке?»;
 *   • недавние исполнители — сверху в списке выбора.
 * Чистые функции — тесты в tests/smart-ux.test.ts.
 */
import { getDueStatus } from "@shared/task-visibility";

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Названия прошлых задач: без повторов, чаще ставят — выше, при равенстве — новее. */
export function titleSuggestions(
  tasks: readonly { title?: string | null; createdAt?: number | null }[],
  limit = 30,
): string[] {
  const byKey = new Map<string, { title: string; count: number; last: number }>();
  for (const t of tasks) {
    const title = (t.title ?? "").replace(/\s+/g, " ").trim();
    if (title.length < 3) continue;
    const key = norm(title);
    const prev = byKey.get(key);
    const at = t.createdAt ?? 0;
    if (prev) {
      prev.count += 1;
      if (at > prev.last) {
        prev.last = at;
        prev.title = title;
      }
    } else {
      byKey.set(key, { title, count: 1, last: at });
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.count - a.count || b.last - a.last || a.title.localeCompare(b.title, "ru"))
    .slice(0, limit)
    .map((x) => x.title);
}

/** «Анна Петрова» → «Анна»; одинаковые имена — полностью, чтобы различать. */
export function shortNames(people: readonly { name?: string | null }[], limit = 20): string[] {
  const full = people.map((p) => (p.name ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const first = full.map((n) => n.split(" ")[0]);
  const counts = new Map<string, number>();
  for (const f of first) counts.set(norm(f), (counts.get(norm(f)) ?? 0) + 1);
  const out: string[] = [];
  const seen = new Set<string>();
  full.forEach((n, i) => {
    const pick = (counts.get(norm(first[i])) ?? 0) > 1 ? n : first[i];
    const key = norm(pick);
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push(pick);
  });
  return out;
}

export type QuestionPreset = { key: string; title: string; options: string[] };

/**
 * Готовые вопросы. «Кто заполняет?» — имена выбранных исполнителей (если их
 * двое и больше), иначе всех сотрудников; меньше двух имён — пресета нет.
 */
export function questionPresets(names: readonly string[]): QuestionPreset[] {
  const presets: QuestionPreset[] = [];
  if (names.length >= 2) presets.push({ key: "who", title: "Кто заполняет?", options: [...names] });
  presets.push({ key: "ok", title: "Всё в порядке?", options: ["Да", "Нет"] });
  return presets;
}

const RECENT_KEY = "tf_recent_workers";
export const RECENT_LIMIT = 6;

/** Недавно выбранные исполнители: новые — в начало, без повторов. */
export function pushRecent(recent: readonly number[], picked: readonly number[], limit = RECENT_LIMIT): number[] {
  const out = [...picked];
  for (const id of recent) if (!out.includes(id)) out.push(id);
  return out.slice(0, limit);
}

export function readRecentWorkers(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberRecentWorkers(picked: readonly number[]): void {
  if (picked.length === 0) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(readRecentWorkers(), picked)));
  } catch {
    // Приватный режим — без «недавних».
  }
}

/** Недавние — сверху в порядке давности, остальные — как были. */
export function orderByRecent<T extends { id: number }>(users: readonly T[], recent: readonly number[]): T[] {
  const rank = new Map(recent.map((id, i) => [id, i]));
  return [...users].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

type UrgencyTask = {
  dueDate?: number | null;
  remindAt?: string | null;
  verificationStatus?: string | null;
};

/**
 * Срочность для списка сотрудника: просрочено → срок сегодня → со временем
 * напоминания (раньше — выше) → остальное; отправленные руководителю — в конце.
 * Внутри группы порядок прежний (сортировка устойчивая).
 */
export function urgencyRank(task: UrgencyTask, nowSec: number): number {
  if (task.verificationStatus === "submitted") return 9000;
  const due = getDueStatus(task.dueDate ?? null, nowSec).kind;
  if (due === "overdue") return 0;
  if (due === "today") return 1;
  const m = /^(\d{2}):(\d{2})$/.exec(task.remindAt ?? "");
  if (m) return 10 + Number(m[1]) * 60 + Number(m[2]);
  return 5000;
}

export function sortByUrgency<T extends UrgencyTask>(tasks: readonly T[], nowSec: number = Math.floor(Date.now() / 1000)): T[] {
  return tasks
    .map((t, i) => ({ t, i, r: urgencyRank(t, nowSec) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.t);
}
