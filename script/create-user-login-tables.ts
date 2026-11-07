import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

// Новые таблицы, users не трогаем. Повторный запуск ничего не меняет.
//  - user_login_links — личный QR входа сотрудника (shared/user-login-link.ts);
//  - user_pin_reveal — PIN, заданный руководителем, в зашифрованном виде,
//    чтобы его можно было посмотреть (server/pin-reveal.ts). PIN, который
//    сотрудник придумал сам, сюда не попадает.
async function main() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS user_login_links (
      user_id INT NOT NULL PRIMARY KEY,
      token VARCHAR(64) NOT NULL,
      created_at INT NOT NULL,
      created_by INT NULL,
      UNIQUE KEY user_login_links_token_unique (token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS user_pin_reveal (
      user_id INT NOT NULL PRIMARY KEY,
      pin_encrypted VARCHAR(255) NOT NULL,
      set_by INT NULL,
      set_at INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `));
  console.log("[migrate] user_login_links, user_pin_reveal ready");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] user login tables failed:", err);
  process.exit(1);
});
