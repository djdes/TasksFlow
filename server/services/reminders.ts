/**
 * Напоминания и итоги дня в Telegram по расписанию компании.
 *
 *   morning — каждому, у кого есть задачи на сегодня: список с кнопками;
 *   evening — тем, у кого что-то осталось: что именно;
 *   digest  — админам и руководителям: сколько сделано у их людей,
 *             что не сделано и премии за день, кнопка «Открыть отчёт».
 *
 * Получают только привязавшие бота (tgChatId + /start). Каждое напоминание
 * уходит один раз за местный день: состояние компании меняется
 * compare-and-swap, так что тик, рестарт и второй процесс не задвоят.
 * Опоздавшее больше чем на 3 часа (сервер лежал) не отправляем — утреннее
 * в обед только раздражает.
 */
import type { Task, User } from "@shared/schema";
import { dayInZone, dayLabelRu, minutesInZone, zoneOrDefault } from "@shared/day";
import {
  hhmmToMinutes,
  NOTIFY_SLOTS,
  parseNotifySettings,
  type NotifySettings,
  type NotifySlot,
} from "@shared/notify";
import type { HistoryItem } from "@shared/history";
import { todayItems } from "@shared/history-report";
import { DatabaseStorage } from "../storage";
import type { PushMessage } from "@shared/push";

const LATE_WINDOW_MIN = 180;

export type NotifyState = Partial<Record<NotifySlot, string>>;

export function parseNotifyState(raw: string | null | undefined): NotifyState {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as NotifyState) : {};
  } catch {
    return {};
  }
}

/** Какие напоминания пора отправить сейчас (минуты от местной полуночи). */
export function dueSlots(settings: NotifySettings, state: NotifyState, day: string, minutes: number): NotifySlot[] {
  return NOTIFY_SLOTS.filter((slot) => {
    const at = settings[slot];
    if (!at || state[slot] === day) return false;
    const start = hhmmToMinutes(at);
    return minutes >= start && minutes < start + LATE_WINDOW_MIN;
  });
}

const linked = (u: User) => u.tgChatId != null && u.tgStartedAt != null;

/** Кому руководитель смотрит итоги: админ — всех, руководитель — своих и себя. */
export function digestScope(viewer: User): number[] | null | undefined {
  if (viewer.isAdmin) return null;
  const managed = DatabaseStorage.parseManagedWorkerIds(viewer.managedWorkerIds);
  return managed ? Array.from(new Set([...managed, viewer.id])) : undefined;
}

export function digestText(items: HistoryItem[], users: User[], day: string, opts: { scoped: boolean }): string | null {
  const assigned = items.filter((i) => i.status !== "claimed");
  if (assigned.length === 0) return null;
  const done = assigned.filter((i) => i.status === "done" || i.status === "submitted").length;
  const bonus = items.reduce((sum, i) => sum + (i.status === "done" ? i.price : 0), 0);
  const left = assigned.filter((i) => i.status === "pending");
  const names = new Map(users.map((u) => [u.id, u.name || u.phone || `#${u.id}`]));
  const pct = Math.round((done / assigned.length) * 100);
  const lines = [
    `📊 <b>Итоги дня · ${dayLabelRu(day)}</b>${opts.scoped ? " · ваши сотрудники" : ""}`,
    `Сделано: <b>${done} из ${assigned.length}</b> · ${pct}%`,
  ];
  if (bonus > 0) lines.push(`Премии: ${bonus.toLocaleString("ru-RU")} ₽`);
  if (left.length > 0) {
    lines.push("", "<b>Не сделано:</b>");
    for (const i of left.slice(0, 15)) {
      lines.push(`• ${escape(names.get(i.workerId ?? 0) ?? "—")} — ${escape(i.title)}`);
    }
    if (left.length > 15) lines.push(`…и ещё ${left.length - 15}`);
  } else {
    lines.push("", "Всё сделано 👏");
  }
  return lines.join("\n");
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------

export type ReminderCompany = { id: number; timezone: string | null; notifySettings: string | null; notifyState: string | null };

export interface ReminderStore {
  listCompanies(): Promise<ReminderCompany[]>;
  /** compare-and-swap состояния: false — другой процесс успел раньше. */
  claimNotify(companyId: number, prev: string | null, next: string): Promise<boolean>;
  getUsers(companyId: number): Promise<User[]>;
  getTasks(companyId: number): Promise<Task[]>;
}

export interface ReminderSender {
  /** Список задач с кнопками — как «Мои задачи». Нет — Telegram-бот не запущен. */
  sendTaskList?(chatId: number, tasks: Task[], header: string): Promise<void>;
  sendText?(chatId: number, html: string, button?: { text: string; url: string }): Promise<void>;
  /** Кто из этих людей получает push хотя бы на одно устройство. */
  pushRecipients?(userIds: number[]): Promise<Set<number>>;
  /** true — доставлено хотя бы на одно устройство. */
  push?(userId: number, message: PushMessage): Promise<boolean>;
}

export type ReminderRun = { companyId: number; slot: NotifySlot; sent: number };

export async function runReminders(
  store: ReminderStore,
  sender: ReminderSender,
  now: number,
  opts: { reportUrl: string; onError?: (companyId: number, err: unknown) => void },
): Promise<ReminderRun[]> {
  const runs: ReminderRun[] = [];
  for (const company of await store.listCompanies()) {
    const tz = zoneOrDefault(company.timezone);
    const day = dayInZone(now, tz);
    const state = parseNotifyState(company.notifyState);
    const due = dueSlots(parseNotifySettings(company.notifySettings), state, day, minutesInZone(now, tz));
    if (due.length === 0) continue;
    const next = { ...state };
    for (const slot of due) next[slot] = day;
    if (!(await store.claimNotify(company.id, company.notifyState, JSON.stringify(next)))) continue;

    try {
      const [users, tasks] = await Promise.all([store.getUsers(company.id), store.getTasks(company.id)]);
      const pushable = sender.pushRecipients
        ? await sender.pushRecipients(users.map((u) => u.id)).catch(() => new Set<number>())
        : new Set<number>();
      for (const slot of due) {
        runs.push({
          companyId: company.id,
          slot,
          sent: await sendSlot(slot, sender, users, tasks, tz, day, opts.reportUrl, pushable),
        });
      }
    } catch (err) {
      // Состояние уже записано: лучше пропустить одно напоминание, чем
      // разослать его дважды половине сотрудников.
      opts.onError?.(company.id, err);
    }
  }
  return runs;
}

async function sendSlot(
  slot: NotifySlot,
  sender: ReminderSender,
  users: User[],
  tasks: Task[],
  tz: string,
  day: string,
  reportUrl: string,
  pushable: Set<number>,
): Promise<number> {
  let sent = 0;
  const items = todayItems(tasks, tz, day, null);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const user of users) {
    const tg = linked(user) && !!sender.sendText && !!sender.sendTaskList;
    const push = pushable.has(user.id) && !!sender.push;
    if (!tg && !push) continue;
    // Каждый канал сам по себе: заблокированный бот не мешает push и наоборот.
    let reached = false;
    const via = async (run: () => Promise<unknown>) => {
      try {
        const ok = await run();
        if (ok !== false) reached = true;
      } catch {
        // Один заблокировавший бота не должен оставить без напоминаний остальных.
      }
    };
    if (slot === "digest") {
      const scope = digestScope(user);
      if (scope === undefined) continue; // обычный сотрудник
      const scoped = scope ? items.filter((i) => i.workerId != null && scope.includes(i.workerId)) : items;
      const text = digestText(scoped, users, day, { scoped: scope !== null });
      if (!text) continue;
      if (tg) await via(() => sender.sendText!(user.tgChatId!, text, { text: "📈 Открыть отчёт", url: reportUrl }));
      if (push) await via(() => sender.push!(user.id, digestPush(scoped, day)));
      if (reached) sent++;
      continue;
    }
    const mine = items.filter((i) => i.workerId === user.id && i.status !== "claimed");
    const open = mine.filter((i) => i.status === "pending");
    if (slot === "morning" && mine.length > 0) {
      const list = mine.map((i) => byId.get(i.taskId)!).filter(Boolean);
      const first = user.name ? user.name.split(" ")[0] : "";
      if (tg) {
        const name = first ? `, ${escape(first)}` : "";
        await via(() => sender.sendTaskList!(user.tgChatId!, list, `☀️ <b>Доброе утро${name}!</b> Задач на сегодня: ${mine.length}`));
      }
      if (push) {
        await via(() =>
          sender.push!(user.id, {
            title: first ? `Доброе утро, ${first}!` : "Доброе утро!",
            body: `Задач на сегодня: ${mine.length}. ${listBody(list.map((t) => t.title))}`,
            url: "/dashboard",
            tag: "morning",
          }),
        );
      }
    } else if (slot === "evening" && open.length > 0) {
      const list = open.map((i) => byId.get(i.taskId)!).filter(Boolean);
      if (tg) await via(() => sender.sendTaskList!(user.tgChatId!, list, `⏰ <b>Осталось сделать: ${open.length}</b>`));
      if (push) {
        await via(() =>
          sender.push!(user.id, {
            title: `Осталось сделать: ${open.length}`,
            body: listBody(list.map((t) => t.title)),
            url: "/dashboard",
            tag: "evening",
          }),
        );
      }
    }
    if (reached) sent++;
  }
  return sent;
}

/** Итог дня одной строкой — для push, где нет места на список. */
export function digestPush(items: HistoryItem[], day: string): PushMessage {
  const assigned = items.filter((i) => i.status !== "claimed");
  const done = assigned.filter((i) => i.status === "done" || i.status === "submitted").length;
  const left = assigned.filter((i) => i.status === "pending").length;
  const pct = assigned.length > 0 ? Math.round((done / assigned.length) * 100) : 0;
  return {
    title: `Итоги дня · ${dayLabelRu(day)}`,
    body: `Сделано ${done} из ${assigned.length} · ${pct}%` + (left > 0 ? ` · не сделано: ${left}` : " · всё сделано"),
    url: "/reports",
    tag: "digest",
  };
}

function listBody(titles: string[]): string {
  const shown = titles.slice(0, 3).map((t) => (t.length > 50 ? `${t.slice(0, 49)}…` : t));
  const rest = titles.length - shown.length;
  return shown.join(" · ") + (rest > 0 ? ` и ещё ${rest}` : "");
}
