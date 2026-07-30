/**
 * Оркестрация: сообщение → черновик → AI → карточка → задачи.
 *
 * Ключевое правило: бот НИКОГДА не остаётся без ответа. Любой отказ AI
 * (не настроен, лимит, таймаут, битый JSON) ведёт в ручной черновик с
 * той же карточкой — руководитель доставит поля кнопками. Сообщение не
 * теряется ни при каком сценарии.
 */

import type { User } from "@shared/schema";
import { storage, DatabaseStorage } from "../storage";
import { logger } from "../logger";
import { createTaskForActor } from "../services/task-create";
import { isTaskServiceError } from "../services/task-actor";
import type { TelegramRuntime } from "./index";
import type { TelegramClient } from "./client";
import {
  buildManualDraft,
  normalizeWorkerResponse,
  type NormalizedSegment,
} from "./normalize";
import { failureMessage, requestTaskParse, type WorkerEnvelope } from "./pf-ai";
import {
  createDraft,
  saveSegments,
  setMessageId,
  setStatus,
  type Draft,
} from "./drafts";
import {
  attachmentsForSegment,
  downloadAttachment,
  type DraftAttachment,
} from "./attachments";
import { renderCreatedSummary, renderSegmentCard, renderSummaryCard, type WorkerOption } from "./cards";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 2_500;

/** Свой лимит поверх лимита ProjectsFlow: один чат не должен съесть общий. */
const USER_PARSES_PER_HOUR = 20;
const parseCounters = new Map<number, number[]>();

export function checkParseRateLimit(userId: number, nowMs = Date.now()): boolean {
  const windowStart = nowMs - 60 * 60 * 1000;
  const hits = (parseCounters.get(userId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= USER_PARSES_PER_HOUR) {
    parseCounters.set(userId, hits);
    return false;
  }
  hits.push(nowMs);
  parseCounters.set(userId, hits);
  return true;
}

/** Сотрудники, которым автор ВПРАВЕ ставить задачи. */
export async function loadAssignableWorkers(
  author: User,
): Promise<WorkerOption[]> {
  if (!author.companyId) return [];
  const all = await storage.getAllUsers(author.companyId);

  const managed = DatabaseStorage.parseManagedWorkerIds(author.managedWorkerIds);
  const allowedIds = author.isAdmin
    ? null
    : new Set([...(Array.isArray(managed) ? managed : []), author.id]);

  return all
    .filter((u) => (allowedIds ? allowedIds.has(u.id) : true))
    .map((u) => ({
      id: u.id,
      name: u.name || u.phone || `#${u.id}`,
      position: u.position ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function buildEnvelope(params: {
  author: User;
  workers: WorkerOption[];
  categories: string[];
  hasPhotos: number;
  message: string;
  now?: Date;
}): WorkerEnvelope {
  const now = params.now ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    app: "tasksflow",
    v: 1,
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    dow: now.getDay(),
    author: {
      name: params.author.name || "руководитель",
      role: params.author.isAdmin ? "admin" : "manager",
    },
    members: params.workers.map((w) => ({
      id: w.id,
      name: w.name,
      position: w.position,
    })),
    categories: params.categories,
    hasPhotos: params.hasPhotos,
    message: params.message,
  };
}

/** Существующие категории компании — подсказка модели, не ограничение. */
async function loadCategories(companyId: number): Promise<string[]> {
  const tasks = await storage.getTasks(companyId);
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.category) set.add(t.category);
  }
  return Array.from(set).slice(0, 30);
}

/**
 * Точка входа: пришло сообщение с текстом (и, возможно, фото).
 * Возвращается быстро — вся долгая работа уходит в фон.
 */
export async function startComposing(params: {
  runtime: TelegramRuntime;
  author: User;
  chatId: number;
  text: string;
  attachments: DraftAttachment[];
  sourceKey: string | null;
}): Promise<void> {
  const { runtime, author, chatId, text, attachments, sourceKey } = params;
  if (!author.companyId) {
    await runtime.client.sendMessage({
      chat_id: chatId,
      text: "У аккаунта не задана компания — задачи ставить не получится.",
    });
    return;
  }

  const draft = await createDraft({
    userId: author.id,
    companyId: author.companyId,
    chatId,
    rawText: text,
    sourceKey,
    attachments,
  });

  const status = await runtime.client.sendMessage({
    chat_id: chatId,
    text: "⏳ Разбираю…",
  });
  await setMessageId(draft.id, status.message_id);

  // Фоном: апдейт Telegram уже подтверждён, держать его нельзя.
  void composeInBackground({ runtime, author, draft, statusMessageId: status.message_id })
    .catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), draftId: draft.id },
        "[tg-composer] разбор упал",
      );
    });
}

async function composeInBackground(params: {
  runtime: TelegramRuntime;
  author: User;
  draft: Draft;
  statusMessageId: number;
}): Promise<void> {
  const { runtime, author, draft, statusMessageId } = params;

  const spinner = startSpinner(runtime.client, draft.chatId, statusMessageId);
  let segments: NormalizedSegment[];
  let truncated = 0;
  let notice: string | null = null;

  try {
    const workers = await loadAssignableWorkers(author);
    const categories = await loadCategories(draft.companyId);

    if (!checkParseRateLimit(author.id)) {
      segments = [buildManualDraft(draft.rawText)];
      notice = "Слишком много разборов за час. Черновик собрал вручную.";
    } else {
      const envelope = buildEnvelope({
        author,
        workers,
        categories,
        hasPhotos: draft.attachments.length,
        message: draft.rawText,
      });

      const result = await requestTaskParse(envelope);
      if (result.ok) {
        const normalized = normalizeWorkerResponse(
          result.raw,
          workers.map((w) => w.id),
          draft.rawText,
        );
        if (normalized) {
          segments = normalized.segments;
          truncated = normalized.truncated;
        } else {
          segments = [buildManualDraft(draft.rawText)];
          notice = failureMessage("bad_json");
        }
      } else {
        segments = [buildManualDraft(draft.rawText)];
        notice = failureMessage(result.reason);
      }
    }
  } finally {
    spinner.stop();
  }

  await saveSegments(draft.id, segments, truncated);

  const card =
    segments.length === 1
      ? renderSegmentCard(draft.id, segments[0], 0, draft.attachments, { standalone: true })
      : renderSummaryCard(draft.id, segments, draft.attachments, truncated);

  const text = notice ? `⚠️ ${notice}\n\n${card.text}` : card.text;
  await runtime.client
    .editMessageText({
      chat_id: draft.chatId,
      message_id: statusMessageId,
      text,
      parse_mode: "HTML",
      reply_markup: card.reply_markup,
    })
    .catch(async (err) => {
      // Редактирование могло не пройти (сообщение удалили) — тогда шлём новое,
      // иначе пользователь останется со «⏳ Разбираю…» навсегда.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[tg-composer] editMessageText не прошёл — шлём новым сообщением",
      );
      const sent = await runtime.client.sendMessage({
        chat_id: draft.chatId,
        text,
        parse_mode: "HTML",
        reply_markup: card.reply_markup,
      });
      await setMessageId(draft.id, sent.message_id);
    });
}

/**
 * Спиннер в статусном сообщении. Ошибки редактирования только логируются:
 * анимация не стоит того, чтобы ронять разбор.
 */
function startSpinner(
  client: TelegramClient,
  chatId: number,
  messageId: number,
): { stop: () => void } {
  let frame = 0;
  const timer = setInterval(() => {
    frame = (frame + 1) % SPINNER_FRAMES.length;
    void client
      .editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: `${SPINNER_FRAMES[frame]} Разбираю…`,
      })
      .catch(() => null);
  }, SPINNER_INTERVAL_MS);

  return {
    stop: () => clearInterval(timer),
  };
}

/**
 * Создание задач по подтверждённому черновику.
 *
 * Идёт через createTaskForActor — тот же код, что у веб-роута, включая
 * проверку прав и аудит. Ошибка одного сегмента не валит остальные:
 * руководителю честно показывается, что создалось, а что нет.
 */
export async function createTasksFromDraft(params: {
  runtime: TelegramRuntime;
  draft: Draft;
  author: User;
}): Promise<string> {
  const { runtime, draft, author } = params;
  const results: Array<{ title: string; taskId: number | null; error: string | null }> = [];

  for (let index = 0; index < draft.segments.length; index++) {
    const seg = draft.segments[index];
    if (!seg.included) continue;

    try {
      const task = await createTaskForActor({
        input: {
          title: seg.title,
          workerId: seg.workerId ?? undefined,
          requiresPhoto: seg.requiresPhoto,
          description: seg.description,
          category: seg.category,
          price: seg.price,
          // isRecurring пишем ЯВНО: в схеме дефолт true, а бот обязан
          // создавать разовую, если не сказано иное.
          isRecurring: seg.isRecurring,
          weekDays: seg.weekDays,
          monthDay: seg.monthDay,
          dueDate: seg.dueDate,
          isCompleted: false,
          checklist: seg.checklist.length
            ? seg.checklist.map((title: string, i: number) => ({
                id: `c${i}-${Date.now().toString(36)}`,
                title,
                done: false,
                photoUrls: [],
              }))
            : null,
        },
        actor: { kind: "telegram", userId: author.id },
        companyId: draft.companyId,
      });

      // Файлы качаем только сейчас, когда задача точно создана и у неё
      // есть id для имени файла.
      const files = attachmentsForSegment(draft.attachments, index);
      if (files.length > 0) {
        const urls: string[] = [];
        for (const file of files) {
          const url = await downloadAttachment(runtime.client, file, task.id);
          if (url) urls.push(url);
        }
        if (urls.length > 0) {
          await storage.updateTask(task.id, { examplePhotoUrls: urls });
        }
      }

      results.push({ title: seg.title, taskId: task.id, error: null });
    } catch (err) {
      const message = isTaskServiceError(err)
        ? err.message
        : err instanceof Error
          ? err.message
          : "неизвестная ошибка";
      logger.warn(
        { err: message, draftId: draft.id, segment: index },
        "[tg-composer] сегмент не создался",
      );
      results.push({ title: seg.title, taskId: null, error: message });
    }
  }

  await setStatus(draft.id, "confirmed");

  if (results.length === 0) {
    return "Ни одной задачи не выбрано — создавать нечего.";
  }
  return renderCreatedSummary(results);
}
