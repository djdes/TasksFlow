import { and, asc, between, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { unlink } from "fs/promises";
import { companies, taskHistory, tasks, type ChecklistItem, type TaskHistoryRow } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { resolveUploadAbs } from "./uploads-paths";
import type { ResetStore } from "./services/daily-reset";

/** affectedRows из ответа mysql2, как бы drizzle его ни обернул. */
function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return header && typeof header === "object" && "affectedRows" in header
    ? Number((header as { affectedRows: number }).affectedRows)
    : 0;
}

export const resetStore: ResetStore = {
  async listCompanies() {
    return db
      .select({ id: companies.id, timezone: companies.timezone, lastResetDay: companies.lastResetDay })
      .from(companies);
  },

  async claimCompanyDay(companyId, from, to) {
    const result = await db
      .update(companies)
      .set({ lastResetDay: to })
      .where(
        and(
          eq(companies.id, companyId),
          from === null ? isNull(companies.lastResetDay) : eq(companies.lastResetDay, from),
        ),
      );
    return affected(result) === 1;
  },

  async releaseCompanyDay(companyId, claimed, previous) {
    await db
      .update(companies)
      .set({ lastResetDay: previous })
      .where(and(eq(companies.id, companyId), eq(companies.lastResetDay, claimed)));
  },

  getRecurringTasks: (companyId) => storage.getRecurringTasks(companyId),

  async insertHistory(rows) {
    let inserted = 0;
    // Пачками: у большой компании сотни задач, один INSERT на всё — лишний риск.
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      inserted += affected(await db.insert(taskHistory).ignore().values(chunk));
    }
    return inserted;
  },

  async resetCompleted(ids, beforeSec) {
    if (ids.length === 0) return 0;
    const result = await db
      .update(tasks)
      .set({
        isCompleted: false,
        completedAt: null,
        photoUrl: null,
        photoUrls: null,
        claimedByWorkerId: null,
        // Задача с проверяющим снова ждёт выполнения; без — как раньше.
        verificationStatus: sql`CASE WHEN ${tasks.verifierWorkerId} IS NULL THEN NULL ELSE 'pending' END`,
        verifiedByUserId: null,
        verifiedAt: null,
        rejectReason: null,
        submittedValues: null,
      })
      .where(
        and(
          inArray(tasks.id, ids),
          eq(tasks.isCompleted, true),
          eq(tasks.isRecurring, true),
          // Перевыполнили уже после полуночи — это сегодняшняя работа.
          or(isNull(tasks.completedAt), lt(tasks.completedAt, beforeSec)),
        ),
      );
    return affected(result);
  },

  async resetChecklist(id, checklist) {
    await db.update(tasks).set({ checklist: JSON.stringify(checklist) }).where(eq(tasks.id, id));
  },
};

// ---------------------------------------------------------------------------

export type HistoryQuery = {
  companyId: number;
  from: string;
  to: string;
  /** null — все сотрудники компании. */
  workerIds: number[] | null;
};

export async function listHistory(q: HistoryQuery): Promise<TaskHistoryRow[]> {
  if (q.workerIds && q.workerIds.length === 0) return [];
  return db
    .select()
    .from(taskHistory)
    .where(
      and(
        eq(taskHistory.companyId, q.companyId),
        between(taskHistory.day, q.from, q.to),
        q.workerIds ? inArray(taskHistory.workerId, q.workerIds) : undefined,
      ),
    )
    .orderBy(asc(taskHistory.day), asc(taskHistory.completedAt), asc(taskHistory.id))
    .limit(20_000);
}

// ---------------------------------------------------------------------------

/**
 * PHOTO_RETENTION_DAYS (необязательно): фото в истории старше N дней
 * удаляются с диска, сама запись истории остаётся. Не задано — фото
 * хранятся бессрочно: пользователи просили не терять вчерашние смены.
 */
export function photoRetentionDays(env: NodeJS.ProcessEnv = process.env): number | null {
  const n = Number(env.PHOTO_RETENTION_DAYS);
  return Number.isInteger(n) && n >= 7 ? n : null;
}

async function unlinkQuiet(url: string): Promise<void> {
  const abs = resolveUploadAbs(url);
  if (!abs) return;
  try {
    await unlink(abs);
  } catch (err: any) {
    if (err?.code !== "ENOENT") console.error("[history] unlink failed", abs, err?.message);
  }
}

export async function pruneHistoryPhotos(days: number, now: number = Math.floor(Date.now() / 1000)): Promise<number> {
  const cutoff = now - days * 86_400;
  const rows = await db
    .select({ id: taskHistory.id, photoUrls: taskHistory.photoUrls, checklist: taskHistory.checklist })
    .from(taskHistory)
    .where(
      and(
        lt(taskHistory.createdAt, cutoff),
        or(isNotNull(taskHistory.photoUrls), sql`${taskHistory.checklist} LIKE '%/uploads/%'`),
      ),
    )
    .limit(500);
  for (const row of rows) {
    const photos: string[] = row.photoUrls ? safeArray(row.photoUrls) : [];
    const items = row.checklist ? (safeArray(row.checklist) as ChecklistItem[]) : [];
    for (const url of photos) await unlinkQuiet(url);
    for (const item of items) for (const url of item?.photoUrls ?? []) await unlinkQuiet(url);
    await db
      .update(taskHistory)
      .set({
        photoUrls: null,
        checklist: items.length > 0 ? JSON.stringify(items.map((it) => ({ ...it, photoUrls: [] }))) : null,
      })
      .where(eq(taskHistory.id, row.id));
  }
  return rows.length;
}

function safeArray(json: string): any[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

