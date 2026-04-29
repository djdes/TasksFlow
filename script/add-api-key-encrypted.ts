/**
 * Migration: добавляет колонку `key_encrypted` в таблицу `api_keys`.
 * Колонка nullable, существующие ключи остаются с NULL — для них
 * reveal не доступен, только rotate.
 *
 * Идемпотентен: если колонка уже есть — пропускает (через
 * `INFORMATION_SCHEMA.COLUMNS` lookup перед ALTER).
 *
 *   tsx script/add-api-key-encrypted.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function run() {
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;
  if (!host || !user || !password || !database) {
    throw new Error("MySQL credentials not set in env");
  }
  const connection = await mysql.createConnection({
    host,
    user,
    password,
    database,
    port: 3306,
  });
  try {
    const [rows] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'api_keys'
          AND COLUMN_NAME = 'key_encrypted'`,
      [database],
    );
    if ((rows as unknown[]).length > 0) {
      console.log("✓ Колонка key_encrypted уже есть, пропускаю.");
      return;
    }
    await connection.execute(
      `ALTER TABLE \`api_keys\` ADD COLUMN \`key_encrypted\` TEXT NULL`,
    );
    console.log("✓ Добавлена колонка api_keys.key_encrypted.");
  } finally {
    await connection.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
