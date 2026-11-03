import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

// Только новая таблица; повторный запуск сохраняет все выданные ссылки.
async function main() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS company_login_links (
      company_id INT NOT NULL PRIMARY KEY,
      token VARCHAR(64) NOT NULL,
      UNIQUE KEY company_login_links_token_unique (token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `));
  console.log("[migrate] company_login_links ready");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] company_login_links failed:", err);
  process.exit(1);
});
