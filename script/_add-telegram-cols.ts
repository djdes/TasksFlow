import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Добавляет колонки привязки Telegram в users (бот @thetasksflowbot).
 * Идемпотентно: ER_DUP_FIELDNAME = колонка уже есть, ER_DUP_KEYNAME = индекс уже есть.
 * Та же миграция есть в авто-миграции на старте (server/index.ts).
 *
 * UNIQUE на telegram_user_id обязателен: один Telegram-аккаунт не должен
 * быть привязан к двум сотрудникам, иначе непонятно, от чьего имени бот
 * ставит задачи и чьи задачи показывает.
 */
const COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "telegram_user_id", ddl: "ADD COLUMN `telegram_user_id` BIGINT NULL" },
  { name: "telegram_username", ddl: "ADD COLUMN `telegram_username` VARCHAR(64) NULL" },
  { name: "telegram_first_name", ddl: "ADD COLUMN `telegram_first_name` VARCHAR(128) NULL" },
  { name: "telegram_photo_url", ddl: "ADD COLUMN `telegram_photo_url` VARCHAR(512) NULL" },
  { name: "tg_chat_id", ddl: "ADD COLUMN `tg_chat_id` BIGINT NULL" },
  { name: "tg_linked_at", ddl: "ADD COLUMN `tg_linked_at` INT NULL" },
  { name: "tg_started_at", ddl: "ADD COLUMN `tg_started_at` INT NULL" },
];

async function main() {
  for (const col of COLUMNS) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`users\` ${col.ddl}`));
      console.log(`[migrate] added users.${col.name}`);
    } catch (err: any) {
      if (err?.code === "ER_DUP_FIELDNAME") {
        console.log(`[migrate] users.${col.name} already exists, skipping`);
      } else {
        throw err;
      }
    }
  }

  try {
    await db.execute(
      sql`ALTER TABLE \`users\` ADD UNIQUE KEY \`uq_users_telegram_user_id\` (\`telegram_user_id\`)`,
    );
    console.log("[migrate] added unique uq_users_telegram_user_id");
  } catch (err: any) {
    if (err?.code === "ER_DUP_KEYNAME") {
      console.log("[migrate] uq_users_telegram_user_id already exists, skipping");
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
