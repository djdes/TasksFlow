import { db } from "./db";
import { auditLog } from "@shared/schema";
import { eq, and, gt, inArray, desc } from "drizzle-orm";

/**
 * Audit log helper для TasksFlow.
 * Phase 2.10 спека Wesetup
 * (docs/superpowers/specs/2026-05-09-wesetup-tasksflow-integration-design.md, П-17).
 *
 * Лёгкая обёртка над `audit_log` таблицей — caller передаёт
 * companyId/actorWorkerId/taskId/action/payload, helper сериализует
 * payload в JSON и делает INSERT.
 *
 * Best-effort: ошибки записи логируются в console, но НЕ пробрасываются —
 * audit log это observability, не critical path. Падение DB здесь
 * не должно валить /complete или /create handler.
 */

export type AuditAction =
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "task.completed"
  | "task.uncompleted"
  | "task.claimed_by_other"
  | "task.verified"
  | "task.rejected"
  | "task.photo_uploaded"
  | "task.photo_deleted";

export type RecordAuditArgs = {
  /** Multi-tenant scope. NULL = system-wide event. */
  companyId: number | null;
  /** Кто инициировал. NULL = system action (cron, claim-siblings auto). */
  actorWorkerId: number | null;
  /** Таска, к которой относится событие. NULL для bulk events. */
  taskId: number | null;
  action: AuditAction;
  /** Произвольный JSON details — будет stringify'нут. */
  payload?: Record<string, unknown> | null;
};

/**
 * Запись audit-event'а. Best-effort — не валим caller на error.
 */
export async function recordAudit(args: RecordAuditArgs): Promise<void> {
  try {
    const payloadStr = args.payload ? JSON.stringify(args.payload) : null;
    await db.insert(auditLog).values({
      companyId: args.companyId,
      actorWorkerId: args.actorWorkerId,
      taskId: args.taskId,
      action: args.action,
      payload: payloadStr,
      createdAt: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    console.error("[audit] failed to record", args.action, err);
  }
}

/**
 * Чтение audit-events для объединённого отчёта Wesetup.
 *
 * Фильтры:
 *   - companyId — обязательный (multi-tenant safety, П-18).
 *   - since — Unix sec нижняя граница (default: now - 30d).
 *   - taskIds — конкретные tasks (если caller знает что искать).
 *   - limit — max количество записей (default 500, max 5000).
 */
export async function listAudit(args: {
  companyId: number;
  since?: number;
  taskIds?: number[];
  limit?: number;
}): Promise<
  Array<{
    id: number;
    companyId: number | null;
    actorWorkerId: number | null;
    taskId: number | null;
    action: string;
    payload: unknown;
    createdAt: number;
  }>
> {
  const limit = Math.min(args.limit ?? 500, 5000);
  const since = args.since ?? Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  const conditions = [
    eq(auditLog.companyId, args.companyId),
    gt(auditLog.createdAt, since),
  ];
  if (args.taskIds && args.taskIds.length > 0) {
    conditions.push(inArray(auditLog.taskId, args.taskIds));
  }

  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    actorWorkerId: r.actorWorkerId,
    taskId: r.taskId,
    action: r.action,
    payload: r.payload ? safeJsonParse(r.payload) : null,
    createdAt: r.createdAt,
  }));
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
