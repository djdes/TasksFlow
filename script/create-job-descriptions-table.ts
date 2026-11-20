import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

// Должностная инструкция сотрудника → задачи (shared/job-description.ts).
// Новая таблица, users и tasks не трогаем. Повторный запуск ничего не меняет.
// Одна строка на человека: новая инструкция заменяет прежнюю.
async function main() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS job_descriptions (
      user_id INT NOT NULL PRIMARY KEY,
      company_id INT NOT NULL,
      source VARCHAR(10) NOT NULL,
      file_name VARCHAR(255) NULL,
      content MEDIUMTEXT NOT NULL,
      status VARCHAR(16) NOT NULL,
      gateway_job_id VARCHAR(64) NULL,
      attempts INT NOT NULL DEFAULT 0,
      tasks_created INT NOT NULL DEFAULT 0,
      task_ids TEXT NULL,
      error VARCHAR(500) NULL,
      created_by INT NULL,
      created_at INT NOT NULL,
      updated_at INT NOT NULL,
      sent_at INT NULL,
      KEY job_descriptions_company (company_id),
      KEY job_descriptions_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `));
  console.log("[migrate] job_descriptions ready");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] job_descriptions failed:", err);
  process.exit(1);
});
