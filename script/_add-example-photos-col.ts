import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Добавляет колонку tasks.example_photo_urls — JSON-массив URL примеров
 * «как надо». Пришла на смену одиночной example_photo_url: Telegram-бот
 * принимает альбом и раскладывает фото по задачам.
 *
 * Старая колонка НЕ удаляется: storage читает её как fallback для задач,
 * созданных до этой миграции, и дублирует туда первый URL при записи.
 *
 * Идемпотентно: ER_DUP_FIELDNAME = колонка уже есть.
 * Та же миграция есть в авто-миграции на старте (server/index.ts).
 */
async function main() {
  try {
    await db.execute(sql`ALTER TABLE \`tasks\` ADD COLUMN \`example_photo_urls\` TEXT NULL`);
    console.log("[migrate] added tasks.example_photo_urls");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") console.log("[migrate] tasks.example_photo_urls already exists, skipping");
    else throw err;
  }
  process.exit(0);
}
main().catch((err) => { console.error("[migrate] failed", err); process.exit(1); });
