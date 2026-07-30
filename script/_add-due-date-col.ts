import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Добавляет колонку tasks.due_date — срок выполнения задачи
 * (unix sec локальной полуночи целевого дня).
 * Идемпотентно: ER_DUP_FIELDNAME = колонка уже есть.
 * Та же миграция есть в авто-миграции на старте (server/index.ts).
 */
async function main() {
  try {
    await db.execute(sql`ALTER TABLE \`tasks\` ADD COLUMN \`due_date\` INT NULL`);
    console.log("[migrate] added tasks.due_date");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") console.log("[migrate] tasks.due_date already exists, skipping");
    else throw err;
  }
  process.exit(0);
}
main().catch((err) => { console.error("[migrate] failed", err); process.exit(1); });
