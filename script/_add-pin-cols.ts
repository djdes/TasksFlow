import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Колонки для входа по PIN и учёта согласия на обработку ПД.
 *
 *   users.pin_hash            — scrypt-хэш 4-значного PIN; NULL = PIN ещё не задан
 *   users.pin_failed_attempts — неверные попытки подряд (для блокировки)
 *   users.pin_locked_until    — unix-время, до которого вход по PIN закрыт
 *   users.pin_updated_at      — когда PIN задан или сменён
 *   users.pd_consent_at       — когда человек сам дал согласие на обработку ПД
 *
 * Раньше вход по телефону пускал в любой аккаунт без проверки. Все колонки
 * NULL/DEFAULT — существующие строки не меняются, пользователь без PIN
 * придумает его при первом входе.
 *
 * Идемпотентно: ER_DUP_FIELDNAME = колонка уже есть.
 */
const COLUMNS: Array<[string, string]> = [
  ["pin_hash", "VARCHAR(255) NULL"],
  ["pin_failed_attempts", "INT NOT NULL DEFAULT 0"],
  ["pin_locked_until", "INT NULL"],
  ["pin_updated_at", "INT NULL"],
  ["pd_consent_at", "INT NULL"],
];

async function main() {
  for (const [name, ddl] of COLUMNS) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`users\` ADD COLUMN \`${name}\` ${ddl}`));
      console.log(`[migrate] added users.${name}`);
    } catch (err: any) {
      if (err?.code === "ER_DUP_FIELDNAME") console.log(`[migrate] users.${name} already exists, skipping`);
      else throw err;
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
