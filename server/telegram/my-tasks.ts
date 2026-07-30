/**
 * «Мои задачи» и закрытие задачи фотографией.
 *
 * Вся бизнес-логика — в сервисах из server/services: бот только доставляет
 * фото и рисует текст. Премии, чек-лист-гейт, ветка верификации, аудит и
 * WeSetup-зеркалирование работают ровно как на сайте, потому что это
 * буквально тот же код.
 */

import crypto from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { and, eq, lt } from "drizzle-orm";
import type { Task, User } from "@shared/schema";
import { db } from "../db";
import { telegramChatState, telegramTaskMessages } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "../logger";
import { isTaskVisibleOn, formatDueBadge } from "@shared/task-visibility";
import { completeTaskForActor } from "../services/task-complete";
import { attachChecklistItemPhoto, attachTaskPhoto } from "../services/task-photo";
import { isTaskServiceError, type TaskActor } from "../services/task-actor";
import type { TelegramRuntime } from "./index";
import type { TgCallbackQuery, TgMessage, TgReplyMarkup } from "./client";
import { buildCallback, type CallbackAction } from "./callbacks";
import { escapeHtml } from "./util";
import { extractAttachment, MAX_FILE_BYTES } from "./attachments";

/** «Жду фото» живёт 15 минут — дальше это забытый тап по кнопке. */
const AWAIT_TTL_SEC = 15 * 60;

/** Задачи сотрудника на сегодня — тем же фильтром, что и дашборд. */
export async function loadTodayTasks(user: User): Promise<Task[]> {
  if (!user.companyId) return [];
  const all = await storage.getTasks(user.companyId);
  const now = new Date();
  const dow = now.getDay();
  const dom = now.getDate();

  return all
    .filter((t) => t.workerId === user.id)
    .filter((t) => isTaskVisibleOn(t, dow, dom))
    .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted) || a.id - b.id);
}

export async function handleTasksCommand(
  chatId: number,
  user: User,
  runtime: TelegramRuntime,
): Promise<void> {
  const view = await renderTaskList(user);
  const sent = await runtime.client.sendMessage({
    chat_id: chatId,
    parse_mode: "HTML",
    text: view.text,
    reply_markup: view.reply_markup,
  });
  // Запоминаем сообщение, чтобы фото-reply на него нашло задачу.
  await rememberTaskMessage(chatId, sent.message_id, 0, null).catch(() => null);
}

async function renderTaskList(
  user: User,
): Promise<{ text: string; reply_markup: TgReplyMarkup }> {
  const tasks = await loadTodayTasks(user);
  if (tasks.length === 0) {
    return {
      text: "📋 На сегодня задач нет.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Обновить", callback_data: buildCallback({ kind: "tasksRefresh" }) }],
        ],
      },
    };
  }

  const lines = [`📋 <b>На сегодня: ${tasks.length}</b>`, ""];
  tasks.forEach((task, i) => {
    lines.push(`${i + 1}. ${taskLine(task)}`);
  });

  const keyboard: TgReplyMarkup["inline_keyboard"] = [];
  for (let i = 0; i < tasks.length; i += 5) {
    keyboard.push(
      tasks.slice(i, i + 5).map((task, j) => ({
        text: `${i + j + 1}`,
        callback_data: buildCallback({ kind: "taskOpen", taskId: task.id }),
      })),
    );
  }
  keyboard.push([
    { text: "🔄 Обновить", callback_data: buildCallback({ kind: "tasksRefresh" }) },
  ]);

  return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
}

function taskLine(task: Task): string {
  const chips: string[] = [];
  if (task.checklist.length > 0) {
    const done = task.checklist.filter((c) => c.done).length;
    chips.push(`(${done}/${task.checklist.length})`);
  }
  if (task.requiresPhoto) chips.push("📸");
  if (task.price > 0) chips.push(`💰${task.price}`);
  if (task.dueDate) chips.push(`📅 ${formatDueBadge(task.dueDate)}`);

  const mark = task.isCompleted
    ? "✅"
    : task.verificationStatus === "submitted"
      ? "🕓"
      : "⬜";
  return `${mark} ${escapeHtml(task.title)} ${chips.join(" ")}`.trim();
}

export async function handleTaskCallback(
  action: Extract<
    CallbackAction,
    { kind: "taskOpen" } | { kind: "taskPhoto" } | { kind: "taskItemPhoto" } | { kind: "tasksRefresh" }
  >,
  query: TgCallbackQuery,
  user: User,
  runtime: TelegramRuntime,
): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const answer = (text?: string, alert = false) =>
    runtime.client
      .answerCallbackQuery({ callback_query_id: query.id, text, show_alert: alert })
      .catch(() => null);

  if (!chatId || !messageId) {
    await answer();
    return;
  }

  if (action.kind === "tasksRefresh") {
    const view = await renderTaskList(user);
    await runtime.client
      .editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: view.text,
        parse_mode: "HTML",
        reply_markup: view.reply_markup,
      })
      .catch(() => null);
    await answer("Обновил");
    return;
  }

  // Задача обязана принадлежать этому сотруднику и его компании.
  const task = await storage.getTask(action.taskId);
  if (!task || task.companyId !== user.companyId || task.workerId !== user.id) {
    await answer("Задача не найдена", true);
    return;
  }

  if (action.kind === "taskOpen") {
    const view = renderTaskCard(task);
    const sent = await runtime.client.sendMessage({
      chat_id: chatId,
      parse_mode: "HTML",
      text: view.text,
      reply_markup: view.reply_markup,
    });
    await rememberTaskMessage(chatId, sent.message_id, task.id, null).catch(() => null);

    // Примеры «как надо» — отдельным альбомом под карточкой.
    const examples = task.examplePhotoUrls.slice(0, 10);
    if (examples.length > 0) {
      const base = publicBase();
      await runtime.client
        .sendMediaGroup({
          chat_id: chatId,
          media: examples.map((url, i) => ({
            type: "photo" as const,
            media: `${base}${url}`,
            caption: i === 0 ? "Пример: как должно выглядеть" : undefined,
          })),
        })
        .catch((err) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), taskId: task.id },
            "[tg-tasks] не удалось отправить примеры фото",
          );
        });
    }
    await answer();
    return;
  }

  // taskPhoto / taskItemPhoto — переводим чат в режим «жду фото».
  const itemId = action.kind === "taskItemPhoto" ? action.itemId : null;
  if (itemId && !task.checklist.some((c) => c.id === itemId)) {
    await answer("Пункт не найден", true);
    return;
  }

  await setAwaitingPhoto(chatId, task.id, itemId);
  const what = itemId
    ? task.checklist.find((c) => c.id === itemId)?.title ?? "пункт"
    : task.title;
  await runtime.client.sendMessage({
    chat_id: chatId,
    parse_mode: "HTML",
    text: `📸 Жду фото: <b>${escapeHtml(what)}</b>\n\nПришли фото следующим сообщением.`,
  });
  await answer();
}

function renderTaskCard(task: Task): { text: string; reply_markup: TgReplyMarkup } {
  const lines = [`<b>${escapeHtml(task.title)}</b>`];
  if (task.description) lines.push(escapeHtml(task.description));

  const chips: string[] = [];
  if (task.requiresPhoto) chips.push("📸 нужно фото");
  if (task.price > 0) chips.push(`💰 ${task.price} ₽`);
  if (task.dueDate) chips.push(`📅 ${formatDueBadge(task.dueDate)}`);
  if (chips.length) {
    lines.push("");
    lines.push(chips.join(" · "));
  }

  if (task.photoUrls.length > 0) {
    lines.push(`\nЗагружено фото: ${task.photoUrls.length}`);
  }

  const keyboard: TgReplyMarkup["inline_keyboard"] = [];

  if (task.checklist.length > 0) {
    lines.push("");
    lines.push("<b>Чек-лист:</b>");
    for (const item of task.checklist) {
      lines.push(`${item.done ? "✅" : "⬜"} ${escapeHtml(item.title)}`);
    }
    // Кнопка на каждый несфотканный пункт: задача не закроется, пока
    // каждый не получит фото.
    for (const item of task.checklist.filter((c) => !c.done)) {
      keyboard.push([
        {
          text: `📸 ${item.title.slice(0, 30)}`,
          callback_data: buildCallback({
            kind: "taskItemPhoto",
            taskId: task.id,
            itemId: item.id,
          }),
        },
      ]);
    }
  } else if (!task.isCompleted) {
    keyboard.push([
      {
        text: "📸 Отправить фото",
        callback_data: buildCallback({ kind: "taskPhoto", taskId: task.id }),
      },
    ]);
  }

  if (task.isCompleted) {
    lines.push("\n✅ Задача закрыта");
  } else if (task.verificationStatus === "submitted") {
    lines.push("\n🕓 Отправлено на проверку");
  }

  keyboard.push([
    { text: "🔄 К списку", callback_data: buildCallback({ kind: "tasksRefresh" }) },
  ]);

  return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
}

/**
 * Входящее фото: либо reply на карточку задачи, либо ответ на «жду фото».
 * Возвращает true, если фото израсходовано на задачу.
 */
export async function handleIncomingTaskPhoto(
  message: TgMessage,
  user: User,
  runtime: TelegramRuntime,
): Promise<boolean> {
  const chatId = message.chat.id;

  // Приоритет у reply: он точно указывает, к какой задаче фото.
  let taskId: number | null = null;
  let itemId: string | null = null;

  if (message.reply_to_message) {
    const link = await findTaskMessage(chatId, message.reply_to_message.message_id);
    if (link && link.taskId > 0) {
      taskId = link.taskId;
      itemId = link.checklistItemId;
    }
  }

  if (taskId === null) {
    const awaiting = await getAwaitingPhoto(chatId);
    if (awaiting) {
      taskId = awaiting.taskId;
      itemId = awaiting.itemId;
    }
  }

  if (taskId === null) return false;

  const attachment = extractAttachment(message, 0);
  if (!attachment) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      text: "Это не похоже на фото. Пришли картинку.",
    });
    return true;
  }

  const actor: TaskActor = { kind: "telegram", userId: user.id };

  try {
    const photoUrl = await saveIncomingPhoto(runtime, attachment, taskId);
    if (!photoUrl) {
      await runtime.client.sendMessage({
        chat_id: chatId,
        text: "Не смог сохранить фото. Попробуй ещё раз.",
      });
      return true;
    }

    if (itemId) {
      await attachChecklistItemPhoto({ taskId, itemId, photoUrl, actor });
    } else {
      await attachTaskPhoto({ taskId, photoUrl, actor });
    }

    await clearAwaitingPhoto(chatId);
    await finishAfterPhoto(chatId, taskId, user, runtime);
  } catch (err) {
    const message = isTaskServiceError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : "Не удалось принять фото";
    await runtime.client.sendMessage({ chat_id: chatId, text: `⚠️ ${message}` });
  }
  return true;
}

/**
 * После фото пробуем закрыть задачу. Гейты (чек-лист не добит, нужно ещё
 * фото) — это НЕ ошибка: сообщаем прогресс и ждём следующее фото.
 */
async function finishAfterPhoto(
  chatId: number,
  taskId: number,
  user: User,
  runtime: TelegramRuntime,
): Promise<void> {
  try {
    const result = await completeTaskForActor({
      taskId,
      actor: { kind: "telegram", userId: user.id },
    });

    if (result.outcome === "submitted") {
      // Честно: не «готово», а «ждёт проверяющего». Премия — после approve.
      await runtime.client.sendMessage({
        chat_id: chatId,
        parse_mode: "HTML",
        text: `🕓 <b>${escapeHtml(result.task.title)}</b>\nФото принято, отправлено на проверку.`,
      });
      return;
    }

    const bonus =
      result.outcome === "completed" && result.task.price > 0
        ? `\n💰 Начислено: ${result.task.price} ₽`
        : "";
    await runtime.client.sendMessage({
      chat_id: chatId,
      parse_mode: "HTML",
      text: `✅ <b>${escapeHtml(result.task.title)}</b>\nЗадача закрыта.${bonus}`,
    });
  } catch (err) {
    if (isTaskServiceError(err) && err.status === 400) {
      // Чек-лист не добит или нужно ещё фото — нормальный ход событий.
      const task = await storage.getTask(taskId);
      const progress =
        task && task.checklist.length > 0
          ? `\n\nОсталось сфоткать: ${task.checklist.filter((c) => !c.done).length}`
          : "";
      await runtime.client.sendMessage({
        chat_id: chatId,
        text: `📸 Фото принято.${progress}`,
      });
      return;
    }
    throw err;
  }
}

async function saveIncomingPhoto(
  runtime: TelegramRuntime,
  attachment: { fileId: string; ext: string },
  taskId: number,
): Promise<string | null> {
  const file = await runtime.client.getFile(attachment.fileId);
  if (!file.file_path) return null;
  if (file.file_size && file.file_size > MAX_FILE_BYTES) return null;

  const buf = await runtime.client.downloadFile(file.file_path, MAX_FILE_BYTES);
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  // Имя генерим сами, как в веб-роуте: имя от Telegram в путь не попадает.
  const filename = `task-${taskId}-${Date.now()}-${crypto
    .randomBytes(8)
    .toString("hex")}${attachment.ext}`;
  await writeFile(path.join(uploadsDir, filename), buf);
  return `/uploads/${filename}`;
}

// ===== Состояние чата и связки сообщений =====

async function setAwaitingPhoto(
  chatId: number,
  taskId: number,
  itemId: string | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(telegramChatState)
    .values({ chatId, awaitingTaskId: taskId, awaitingItemId: itemId, updatedAt: now })
    .onDuplicateKeyUpdate({
      set: { awaitingTaskId: taskId, awaitingItemId: itemId, updatedAt: now },
    });
}

async function getAwaitingPhoto(
  chatId: number,
): Promise<{ taskId: number; itemId: string | null } | null> {
  const cutoff = Math.floor(Date.now() / 1000) - AWAIT_TTL_SEC;
  const [row] = await db
    .select()
    .from(telegramChatState)
    .where(eq(telegramChatState.chatId, chatId));
  if (!row || !row.awaitingTaskId) return null;
  // Протухшее ожидание игнорируем: фото месяц спустя — не отчёт по задаче.
  if (row.updatedAt < cutoff) return null;
  return { taskId: row.awaitingTaskId, itemId: row.awaitingItemId };
}

async function clearAwaitingPhoto(chatId: number): Promise<void> {
  await db
    .delete(telegramChatState)
    .where(eq(telegramChatState.chatId, chatId))
    .catch(() => null);
}

async function rememberTaskMessage(
  chatId: number,
  messageId: number,
  taskId: number,
  checklistItemId: string | null,
): Promise<void> {
  await db
    .insert(telegramTaskMessages)
    .values({
      chatId,
      messageId,
      taskId,
      checklistItemId,
      createdAt: Math.floor(Date.now() / 1000),
    })
    .onDuplicateKeyUpdate({ set: { taskId, checklistItemId } });
}

async function findTaskMessage(
  chatId: number,
  messageId: number,
): Promise<{ taskId: number; checklistItemId: string | null } | null> {
  const [row] = await db
    .select()
    .from(telegramTaskMessages)
    .where(
      and(
        eq(telegramTaskMessages.chatId, chatId),
        eq(telegramTaskMessages.messageId, messageId),
      ),
    );
  return row ? { taskId: row.taskId, checklistItemId: row.checklistItemId } : null;
}

/** Абсолютный URL для sendMediaGroup: Telegram сам качает файл по ссылке. */
function publicBase(): string {
  const env =
    process.env.TASKSFLOW_PUBLIC_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.PUBLIC_BASE_URL;
  return (env || "https://tasksflow.ru").replace(/\/$/, "");
}
