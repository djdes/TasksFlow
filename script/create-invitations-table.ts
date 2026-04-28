/**
 * Создаёт таблицу invitations для QR-приглашений сотрудников.
 * Запускать ВРУЧНУЮ при деплое:
 *
 *   npm run create-invitations-table
 *
 * Идемпотентно — повторный запуск ничего не сломает (CREATE IF NOT EXISTS).
 *
 * Используется вместо drizzle-kit push, потому что в проекте есть дрейф
 * схемы (см. ER_MULTIPLE_PRI_KEY на api_keys), и push нельзя гонять
 * безопасно. Тот же паттерн, что в create-api-keys-table.ts.
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
			CREATE TABLE IF NOT EXISTS \`invitations\` (
				\`id\` INT AUTO_INCREMENT PRIMARY KEY,
				\`token\` VARCHAR(64) NOT NULL UNIQUE,
				\`company_id\` INT NOT NULL,
				\`created_by_user_id\` INT NOT NULL,
				\`position\` VARCHAR(120),
				\`is_admin\` BOOLEAN NOT NULL DEFAULT FALSE,
				\`used_at\` INT,
				\`used_by_user_id\` INT,
				\`revoked_at\` INT,
				\`created_at\` INT NOT NULL DEFAULT 0,
				INDEX \`idx_company\` (\`company_id\`),
				INDEX \`idx_active\` (\`company_id\`, \`used_at\`, \`revoked_at\`)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
		`);
		console.log("✅ Таблица invitations создана (или уже существовала)");

		const [rows] = await conn.execute<any[]>("SHOW COLUMNS FROM `invitations`");
		console.log("Колонки:", (rows as any[]).map((r: any) => r.Field).join(", "));
	} finally {
		await conn.end();
	}
}

run().then(() => process.exit(0)).catch(err => {
	console.error("❌ Ошибка:", err.message);
	process.exit(1);
});
