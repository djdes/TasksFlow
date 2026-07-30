/**
 * Роутер входящих апдейтов Telegram.
 *
 * Единая точка для обоих транспортов: long-poll и webhook отдают сюда
 * один и тот же объект TgUpdate.
 *
 * Первое, что делает любой путь, — резолвит привязанного пользователя.
 * companyId ВСЕГДА берётся из профиля привязанного сотрудника и никогда
 * из содержимого сообщения: иначе мультитенантность пробивается одной
 * подделанной строкой.
 */

import type { User } from "@shared/schema";
import { storage } from "../storage";
import { getPublicTasksflowBaseUrl } from "../public-urls";
import { logger } from "../logger";
import type { TelegramRuntime } from "./index";
import type { TgMessage, TgUpdate } from "./client";
import { extractAttachment, type DraftAttachment } from "./attachments";
import { startComposing } from "./composer";
import { handleCallback } from "./handle-callback";
import { handleTasksCommand, handleIncomingTaskPhoto } from "./my-tasks";
import { canCreateTasks, escapeHtml } from "./util";

/**
 * Буфер альбомов. Telegram присылает каждое фото альбома отдельным
 * апдейтом с общим media_group_id — без буфера мы завели бы по черновику
 * на каждое фото. Ждём короткую паузу после последнего кадра и стартуем
 * разбор один раз.
 */
const ALBUM_DEBOUNCE_MS = 1_500;
type AlbumBuffer = {
  messages: TgMessage[];
  timer: NodeJS.Timeout;
};
const albums = new Map<string, AlbumBuffer>();

export async function handleUpdate(
  update: TgUpdate,
  runtime: TelegramRuntime,
): Promise<void> {
  if (update.message) {
    await handleMessage(update.message, runtime);
    return;
  }
  if (update.callback_query) {
    await handleCallback(update.callback_query, runtime);
  }
}

async function handleMessage(
  message: TgMessage,
  runtime: TelegramRuntime,
): Promise<void> {
  // Только личка: групповые чаты вне рамок v1.
  if (message.chat.type !== "private") return;

  const tgUserId = message.from?.id;
  if (!tgUserId) return;

  const chatId = message.chat.id;
  const user = await storage.findUserByTelegramUserId(tgUserId);

  if (!user) {
    await sendNotLinked(chatId, runtime);
    return;
  }

  // Любое сообщение от привязанного юзера обновляет chat_id: он мог
  // измениться, а без него бот не сможет написать первым.
  if (user.tgChatId !== chatId || !user.tgStartedAt) {
    await storage.markTelegramStarted(user.id, chatId).catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), userId: user.id },
        "[telegram] не удалось сохранить chat_id",
      );
    });
  }

  const text = (message.text || message.caption || "").trim();

  if (text.startsWith("/start")) {
    await sendGreeting(chatId, user, runtime);
    return;
  }
  if (text.startsWith("/help")) {
    await sendHelp(chatId, user, runtime);
    return;
  }
  if (text.startsWith("/tasks")) {
    await handleTasksCommand(chatId, user, runtime);
    return;
  }

  // Фото без подписи — это, скорее всего, отчёт по задаче, а не новая
  // задача. Сначала пробуем закрыть задачу, и только потом разбираем текст.
  const hasPhoto = Boolean(message.photo?.length || message.document);
  if (hasPhoto && !text) {
    const handled = await handleIncomingTaskPhoto(message, user, runtime);
    if (handled) return;
  }

  if (!canCreateTasks(user)) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      text: "Задачи ставит руководитель. Свои задачи смотри командой /tasks.",
    });
    return;
  }

  if (message.media_group_id) {
    bufferAlbumMessage(message, user, runtime);
    return;
  }

  if (!text) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      text: "Напиши, что нужно сделать — я соберу задачу.",
    });
    return;
  }

  const attachment = extractAttachment(message, 0);
  await startComposing({
    runtime,
    author: user,
    chatId,
    text,
    attachments: attachment ? [attachment] : [],
    sourceKey: `msg:${chatId}:${message.message_id}`,
  });
}

/** Копим кадры альбома и стартуем разбор один раз после паузы. */
function bufferAlbumMessage(
  message: TgMessage,
  user: User,
  runtime: TelegramRuntime,
): void {
  const key = `${message.chat.id}:${message.media_group_id}`;
  const existing = albums.get(key);

  if (existing) {
    existing.messages.push(message);
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => void flushAlbum(key, user, runtime), ALBUM_DEBOUNCE_MS);
    return;
  }

  albums.set(key, {
    messages: [message],
    timer: setTimeout(() => void flushAlbum(key, user, runtime), ALBUM_DEBOUNCE_MS),
  });
}

async function flushAlbum(
  key: string,
  user: User,
  runtime: TelegramRuntime,
): Promise<void> {
  const buffer = albums.get(key);
  albums.delete(key);
  if (!buffer || buffer.messages.length === 0) return;

  const first = buffer.messages[0];
  // Подпись может быть на любом кадре альбома, не обязательно на первом.
  const text = buffer.messages
    .map((m) => (m.caption || m.text || "").trim())
    .find((t) => t.length > 0);

  if (!text) {
    await runtime.client.sendMessage({
      chat_id: first.chat.id,
      text: "К фото нужна подпись — что именно сделать?",
    });
    return;
  }

  const attachments: DraftAttachment[] = [];
  for (const m of buffer.messages) {
    const a = extractAttachment(m, attachments.length);
    if (a) attachments.push(a);
  }

  await startComposing({
    runtime,
    author: user,
    chatId: first.chat.id,
    text,
    attachments,
    sourceKey: key,
  });
}

async function sendGreeting(
  chatId: number,
  user: User,
  runtime: TelegramRuntime,
): Promise<void> {
  await runtime.client.sendMessage({
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `Привет, ${escapeHtml(user.name || "коллега")}! Аккаунт привязан.\n\n` +
      (canCreateTasks(user)
        ? "Напиши задачу обычным текстом — например «Олегу каждую пятницу мыть холодильник, фото обязательно, 200р» — и я покажу карточку перед созданием.\n\n"
        : "") +
      "Команда /tasks — твои задачи на сегодня.",
  });
}

async function sendHelp(
  chatId: number,
  user: User,
  runtime: TelegramRuntime,
): Promise<void> {
  await runtime.client.sendMessage({
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      "<b>Что я умею</b>\n" +
      "/tasks — задачи на сегодня, закрытие фотографией\n" +
      (canCreateTasks(user)
        ? "Просто напиши текст — разберу его в задачу и покажу карточку. " +
          "Фото в том же сообщении станут примером «как надо».\n"
        : "") +
      "\nТекст задачи правится на сайте, в боте — кнопками.",
  });
}

async function sendNotLinked(
  chatId: number,
  runtime: TelegramRuntime,
): Promise<void> {
  const accountUrl = `${getPublicTasksflowBaseUrl()}/account`;
  await runtime.client.sendMessage({
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      "Не вижу твой аккаунт TasksFlow.\n\n" +
      `Открой <a href="${accountUrl}">страницу «Аккаунт»</a> на сайте и нажми ` +
      "«Привязать Telegram» — после этого возвращайся сюда.",
  });
}
