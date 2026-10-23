import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * push_subscriptions — устройства для push-уведомлений (shared/schema.ts):
 * браузеры, установленные PWA и Android-приложение (Web Push) и
 * iOS-приложение (APNs).
 *
 * Только CREATE TABLE, существующие таблицы не трогает. Идемпотентно:
 * ER_TABLE_EXISTS_ERROR = уже есть. Без таблицы сайт работает как раньше,
 * просто без push (server/push сообщит в лог один раз).
 */
async function main() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        company_id INT NULL,
        kind VARCHAR(8) NOT NULL,
        endpoint TEXT NOT NULL,
        endpoint_hash VARCHAR(64) NOT NULL,
        p256dh VARCHAR(255) NULL,
        auth VARCHAR(64) NULL,
        environment VARCHAR(16) NULL,
        user_agent VARCHAR(255) NULL,
        created_at INT NOT NULL DEFAULT 0,
        last_seen_at INT NOT NULL DEFAULT 0,
        failures INT NOT NULL DEFAULT 0,
        UNIQUE KEY uniq_push_endpoint_hash (endpoint_hash),
        KEY idx_push_user (user_id),
        KEY idx_push_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `));
    console.log("[migrate] created table push_subscriptions");
  } catch (err: any) {
    if (err?.code === "ER_TABLE_EXISTS_ERROR") console.log("[migrate] push_subscriptions already exists, skipping");
    else throw err;
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] push_subscriptions failed:", err);
  process.exit(1);
});
