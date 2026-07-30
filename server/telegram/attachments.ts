/**
 * Фото-вложения из сообщения → примеры фото у создаваемых задач.
 *
 * Файлы НЕ качаются при разборе — только на этапе создания задачи.
 * Иначе каждый отменённый черновик оставлял бы мусор в uploads/, а
 * file_id живёт достаточно долго, чтобы этим не рисковать.
 */

import crypto from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import type { TelegramClient, TgMessage } from "./client";
import { logger } from "../logger";

/** Тот же лимит, что у веб-загрузки (multer). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Тот же allowlist, что в routes.ts — SVG сюда не должен попасть никогда. */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

export type DraftAttachment = {
  /** Порядковый номер в драфте — он же индекс в callback_data. */
  key: number;
  fileId: string;
  /** Расширение из mime, если известно. Для photo Telegram всегда jpg. */
  ext: string;
  /** Индексы сегментов, к которым прикреплён файл. */
  targetSegmentIndexes: number[];
};

/**
 * Достаёт фото/документ-картинку из сообщения.
 * Для photo берём последний размер — он самый большой.
 */
export function extractAttachment(
  message: TgMessage,
  key: number,
): DraftAttachment | null {
  if (message.photo && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1];
    return {
      key,
      fileId: largest.file_id,
      ext: ".jpg",
      targetSegmentIndexes: [0],
    };
  }

  if (message.document) {
    const mime = message.document.mime_type ?? "";
    const ext = EXT_BY_MIME[mime];
    // Документы не-картинки игнорируем молча: примеры фото — это фото.
    if (!ext) return null;
    if (message.document.file_size && message.document.file_size > MAX_FILE_BYTES) {
      return null;
    }
    return {
      key,
      fileId: message.document.file_id,
      ext,
      targetSegmentIndexes: [0],
    };
  }

  return null;
}

/** Файл ко всем задачам / ни к одной / тогл одной. */
export function toggleFileTarget(
  attachment: DraftAttachment,
  segmentIndex: number,
): DraftAttachment {
  const has = attachment.targetSegmentIndexes.includes(segmentIndex);
  return {
    ...attachment,
    targetSegmentIndexes: has
      ? attachment.targetSegmentIndexes.filter((i) => i !== segmentIndex)
      : [...attachment.targetSegmentIndexes, segmentIndex].sort((a, b) => a - b),
  };
}

export function setFileToAll(
  attachment: DraftAttachment,
  segmentCount: number,
): DraftAttachment {
  return {
    ...attachment,
    targetSegmentIndexes: Array.from({ length: segmentCount }, (_, i) => i),
  };
}

export function clearFileTargets(attachment: DraftAttachment): DraftAttachment {
  return { ...attachment, targetSegmentIndexes: [] };
}

/** Файлы, назначенные конкретному сегменту. */
export function attachmentsForSegment(
  attachments: DraftAttachment[],
  segmentIndex: number,
): DraftAttachment[] {
  return attachments.filter((a) =>
    a.targetSegmentIndexes.includes(segmentIndex),
  );
}

/**
 * Скачивает файл в uploads/ и возвращает публичный URL.
 *
 * Имя файла генерим сами, ровно как в веб-роуте загрузки: имя от
 * Telegram в путь не попадает вообще, поэтому path traversal невозможен.
 */
export async function downloadAttachment(
  client: TelegramClient,
  attachment: DraftAttachment,
  taskId: number,
): Promise<string | null> {
  try {
    const file = await client.getFile(attachment.fileId);
    if (!file.file_path) return null;
    if (file.file_size && file.file_size > MAX_FILE_BYTES) {
      logger.warn(
        { fileId: attachment.fileId, size: file.file_size },
        "[tg-files] файл больше лимита — пропускаем",
      );
      return null;
    }

    const buf = await client.downloadFile(file.file_path, MAX_FILE_BYTES);

    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

    const filename = `task-${taskId}-${Date.now()}-${crypto
      .randomBytes(8)
      .toString("hex")}${attachment.ext}`;
    await writeFile(path.join(uploadsDir, filename), buf);
    return `/uploads/${filename}`;
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        fileId: attachment.fileId,
      },
      "[tg-files] не удалось скачать вложение",
    );
    return null;
  }
}
