import "dotenv/config";
import mysql from "mysql2/promise";

async function updateTasksTable() {
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;

  if (!host || !user || !password || !database) {
    throw new Error("MySQL credentials not set");
  }

  const connection = await mysql.createConnection({
    host,
    user,
    password,
    database,
    port: 3306,
  });

  try {
    // Добавляем поля если их нет
    await connection.execute(`
      ALTER TABLE \`tasks\` 
      ADD COLUMN IF NOT EXISTS \`requires_photo\` tinyint(1) NOT NULL DEFAULT 0
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\` 
      ADD COLUMN IF NOT EXISTS \`photo_url\` varchar(500) NULL
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\`
      ADD COLUMN IF NOT EXISTS \`is_completed\` tinyint(1) NOT NULL DEFAULT 0
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\`
      ADD COLUMN IF NOT EXISTS \`week_days\` varchar(20) NULL
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\`
      ADD COLUMN IF NOT EXISTS \`is_recurring\` tinyint(1) NOT NULL DEFAULT 1
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\`
      ADD COLUMN IF NOT EXISTS \`month_day\` int NULL
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\`
      ADD COLUMN IF NOT EXISTS \`price\` int NOT NULL DEFAULT 0
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\`
      ADD COLUMN IF NOT EXISTS \`category\` varchar(100) NULL
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\`
      ADD COLUMN IF NOT EXISTS \`description\` text NULL
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\`
      ADD COLUMN IF NOT EXISTS \`example_photo_url\` varchar(500) NULL
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    await connection.execute(`
      ALTER TABLE \`tasks\`
      ADD COLUMN IF NOT EXISTS \`photo_urls\` text NULL
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    // Добавляем поле bonus_balance в таблицу users
    await connection.execute(`
      ALTER TABLE \`users\`
      ADD COLUMN IF NOT EXISTS \`bonus_balance\` int NOT NULL DEFAULT 0
    `).catch(() => {}); // Игнорируем ошибку если колонка уже существует

    console.log("Таблицы tasks и users обновлены");
  } catch (error) {
    console.error("Ошибка:", error);
    // process.exitCode = 1 + connection.end в finally без exit(0)
    // — иначе finally переопределяло exit на 0 при ошибке миграции.
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

updateTasksTable();
