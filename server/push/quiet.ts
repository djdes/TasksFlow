/**
 * Тихие часы: ночью уведомления не будят, а ждут утра.
 *
 *   soonOrMorning() — новые задачи и «ждёт проверки»: днём — как раньше,
 *                     со склейкой за 15 с; ночью — в очередь push_deferred;
 *   nowOrMorning()  — готовое сообщение (вернули, приняли, оплата);
 *   flushDeferred() — раз в минуту из daily-scheduler: у кого ночь
 *                     кончилась, тем разослать накопленное, склеив
 *                     однотипное и выбросив неактуальное (задачу уже
 *                     сделали, приняли или удалили).
 *
 * Ночь — с companies.notify_settings.quietFrom до утренней сводки
 * (shared/notify.ts). Напоминания по расписанию сюда не попадают: их время
 * компания выбрала сама. Письма тоже уходят сразу — они не звенят.
 *
 * Очередь — таблица, а не память: деплой или рестарт ночью ничего не теряет.
 * Нет таблицы (миграция не прошла) — уведомления уходят сразу, как раньше.
 */
import { asc, eq } from "drizzle-orm";
import type { Task } from "@shared/schema";
import { pushDeferred, type PushDeferredRow } from "@shared/schema";
import type { PushMessage } from "@shared/push";
import { minutesInZone, zoneOrDefault } from "@shared/day";
import { isQuietTime, parseNotifySettings } from "@shared/notify";
import { db } from "../db";
import { logger } from "../logger";
import { storage } from "../storage";
import { awaitingReviewMessage, newTasksMessage, notifySoon, sendInBackground } from "./index";

export type DeferredKind = "new-task" | "review" | "message";

export type DeferredEntry = {
  companyId: number;
  userId: number;
  kind: DeferredKind;
  taskId?: number | null;
  item: string;
  message?: PushMessage | null;
};

export interface DeferStore {
  add(entry: DeferredEntry, now: number): Promise<void>;
  list(): Promise<PushDeferredRow[]>;
  /** Забрать строку себе (DELETE): false — её уже забрал другой тик. */
  claim(id: number): Promise<boolean>;
}

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return header && typeof header === "object" && "affectedRows" in header
    ? Number((header as { affectedRows: number }).affectedRows)
    : 0;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const deferStore: DeferStore = {
  async add(entry, now) {
    await db.insert(pushDeferred).values({
      companyId: entry.companyId,
      userId: entry.userId,
      kind: entry.kind,
      taskId: entry.taskId ?? null,
      item: clip(entry.item, 255),
      message: entry.message ? JSON.stringify(entry.message) : null,
      createdAt: now,
    });
  },
  list: () => db.select().from(pushDeferred).orderBy(asc(pushDeferred.id)).limit(5000),
  async claim(id) {
    return affected(await db.delete(pushDeferred).where(eq(pushDeferred.id, id))) === 1;
  },
};

// ---------------------------------------------------------------------------
// Ночь ли сейчас у компании

export type CompanyClock = { timezone: string | null; notifySettings: string | null };

export function quietAt(company: CompanyClock, now: number): boolean {
  const settings = parseNotifySettings(company.notifySettings);
  return isQuietTime(settings, minutesInZone(now, zoneOrDefault(company.timezone)));
}

// Настройки компании меняются редко, а события идут пачками (синхронизация
// WeSetup ставит десятки задач) — минута кэша экономит запросы.
const CLOCK_TTL_MS = 60_000;
const clocks = new Map<number, { at: number; clock: CompanyClock | null }>();

async function companyClock(companyId: number): Promise<CompanyClock | null> {
  const hit = clocks.get(companyId);
  if (hit && Date.now() - hit.at < CLOCK_TTL_MS) return hit.clock;
  const company = await storage.getCompanyById(companyId);
  const clock = company ? { timezone: company.timezone ?? null, notifySettings: company.notifySettings ?? null } : null;
  clocks.set(companyId, { at: Date.now(), clock });
  return clock;
}

/** Для тестов и после сохранения расписания. */
export function forgetCompanyClock(companyId?: number) {
  if (companyId === undefined) clocks.clear();
  else clocks.delete(companyId);
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** Ошибка БД — считаем, что день: лучше разбудить, чем потерять уведомление. */
export async function isQuietFor(companyId: number | null | undefined, now: number = nowSec()): Promise<boolean> {
  if (!companyId) return false;
  try {
    const clock = await companyClock(companyId);
    return !!clock && quietAt(clock, now);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Отправить или отложить

export type QuietDeps = {
  isQuiet: (companyId: number | null | undefined) => Promise<boolean>;
  store: DeferStore;
  soon: typeof notifySoon;
  send: (userIds: number[], message: PushMessage) => void;
  now: () => number;
};

const defaultQuietDeps = (): QuietDeps => ({ isQuiet: isQuietFor, store: deferStore, soon: notifySoon, send: sendInBackground, now: nowSec });

let warnedNoTable = false;

async function tryDefer(deps: QuietDeps, entry: DeferredEntry): Promise<boolean> {
  try {
    await deps.store.add(entry, deps.now());
    return true;
  } catch (err) {
    if (!warnedNoTable) {
      warnedNoTable = true;
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[push] очередь до утра недоступна — шлём сразу");
    }
    return false;
  }
}

/** Новые задачи и «ждёт проверки»: днём — со склейкой, ночью — до утра. */
export async function soonOrMorning(
  kind: "new-task" | "review",
  task: Pick<Task, "id" | "companyId">,
  userId: number,
  item: string,
  deps: QuietDeps = defaultQuietDeps(),
): Promise<"sent" | "deferred"> {
  if (task.companyId && (await deps.isQuiet(task.companyId))) {
    if (await tryDefer(deps, { companyId: task.companyId, userId, kind, taskId: task.id, item })) return "deferred";
  }
  deps.soon(kind, userId, item, kind === "new-task" ? newTasksMessage : awaitingReviewMessage);
  return "sent";
}

/** Готовое сообщение: днём — сразу, ночью — до утра. */
export async function nowOrMorning(
  companyId: number | null | undefined,
  userIds: number[],
  message: PushMessage,
  taskId: number | null = null,
  deps: QuietDeps = defaultQuietDeps(),
): Promise<"sent" | "deferred"> {
  if (companyId && userIds.length > 0 && (await deps.isQuiet(companyId))) {
    const failed: number[] = [];
    for (const userId of userIds) {
      if (!(await tryDefer(deps, { companyId, userId, kind: "message", taskId, item: message.title, message }))) failed.push(userId);
    }
    if (failed.length === 0) return "deferred";
    deps.send(failed, message);
    return "sent";
  }
  deps.send(userIds, message);
  return "sent";
}

// ---------------------------------------------------------------------------
// Утром: разослать накопленное

/** Старше суток — уже не новость (например, ночь растянулась из-за настроек). */
export const DEFERRED_MAX_AGE_SEC = 24 * 3600;
/** Больше готовых сообщений одному человеку за раз не шлём — остальное в кабинете. */
const MAX_MESSAGES_PER_USER = 5;

function parseMessage(raw: string | null): PushMessage | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    return m && typeof m.title === "string" && typeof m.body === "string" && typeof m.url === "string" ? (m as PushMessage) : null;
  } catch {
    return null;
  }
}

/**
 * Что отправить утром каждому: однотипное склеено, неактуальное выброшено.
 * tasks = null — задачи не загрузились: шлём как есть, без проверки.
 */
export function morningMessages(rows: PushDeferredRow[], tasks: Task[] | null): Array<{ userId: number; message: PushMessage }> {
  const byId = tasks ? new Map(tasks.map((t) => [t.id, t])) : null;
  const fresh = (row: PushDeferredRow) => {
    if (row.kind === "message" || row.taskId == null || !byId) return true;
    const task = byId.get(row.taskId);
    if (!task) return false; // удалили
    if (row.kind === "new-task") return !task.isCompleted && task.workerId === row.userId;
    if (row.kind === "review") return task.verificationStatus === "submitted";
    return true;
  };

  const users = new Map<number, { newTasks: string[]; review: string[]; messages: PushMessage[] }>();
  for (const row of rows) {
    if (!fresh(row)) continue;
    const bucket = users.get(row.userId) ?? { newTasks: [], review: [], messages: [] };
    users.set(row.userId, bucket);
    if (row.kind === "new-task") bucket.newTasks.push(row.item);
    else if (row.kind === "review") bucket.review.push(row.item);
    else {
      const message = parseMessage(row.message);
      if (!message) continue;
      // Одинаковый tag на устройстве всё равно заменит прошлое — шлём последнее.
      const same = message.tag ? bucket.messages.findIndex((m) => m.tag === message.tag) : -1;
      if (same >= 0) bucket.messages.splice(same, 1);
      bucket.messages.push(message);
    }
  }

  const out: Array<{ userId: number; message: PushMessage }> = [];
  for (const [userId, b] of Array.from(users.entries())) {
    if (b.newTasks.length > 0) out.push({ userId, message: newTasksMessage(b.newTasks) });
    if (b.review.length > 0) out.push({ userId, message: awaitingReviewMessage(b.review) });
    for (const message of b.messages.slice(-MAX_MESSAGES_PER_USER)) out.push({ userId, message });
  }
  return out;
}

export type FlushDeps = {
  store: DeferStore;
  listCompanies: () => Promise<Array<{ id: number } & CompanyClock>>;
  getTasks: (companyId: number) => Promise<Task[]>;
  push: (userId: number, message: PushMessage) => Promise<unknown>;
};

export type FlushRun = { companyId: number; sent: number; dropped: number };

export async function flushDeferred(deps: FlushDeps, now: number): Promise<FlushRun[]> {
  const rows = await deps.store.list();
  if (rows.length === 0) return [];
  const byCompany = new Map<number, PushDeferredRow[]>();
  for (const row of rows) byCompany.set(row.companyId, [...(byCompany.get(row.companyId) ?? []), row]);
  const companies = new Map((await deps.listCompanies()).map((c) => [c.id, c]));

  const runs: FlushRun[] = [];
  for (const [companyId, list] of Array.from(byCompany.entries())) {
    const company = companies.get(companyId);
    const night = company ? quietAt(company, now) : false;
    let dropped = 0;
    const ready: PushDeferredRow[] = [];
    for (const row of list) {
      const stale = now - row.createdAt > DEFERRED_MAX_AGE_SEC;
      if (!stale && night) continue; // ещё ночь — ждём
      // Забираем до отправки: второй процесс или следующий тик не продублируют.
      if (!(await deps.store.claim(row.id).catch(() => false))) continue;
      if (stale) dropped++;
      else ready.push(row);
    }
    if (ready.length === 0) {
      if (dropped > 0) runs.push({ companyId, sent: 0, dropped });
      continue;
    }
    const needTasks = ready.some((r) => r.kind !== "message" && r.taskId != null);
    const tasks = needTasks ? await deps.getTasks(companyId).catch(() => null) : [];
    let sent = 0;
    for (const { userId, message } of morningMessages(ready, tasks)) {
      try {
        await deps.push(userId, message);
        sent++;
      } catch {
        // одно устройство не должно остановить остальных
      }
    }
    runs.push({ companyId, sent, dropped });
  }
  return runs;
}
