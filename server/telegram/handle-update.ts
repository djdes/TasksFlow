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
import { startComposing, loadAssignableWorkers } from "./composer";
import { handleCallback } from "./handle-callback";
import {
  handleTasksCommand,
  handleIncomingTaskPhoto,
  renderWorkerTasks,
  renderWorkerTasksMenu,
} from "./my-tasks";
import { canCreateTasks, escapeHtml } from "./util";
import { parseMessage, matchWorker } from "./parse-message";
import {
  bindGroupIfAbsent,
  getGroupOwner,
  formatSenderName,
  type GroupOwner,
} from "./group-owners";

/**
 * Буфер альбомов. Telegram присылает каждое фото альбома отдельным
 * апдейтом с общим media_group_id — без буфера мы завели бы по черновику
 * на каждое фото. Ждём короткую паузу после последнего кадра и стартуем
 * разбор один раз.
 */
const ALBUM_DEBOUNCE_MS = 1_500;
type AlbumBuffer = {
  messages: TgMessage[];
  /** Подпись, уже очищенная от упоминания бота. */
  text: string;
  /** Кто просил, если это не автор задачи (групповой сценарий). */
  requestedBy: string | null;
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

/**
 * Обращаются ли к боту в этом сообщении.
 *
 * В личке — всегда. В группе только явно: упоминание @username, reply на
 * сообщение бота или команда с суффиксом (/tasks@thetasksflowbot). Иначе
 * бот разбирал бы всю болтовню коллег и выжрал лимит AI за пять минут.
 *
 * Возвращает текст БЕЗ упоминания — «@bot поставь задачу» должно стать
 * задачей «поставь задачу», а не тащить имя бота в заголовок.
 */
export function resolveAddressing(
  message: TgMessage,
  me: { id: number; username: string | null },
): { addressed: boolean; text: string } {
  const raw = (message.text || message.caption || "").trim();
  const isPrivate = message.chat.type === "private";
  if (isPrivate) return { addressed: true, text: raw };

  const username = me.username;
  let addressed = false;
  let text = raw;

  if (username) {
    const mention = new RegExp(`@${escapeRegExp(username)}\\b`, "gi");
    if (mention.test(text)) {
      addressed = true;
      text = text.replace(mention, " ").replace(/\s{2,}/g, " ").trim();
    }
    // /tasks@thetasksflowbot — так Telegram оформляет команды в группах.
    const cmdSuffix = new RegExp(`^(/[a-z_]+)@${escapeRegExp(username)}\\b`, "i");
    if (cmdSuffix.test(text)) {
      addressed = true;
      text = text.replace(cmdSuffix, "$1").trim();
    }
  }

  // Reply на сообщение бота — обращение к нему, даже без упоминания.
  if (message.reply_to_message?.from?.id === me.id) {
    addressed = true;
  }

  return { addressed, text };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleMessage(
  message: TgMessage,
  runtime: TelegramRuntime,
): Promise<void> {
  const tgUserId = message.from?.id;
  if (!tgUserId) return;
  // Свои же сообщения и другие боты нас не интересуют.
  if (message.from?.is_bot) return;

  const isPrivate = message.chat.type === "private";
  const { addressed, text: addressedText } = resolveAddressing(message, runtime.me);
  // В группе молчим, пока не позвали. Молча — без «я вас не понял».
  if (!addressed) return;

  const chatId = message.chat.id;
  const user = await storage.findUserByTelegramUserId(tgUserId);

  // Текст уже очищен от упоминания бота: «@bot помыть пол» → «помыть пол».
  const text = addressedText;
  // В группе отвечаем реплаем, иначе непонятно, кому бот отвечает.
  const replyTo = isPrivate ? undefined : message.message_id;

  // ===== Групповая ветка =====
  if (!isPrivate) {
    // /start в группе привязывает ЧАТ к аккаунту отправителя, а не
    // трогает его личный диалог с ботом.
    if (text.startsWith("/start")) {
      await handleGroupStart(message, user, runtime, replyTo);
      return;
    }

    const owner = await getGroupOwner(chatId);
    if (!owner) {
      // Группа ничейная: не знаем, в какую компанию класть задачу.
      await runtime.client.sendMessage({
        chat_id: chatId,
        reply_to_message_id: replyTo,
        text:
          "Группа ещё не привязана к компании. " +
          "Пусть руководитель с аккаунтом TasksFlow отправит здесь /start — " +
          "после этого задачи смогут ставить все участники.",
      });
      return;
    }

    await handleGroupMessage({ message, runtime, owner, sender: user, text, replyTo });
    return;
  }

  // ===== Личка =====

  // /start с кодом из ссылки на сайте — привязка аккаунта. Проверяем ДО
  // «не вижу твой аккаунт»: смысл кода как раз в том, что связи ещё нет.
  const startCode = /^\/start(?:@\S+)?\s+([A-Za-z0-9_-]{6,64})$/.exec(text)?.[1];
  if (startCode && message.from) {
    const { linkTelegramByCode } = await import("./link");
    const result = await linkTelegramByCode({
      code: startCode,
      telegramUserId: tgUserId,
      telegramUsername: message.from.username ?? null,
      telegramFirstName: message.from.first_name ?? null,
      chatId,
    });

    if (result.ok) {
      await sendGreeting(chatId, result.user, runtime);
      return;
    }
    await runtime.client.sendMessage({
      chat_id: chatId,
      text:
        result.reason === "already_linked_other"
          ? "Этот Telegram уже привязан к другому аккаунту TasksFlow."
          : "Ссылка устарела. Открой страницу «Аккаунт» на сайте и нажми «Привязать» ещё раз.",
    });
    return;
  }

  if (!user) {
    await sendNotLinked(chatId, runtime, message.message_id);
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

  if (text.startsWith("/start")) {
    await sendGreeting(chatId, user, runtime, replyTo);
    return;
  }
  if (text.startsWith("/help")) {
    await sendHelp(chatId, user, runtime, replyTo);
    return;
  }
  if (text.startsWith("/tasks")) {
    await handleTasksCommand(chatId, user, runtime, replyTo);
    return;
  }

  // Фото без подписи — это, скорее всего, отчёт по задаче, а не новая
  // задача. Сначала пробуем закрыть задачу, и только потом разбираем текст.
  const hasPhoto = Boolean(message.photo?.length || message.document);
  if (hasPhoto && !text) {
    const handled = await handleIncomingTaskPhoto(message, user, runtime);
    if (handled) return;
  }

  // Неизвестная слэш-команда — это опечатка, а не задача. Иначе «/tsaks»
  // превратился бы в задачу «tsaks» и ушёл в AI.
  if (text.startsWith("/")) {
    await sendHelp(chatId, user, runtime, replyTo);
    return;
  }

  // «@Олег» без текста — просьба показать его задачи, а не создать новую.
  if (!hasPhoto) {
    const parsed = parseMessage(text);
    if (parsed.assigneeQuery !== null && parsed.taskText.length === 0) {
      await handleWorkerTasksRequest({
        runtime, chatId, viewer: user, query: parsed.assigneeQuery, replyTo,
      });
      return;
    }
  }

  if (!canCreateTasks(user)) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      reply_to_message_id: replyTo,
      text: "Задачи ставит руководитель. Свои задачи смотри командой /tasks.",
    });
    return;
  }

  if (message.media_group_id) {
    bufferAlbumMessage(message, user, runtime, text);
    return;
  }

  if (!text) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      reply_to_message_id: replyTo,
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
    replyTo,
  });
}

/**
 * /start в группе — привязка чата к компании отправителя.
 * First-writer-wins: перехватить уже привязанную группу нельзя, иначе
 * любой участник уводил бы чужие задачи в свою компанию одной командой.
 */
async function handleGroupStart(
  message: TgMessage,
  user: User | undefined,
  runtime: TelegramRuntime,
  replyTo?: number,
): Promise<void> {
  const chatId = message.chat.id;

  if (!user) {
    await sendNotLinked(chatId, runtime, replyTo);
    return;
  }
  if (!user.companyId) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      reply_to_message_id: replyTo,
      text: "У твоего аккаунта не задана компания — привязать группу не получится.",
    });
    return;
  }
  if (!canCreateTasks(user)) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      reply_to_message_id: replyTo,
      text: "Привязать группу может только руководитель или администратор.",
    });
    return;
  }

  const { owner, created } = await bindGroupIfAbsent({
    chatId,
    ownerUserId: user.id,
    companyId: user.companyId,
    chatTitle: message.chat.title ?? null,
  });

  if (!created) {
    const same = owner.ownerUserId === user.id;
    const ownerUser = same ? user : await storage.getUserById(owner.ownerUserId);
    await runtime.client.sendMessage({
      chat_id: chatId,
      reply_to_message_id: replyTo,
      parse_mode: "HTML",
      text: same
        ? "Группа уже привязана к твоей компании — можно ставить задачи."
        : `Группа уже привязана к аккаунту <b>${escapeHtml(ownerUser?.name ?? "другого руководителя")}</b>.`,
    });
    return;
  }

  await runtime.client.sendMessage({
    chat_id: chatId,
    reply_to_message_id: replyTo,
    parse_mode: "HTML",
    text:
      "✅ Группа привязана.\n\n" +
      "Теперь задачу может попросить любой участник — просто упомяните меня: " +
      `«@${escapeHtml(runtime.me.username ?? "bot")} помыть холодильник @Олег».\n\n` +
      "Тем, у кого нет аккаунта TasksFlow, тоже можно: задача создастся " +
      "в этой компании, а в описании будет видно, кто просил.",
  });
}

/**
 * Сообщение в привязанной группе.
 *
 * Автор задачи — отправитель, если он привязан и вправе ставить задачи;
 * иначе владелец группы, а имя просившего уходит в описание. Именно это
 * делает бота полезным для всей смены, а не только для админов.
 */
async function handleGroupMessage(params: {
  message: TgMessage;
  runtime: TelegramRuntime;
  owner: GroupOwner;
  sender: User | undefined;
  text: string;
  replyTo?: number;
}): Promise<void> {
  const { message, runtime, owner, sender, text, replyTo } = params;
  const chatId = message.chat.id;

  if (text.startsWith("/help")) {
    const viewer = sender ?? (await storage.getUserById(owner.ownerUserId));
    if (viewer) await sendHelp(chatId, viewer, runtime, replyTo);
    return;
  }
  if (text.startsWith("/tasks")) {
    // Свои задачи в группе показываем только привязанному человеку —
    // иначе непонятно, чьи именно задачи показывать.
    if (!sender) {
      await sendNotLinked(chatId, runtime, replyTo);
      return;
    }
    await handleTasksCommand(chatId, sender, runtime, replyTo);
    return;
  }
  if (text.startsWith("/")) {
    const viewer = sender ?? (await storage.getUserById(owner.ownerUserId));
    if (viewer) await sendHelp(chatId, viewer, runtime, replyTo);
    return;
  }

  const hasPhoto = Boolean(message.photo?.length || message.document);

  // Автор задачи: отправитель, если может; иначе владелец группы.
  const senderCanCreate =
    sender && sender.companyId === owner.companyId && canCreateTasks(sender);
  const author = senderCanCreate
    ? sender!
    : await storage.getUserById(owner.ownerUserId);
  if (!author) {
    logger.warn({ chatId, ownerUserId: owner.ownerUserId }, "[tg-group] владелец не найден");
    return;
  }

  // Пустое упоминание бота (текста не осталось) → меню задач по сотрудникам.
  if (!text && !hasPhoto) {
    await handleWorkerMenu({ runtime, chatId, viewer: author, replyTo });
    return;
  }

  // «@Олег» без текста задачи → сводка его задач.
  if (!hasPhoto) {
    const parsed = parseMessage(text);
    if (parsed.assigneeQuery !== null && parsed.taskText.length === 0) {
      await handleWorkerTasksRequest({
        runtime, chatId, viewer: author, query: parsed.assigneeQuery, replyTo,
      });
      return;
    }
  }

  if (!text) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      reply_to_message_id: replyTo,
      text: "К фото нужна подпись — что именно сделать?",
    });
    return;
  }

  // Просил не автор — фиксируем это в описании задачи, иначе потом не
  // разобраться, откуда она взялась.
  const requestedBy =
    senderCanCreate || !message.from ? null : formatSenderName(message.from);

  if (message.media_group_id) {
    bufferAlbumMessage(message, author, runtime, text, requestedBy);
    return;
  }

  const attachment = extractAttachment(message, 0);
  await startComposing({
    runtime,
    author,
    chatId,
    text,
    attachments: attachment ? [attachment] : [],
    sourceKey: `msg:${chatId}:${message.message_id}`,
    replyTo,
    requestedBy,
  });
}

/** Меню «чьи задачи показать» — по пустому упоминанию бота в группе. */
async function handleWorkerMenu(params: {
  runtime: TelegramRuntime;
  chatId: number;
  viewer: User;
  replyTo?: number;
}): Promise<void> {
  const { runtime, chatId, viewer, replyTo } = params;
  const workers = await loadAssignableWorkers(viewer);

  if (workers.length === 0) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      reply_to_message_id: replyTo,
      text: "В компании пока нет сотрудников, которым можно ставить задачи.",
    });
    return;
  }

  const view = await renderWorkerTasksMenu(workers, viewer);
  await runtime.client.sendMessage({
    chat_id: chatId,
    reply_to_message_id: replyTo,
    parse_mode: "HTML",
    text: view.text,
    reply_markup: view.reply_markup,
  });
}

/** «@Олег» без текста → открытые задачи этого сотрудника. */
async function handleWorkerTasksRequest(params: {
  runtime: TelegramRuntime;
  chatId: number;
  viewer: User;
  query: string;
  replyTo?: number;
}): Promise<void> {
  const { runtime, chatId, viewer, query, replyTo } = params;
  const workers = await loadAssignableWorkers(viewer);

  if (!query) {
    await handleWorkerMenu({ runtime, chatId, viewer, replyTo });
    return;
  }

  const worker = matchWorker(query, workers);
  if (!worker) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      reply_to_message_id: replyTo,
      text: `Не понял, кто такой «${query}». Упомяни меня без текста — покажу список.`,
    });
    return;
  }

  const view = await renderWorkerTasks(worker.id, worker.name, viewer);
  await runtime.client.sendMessage({
    chat_id: chatId,
    reply_to_message_id: replyTo,
    parse_mode: "HTML",
    text: view.text,
    reply_markup: view.reply_markup,
  });
}

/** Копим кадры альбома и стартуем разбор один раз после паузы. */
function bufferAlbumMessage(
  message: TgMessage,
  user: User,
  runtime: TelegramRuntime,
  addressedText: string,
  requestedBy: string | null = null,
): void {
  const key = `${message.chat.id}:${message.media_group_id}`;
  const existing = albums.get(key);

  if (existing) {
    existing.messages.push(message);
    if (addressedText) existing.text = addressedText;
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => void flushAlbum(key, user, runtime), ALBUM_DEBOUNCE_MS);
    return;
  }

  albums.set(key, {
    messages: [message],
    text: addressedText,
    requestedBy,
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
  const isPrivate = first.chat.type === "private";
  const replyTo = isPrivate ? undefined : first.message_id;

  // Подпись может быть на любом кадре альбома, не обязательно на первом;
  // текст уже очищен от упоминания бота при приёме.
  const text =
    buffer.text ||
    buffer.messages.map((m) => (m.caption || m.text || "").trim()).find((t) => t.length > 0);

  if (!text) {
    await runtime.client.sendMessage({
      chat_id: first.chat.id,
      reply_to_message_id: replyTo,
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
    replyTo,
    requestedBy: buffer.requestedBy,
  });
}

async function sendGreeting(
  chatId: number,
  user: User,
  runtime: TelegramRuntime,
  replyTo?: number,
): Promise<void> {
  await runtime.client.sendMessage({
    chat_id: chatId,
    parse_mode: "HTML",
    reply_to_message_id: replyTo,
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
  replyTo?: number,
): Promise<void> {
  await runtime.client.sendMessage({
    chat_id: chatId,
    parse_mode: "HTML",
    reply_to_message_id: replyTo,
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
  replyTo?: number,
): Promise<void> {
  const accountUrl = `${getPublicTasksflowBaseUrl()}/account`;
  await runtime.client.sendMessage({
    chat_id: chatId,
    parse_mode: "HTML",
    reply_to_message_id: replyTo,
    text:
      "Не вижу твой аккаунт TasksFlow.\n\n" +
      `Открой <a href="${accountUrl}">страницу «Аккаунт»</a> на сайте и нажми ` +
      "«Привязать Telegram» — после этого возвращайся сюда.",
  });
}
