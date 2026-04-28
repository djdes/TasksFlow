import "dotenv/config";
import mysql from "mysql2/promise";

async function createTables() {
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
    // Удаляем старую таблицу users если она существует
    await connection.execute("DROP TABLE IF EXISTS `users`");
    
    // Создаем новую таблицу users
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`phone\` varchar(20) NOT NULL,
        \`name\` varchar(255),
        \`is_admin\` tinyint(1) NOT NULL DEFAULT 0,
        \`created_at\` int NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`phone\` (\`phone\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log("Таблица users создана");

    // Создаем админа
    const adminPhone = "+79263740794";
    const [rows] = await connection.execute(
      "SELECT * FROM `users` WHERE `phone` = ?",
      [adminPhone]
    );

    if ((rows as any[]).length === 0) {
      await connection.execute(
        "INSERT INTO `users` (`phone`, `name`, `is_admin`, `created_at`) VALUES (?, ?, ?, ?)",
        [adminPhone, "Администратор", 1, Math.floor(Date.now() / 1000)]
      );
      console.log("Админ создан с номером:", adminPhone);
    } else {
      // Обновляем существующего пользователя на админа
      await connection.execute(
        "UPDATE `users` SET `is_admin` = 1 WHERE `phone` = ?",
        [adminPhone]
      );
      console.log("Пользователь обновлен до администратора");
    }

    console.log("Готово!");
  } catch (error) {
    console.error("Ошибка:", error);
    process.exit(1);
  } finally {
    await connection.end();
    process.exit(0);
  }
}

createTables();
