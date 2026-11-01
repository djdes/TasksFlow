// Очередь вебхуков, журнал аудита, сброс отрицательных балансов.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { db } from "../db";
import {
  requireAuth,
  requireAdmin,
  requireAdminOrApiKey,
  requireAuthOrApiKey,
  getCompanyIdFromReq,
} from "./common";

export function registerAdminToolRoutes(app: Express): void {
  // ===================== WEBHOOK QUEUE DASHBOARD =====================
  // Видимая статистика очереди отложенных доставок (см. webhook-queue.ts).
  // Без этого админ не знает «у нас что-то завязло» — данные сотрудников
  // могут лежать пол-дня и никто не заметит.
  app.get(
    "/api/admin/webhook-queue/stats",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        // Multi-tenant scope: webhookDeliveries не имеет companyId,
        // только taskId. Раньше: возвращали ВСЕ deliveries из ВСЕХ
        // компаний — admin компании A видел ошибки доставок компании B
        // (включая targetUrl и apiKey-prefix в lastError). Теперь
        // сначала собираем taskIds компании, потом фильтруем deliveries.
        const adminCompanyId = await getCompanyIdFromReq(req);
        if (adminCompanyId === null) {
          return res.json({
            stats: { pending: 0, delivered: 0, failed: 0, cancelled: 0 },
            recentFailed: [],
          });
        }

        const { db } = await import("../db");
        const { webhookDeliveries, tasks: tasksTable } = await import("@shared/schema");
        const { sql, eq, and, inArray, desc } = await import("drizzle-orm");

        // Список taskIds компании (limit для perf — обычно их немного,
        // но огромная org может иметь 10к+).
        const myTasks = await db
          .select({ id: tasksTable.id })
          .from(tasksTable)
          .where(eq(tasksTable.companyId, adminCompanyId));
        const myTaskIds = myTasks.map((t) => t.id);
        if (myTaskIds.length === 0) {
          return res.json({
            stats: { pending: 0, delivered: 0, failed: 0, cancelled: 0 },
            recentFailed: [],
          });
        }

        const rows = await db
          .select({
            status: webhookDeliveries.status,
            count: sql<number>`count(*)`,
          })
          .from(webhookDeliveries)
          .where(inArray(webhookDeliveries.taskId, myTaskIds))
          .groupBy(webhookDeliveries.status);
        const stats = { pending: 0, delivered: 0, failed: 0, cancelled: 0 };
        for (const r of rows) {
          if (r.status === 0) stats.pending = Number(r.count);
          else if (r.status === 1) stats.delivered = Number(r.count);
          else if (r.status === 2) stats.failed = Number(r.count);
          else if (r.status === 3) stats.cancelled = Number(r.count);
        }
        // Top-N последних failed — только для своей компании.
        const recentFailed = await db
          .select()
          .from(webhookDeliveries)
          .where(
            and(
              eq(webhookDeliveries.status, 2),
              inArray(webhookDeliveries.taskId, myTaskIds)
            )
          )
          .orderBy(desc(webhookDeliveries.updatedAt))
          .limit(20);
        res.json({
          stats,
          recentFailed: recentFailed.map((d) => ({
            id: d.id,
            taskId: d.taskId,
            eventType: d.eventType,
            attempts: d.attempts,
            lastError: d.lastError,
            updatedAt: d.updatedAt,
          })),
        });
      } catch (err) {
        // Если таблицы ещё нет (миграция не прогнана) — возвращаем
        // пустую статистику + флаг, чтобы UI показал «миграция не
        // прогнана» вместо красного error-стейта.
        const message = err instanceof Error ? err.message : String(err);
        const tableMissing = /webhook_deliveries.*doesn'?t exist|Unknown table/i.test(
          message,
        );
        if (tableMissing) {
          return res.json({
            stats: { pending: 0, delivered: 0, failed: 0, cancelled: 0 },
            recentFailed: [],
            migrationNeeded: true,
          });
        }
        console.error("[webhook-queue-stats] failed", err);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    },
  );

  /**
   * GET /api/audit — Phase 2.10 спека Wesetup
   * (docs/superpowers/specs/2026-05-09-wesetup-tasksflow-integration-design.md, П-17).
   *
   * Возвращает audit-events за период, отфильтрованные по company.
   * Wesetup при рендере объединённого audit-report'а merge'ит эти
   * события с собственным AuditLog'ом по timestamp'у.
   *
   * Query params:
   *   - since (Unix sec, optional, default = now - 30d)
   *   - taskIds (comma-separated, optional — узкий filter для документа)
   *   - limit (default 500, max 5000)
   *
   * Multi-tenant safety: companyId берётся из API key или session-юзера,
   * caller не может его передавать — гарантия что org A не видит events org B.
   */
  app.get("/api/audit", requireAuthOrApiKey, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (companyId === null) {
        return res.status(403).json({ message: "Multi-tenant scope required" });
      }

      const sinceParam = req.query.since;
      const since =
        typeof sinceParam === "string"
          ? Number(sinceParam) || undefined
          : undefined;

      const taskIdsParam = req.query.taskIds;
      const taskIds =
        typeof taskIdsParam === "string"
          ? taskIdsParam
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isInteger(n) && n > 0)
          : undefined;

      const limitParam = req.query.limit;
      const limit =
        typeof limitParam === "string" ? Number(limitParam) || undefined : undefined;

      const { listAudit } = await import("../audit-log");
      const events = await listAudit({
        companyId,
        since,
        taskIds,
        limit,
      });

      res.json({ events, count: events.length });
    } catch (err) {
      console.error("[audit] list failed", err);
      res.status(500).json({ message: "Ошибка чтения audit log" });
    }
  });

  /**
   * POST /api/admin/reset-negative-balances
   *
   * Hot-fix endpoint: обнуляет отрицательные bonus_balance у workers
   * текущей компании. Background — bug до commit ef3e8ec: sibling-claimed
   * task'и при удалении уводили чужой balance в минус. После fix новые
   * случаи невозможны, но накопленные negative значения в БД остаются.
   *
   * Auth: API key (Wesetup admin) или session admin.
   * Multi-tenant: трогает только users текущей компании (companyId
   * из API key или session).
   * SAFE: только negative → 0. Положительные не трогаются.
   * Идемпотентно — повторный POST = no-op.
   *
   * Returns: { reset: <count>, users: [{id,phone,name,wasBalance}] }
   */
  app.post(
    "/api/admin/reset-negative-balances",
    requireAdminOrApiKey,
    async (req, res) => {
      try {
        const companyId = await getCompanyIdFromReq(req);
        if (companyId === null) {
          return res.status(403).json({ message: "Multi-tenant scope required" });
        }

        const { users: usersTable } = await import("@shared/schema");
        const { eq, and, lt } = await import("drizzle-orm");

        // Найти всех у кого balance < 0 в этой компании.
        const affected = await db
          .select({
            id: usersTable.id,
            phone: usersTable.phone,
            name: usersTable.name,
            wasBalance: usersTable.bonusBalance,
          })
          .from(usersTable)
          .where(
            and(eq(usersTable.companyId, companyId), lt(usersTable.bonusBalance, 0)),
          );

        if (affected.length === 0) {
          return res.json({ reset: 0, users: [] });
        }

        // Обнулить negative.
        await db
          .update(usersTable)
          .set({ bonusBalance: 0 })
          .where(
            and(eq(usersTable.companyId, companyId), lt(usersTable.bonusBalance, 0)),
          );

        console.log(
          `[reset-balances] company=${companyId} reset ${affected.length} negative balances`,
        );
        res.json({ reset: affected.length, users: affected });
      } catch (err) {
        console.error("[reset-balances] failed", err);
        res.status(500).json({ message: "Ошибка сброса балансов" });
      }
    },
  );
}
