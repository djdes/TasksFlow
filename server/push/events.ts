/**
 * Когда что уходит в push. Вызывается из мест, где меняется задача;
 * отправка фоновая — запрос, который её вызвал, не ждёт и не падает.
 *
 *   сотруднику:   новая задача (склеиваются за 15 с), задачу вернули,
 *                 задачу с премией приняли;
 *   проверяющему: задача ждёт проверки (склеиваются за 15 с).
 * Утренние, вечерние напоминания и итоги дня — services/reminders.ts.
 */
import type { Task } from "@shared/schema";
import { storage } from "../storage";
import { awaitingReviewMessage, newTasksMessage, notifySoon, sendInBackground } from "./index";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Сам себе задачу поставил — не уведомляем. */
export function onTaskCreated(task: Task, actorUserId: number | null) {
  if (!task.workerId || task.workerId === actorUserId) return;
  notifySoon("new-task", task.workerId, task.title, newTasksMessage);
}

export function onTaskRejected(task: Task, reason: string | null | undefined) {
  if (!task.workerId) return;
  sendInBackground([task.workerId], {
    title: "Задачу вернули на доработку",
    body: clip(reason ? `${task.title}: ${reason}` : task.title, 160),
    url: "/dashboard",
    tag: `task-${task.id}`,
  });
}

/** Принятие без денег — не повод беспокоить; с премией — приятная новость. */
export function onTaskApproved(task: Task) {
  if (!task.workerId || !task.price || task.price <= 0) return;
  sendInBackground([task.workerId], {
    title: "Задача принята",
    body: clip(`${task.title} · +${task.price.toLocaleString("ru-RU")} ₽`, 160),
    url: "/reports",
    tag: `task-${task.id}`,
  });
}

/** Проверяющий задачи, а если не назначен — администраторы компании. */
export async function onTaskSubmitted(task: Task, submitterId: number | null) {
  let recipients: number[] = [];
  if (task.verifierWorkerId) {
    recipients = [task.verifierWorkerId];
  } else if (task.companyId) {
    const users = await storage.getAllUsers(task.companyId);
    recipients = users.filter((u) => u.isAdmin).map((u) => u.id);
  }
  const worker = task.workerId ? await storage.getUserById(task.workerId) : undefined;
  const who = worker?.name?.trim() || worker?.phone || null;
  const item = who ? `${task.title} — ${who}` : task.title;
  for (const userId of recipients) {
    if (userId !== submitterId) notifySoon("review", userId, item, awaitingReviewMessage);
  }
}

/** Обёртка для вызова из обработчиков: ошибка push не должна ломать ответ. */
export function safely(run: () => unknown) {
  try {
    const result = run();
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // push — побочный эффект
  }
}
