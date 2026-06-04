import "dotenv/config";
import { db } from "../server/db";

/**
 * Создаёт таблицу `banners` для промо-баннеров публичного сайта
 * (узкая полоса сверху + вставка в контент). Идемпотентно — safe to re-run.
 *
 * Та же таблица создаётся авто-миграцией на старте сервера
 * (server/index.ts). Этот скрипт — ручной путь / для CI.
 */
async function main() {
  try {
    await db.execute(`
      CREATE TABLE banners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        text VARCHAR(500) NOT NULL,
        link_url VARCHAR(500) NULL,
        link_label VARCHAR(120) NULL,
        placement VARCHAR(16) NOT NULL DEFAULT 'top',
        bg_color VARCHAR(64) NULL,
        text_color VARCHAR(64) NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        starts_at INT NULL,
        ends_at INT NULL,
        position INT NOT NULL DEFAULT 0,
        created_at INT NOT NULL DEFAULT 0,
        updated_at INT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("[migrate] created table banners");
  } catch (err: any) {
    if (err?.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("[migrate] table banners already exists, skipping");
    } else {
      throw err;
    }
  }

  try {
    await db.execute("CREATE INDEX banners_active_placement_idx ON banners(active, placement)");
    console.log("[migrate] created index banners_active_placement_idx");
  } catch (err: any) {
    if (err?.code === "ER_DUP_KEYNAME") {
      console.log("[migrate] index already exists, skipping");
    } else {
      throw err;
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
