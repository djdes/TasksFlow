import "dotenv/config";
import { db } from "../server/db";

/**
 * Миграция для email-авторизации (лендинг, ветка как в ordersflow).
 *
 *   • users.phone → NULL-able (email-админы без телефона; unique-индекс
 *     допускает несколько NULL, телефонные юзеры по-прежнему уникальны)
 *   • +users.email (VARCHAR 255, UNIQUE)
 *   • +users.password_hash (VARCHAR 255) — scrypt
 *   • +users.magic_token (VARCHAR 64)
 *   • +users.magic_token_expires_at (INT)
 *
 * Идемпотентная: безопасно запускать в каждом деплое.
 * Запуск: npx tsx script/_add-email-auth-cols.ts
 */
async function runStmt(sql: string, okCodes: string[] = []) {
  try {
    await db.execute(sql);
    console.log("[migrate] OK:", sql);
  } catch (err: any) {
    if (okCodes.includes(err?.code)) {
      console.log(`[migrate] skip (${err.code}):`, sql);
    } else {
      throw err;
    }
  }
}

async function main() {
  // 1. phone → nullable. Повторный запуск просто переустановит тот же тип.
  await runStmt("ALTER TABLE users MODIFY COLUMN phone VARCHAR(20) NULL");

  // 2. Новые колонки (ER_DUP_FIELDNAME если уже есть).
  await runStmt("ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL", ["ER_DUP_FIELDNAME"]);
  await runStmt("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL", ["ER_DUP_FIELDNAME"]);
  await runStmt("ALTER TABLE users ADD COLUMN magic_token VARCHAR(64) NULL", ["ER_DUP_FIELDNAME"]);
  await runStmt("ALTER TABLE users ADD COLUMN magic_token_expires_at INT NULL", ["ER_DUP_FIELDNAME"]);

  // 3. Уникальный индекс на email (ER_DUP_KEYNAME если уже есть).
  await runStmt(
    "ALTER TABLE users ADD UNIQUE INDEX users_email_unique (email)",
    ["ER_DUP_KEYNAME"],
  );

  console.log("[migrate] email-auth columns done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
