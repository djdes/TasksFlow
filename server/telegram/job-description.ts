/**
 * Должностная инструкция через Telegram-бота.
 *
 * Руководитель присылает боту файл Word, Excel или PDF. Бот вынимает текст
 * (тот же server/job-description/extract.ts, что у кабинета) и спрашивает
 * кнопками, чья это инструкция; если имя есть в подписи к файлу — не
 * спрашивает. Дальше — обычный путь: разбор диспетчером Ralph, а когда
 * задачи готовы к проверке, бот присылает ссылку на окно «Задачи из
 * инструкции» в «Сотрудниках» (notifyJobDescriptionReady).
 *
 * Выбор сотрудника ждёт 30 минут в памяти процесса: инструкция — разовое
 * действие, а TasksFlow работает одним процессом.
 */

import { randomBytes } from "node:crypto";
import type { JobDescriptionRow, User } from "@shared/schema";
import { canManageUser } from "@shared/roles";
import { JOB_DESCRIPTION_MAX_FILE_BYTES, sourceFromFileName } from "@shared/job-description";
import { storage } from "../storage";
import { accessOf, roleOf } from "../access";
import { logger } from "../logger";
import { getPublicTasksflowBaseUrl } from "../public-urls";
import { extractJobDescriptionFile } from "../job-description/extract";
import type { TelegramRuntime } from "./index";
import type { TgCallbackQuery, TgInlineKeyboardButton, TgMessage } from "./client";
import { escapeHtml } from "./util";

const PENDING_TTL_MS = 30 * 60_000;
const MAX_BUTTONS = 24;

type Pending = { authorId: number; companyId: number; source: Exclude<ReturnType<typeof sourceFromFileName>, "legacy" | null>; fileName: string | null; content: string; at: number };
const pending = new Map<string, Pending>();

const nameOf = (u: Pick<User, "id" | "name" | "phone">) => u.name || u.phone || `#${u.id}`;

/** Файл, который похож на инструкцию: Word, Excel, PDF (картинки — это фотоотчёты). */
export function isJobDescriptionDocument(message: TgMessage): boolean {
  const name = message.document?.file_name ?? "";
  const source = sourceFromFileName(name);
  return source === "docx" || source === "xlsx" || source === "pdf" || source === "legacy";
}

async function canManagePeople(user: User): Promise<boolean> {
  return user.isAdmin || (await accessOf(user)).manageUsers;
}

/** Люди, которым автор вправе давать инструкцию (как «Сотрудники» в кабинете). */
export async function manageableUsers(author: User): Promise<User[]> {
  if (!author.companyId) return [];
  const all = await storage.getAllUsers(author.companyId);
  if (author.isAdmin) return all;
  const access = await accessOf(author);
  const out: User[] = [];
  for (const u of all) if (canManageUser(access, u, await roleOf(u))) out.push(u);
  return out;
}

/** Имя из подписи: «инструкция Олега», «для Анны Петровой» — однозначное совпадение. */
export function matchByCaption(caption: string, people: Pick<User, "id" | "name">[]): number | null {
  const words = caption.toLowerCase().replace(/ё/g, "е").split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 3);
  if (words.length === 0) return null;
  // Основа имени: «Олега», «Олегу» → «оле». Совпадение по началу слова.
  const hits = people.filter((p) => {
    const first = (p.name ?? "").toLowerCase().replace(/ё/g, "е").split(/\s+/)[0] ?? "";
    if (first.length < 3) return false;
    const stem = first.slice(0, Math.max(3, first.length - 1));
    return words.some((w) => w.startsWith(stem) || stem.startsWith(w.slice(0, Math.max(3, w.length - 2))));
  });
  return hits.length === 1 ? hits[0].id : null;
}

/** Файл от руководителя. true — сообщение обработано здесь. */
export async function handleJobDescriptionDocument(message: TgMessage, user: User, runtime: TelegramRuntime): Promise<boolean> {
  const doc = message.document;
  if (!doc || !isJobDescriptionDocument(message) || !user.companyId) return false;
  if (!(await canManagePeople(user))) return false;
  const chatId = message.chat.id;
  const reply = (text: string, extra: Record<string, unknown> = {}) =>
    runtime.client.sendMessage({ chat_id: chatId, reply_to_message_id: message.message_id, text, parse_mode: "HTML", ...extra });

  if (doc.file_size && doc.file_size > JOB_DESCRIPTION_MAX_FILE_BYTES) {
    await reply("Файл больше 5 МБ. Сохраните инструкцию без картинок и пришлите ещё раз.");
    return true;
  }
  let buffer: Buffer;
  try {
    const file = await runtime.client.getFile(doc.file_id);
    if (!file.file_path) throw new Error("no file_path");
    buffer = await runtime.client.downloadFile(file.file_path, JOB_DESCRIPTION_MAX_FILE_BYTES);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[tg-job] файл не скачался");
    await reply("Не получилось скачать файл. Пришлите его ещё раз.");
    return true;
  }
  const extracted = extractJobDescriptionFile(buffer, doc.file_name ?? "instruction");
  if (!extracted.ok) {
    await reply(escapeHtml(extracted.message));
    return true;
  }
  const people = await manageableUsers(user);
  if (people.length === 0) {
    await reply("Сначала добавьте сотрудника в кабинете — потом пришлите его инструкцию.");
    return true;
  }
  const id = randomBytes(4).toString("hex");
  pending.set(id, { authorId: user.id, companyId: user.companyId, source: extracted.source as Pending["source"], fileName: extracted.fileName, content: extracted.content, at: Date.now() });
  sweep();

  const direct = matchByCaption(message.caption ?? "", people);
  if (direct !== null) {
    const target = people.find((p) => p.id === direct)!;
    const sent = await reply(`📄 Инструкция для <b>${escapeHtml(nameOf(target))}</b>…`);
    await startForTarget(id, target, user, runtime, chatId, sent.message_id);
    return true;
  }

  const sorted = [...people].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "ru")).slice(0, MAX_BUTTONS);
  const rows: TgInlineKeyboardButton[][] = [];
  for (let i = 0; i < sorted.length; i += 2) {
    rows.push(sorted.slice(i, i + 2).map((p) => ({ text: nameOf(p).slice(0, 40), callback_data: `jd:${id}:${p.id}` })));
  }
  rows.push([{ text: "Отмена", callback_data: `jd:${id}:0` }]);
  await reply(
    `📄 Прочитал «${escapeHtml(extracted.fileName ?? "инструкцию")}» — ${extracted.content.length} знаков. Чья это инструкция?`,
    { reply_markup: { inline_keyboard: rows } },
  );
  return true;
}

function sweep() {
  const now = Date.now();
  for (const [k, v] of Array.from(pending)) if (now - v.at > PENDING_TTL_MS) pending.delete(k);
}

async function startForTarget(id: string, target: User, author: User, runtime: TelegramRuntime, chatId: number, messageId: number): Promise<void> {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  const { saveJobDescription, runJobDescription, isGatewayConfigured } = await import("../job-description/service");
  await saveJobDescription({ userId: target.id, companyId: p.companyId, createdBy: author.id, source: p.source, fileName: p.fileName, content: p.content });
  void runJobDescription(target.id);
  const text = isGatewayConfigured()
    ? `📄 Инструкция для <b>${escapeHtml(nameOf(target))}</b> принята. Разбираю — когда задачи будут готовы, пришлю ссылку на проверку.`
    : `📄 Инструкция для <b>${escapeHtml(nameOf(target))}</b> сохранена. Разберу, когда подключат диспетчер.`;
  await runtime.client.editMessageText({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }).catch(() => null);
}

/** Кнопка «чья инструкция». true — нажатие обработано здесь. */
export async function handleJobDescriptionCallback(query: TgCallbackQuery, runtime: TelegramRuntime): Promise<boolean> {
  const m = /^jd:([a-f0-9]{8}):(\d{1,9})$/.exec(query.data ?? "");
  if (!m) return false;
  const answer = (text?: string, alert = false) => runtime.client.answerCallbackQuery({ callback_query_id: query.id, text, show_alert: alert }).catch(() => null);
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const p = pending.get(m[1]);
  const user = await storage.findUserByTelegramUserId(query.from.id);
  if (!p || !user || p.authorId !== user.id || chatId === undefined || messageId === undefined) {
    await answer("Кнопка устарела — пришлите файл ещё раз", true);
    return true;
  }
  if (m[2] === "0") {
    pending.delete(m[1]);
    await runtime.client.editMessageText({ chat_id: chatId, message_id: messageId, text: "Инструкцию не отправил." }).catch(() => null);
    await answer();
    return true;
  }
  const target = (await manageableUsers(user)).find((u) => u.id === Number(m[2]));
  if (!target || target.companyId !== p.companyId) {
    await answer("Этому сотруднику инструкцию дать нельзя", true);
    return true;
  }
  await answer("Принято");
  await startForTarget(m[1], target, user, runtime, chatId, messageId);
  return true;
}

/**
 * Предложения готовы — написать автору в Telegram, если он его привязал.
 * Зовётся из сервиса инструкций на любой источник (кабинет, бот): разбор
 * идёт минуту-две, и руководитель не обязан держать «Сотрудники» открытыми.
 */
export async function notifyJobDescriptionReady(row: Pick<JobDescriptionRow, "userId" | "createdBy">, count: number): Promise<void> {
  if (!row.createdBy) return;
  const { getTelegramRuntime } = await import("./index");
  const runtime = getTelegramRuntime();
  if (!runtime) return;
  const author = await storage.getUserById(row.createdBy);
  const employee = await storage.getUserById(row.userId);
  if (!author?.tgChatId || !author.tgStartedAt || !employee) return;
  const url = `${getPublicTasksflowBaseUrl()}/admin/users?review=${employee.id}`;
  await runtime.client.sendMessage({
    chat_id: author.tgChatId,
    parse_mode: "HTML",
    text: `✅ Задачи из инструкции для <b>${escapeHtml(nameOf(employee))}</b> готовы: ${count}. Отметьте нужные и создайте.`,
    reply_markup: { inline_keyboard: [[{ text: "Проверить задачи", url }]] },
  }).catch((err: unknown) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[tg-job] уведомление не ушло");
  });
}

/** Для тестов: ожидающие выборы. */
export function __pendingForTests(): Map<string, Pending> {
  return pending;
}
