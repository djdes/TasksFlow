import "dotenv/config";
import { db } from "../server/db";

/**
 * Phase 2.10 спека Wesetup
 * (docs/superpowers/specs/2026-05-09-wesetup-tasksflow-integration-design.md, П-17).
 *
 * Создаёт таблицу `audit_log` для записи task lifecycle events.
 * Идемпотентно — safe to re-run.
 *
 * Действия (action) пишутся в /api/tasks routes:
 *   - "task.created", "task.updated", "task.deleted"
 *   - "task.completed", "task.uncompleted"
 *   - "task.claimed_by_other" (claim-siblings auto)
 *   - "task.verified", "task.rejected"
 *
 * Wesetup при рендере объединённого audit-report'а подтягивает события
 * через GET /api/audit?since=...&taskIds=... и merge'ит хронологически.
 *
 * Retention: 90 дней (отдельный cron-cleanup в будущем).
 */
async function main() {
  try {
    await db.execute(`
      CREATE TABLE audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NULL,
        actor_worker_id INT NULL,
        task_id INT NULL,
        action VARCHAR(64) NOT NULL,
        payload TEXT NULL,
        created_at INT NOT NULL DEFAULT 0
      )
    `);
    console.log("[migrate] created table audit_log");
  } catch (err: any) {
    if (err?.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("[migrate] table audit_log already exists, skipping");
    } else {
      throw err;
    }
  }

  // Indexes для частых запросов:
  //   - WHERE company_id = X AND created_at > N (мульти-тенант фильтр)
  //   - WHERE task_id IN (...) (rendering объединённой ленты для документа)
  for (const sql of [
    "CREATE INDEX idx_audit_company_created ON audit_log(company_id, created_at)",
    "CREATE INDEX idx_audit_task ON audit_log(task_id)",
  ]) {
    try {
      await db.execute(sql);
      console.log(`[migrate] created index: ${sql.match(/idx_\w+/)?.[0]}`);
    } catch (err: any) {
      if (err?.code === "ER_DUP_KEYNAME") {
        console.log(`[migrate] index already exists, skipping`);
      } else {
        throw err;
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
