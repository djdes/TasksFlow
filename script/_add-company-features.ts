import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Новые возможности компании (одна миграция на выкладку 10.2026):
 * история выполнения, часовой пояс, напоминания, фото-отчёты, тарифы, точки.
 *
 *   task_history            — снимок задачи за день: done / claimed / missed,
 *                             фото, чек-лист, проверка. Раньше ночной сброс
 *                             удалял фото и факт выполнения без следа.
 *   companies.timezone      — IANA-пояс, по нему задачи сбрасываются в
 *                             местную полночь (по умолчанию Europe/Moscow).
 *   companies.last_reset_day — местный день последнего сброса. NULL —
 *                             сброса ещё не было: сервер запишет «сегодня»
 *                             без сброса, первый сброс — в ближайшую полночь.
 *   companies.notify_settings — время напоминаний в Telegram (JSON), NULL —
 *                             по умолчанию; notify_state — что уже ушло сегодня.
 *   companies.photo_settings — время на фото и «только камера» (JSON), NULL —
 *                             по умолчанию.
 *   companies.plan / plan_until — тариф (shared/plans.ts), NULL — «Старт».
 *   locations, users.location_id — точки сети и привязка сотрудника к точке.
 *
 * Только CREATE TABLE и ADD COLUMN, существующие строки не меняются.
 * Идемпотентно: ER_TABLE_EXISTS_ERROR / ER_DUP_FIELDNAME = уже есть.
 */
async function main() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE task_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        company_id INT NULL,
        worker_id INT NULL,
        day VARCHAR(10) NOT NULL,
        status VARCHAR(16) NOT NULL,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NULL,
        price INT NOT NULL DEFAULT 0,
        completed_at INT NULL,
        photo_urls TEXT NULL,
        checklist TEXT NULL,
        claimed_by_worker_id INT NULL,
        verification_status VARCHAR(20) NULL,
        verified_by_user_id INT NULL,
        verified_at INT NULL,
        created_at INT NOT NULL DEFAULT 0,
        UNIQUE KEY uniq_task_history_task_day (task_id, day),
        KEY idx_task_history_company_day (company_id, day),
        KEY idx_task_history_worker_day (worker_id, day),
        KEY idx_task_history_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `));
    console.log("[migrate] created table task_history");
  } catch (err: any) {
    if (err?.code === "ER_TABLE_EXISTS_ERROR") console.log("[migrate] task_history already exists, skipping");
    else throw err;
  }

  const COLUMNS: Array<[string, string]> = [
    ["timezone", "VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow'"],
    ["last_reset_day", "VARCHAR(10) NULL"],
    ["notify_settings", "TEXT NULL"],
    ["notify_state", "TEXT NULL"],
    ["photo_settings", "TEXT NULL"],
    ["plan", "VARCHAR(20) NULL"],
    ["plan_until", "INT NULL"],
  ];
  for (const [name, ddl] of COLUMNS) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`companies\` ADD COLUMN \`${name}\` ${ddl}`));
      console.log(`[migrate] added companies.${name}`);
    } catch (err: any) {
      if (err?.code === "ER_DUP_FIELDNAME") console.log(`[migrate] companies.${name} already exists, skipping`);
      else throw err;
    }
  }
  try {
    await db.execute(sql.raw(`
      CREATE TABLE locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(120) NOT NULL,
        address VARCHAR(255) NULL,
        created_at INT NOT NULL DEFAULT 0,
        archived_at INT NULL,
        KEY idx_locations_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `));
    console.log("[migrate] created table locations");
  } catch (err: any) {
    if (err?.code === "ER_TABLE_EXISTS_ERROR") console.log("[migrate] locations already exists, skipping");
    else throw err;
  }

  try {
    await db.execute(sql.raw("ALTER TABLE `users` ADD COLUMN `location_id` INT NULL"));
    console.log("[migrate] added users.location_id");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") console.log("[migrate] users.location_id already exists, skipping");
    else throw err;
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
