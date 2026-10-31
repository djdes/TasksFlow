import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * push_deferred — уведомления, случившиеся ночью (тихие часы компании,
 * shared/notify.ts quietFrom): ждут утра и уходят одной пачкой
 * (server/push/quiet.ts).
 *
 * Только CREATE TABLE, существующие таблицы не трогает. Идемпотентно:
 * ER_TABLE_EXISTS_ERROR = уже есть. Без таблицы ночные уведомления
 * просто уходят сразу, как раньше.
 */
async function main() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE push_deferred (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        user_id INT NOT NULL,
        kind VARCHAR(16) NOT NULL,
        task_id INT NULL,
        item VARCHAR(255) NOT NULL,
        message TEXT NULL,
        created_at INT NOT NULL DEFAULT 0,
        KEY idx_push_deferred_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `));
    console.log("[migrate] created table push_deferred");
  } catch (err: any) {
    if (err?.code === "ER_TABLE_EXISTS_ERROR") console.log("[migrate] push_deferred already exists, skipping");
    else throw err;
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] push_deferred failed:", err);
  process.exit(1);
});
