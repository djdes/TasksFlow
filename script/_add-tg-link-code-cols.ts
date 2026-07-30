import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Колонки одноразового кода привязки Telegram.
 *
 * Login Widget требует /setdomain в BotFather, доступности telegram.org в
 * браузере и работающего попапа. Код-привязка не требует ничего: сайт
 * выдаёт короткий код, пользователь открывает бота по ссылке, бот
 * связывает аккаунт. Работает всегда, поэтому это основной путь.
 *
 * Идемпотентно: ER_DUP_FIELDNAME = колонка уже есть.
 */
const COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "tg_link_code", ddl: "ADD COLUMN `tg_link_code` VARCHAR(32) NULL" },
  { name: "tg_link_code_expires_at", ddl: "ADD COLUMN `tg_link_code_expires_at` INT NULL" },
];

async function main() {
  for (const col of COLUMNS) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`users\` ${col.ddl}`));
      console.log(`[migrate] added users.${col.name}`);
    } catch (err: any) {
      if (err?.code === "ER_DUP_FIELDNAME") console.log(`[migrate] users.${col.name} already exists, skipping`);
      else throw err;
    }
  }
  try {
    await db.execute(sql`ALTER TABLE \`users\` ADD KEY \`idx_users_tg_link_code\` (\`tg_link_code\`)`);
    console.log("[migrate] added idx_users_tg_link_code");
  } catch (err: any) {
    if (err?.code === "ER_DUP_KEYNAME") console.log("[migrate] idx_users_tg_link_code already exists, skipping");
    else throw err;
  }
  process.exit(0);
}
main().catch((err) => { console.error("[migrate] failed", err); process.exit(1); });
