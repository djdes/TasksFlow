/**
 * Когда что уходит в push. Вызывается из мест, где меняется задача;
 * отправка фоновая — запрос, который её вызвал, не ждёт и не падает.
 *
 *   сотруднику:   новая задача (склеиваются за 15 с), задачу вернули,
 *                 задачу с премией приняли;
 *   проверяющему: задача ждёт проверки (склеиваются за 15 с) — назначенному
 *                 проверяющему, а если его нет — админам и тем, кому роль
 *                 даёт «Принимает задачи» (shared/roles.ts).
 *
 * Личные настройки (users.notify_prefs, shared/notify.ts) решают, что
 * человек получает; письмо о новой задаче уходит на его email.
 * Утренние, вечерние напоминания, итоги дня и время задачи — services/reminders.ts.
 */
import type { Task, User } from "@shared/schema";
import { canReviewTask } from "@shared/roles";
import { parseNotifyPrefs, type NotifyPrefKey } from "@shared/notify";
import { storage } from "../storage";
import { logger } from "../logger";
import { accessMap } from "../access";
import { getPublicTasksflowBaseUrl } from "../public-urls";
import { awaitingReviewMessage, newTasksMessage, notifySoon, sendInBackground } from "./index";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const wants = (user: Pick<User, "notifyPrefs"> | undefined, key: NotifyPrefKey) =>
  !!user && parseNotifyPrefs(user.notifyPrefs)[key];

/** Сам себе задачу поставил — не уведомляем. */
export async function onTaskCreated(task: Task, actorUserId: number | null) {
  if (!task.workerId || task.workerId === actorUserId) return;
  const worker = await storage.getUserById(task.workerId);
  if (!worker) return;
  if (wants(worker, "newTask")) {
    notifySoon("new-task", task.workerId, task.title, newTasksMessage);
  }
  if (wants(worker, "emailNewTask") && worker.email) {
    const to = worker.email;
    notifySoon("new-task-email", task.workerId, task.title, (titles) => newTasksEmail(titles), (_ids, message) => {
      void sendTaskEmail(to, message.title, message.body).catch((err) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[mail] письмо о новой задаче не ушло");
      });
    });
  }
}

/** Склеенное письмо о новых задачах: тема и список. */
export function newTasksEmail(titles: string[]) {
  return titles.length === 1
    ? { title: `Новая задача: ${clip(titles[0], 80)}`, body: titles[0], url: "/dashboard" }
    : { title: `Новых задач: ${titles.length}`, body: titles.join("\n"), url: "/dashboard" };
}

async function sendTaskEmail(to: string, subject: string, body: string) {
  const { sendNoticeMail } = await import("../mailer");
  const lines = body.split("\n").slice(0, 20);
  await sendNoticeMail(to, {
    subject,
    heading: lines.length > 1 ? "Вам поставили задачи" : "Вам поставили задачу",
    paragraphs: lines.map((t) => `• ${t}`),
    button: { url: `${getPublicTasksflowBaseUrl()}/dashboard`, label: "Открыть задачи →" },
    footer: "Письмо пришло, потому что в TasksFlow включены письма о новых задачах. Выключить — «Мой аккаунт» → «Уведомления».",
  });
}

export async function onTaskRejected(task: Task, reason: string | null | undefined) {
  if (!task.workerId) return;
  const worker = await storage.getUserById(task.workerId);
  if (!wants(worker, "verdict")) return;
  sendInBackground([task.workerId], {
    title: "Задачу вернули на доработку",
    body: clip(reason ? `${task.title}: ${reason}` : task.title, 160),
    url: "/dashboard",
    tag: `task-${task.id}`,
  });
}

/** Принятие без денег — не повод беспокоить; с премией — приятная новость. */
export async function onTaskApproved(task: Task) {
  if (!task.workerId || !task.price || task.price <= 0) return;
  const worker = await storage.getUserById(task.workerId);
  if (!wants(worker, "verdict")) return;
  sendInBackground([task.workerId], {
    title: "Задача принята",
    body: clip(`${task.title} · +${task.price.toLocaleString("ru-RU")} ₽`, 160),
    url: "/reports",
    tag: `task-${task.id}`,
  });
}

/**
 * Кто примет задачу: назначенный проверяющий, а если его нет — админы и
 * те, кому роль позволяет принять работу этого человека.
 */
export async function reviewersFor(task: Task, users: User[]): Promise<User[]> {
  if (task.verifierWorkerId) {
    const verifier = users.find((u) => u.id === task.verifierWorkerId);
    return verifier ? [verifier] : [];
  }
  if (!task.companyId) return [];
  const access = await accessMap(task.companyId, users);
  return users.filter((u) => {
    const a = access.get(u.id);
    return !!a && canReviewTask(a, task);
  });
}

export async function onTaskSubmitted(task: Task, submitterId: number | null) {
  if (!task.companyId) return;
  const users = await storage.getAllUsers(task.companyId);
  const recipients = await reviewersFor(task, users);
  const worker = task.workerId ? users.find((u) => u.id === task.workerId) : undefined;
  const who = worker?.name?.trim() || worker?.phone || null;
  const item = who ? `${task.title} — ${who}` : task.title;
  for (const user of recipients) {
    if (user.id !== submitterId && wants(user, "review")) notifySoon("review", user.id, item, awaitingReviewMessage);
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
