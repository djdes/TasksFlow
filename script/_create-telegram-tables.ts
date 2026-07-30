import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

/**
 * Создаёт три таблицы Telegram-бота. Идемпотентно через CREATE TABLE IF NOT EXISTS.
 * Те же DDL есть в авто-миграции на старте (server/index.ts).
 *
 *   telegram_task_drafts   — черновик распознанных задач (TTL 30 мин)
 *   telegram_task_messages — «сообщение бота ↔ задача», чтобы фото-reply
 *                            попало в нужную задачу
 *   telegram_chat_state    — путь без reply: «жду фото для задачи N» (TTL 15 мин)
 */
async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`telegram_task_drafts\` (
      \`id\`          CHAR(36)     NOT NULL PRIMARY KEY,
      \`user_id\`     INT          NOT NULL,
      \`company_id\`  INT          NOT NULL,
      \`chat_id\`     BIGINT       NOT NULL,
      \`message_id\`  BIGINT       NULL,
      \`source_key\`  VARCHAR(191) NULL,
      \`status\`      VARCHAR(20)  NOT NULL,
      \`raw_text\`    TEXT         NULL,
      \`segments\`    TEXT         NULL,
      \`attachments\` TEXT         NULL,
      \`created_at\`  INT          NOT NULL,
      \`expires_at\`  INT          NOT NULL,
      UNIQUE KEY \`uq_ttd_source_key\` (\`source_key\`),
      KEY \`idx_ttd_chat\` (\`chat_id\`, \`status\`),
      KEY \`idx_ttd_expires\` (\`expires_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("[migrate] telegram_task_drafts ready");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`telegram_task_messages\` (
      \`chat_id\`           BIGINT      NOT NULL,
      \`message_id\`        BIGINT      NOT NULL,
      \`task_id\`           INT         NOT NULL,
      \`checklist_item_id\` VARCHAR(64) NULL,
      \`created_at\`        INT         NOT NULL,
      PRIMARY KEY (\`chat_id\`, \`message_id\`),
      KEY \`idx_ttm_task\` (\`task_id\`),
      KEY \`idx_ttm_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("[migrate] telegram_task_messages ready");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`telegram_chat_state\` (
      \`chat_id\`          BIGINT      NOT NULL PRIMARY KEY,
      \`awaiting_task_id\` INT         NULL,
      \`awaiting_item_id\` VARCHAR(64) NULL,
      \`updated_at\`       INT         NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("[migrate] telegram_chat_state ready");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`telegram_group_owners\` (
      \`chat_id\`       BIGINT       NOT NULL PRIMARY KEY,
      \`owner_user_id\` INT          NOT NULL,
      \`company_id\`    INT          NOT NULL,
      \`chat_title\`    VARCHAR(255) NULL,
      \`created_at\`    INT          NOT NULL,
      KEY \`idx_tgo_owner\` (\`owner_user_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("[migrate] telegram_group_owners ready");

  process.exit(0);
}
main().catch((err) => { console.error("[migrate] failed", err); process.exit(1); });
