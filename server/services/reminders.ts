/**
 * Напоминания и итоги дня по расписанию компании — в Telegram и push
 * (приложение, PWA на рабочем столе, браузер).
 *
 *   morning — утренняя сводка для всех (по умолчанию 08:30): сотруднику —
 *             его задачи на день со списком; руководителю и админу — ещё
 *             сколько задач у команды и сколько ждут проверки;
 *   evening — тем, у кого что-то осталось: что именно;
 *   digest  — админам и руководителям: сколько сделано у их людей,
 *             что не сделано и премии за день, кнопка «Открыть отчёт».
 *   task    — своё время у задачи (tasks.remind_at): исполнителю, если
 *             задача к этому времени не сделана.
 *
 * Telegram получают привязавшие бота (tgChatId + /start), push — те, у кого
 * включены уведомления на устройстве. Личные настройки (shared/notify.ts)
 * выключают напоминания или итоги дня у конкретного человека.
 *
 * Каждое напоминание уходит один раз за местный день: состояние компании
 * (и remind_sent_day задачи) меняется compare-and-swap, так что тик, рестарт
 * и второй процесс не задвоят. Опоздавшее больше чем на 3 часа (сервер лежал)
 * не отправляем — утреннее в обед только раздражает.
 */
import type { Task, User } from "@shared/schema";
import { dayInZone, dayLabelRu, minutesInZone, zoneOrDefault } from "@shared/day";
import {
  hhmmToMinutes,
  NOTIFY_SLOTS,
  parseNotifyPrefs,
  parseNotifySettings,
  type NotifyPrefs,
  type NotifySettings,
  type NotifySlot,
} from "@shared/notify";
import type { HistoryItem } from "@shared/history";
import { todayItems } from "@shared/history-report";
import { canReviewTask, resolveAccess, type AccessRole, type UserAccess } from "@shared/roles";
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

/** Своё время задачи наступило, сегодня ещё не напоминали, опоздание меньше 3 часов. */
export function isTaskReminderDue(task: Pick<Task, "remindAt" | "remindSentDay">, day: string, minutes: number): boolean {
  if (!task.remindAt || task.remindSentDay === day) return false;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(task.remindAt)) return false;
  const start = hhmmToMinutes(task.remindAt);
  return minutes >= start && minutes < start + LATE_WINDOW_MIN;
}

const linked = (u: User) => u.tgChatId != null && u.tgStartedAt != null;

/**
 * Чью работу человек видит в сводках: null — вся компания, массив — эти
 * люди, undefined — только свою (обычный сотрудник).
 */
export function summaryScope(access: UserAccess): number[] | null | undefined {
  if (access.isAdmin) return null;
  if (!access.manageTasks && !access.verifyTasks && !access.viewReports) return undefined;
  if (
    (access.manageTasks && access.taskScope === null) ||
    (access.verifyTasks && access.reviewScope === null) ||
    (access.viewReports && access.reportScope === null)
  ) {
    return null;
  }
  return Array.from(new Set([...(access.taskScope ?? []), ...(access.reportScope ?? []), access.userId]));
}

/** Кому руководитель смотрит итоги: админ — всех, руководитель — своих и себя. */
export function digestScope(viewer: User, role: AccessRole | null = null): number[] | null | undefined {
  return summaryScope(resolveAccess(viewer, role));
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

/** Сводка по команде на утро: задачи людей на сегодня и что ждёт проверки. */
export type TeamMorning = { tasks: number; review: number };

export function teamMorningText(team: TeamMorning): string {
  const parts = [`у команды на сегодня задач: ${team.tasks}`];
  if (team.review > 0) parts.push(`ждут проверки: ${team.review}`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------

export type ReminderCompany = { id: number; timezone: string | null; notifySettings: string | null; notifyState: string | null };

export interface ReminderStore {
  listCompanies(): Promise<ReminderCompany[]>;
  /** compare-and-swap состояния: false — другой процесс успел раньше. */
  claimNotify(companyId: number, prev: string | null, next: string): Promise<boolean>;
  getUsers(companyId: number): Promise<User[]>;
  getTasks(companyId: number): Promise<Task[]>;
  /** Свои роли компании — кто руководитель (shared/roles.ts). Нет — ролей нет. */
  getRoles?(companyId: number): Promise<AccessRole[]>;
  /** Невыполненные задачи со своим временем напоминания, по всем компаниям. */
  listTaskReminders?(): Promise<Task[]>;
  /** compare-and-swap remind_sent_day: false — сегодня уже отправлено. */
  claimTaskReminder?(taskId: number, day: string): Promise<boolean>;
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

export type ReminderRun = { companyId: number; slot: NotifySlot | "task"; sent: number };

type RunOpts = {
  reportUrl: string;
  /** Ссылка «Открыть задачи» в Telegram; по умолчанию рядом с отчётом. */
  dashboardUrl?: string;
  onError?: (companyId: number, err: unknown) => void;
};

export async function runReminders(
  store: ReminderStore,
  sender: ReminderSender,
  now: number,
  opts: RunOpts,
): Promise<ReminderRun[]> {
  const runs: ReminderRun[] = [];
  // Задачи со своим временем — одним запросом на все компании.
  const withReminders = store.listTaskReminders ? await store.listTaskReminders().catch(() => [] as Task[]) : [];
  const remindersByCompany = new Map<number, Task[]>();
  for (const t of withReminders) {
    if (t.companyId == null) continue;
    remindersByCompany.set(t.companyId, [...(remindersByCompany.get(t.companyId) ?? []), t]);
  }

  for (const company of await store.listCompanies()) {
    const tz = zoneOrDefault(company.timezone);
    const day = dayInZone(now, tz);
    const minutes = minutesInZone(now, tz);
    const state = parseNotifyState(company.notifyState);
    const due = dueSlots(parseNotifySettings(company.notifySettings), state, day, minutes);
    const dueTasks = (remindersByCompany.get(company.id) ?? []).filter((t) => isTaskReminderDue(t, day, minutes));
    if (due.length === 0 && dueTasks.length === 0) continue;

    let claimed: NotifySlot[] = [];
    if (due.length > 0) {
      const next = { ...state };
      for (const slot of due) next[slot] = day;
      if (await store.claimNotify(company.id, company.notifyState, JSON.stringify(next))) claimed = due;
    }
    if (claimed.length === 0 && dueTasks.length === 0) continue;

    try {
      const [users, tasks, roles] = await Promise.all([
        store.getUsers(company.id),
        claimed.length > 0 ? store.getTasks(company.id) : Promise.resolve([] as Task[]),
        store.getRoles ? store.getRoles(company.id).catch(() => [] as AccessRole[]) : Promise.resolve([] as AccessRole[]),
      ]);
      const pushable = sender.pushRecipients
        ? await sender.pushRecipients(users.map((u) => u.id)).catch(() => new Set<number>())
        : new Set<number>();
      const ctx = makeContext(users, roles, sender, pushable, tz, day, opts);
      for (const slot of claimed) {
        runs.push({ companyId: company.id, slot, sent: await sendSlot(slot, ctx, tasks) });
      }
      if (dueTasks.length > 0) {
        const sent = await sendTaskReminders(store, ctx, dueTasks);
        if (sent > 0) runs.push({ companyId: company.id, slot: "task", sent });
      }
    } catch (err) {
      // Состояние уже записано: лучше пропустить одно напоминание, чем
      // разослать его дважды половине сотрудников.
      opts.onError?.(company.id, err);
    }
  }
  return runs;
}

type Ctx = {
  users: User[];
  sender: ReminderSender;
  pushable: Set<number>;
  tz: string;
  day: string;
  reportUrl: string;
  dashboardUrl: string;
  access: Map<number, UserAccess>;
  prefs: (user: User) => NotifyPrefs;
};

function makeContext(
  users: User[],
  roles: AccessRole[],
  sender: ReminderSender,
  pushable: Set<number>,
  tz: string,
  day: string,
  opts: RunOpts,
): Ctx {
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const access = new Map(users.map((u) => [u.id, resolveAccess(u, typeof u.roleId === "number" ? roleById.get(u.roleId) ?? null : null)]));
  return {
    users,
    sender,
    pushable,
    tz,
    day,
    reportUrl: opts.reportUrl,
    dashboardUrl: opts.dashboardUrl ?? opts.reportUrl.replace(/\/reports\/?$/, "/dashboard"),
    access,
    prefs: (u) => parseNotifyPrefs(u.notifyPrefs),
  };
}

/** Отправка одному человеку по каналам: заблокированный бот не мешает push и наоборот. */
function channels(ctx: Ctx, user: User) {
  const tg = linked(user) && !!ctx.sender.sendText && !!ctx.sender.sendTaskList;
  const push = ctx.pushable.has(user.id) && !!ctx.sender.push;
  let reached = false;
  const via = async (run: () => Promise<unknown>) => {
    try {
      const ok = await run();
      if (ok !== false) reached = true;
    } catch {
      // Один заблокировавший бота не должен оставить без напоминаний остальных.
    }
  };
  return { tg, push, via, reached: () => reached };
}

async function sendSlot(slot: NotifySlot, ctx: Ctx, tasks: Task[]): Promise<number> {
  const { sender, users } = ctx;
  let sent = 0;
  const items = todayItems(tasks, ctx.tz, ctx.day, null);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const user of users) {
    const ch = channels(ctx, user);
    if (!ch.tg && !ch.push) continue;
    const prefs = ctx.prefs(user);
    const access = ctx.access.get(user.id)!;
    const scope = summaryScope(access);
    if (slot === "digest") {
      if (scope === undefined || !prefs.digest) continue; // обычный сотрудник или выключил
      const scoped = scope ? items.filter((i) => i.workerId != null && scope.includes(i.workerId)) : items;
      const text = digestText(scoped, users, ctx.day, { scoped: scope !== null });
      if (!text) continue;
      if (ch.tg) await ch.via(() => sender.sendText!(user.tgChatId!, text, { text: "📈 Открыть отчёт", url: ctx.reportUrl }));
      if (ch.push) await ch.via(() => sender.push!(user.id, digestPush(scoped, ctx.day)));
      if (ch.reached()) sent++;
      continue;
    }
    if (!prefs.reminders) continue;
    const mine = items.filter((i) => i.workerId === user.id && i.status !== "claimed");
    const open = mine.filter((i) => i.status === "pending");
    if (slot === "morning") {
      const team = scope === undefined ? null : teamMorning(ctx, tasks, items, access, scope);
      if (mine.length === 0 && !team) continue;
      const list = mine.map((i) => byId.get(i.taskId)!).filter(Boolean);
      const first = user.name ? user.name.split(" ")[0] : "";
      if (ch.tg) {
        const name = first ? `, ${escape(first)}` : "";
        const teamLine = team ? teamMorningText(team) : "";
        if (list.length > 0) {
          const header = `☀️ <b>Доброе утро${name}!</b> Задач на сегодня: ${mine.length}` + (teamLine ? ` · ${teamLine}` : "");
          await ch.via(() => sender.sendTaskList!(user.tgChatId!, list, header));
        } else {
          const text = `☀️ <b>Доброе утро${name}!</b> ${capitalize(teamLine)}`;
          await ch.via(() => sender.sendText!(user.tgChatId!, text, { text: "📋 Открыть задачи", url: ctx.dashboardUrl }));
        }
      }
      if (ch.push) {
        const body =
          list.length > 0
            ? `Задач на сегодня: ${mine.length}. ${listBody(list.map((t) => t.title))}` + (team ? ` · ${teamMorningText(team)}` : "")
            : capitalize(teamMorningText(team!));
        await ch.via(() =>
          sender.push!(user.id, {
            title: first ? `Доброе утро, ${first}!` : "Доброе утро!",
            body,
            url: team && list.length === 0 && team.review > 0 ? "/admin/verification" : "/dashboard",
            tag: "morning",
          }),
        );
      }
    } else if (slot === "evening" && open.length > 0) {
      const list = open.map((i) => byId.get(i.taskId)!).filter(Boolean);
      if (ch.tg) await ch.via(() => sender.sendTaskList!(user.tgChatId!, list, `⏰ <b>Осталось сделать: ${open.length}</b>`));
      if (ch.push) {
        await ch.via(() =>
          sender.push!(user.id, {
            title: `Осталось сделать: ${open.length}`,
            body: listBody(list.map((t) => t.title)),
            url: "/dashboard",
            tag: "evening",
          }),
        );
      }
    }
    if (ch.reached()) sent++;
  }
  return sent;
}

/** Утренняя сводка по команде руководителя; null — у команды пусто. */
function teamMorning(ctx: Ctx, tasks: Task[], items: HistoryItem[], access: UserAccess, scope: number[] | null): TeamMorning | null {
  const inScope = (workerId: number | null | undefined) =>
    workerId != null && workerId !== access.userId && (scope === null || scope.includes(workerId));
  const teamTasks = items.filter((i) => i.status !== "claimed" && inScope(i.workerId)).length;
  const review = tasks.filter((t) => t.verificationStatus === "submitted" && canReviewTask(access, t)).length;
  if (teamTasks === 0 && review === 0) return null;
  return { tasks: teamTasks, review };
}

async function sendTaskReminders(store: ReminderStore, ctx: Ctx, dueTasks: Task[]): Promise<number> {
  // Только то, что сегодня в расписании и ещё не сделано и не на проверке.
  const pending = new Set(
    todayItems(dueTasks, ctx.tz, ctx.day, null)
      .filter((i) => i.status === "pending")
      .map((i) => i.taskId),
  );
  const byId = new Map(ctx.users.map((u) => [u.id, u]));
  let sent = 0;
  for (const task of dueTasks) {
    if (!pending.has(task.id) || task.workerId == null) continue;
    const user = byId.get(task.workerId);
    if (!user || !ctx.prefs(user).reminders) continue;
    const ch = channels(ctx, user);
    if (!ch.tg && !ch.push) continue;
    // Заявка до отправки: второй процесс или повторный тик не продублируют.
    if (store.claimTaskReminder && !(await store.claimTaskReminder(task.id, ctx.day).catch(() => false))) continue;
    if (ch.tg) await ch.via(() => ctx.sender.sendTaskList!(user.tgChatId!, [task], `⏰ <b>Напоминание</b> · ${task.remindAt}`));
    if (ch.push) {
      await ch.via(() =>
        ctx.sender.push!(user.id, {
          title: `Напоминание · ${task.remindAt}`,
          body: task.title.length > 120 ? `${task.title.slice(0, 119)}…` : task.title,
          url: "/dashboard",
          tag: `remind-${task.id}`,
        }),
      );
    }
    if (ch.reached()) sent++;
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

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function listBody(titles: string[]): string {
  const shown = titles.slice(0, 3).map((t) => (t.length > 50 ? `${t.slice(0, 49)}…` : t));
  const rest = titles.length - shown.length;
  return shown.join(" · ") + (rest > 0 ? ` и ещё ${rest}` : "");
}
