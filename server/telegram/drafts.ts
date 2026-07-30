/**
 * Репозиторий черновиков задач.
 *
 * Драфт создаётся СРАЗУ при получении сообщения, до обращения к AI:
 * апдейт Telegram должен быть подтверждён мгновенно, иначе он ретраится,
 * а разбор может занять до 150 секунд.
 *
 * Поиск по короткому id (12 hex из коллбэка) делается LIKE-префиксом по
 * UUID без дефисов — полный UUID в callback_data не влезает.
 */

import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { telegramTaskDrafts } from "@shared/schema";
import type { NormalizedSegment } from "./normalize";
import type { DraftAttachment } from "./attachments";

/** Черновик живёт 30 минут — дальше руководитель уже забыл, о чём он. */
export const DRAFT_TTL_SEC = 30 * 60;

export type DraftStatus =
  | "composing"
  | "confirming"
  | "confirmed"
  | "cancelled"
  | "expired";

export type Draft = {
  id: string;
  userId: number;
  companyId: number;
  chatId: number;
  messageId: number | null;
  status: DraftStatus;
  rawText: string;
  segments: NormalizedSegment[];
  attachments: DraftAttachment[];
  truncated: number;
  createdAt: number;
  expiresAt: number;
};

type SegmentsBlob = {
  segments: NormalizedSegment[];
  truncated: number;
};

export async function createDraft(params: {
  userId: number;
  companyId: number;
  chatId: number;
  rawText: string;
  sourceKey: string | null;
  attachments: DraftAttachment[];
}): Promise<Draft> {
  const now = Math.floor(Date.now() / 1000);
  const id = randomUUID();
  const draft: Draft = {
    id,
    userId: params.userId,
    companyId: params.companyId,
    chatId: params.chatId,
    messageId: null,
    status: "composing",
    rawText: params.rawText,
    segments: [],
    attachments: params.attachments,
    truncated: 0,
    createdAt: now,
    expiresAt: now + DRAFT_TTL_SEC,
  };

  await db.insert(telegramTaskDrafts).values({
    id,
    userId: params.userId,
    companyId: params.companyId,
    chatId: params.chatId,
    messageId: null,
    sourceKey: params.sourceKey,
    status: "composing",
    rawText: params.rawText,
    segments: null,
    attachments: JSON.stringify(params.attachments),
    createdAt: now,
    expiresAt: now + DRAFT_TTL_SEC,
  });

  return draft;
}

/**
 * Поиск по короткому id из коллбэка. Возвращает только непротухшие:
 * истёкший драфт для пользователя не существует.
 */
export async function findDraftByShortId(
  shortId: string,
): Promise<Draft | null> {
  // Защита от инъекции в LIKE: короткий id обязан быть чистым hex.
  if (!/^[a-f0-9]{1,32}$/i.test(shortId)) return null;

  const now = Math.floor(Date.now() / 1000);
  const rows = await db
    .select()
    .from(telegramTaskDrafts)
    .where(
      and(
        sql`REPLACE(${telegramTaskDrafts.id}, '-', '') LIKE ${shortId + "%"}`,
        gt(telegramTaskDrafts.expiresAt, now),
      ),
    )
    .limit(2);

  // Коллизия префикса теоретически возможна — тогда лучше не угадывать.
  if (rows.length !== 1) return null;
  return rowToDraft(rows[0]);
}

export async function getDraft(id: string): Promise<Draft | null> {
  const [row] = await db
    .select()
    .from(telegramTaskDrafts)
    .where(eq(telegramTaskDrafts.id, id));
  return row ? rowToDraft(row) : null;
}

export async function saveSegments(
  id: string,
  segments: NormalizedSegment[],
  truncated: number,
): Promise<void> {
  const blob: SegmentsBlob = { segments, truncated };
  await db
    .update(telegramTaskDrafts)
    .set({ segments: JSON.stringify(blob), status: "confirming" })
    .where(eq(telegramTaskDrafts.id, id));
}

export async function saveAttachments(
  id: string,
  attachments: DraftAttachment[],
): Promise<void> {
  await db
    .update(telegramTaskDrafts)
    .set({ attachments: JSON.stringify(attachments) })
    .where(eq(telegramTaskDrafts.id, id));
}

export async function setMessageId(
  id: string,
  messageId: number,
): Promise<void> {
  await db
    .update(telegramTaskDrafts)
    .set({ messageId })
    .where(eq(telegramTaskDrafts.id, id));
}

export async function setStatus(
  id: string,
  status: DraftStatus,
): Promise<void> {
  await db
    .update(telegramTaskDrafts)
    .set({ status })
    .where(eq(telegramTaskDrafts.id, id));
}

/**
 * Дедуп альбомов и ретраев одного апдейта: у альбома все сообщения
 * приходят по отдельности с общим media_group_id, и без этого мы бы
 * завели по драфту на каждое фото.
 */
export async function findDraftBySourceKey(
  sourceKey: string,
): Promise<Draft | null> {
  const [row] = await db
    .select()
    .from(telegramTaskDrafts)
    .where(eq(telegramTaskDrafts.sourceKey, sourceKey));
  return row ? rowToDraft(row) : null;
}

function rowToDraft(row: typeof telegramTaskDrafts.$inferSelect): Draft {
  let segments: NormalizedSegment[] = [];
  let truncated = 0;
  if (row.segments) {
    try {
      const blob = JSON.parse(row.segments) as SegmentsBlob;
      segments = Array.isArray(blob.segments) ? blob.segments : [];
      truncated = blob.truncated ?? 0;
    } catch {
      segments = [];
    }
  }

  let attachments: DraftAttachment[] = [];
  if (row.attachments) {
    try {
      const parsed = JSON.parse(row.attachments);
      if (Array.isArray(parsed)) attachments = parsed;
    } catch {
      attachments = [];
    }
  }

  return {
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    chatId: row.chatId,
    messageId: row.messageId,
    status: row.status as DraftStatus,
    rawText: row.rawText ?? "",
    segments,
    attachments,
    truncated,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}
