import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Добавляет колонку tasks.checklist (чек-лист/подзадачи внутри задачи).
 * Идемпотентно: ER_DUP_FIELDNAME = колонка уже есть.
 * Та же миграция есть в авто-миграции на старте (server/index.ts).
 */
async function main() {
  try {
    await db.execute(sql`ALTER TABLE \`tasks\` ADD COLUMN \`checklist\` TEXT NULL`);
    console.log("[migrate] added tasks.checklist");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") console.log("[migrate] tasks.checklist already exists, skipping");
    else throw err;
  }
  process.exit(0);
}
main().catch((err) => { console.error("[migrate] failed", err); process.exit(1); });
