/**
 * Уборка данных бота. Вызывается из общего фонового таймера в
 * server/index.ts — отдельный интервал ради этого не нужен.
 *
 * Чистим только то, что гарантированно мусор:
 *   • черновики, у которых истёк срок и которые так и не подтвердили;
 *   • связки «сообщение ↔ задача» старше 30 дней (reply на сообщение
 *     месячной давности — сценарий, которого нет).
 * Подтверждённые черновики (confirmed) не трогаем: по ним видно, что
 * бот реально создавал, это полезно при разборе жалоб.
 */

import { and, eq, lt } from "drizzle-orm";
import { db } from "../db";
import { telegramTaskDrafts, telegramTaskMessages, telegramChatState } from "@shared/schema";

const MESSAGE_LINK_TTL_SEC = 30 * 24 * 60 * 60;
/** Состояние «жду фото» живёт 15 минут — дальше это забытый тап по кнопке. */
const CHAT_STATE_TTL_SEC = 15 * 60;

export async function cleanupTelegramData(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await db
    .delete(telegramTaskDrafts)
    .where(
      and(
        eq(telegramTaskDrafts.status, "composing"),
        lt(telegramTaskDrafts.expiresAt, now),
      ),
    );

  await db
    .delete(telegramTaskDrafts)
    .where(
      and(
        eq(telegramTaskDrafts.status, "confirming"),
        lt(telegramTaskDrafts.expiresAt, now),
      ),
    );

  await db
    .delete(telegramTaskMessages)
    .where(lt(telegramTaskMessages.createdAt, now - MESSAGE_LINK_TTL_SEC));

  await db
    .delete(telegramChatState)
    .where(lt(telegramChatState.updatedAt, now - CHAT_STATE_TTL_SEC));
}
