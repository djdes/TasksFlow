import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Добавляет колонку users.is_root (root-доступ к управлению сайтом).
 * Идемпотентно: ER_DUP_FIELDNAME = колонка уже есть.
 * Та же миграция есть в авто-миграции на старте (server/index.ts).
 */
async function main() {
  try {
    await db.execute(sql`ALTER TABLE \`users\` ADD COLUMN \`is_root\` BOOLEAN NOT NULL DEFAULT false`);
    console.log("[migrate] added users.is_root");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") {
      console.log("[migrate] users.is_root already exists, skipping");
    } else {
      throw err;
    }
  }
  process.exit(0);
}
main().catch((err) => { console.error("[migrate] failed", err); process.exit(1); });
