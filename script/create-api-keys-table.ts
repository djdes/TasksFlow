/**
 * Создаёт таблицу api_keys для server-to-server auth.
 * Запускать ВРУЧНУЮ на проде после первого деплоя Phase A:
 *
 *   npm run create-api-keys-table
 *
 * Идемпотентно — повторный запуск ничего не сломает (CREATE IF NOT EXISTS).
 */

import "dotenv/config";
import mysql from "mysql2/promise";

async function run() {
	const host = process.env.MYSQL_HOST;
	const user = process.env.MYSQL_USER;
	const password = process.env.MYSQL_PASSWORD;
	const database = process.env.MYSQL_DATABASE;

	if (!host || !user || !password || !database) {
		throw new Error("MySQL credentials not set. Check MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE");
	}

	const conn = await mysql.createConnection({
		host,
		user,
		password,
		database,
		port: Number(process.env.MYSQL_PORT) || 3306,
	});

	try {
		await conn.execute(`
			CREATE TABLE IF NOT EXISTS \`api_keys\` (
				\`id\` INT AUTO_INCREMENT PRIMARY KEY,
				\`name\` VARCHAR(100) NOT NULL,
				\`key_hash\` VARCHAR(64) NOT NULL UNIQUE,
				\`key_prefix\` VARCHAR(16) NOT NULL,
				\`company_id\` INT NOT NULL,
				\`created_by_user_id\` INT NOT NULL,
				\`created_at\` INT NOT NULL DEFAULT 0,
				\`last_used_at\` INT DEFAULT 0,
				\`revoked_at\` INT DEFAULT 0,
				INDEX \`idx_company\` (\`company_id\`),
				INDEX \`idx_revoked\` (\`revoked_at\`)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
		`);
		console.log("✅ Таблица api_keys создана (или уже существовала)");

		const [rows] = await conn.execute<any[]>("SHOW COLUMNS FROM `api_keys`");
		console.log("Колонки:", (rows as any[]).map((r: any) => r.Field).join(", "));
	} finally {
		await conn.end();
	}
}

run().then(() => process.exit(0)).catch(err => {
	console.error("❌ Ошибка:", err.message);
	process.exit(1);
});
