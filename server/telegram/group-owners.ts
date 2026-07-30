/**
 * Привязка группового чата к аккаунту-владельцу.
 *
 * В рабочей группе задачу просит кто угодно — повар, курьер, кладовщик, —
 * и аккаунта TasksFlow у большинства нет. Отшивать их «привяжи аккаунт»
 * значит сделать бота бесполезным для смены. Поэтому задача создаётся в
 * компании владельца группы, а имя просившего уходит в описание.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { telegramGroupOwners } from "@shared/schema";
import { logger } from "../logger";

export type GroupOwner = {
  chatId: number;
  ownerUserId: number;
  companyId: number;
  chatTitle: string | null;
};

export async function getGroupOwner(chatId: number): Promise<GroupOwner | null> {
  const [row] = await db
    .select()
    .from(telegramGroupOwners)
    .where(eq(telegramGroupOwners.chatId, chatId));
  if (!row) return null;
  return {
    chatId: row.chatId,
    ownerUserId: row.ownerUserId,
    companyId: row.companyId,
    chatTitle: row.chatTitle,
  };
}

/**
 * Привязывает владельца, если группа ещё свободна (first-writer-wins).
 * Перехват уже привязанной группы запрещён: иначе любой участник мог бы
 * увести чужие задачи в свою компанию одной командой /start.
 */
export async function bindGroupIfAbsent(params: {
  chatId: number;
  ownerUserId: number;
  companyId: number;
  chatTitle: string | null;
}): Promise<{ owner: GroupOwner; created: boolean }> {
  const existing = await getGroupOwner(params.chatId);
  if (existing) return { owner: existing, created: false };

  try {
    await db.insert(telegramGroupOwners).values({
      chatId: params.chatId,
      ownerUserId: params.ownerUserId,
      companyId: params.companyId,
      chatTitle: params.chatTitle,
      createdAt: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    // Гонка двух /start подряд: кто-то успел первым — берём его запись.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), chatId: params.chatId },
      "[tg-group] привязка не прошла, читаем существующую",
    );
    const raced = await getGroupOwner(params.chatId);
    if (raced) return { owner: raced, created: false };
    throw err;
  }

  return {
    owner: {
      chatId: params.chatId,
      ownerUserId: params.ownerUserId,
      companyId: params.companyId,
      chatTitle: params.chatTitle,
    },
    created: true,
  };
}

export async function unbindGroup(chatId: number): Promise<void> {
  await db.delete(telegramGroupOwners).where(eq(telegramGroupOwners.chatId, chatId));
}

/** Имя просившего для описания задачи: «Иван Петров (@ivan)». */
export function formatSenderName(from: {
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (name && from.username) return `${name} (@${from.username})`;
  if (name) return name;
  if (from.username) return `@${from.username}`;
  return "участник группы";
}
