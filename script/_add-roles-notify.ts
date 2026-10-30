import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Роли, проверка выполненного и личные уведомления (выкладка 10.2026):
 *
 *   company_roles               — свои роли компании: название и права JSON
 *                                 (shared/roles.ts), например «Руководитель».
 *   users.role_id               — роль человека; NULL — «Сотрудник» или админ.
 *   users.notify_prefs          — личные настройки уведомлений JSON; NULL — всё включено.
 *   companies.access_settings   — права «Сотрудника» JSON {employeeApproval};
 *                                 NULL — как раньше, без проверки.
 *   tasks.remind_at             — своё время напоминания задачи «ЧЧ:ММ».
 *   tasks.remind_sent_day       — местный день, когда напоминание ушло.
 *   invitations.role_id         — роль, которую получит принявший приглашение.
 *
 * Только CREATE TABLE и ADD COLUMN (все колонки NULL), существующие строки
 * не меняются. Идемпотентно: ER_TABLE_EXISTS_ERROR / ER_DUP_FIELDNAME /
 * ER_DUP_KEYNAME = уже есть. Обязательный шаг деплоя: код читает новые
 * колонки users и tasks в каждом запросе.
 */
async function main() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE company_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(60) NOT NULL,
        permissions TEXT NOT NULL,
        created_at INT NOT NULL DEFAULT 0,
        updated_at INT NOT NULL DEFAULT 0,
        KEY idx_company_roles_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `));
    console.log("[migrate] created table company_roles");
  } catch (err: any) {
    if (err?.code === "ER_TABLE_EXISTS_ERROR") console.log("[migrate] company_roles already exists, skipping");
    else throw err;
  }

  const COLUMNS: Array<[string, string, string]> = [
    ["users", "role_id", "INT NULL"],
    ["users", "notify_prefs", "TEXT NULL"],
    ["companies", "access_settings", "TEXT NULL"],
    ["tasks", "remind_at", "VARCHAR(5) NULL"],
    ["tasks", "remind_sent_day", "VARCHAR(10) NULL"],
    ["invitations", "role_id", "INT NULL"],
  ];
  for (const [table, name, ddl] of COLUMNS) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${ddl}`));
      console.log(`[migrate] added ${table}.${name}`);
    } catch (err: any) {
      if (err?.code === "ER_DUP_FIELDNAME") console.log(`[migrate] ${table}.${name} already exists, skipping`);
      else throw err;
    }
  }

  // Планировщик раз в минуту ищет задачи со своим временем напоминания.
  try {
    await db.execute(sql.raw("CREATE INDEX idx_tasks_remind_at ON tasks(remind_at)"));
    console.log("[migrate] created index idx_tasks_remind_at");
  } catch (err: any) {
    if (err?.code === "ER_DUP_KEYNAME") console.log("[migrate] idx_tasks_remind_at already exists, skipping");
    else throw err;
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] roles/notify failed:", err);
  process.exit(1);
});
