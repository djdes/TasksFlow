import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Колонка telegram_task_drafts.auto_create_at — дедлайн авто-создания.
 *
 * Руководитель часто пишет задачу и уходит, не нажав «Создать»: без
 * дедлайна черновик просто протухал, и работа терялась. Теперь задача
 * создаётся сама, а в карточке об этом сказано заранее.
 *
 * Идемпотентно: ER_DUP_FIELDNAME = колонка уже есть.
 */
async function main() {
  try {
    await db.execute(sql`ALTER TABLE \`telegram_task_drafts\` ADD COLUMN \`auto_create_at\` INT NULL`);
    console.log("[migrate] added telegram_task_drafts.auto_create_at");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") console.log("[migrate] auto_create_at already exists, skipping");
    else throw err;
  }
  try {
    await db.execute(sql`ALTER TABLE \`telegram_task_drafts\` ADD KEY \`idx_ttd_autocreate\` (\`status\`, \`auto_create_at\`)`);
    console.log("[migrate] added idx_ttd_autocreate");
  } catch (err: any) {
    if (err?.code === "ER_DUP_KEYNAME") console.log("[migrate] idx_ttd_autocreate already exists, skipping");
    else throw err;
  }
  process.exit(0);
}
main().catch((err) => { console.error("[migrate] failed", err); process.exit(1); });
