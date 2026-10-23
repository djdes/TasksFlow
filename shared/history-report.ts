/**
 * Журнал дня и сводка по сотрудникам — общая логика для API и CSV.
 *
 * Прошлые дни читаются из task_history (её пишет ночной сброс), сегодняшний
 * — из живых задач: день ещё идёт, поэтому вместо «пропущено» там «ждёт».
 */
import type { ChecklistItem, Task, TaskHistoryRow, User } from "./schema";
import type { DaySummary, HistoryItem, HistoryStatus, PersonSummary } from "./history";
import { dayOfMonth, dayOfWeek, startOfDayInZone, timeInZone } from "./day";
import { isTaskVisibleOn } from "./task-visibility";

function parseArray<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function fromHistoryRow(row: TaskHistoryRow, tz: string): HistoryItem {
  const checklist = parseArray<ChecklistItem>(row.checklist);
  return {
    key: `${row.taskId}:${row.day}`,
    taskId: row.taskId,
    workerId: row.workerId,
    day: row.day,
    title: row.title,
    category: row.category,
    status: row.status as HistoryStatus,
    completedAt: row.completedAt,
    time: row.completedAt ? timeInZone(row.completedAt, tz) : null,
    photoUrls: parseArray<string>(row.photoUrls),
    checklist: checklist.length > 0 ? checklist : null,
    price: row.price,
    claimedByWorkerId: row.claimedByWorkerId,
    verificationStatus: row.verificationStatus,
  };
}

/** Сегодняшний день из живых задач: сделано, на проверке, ждёт. */
export function todayItems(tasks: readonly Task[], tz: string, today: string, workerIds: number[] | null): HistoryItem[] {
  const start = startOfDayInZone(today, tz);
  const dow = dayOfWeek(today);
  const dom = dayOfMonth(today);
  const allowed = workerIds ? new Set(workerIds) : null;
  const items: HistoryItem[] = [];
  for (const t of tasks) {
    if (t.workerId == null) continue;
    if (allowed && !allowed.has(t.workerId)) continue;
    let status: HistoryStatus;
    if (t.isCompleted) {
      // Разовая задача, закрытая на прошлой неделе, — не сегодняшняя работа.
      if (!t.completedAt || t.completedAt < start) continue;
      status = t.claimedByWorkerId != null ? "claimed" : "done";
    } else if (t.verificationStatus === "submitted") {
      status = "submitted";
    } else if (t.isRecurring ? isTaskVisibleOn({ weekDays: t.weekDays, monthDay: t.monthDay }, dow, dom) : true) {
      status = "pending";
    } else {
      continue;
    }
    const photos = t.photoUrls?.length ? t.photoUrls : t.photoUrl ? [t.photoUrl] : [];
    items.push({
      key: `${t.id}:${today}`,
      taskId: t.id,
      workerId: t.workerId,
      day: today,
      title: t.title,
      category: t.category ?? null,
      status,
      completedAt: t.isCompleted ? t.completedAt ?? null : null,
      time: t.isCompleted && t.completedAt ? timeInZone(t.completedAt, tz) : null,
      photoUrls: status === "done" || status === "claimed" || status === "submitted" ? photos : [],
      checklist: t.checklist?.length ? t.checklist : null,
      price: status === "done" ? t.price ?? 0 : 0,
      claimedByWorkerId: t.claimedByWorkerId ?? null,
      verificationStatus: t.verificationStatus ?? null,
    });
  }
  return items;
}

const STATUS_ORDER: Record<HistoryStatus, number> = { done: 0, submitted: 1, claimed: 2, pending: 3, missed: 4 };

export function sortItems(items: HistoryItem[]): HistoryItem[] {
  return items.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity) ||
      a.title.localeCompare(b.title, "ru"),
  );
}

export function summarize(items: readonly HistoryItem[], users: readonly Pick<User, "id" | "name" | "phone">[]) {
  const names = new Map(users.map((u) => [u.id, u.name || u.phone || `Сотрудник ${u.id}`]));
  const people = new Map<number, PersonSummary>();
  const days = new Map<string, DaySummary>();
  for (const it of items) {
    if (it.workerId == null) continue;
    let p = people.get(it.workerId);
    if (!p) {
      p = { workerId: it.workerId, name: names.get(it.workerId) ?? `Сотрудник ${it.workerId}`, done: 0, claimed: 0, missed: 0, pending: 0, bonus: 0, photos: 0, rate: null };
      people.set(it.workerId, p);
    }
    let d = days.get(it.day);
    if (!d) {
      d = { day: it.day, done: 0, missed: 0 };
      days.set(it.day, d);
    }
    if (it.status === "done" || it.status === "submitted") {
      p.done++;
      d.done++;
      p.bonus += it.price;
      p.photos += it.photoUrls.length;
    } else if (it.status === "claimed") {
      p.claimed++;
    } else if (it.status === "missed") {
      p.missed++;
      d.missed++;
    } else {
      p.pending++;
    }
  }
  for (const p of Array.from(people.values())) {
    const base = p.done + p.missed;
    p.rate = base > 0 ? p.done / base : null;
  }
  const list = Array.from(people.values()).sort((a, b) => b.done - a.done || a.name.localeCompare(b.name, "ru"));
  const totals = list.reduce(
    (t, p) => ({ done: t.done + p.done, claimed: t.claimed + p.claimed, missed: t.missed + p.missed, pending: t.pending + p.pending, bonus: t.bonus + p.bonus }),
    { done: 0, claimed: 0, missed: 0, pending: 0, bonus: 0 },
  );
  return { people: list, days: Array.from(days.values()).sort((a, b) => a.day.localeCompare(b.day)), totals };
}

// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<HistoryStatus, string> = {
  done: "Выполнено",
  claimed: "Сделал коллега",
  missed: "Не выполнено",
  submitted: "На проверке",
  pending: "Ждёт",
};

/**
 * Ячейка CSV для Excel: `;`-разделитель, кавычки при необходимости, и
 * защита от формул (=, +, -, @ в начале исполнились бы в Excel).
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Телефон для Excel: «+7…» он прочитал бы как формулу или число, поэтому
 * российский номер пишем как «8 (999) 000-00-10» — это текст.
 */
export function csvPhone(phone: string | null | undefined): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone ?? "");
  return m ? `8 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}` : phone ?? "";
}

export function buildCsv(
  items: readonly HistoryItem[],
  users: readonly Pick<User, "id" | "name" | "phone">[],
  absoluteUrl: (path: string) => string,
): string {
  const byId = new Map(users.map((u) => [u.id, u]));
  const header = ["Дата", "Сотрудник", "Телефон", "Задача", "Категория", "Статус", "Время", "Премия, ₽", "Фото"];
  const lines = [header.map(csvCell).join(";")];
  for (const it of items) {
    const u = it.workerId != null ? byId.get(it.workerId) : undefined;
    const photos = [...it.photoUrls, ...(it.checklist ?? []).flatMap((c) => c.photoUrls ?? [])];
    lines.push(
      [
        it.day.split("-").reverse().join("."),
        u?.name ?? "",
        csvPhone(u?.phone),
        it.title,
        it.category ?? "",
        STATUS_LABEL[it.status],
        it.time ?? "",
        it.price || "",
        photos.map(absoluteUrl).join(" "),
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  // BOM — чтобы Excel открыл кириллицу без «кракозябр».
  return "﻿" + lines.join("\r\n") + "\r\n";
}

