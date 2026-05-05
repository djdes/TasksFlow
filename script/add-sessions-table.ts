/**
 * Migration: создаёт таблицу `sessions` для express-session store.
 * Идемпотентен — IF NOT EXISTS.
 *
 *   tsx script/add-sessions-table.ts
 *
 * После применения сервер перейдёт с MemoryStore на MySQL store —
 * сессии переживут рестарт. См. server/session-store.ts.
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
    port: Number(process.env.MYSQL_PORT) || 3306,
  });
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`sessions\` (
        \`sid\` VARCHAR(128) NOT NULL,
        \`expires\` INT NOT NULL,
        \`data\` MEDIUMTEXT NOT NULL,
        PRIMARY KEY (\`sid\`),
        KEY \`expires_idx\` (\`expires\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✓ Таблица sessions создана (или уже существовала).");
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
