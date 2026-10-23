/**
 * Ежедневный сброс повторяющихся задач — с историей вместо удаления.
 *
 * Было (script/reset-recurring-tasks.ts до 10.2026): в полночь сервера
 * выполненные задачи становились невыполненными, а их фото удалялись
 * с диска — от вчерашней смены не оставалось ничего. Заодно задачи с
 * проверяющим навсегда застревали в verification_status='approved'
 * (повторно отправить на проверку было нельзя), а «Сделано другими»
 * не очищалось.
 *
 * Стало:
 *   • сброс в местную полночь компании (companies.timezone);
 *   • перед сбросом задача уходит в task_history: done/claimed со
 *     снимком фото, чек-листа и проверки, missed — если была в
 *     расписании и не выполнена;
 *   • файлы фото остаются на диске (удаляет их только опциональный
 *     PHOTO_RETENTION_DAYS, см. photo-retention.ts);
 *   • сбрасываются и поля проверки/«забрал коллега».
 *
 * Компания сбрасывается один раз за местный день: атомарная «заявка»
 * на companies.last_reset_day, так что тик планировщика, cron-скрипт и
 * несколько процессов не сбросят дважды. Если сброс упал — заявка
 * откатывается и следующий тик повторит (история идемпотентна по
 * (task_id, day), сброс трогает только выполненное до полуночи).
 */

import type { ChecklistItem, InsertTaskHistory, Task } from "@shared/schema";
import {
  dayInZone,
  dayOfMonth,
  dayOfWeek,
  shiftDay,
  startOfDayInZone,
  zoneOrDefault,
} from "@shared/day";
import { isTaskVisibleOn } from "@shared/task-visibility";

export type ResetTask = Pick<
  Task,
  | "id"
  | "title"
  | "workerId"
  | "companyId"
  | "category"
  | "price"
  | "isRecurring"
  | "isCompleted"
  | "completedAt"
  | "createdAt"
  | "photoUrl"
  | "photoUrls"
  | "checklist"
  | "claimedByWorkerId"
  | "verificationStatus"
  | "verifiedByUserId"
  | "verifiedAt"
  | "weekDays"
  | "monthDay"
  | "dueDate"
>;

export type ChecklistReset = { id: number; checklist: ChecklistItem[] };

export type ResetPlan = {
  history: InsertTaskHistory[];
  /** Выполненные до местной полуночи — их возвращаем в «не выполнено». */
  resetIds: number[];
  /** Прогресс чек-листа обнуляем (заголовки остаются). */
  checklistResets: ChecklistReset[];
};

function photosOf(task: ResetTask): string[] {
  if (task.photoUrls && task.photoUrls.length > 0) return task.photoUrls;
  return task.photoUrl ? [task.photoUrl] : [];
}

function hasChecklistProgress(items: ChecklistItem[] | null | undefined): items is ChecklistItem[] {
  return !!items && items.some((it) => it.done || (it.photoUrls?.length ?? 0) > 0);
}

/**
 * План сброса задач одной компании в момент now. Ничего не пишет —
 * только решает, что заархивировать и что сбросить.
 *
 * today — местный день, который начался (сброс «закрывает» вчера).
 */
export function planDailyReset(
  tasks: readonly ResetTask[],
  opts: { tz: string; today: string; now: number },
): ResetPlan {
  const tz = zoneOrDefault(opts.tz);
  const yesterday = shiftDay(opts.today, -1);
  const todayStart = startOfDayInZone(opts.today, tz);
  const dow = dayOfWeek(yesterday);
  const dom = dayOfMonth(yesterday);
  const plan: ResetPlan = { history: [], resetIds: [], checklistResets: [] };

  for (const task of tasks) {
    if (!task.isRecurring) continue;
    const base = {
      taskId: task.id,
      companyId: task.companyId ?? null,
      workerId: task.workerId ?? null,
      title: task.title,
      category: task.category ?? null,
      createdAt: opts.now,
    };

    if (task.isCompleted) {
      // Выполнено уже после полуночи (сброс запоздал) — это сегодняшняя
      // работа, её не трогаем.
      if (task.completedAt && task.completedAt >= todayStart) continue;
      const photos = photosOf(task);
      const claimed = task.claimedByWorkerId != null;
      plan.history.push({
        ...base,
        day: task.completedAt ? dayInZone(task.completedAt, tz) : yesterday,
        status: claimed ? "claimed" : "done",
        price: claimed ? 0 : task.price ?? 0,
        completedAt: task.completedAt ?? null,
        photoUrls: photos.length > 0 ? JSON.stringify(photos) : null,
        checklist: task.checklist && task.checklist.length > 0 ? JSON.stringify(task.checklist) : null,
        claimedByWorkerId: task.claimedByWorkerId ?? null,
        verificationStatus: task.verificationStatus ?? null,
        verifiedByUserId: task.verifiedByUserId ?? null,
        verifiedAt: task.verifiedAt ?? null,
      });
      plan.resetIds.push(task.id);
      if (hasChecklistProgress(task.checklist)) {
        plan.checklistResets.push(checklistReset(task.id, task.checklist));
      }
      continue;
    }

    // Отправлено на проверку — работа сделана, ждёт проверяющего.
    // Не пропуск и не сбрасываем: после «Принять» уйдёт в историю.
    if (task.verificationStatus === "submitted") continue;

    const wasScheduled =
      task.workerId != null &&
      (task.createdAt ?? 0) < todayStart &&
      task.dueDate == null &&
      isTaskVisibleOn({ weekDays: task.weekDays, monthDay: task.monthDay }, dow, dom);
    if (wasScheduled) {
      plan.history.push({
        ...base,
        day: yesterday,
        status: "missed",
        price: 0,
        completedAt: null,
        photoUrls: null,
        // Частичный прогресс чек-листа показываем как «3 из 5».
        checklist: hasChecklistProgress(task.checklist) ? JSON.stringify(task.checklist) : null,
        claimedByWorkerId: null,
        verificationStatus: null,
        verifiedByUserId: null,
        verifiedAt: null,
      });
    }
    if (hasChecklistProgress(task.checklist)) {
      plan.checklistResets.push(checklistReset(task.id, task.checklist));
    }
  }
  return plan;
}

function checklistReset(id: number, items: ChecklistItem[]): ChecklistReset {
  return { id, checklist: items.map((it) => ({ ...it, done: false, photoUrls: [] })) };
}

// ---------------------------------------------------------------------------

export type ResetCompany = { id: number; timezone: string | null; lastResetDay: string | null };

/** Всё, что сбросу нужно от БД. Реализация — server/task-history-store.ts. */
export interface ResetStore {
  listCompanies(): Promise<ResetCompany[]>;
  /** Атомарно: last_reset_day from → to. false — кто-то успел раньше. */
  claimCompanyDay(companyId: number, from: string | null, to: string): Promise<boolean>;
  /** Откат заявки после ошибки, чтобы следующий тик повторил сброс. */
  releaseCompanyDay(companyId: number, claimed: string, previous: string | null): Promise<void>;
  /** Повторяющиеся задачи компании; null — задачи без компании (legacy). */
  getRecurringTasks(companyId: number | null): Promise<ResetTask[]>;
  /** INSERT IGNORE по (task_id, day). */
  insertHistory(rows: InsertTaskHistory[]): Promise<number>;
  /** Сброс выполненных до beforeSec. Возвращает число строк. */
  resetCompleted(ids: number[], beforeSec: number): Promise<number>;
  /** Обнуляет прогресс чек-листа (заголовки и id пунктов остаются). */
  resetChecklist(id: number, checklist: ChecklistItem[]): Promise<void>;
}

export type ResetSummary = { companyId: number | null; day: string; archived: number; reset: number; missed: number };

export async function resetTasksOf(
  store: ResetStore,
  companyId: number | null,
  tz: string,
  today: string,
  now: number,
): Promise<ResetSummary> {
  const tasks = await store.getRecurringTasks(companyId);
  const plan = planDailyReset(tasks, { tz, today, now });
  const archived = await store.insertHistory(plan.history);
  const reset = await store.resetCompleted(plan.resetIds, startOfDayInZone(today, zoneOrDefault(tz)));
  for (const c of plan.checklistResets) {
    await store.resetChecklist(c.id, c.checklist);
  }
  return {
    companyId,
    day: shiftDay(today, -1),
    archived,
    reset,
    missed: plan.history.filter((h) => h.status === "missed").length,
  };
}

/**
 * Сбросить компании, у которых наступил новый местный день.
 * includeLegacy — ещё и задачи без компании (их сбрасывает только
 * cron-скрипт: для них нет строки, где хранить день сброса).
 */
export async function runDueResets(
  store: ResetStore,
  now: number = Math.floor(Date.now() / 1000),
  opts: { includeLegacy?: boolean; onError?: (companyId: number | null, err: unknown) => void } = {},
): Promise<ResetSummary[]> {
  const done: ResetSummary[] = [];
  for (const company of await store.listCompanies()) {
    const tz = zoneOrDefault(company.timezone);
    const today = dayInZone(now, tz);
    if (company.lastResetDay === null) {
      // Первый запуск после миграции или новая компания: запоминаем
      // «сегодня» без сброса — иначе выкладка днём обнулила бы смену.
      await store.claimCompanyDay(company.id, null, today);
      continue;
    }
    if (company.lastResetDay >= today) continue;
    if (!(await store.claimCompanyDay(company.id, company.lastResetDay, today))) continue;
    try {
      done.push(await resetTasksOf(store, company.id, tz, today, now));
    } catch (err) {
      await store.releaseCompanyDay(company.id, today, company.lastResetDay).catch(() => {});
      opts.onError?.(company.id, err);
    }
  }
  if (opts.includeLegacy) {
    const tz = zoneOrDefault(null);
    try {
      done.push(await resetTasksOf(store, null, tz, dayInZone(now, tz), now));
    } catch (err) {
      opts.onError?.(null, err);
    }
  }
  return done;
}
