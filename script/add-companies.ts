import "dotenv/config";
import mysql from "mysql2/promise";

async function addCompanies() {
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
    console.log("Начинаю миграцию для добавления компаний...\n");

    // 1. Создаем таблицу companies
    console.log("1. Создаю таблицу companies...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`companies\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`email\` varchar(255),
        \`created_at\` int NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("   Таблица companies создана\n");

    // 2. Добавляем колонку company_id в users (если не существует)
    console.log("2. Добавляю колонку company_id в users...");
    try {
      await connection.execute(`
        ALTER TABLE \`users\` ADD COLUMN \`company_id\` int DEFAULT NULL
      `);
      console.log("   Колонка company_id добавлена в users\n");
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log("   Колонка company_id уже существует в users\n");
      } else {
        throw e;
      }
    }

    // 3. Добавляем колонку company_id в tasks (если не существует)
    console.log("3. Добавляю колонку company_id в tasks...");
    try {
      await connection.execute(`
        ALTER TABLE \`tasks\` ADD COLUMN \`company_id\` int DEFAULT NULL
      `);
      console.log("   Колонка company_id добавлена в tasks\n");
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log("   Колонка company_id уже существует в tasks\n");
      } else {
        throw e;
      }
    }

    // 4. Добавляем колонку company_id в workers (если не существует)
    console.log("4. Добавляю колонку company_id в workers...");
    try {
      await connection.execute(`
        ALTER TABLE \`workers\` ADD COLUMN \`company_id\` int DEFAULT NULL
      `);
      console.log("   Колонка company_id добавлена в workers\n");
    } catch (e: any) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log("   Колонка company_id уже существует в workers\n");
      } else {
        throw e;
      }
    }

    // 5. Создаем компанию по умолчанию "ИП Волков Денис"
    console.log("5. Создаю компанию по умолчанию...");
    const defaultCompanyName = "ИП Волков Денис";
    const defaultCompanyEmail = "bugdenes@gmail.com";

    // Проверяем, существует ли уже компания
    const [existingCompanies] = await connection.execute(
      "SELECT * FROM `companies` WHERE `name` = ?",
      [defaultCompanyName]
    );

    let companyId: number;

    if ((existingCompanies as any[]).length === 0) {
      const [result] = await connection.execute(
        "INSERT INTO `companies` (`name`, `email`, `created_at`) VALUES (?, ?, ?)",
        [defaultCompanyName, defaultCompanyEmail, Math.floor(Date.now() / 1000)]
      );
      companyId = (result as any).insertId;
      console.log(`   Компания "${defaultCompanyName}" создана с ID: ${companyId}\n`);
    } else {
      companyId = (existingCompanies as any[])[0].id;
      console.log(`   Компания "${defaultCompanyName}" уже существует с ID: ${companyId}\n`);
    }

    // 6. Привязываем всех пользователей к компании
    console.log("6. Привязываю пользователей к компании...");
    const [usersResult] = await connection.execute(
      "UPDATE `users` SET `company_id` = ? WHERE `company_id` IS NULL",
      [companyId]
    );
    console.log(`   Обновлено пользователей: ${(usersResult as any).affectedRows}\n`);

    // 7. Привязываем все задачи к компании
    console.log("7. Привязываю задачи к компании...");
    const [tasksResult] = await connection.execute(
      "UPDATE `tasks` SET `company_id` = ? WHERE `company_id` IS NULL",
      [companyId]
    );
    console.log(`   Обновлено задач: ${(tasksResult as any).affectedRows}\n`);

    // 8. Привязываем всех работников к компании
    console.log("8. Привязываю работников к компании...");
    const [workersResult] = await connection.execute(
      "UPDATE `workers` SET `company_id` = ? WHERE `company_id` IS NULL",
      [companyId]
    );
    console.log(`   Обновлено работников: ${(workersResult as any).affectedRows}\n`);

    console.log("✅ Миграция завершена успешно!");
    console.log(`   Компания по умолчанию: "${defaultCompanyName}" (ID: ${companyId})`);

  } catch (error) {
    console.error("❌ Ошибка миграции:", error);
    // process.exitCode = 1 + connection.end в finally без exit(0)
    // — иначе finally переопределяло exit на 0 при ошибке миграции.
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

addCompanies();
