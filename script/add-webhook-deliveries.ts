/**
 * Migration script: создаёт таблицу `webhook_deliveries` для очереди
 * повторных доставок webhook'ов в WeSetup. См. P1#6 в
 * docs/THREAD_TASKSFLOW.md и комментарий к webhookDeliveries в
 * shared/schema.ts.
 *
 * Идемпотентен — IF NOT EXISTS, можно гонять много раз.
 *
 *   tsx script/add-webhook-deliveries.ts
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
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`webhook_deliveries\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`task_id\` int NOT NULL,
        \`event_type\` varchar(20) NOT NULL,
        \`target_url\` varchar(500) NOT NULL,
        \`api_key\` varchar(255) NOT NULL,
        \`payload\` text NOT NULL,
        \`attempts\` int NOT NULL DEFAULT 0,
        \`status\` int NOT NULL DEFAULT 0,
        \`next_retry_at\` int NOT NULL,
        \`last_error\` text,
        \`created_at\` int NOT NULL DEFAULT 0,
        \`updated_at\` int NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        KEY \`status_next_retry_idx\` (\`status\`, \`next_retry_at\`),
        KEY \`task_id_idx\` (\`task_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✓ Таблица webhook_deliveries создана (или уже существовала).");
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
