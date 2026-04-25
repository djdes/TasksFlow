import "dotenv/config";
import { db } from "../server/db";

/**
 * Adds `users.managed_worker_ids` (TEXT, JSON array) so TasksFlow can
 * mirror WeSetup's ManagerScope. Идемпотентная миграция, безопасно
 * запускать в каждом деплое — ловим ER_DUP_FIELDNAME и пропускаем.
 *
 * Источник истины — WeSetup (см. /api/integrations/tasksflow/sync-hierarchy
 * на стороне WeSetup). Эта колонка NULLable, пустой/NULL = «нет
 * подчинённых» (ведёт себя как обычный воркер с фильтром по своим).
 */
async function main() {
  try {
    await db.execute(
      "ALTER TABLE users ADD COLUMN managed_worker_ids TEXT NULL"
    );
    console.log("[migrate] added column users.managed_worker_ids");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") {
      console.log(
        "[migrate] users.managed_worker_ids already exists, skipping"
      );
    } else {
      throw err;
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
