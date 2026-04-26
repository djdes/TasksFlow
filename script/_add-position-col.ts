import "dotenv/config";
import { db } from "../server/db";

/**
 * Adds `users.position` (VARCHAR 120). Заполняется WeSetup'ом при
 * createUser/updateUser — синхронизирует JobPosition.name. Используется
 * UI для отображения «ФИО · Должность» и сортировки секций группы-
 * по-сотруднику. Идемпотентная миграция, безопасно запускать в каждом
 * деплое.
 */
async function main() {
  try {
    await db.execute(
      "ALTER TABLE users ADD COLUMN position VARCHAR(120) NULL"
    );
    console.log("[migrate] added column users.position");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") {
      console.log("[migrate] users.position already exists, skipping");
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
