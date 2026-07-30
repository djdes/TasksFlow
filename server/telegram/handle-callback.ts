/**
 * Обработка нажатий на кнопки карточек.
 *
 * Каждый коллбэк проверяет ЗАНОВО: драфт существует, не истёк,
 * принадлежит этому telegram_user_id, у автора всё ещё есть права.
 * callback_data не доверяем ни в одном байте — между показом карточки и
 * нажатием могло пройти полчаса, за которые у человека отобрали доступ.
 */

import type { User } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "../logger";
import type { TelegramRuntime } from "./index";
import type { TgCallbackQuery } from "./client";
import { parseCallback, type CallbackAction } from "./callbacks";
import {
  findDraftByShortId,
  saveAttachments,
  saveSegments,
  setStatus,
  type Draft,
} from "./drafts";
import {
  clearFileTargets,
  setFileToAll,
  toggleFileTarget,
} from "./attachments";
import {
  renderFilePicker,
  renderSegmentCard,
  renderSummaryCard,
  renderWorkerPicker,
} from "./cards";
import { canCreateTasks } from "./util";
import { createTasksFromDraft, loadAssignableWorkers } from "./composer";
import { handleTaskCallback } from "./my-tasks";
import type { NormalizedSegment } from "./normalize";

export async function handleCallback(
  query: TgCallbackQuery,
  runtime: TelegramRuntime,
): Promise<void> {
  const answer = (text?: string, alert = false) =>
    runtime.client
      .answerCallbackQuery({
        callback_query_id: query.id,
        text,
        show_alert: alert,
      })
      .catch(() => null);

  const action = parseCallback(query.data);
  if (!action) {
    await answer("Кнопка устарела");
    return;
  }

  const user = await storage.findUserByTelegramUserId(query.from.id);
  if (!user) {
    await answer("Аккаунт не привязан", true);
    return;
  }

  // Задачи сотрудника — отдельная ветка, черновики ей не нужны.
  if (
    action.kind === "taskOpen" ||
    action.kind === "taskPhoto" ||
    action.kind === "taskItemPhoto" ||
    action.kind === "tasksRefresh"
  ) {
    await handleTaskCallback(action, query, user, runtime);
    return;
  }

  if (!canCreateTasks(user)) {
    await answer("Нет прав ставить задачи", true);
    return;
  }

  const draft = await findDraftByShortId(action.draft);
  if (!draft) {
    await answer("Черновик истёк — пришли задачу заново", true);
    return;
  }
  // Владелец, а не просто «кто-то с правами»: чужой черновик недоступен
  // даже админу той же компании.
  if (draft.userId !== user.id) {
    await answer("Это не твой черновик", true);
    return;
  }
  if (draft.status === "confirmed" || draft.status === "cancelled") {
    await answer("Черновик уже закрыт");
    return;
  }

  try {
    await dispatch(action, draft, user, runtime, query);
    await answer();
  } catch (err) {
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        action: action.kind,
        draftId: draft.id,
      },
      "[tg-callback] обработка упала",
    );
    await answer("Что-то пошло не так", true);
  }
}

async function dispatch(
  action: Exclude<
    CallbackAction,
    { kind: "taskOpen" } | { kind: "taskPhoto" } | { kind: "taskItemPhoto" } | { kind: "tasksRefresh" }
  >,
  draft: Draft,
  user: User,
  runtime: TelegramRuntime,
  query: TgCallbackQuery,
): Promise<void> {
  const messageId = query.message?.message_id ?? draft.messageId;
  if (!messageId) return;

  const rerender = (view: { text: string; reply_markup: any }) =>
    runtime.client
      .editMessageText({
        chat_id: draft.chatId,
        message_id: messageId,
        text: view.text,
        parse_mode: "HTML",
        reply_markup: view.reply_markup,
      })
      .catch((err) => {
        // «message is not modified» — нормальная ситуация при тапе по
        // уже выбранному значению, шуметь не о чем.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("not modified")) {
          logger.warn({ err: msg }, "[tg-callback] editMessageText не прошёл");
        }
      });

  const showCurrentView = async () => {
    const fresh = (await findDraftByShortId(action.draft)) ?? draft;
    await rerender(mainView(fresh));
  };

  switch (action.kind) {
    case "cancel": {
      await setStatus(draft.id, "cancelled");
      await rerender({
        text: "✖️ Отменено. Пришли задачу заново, когда будет нужно.",
        reply_markup: { inline_keyboard: [] },
      });
      return;
    }

    case "create": {
      const summary = await createTasksFromDraft({ runtime, draft, author: user });
      await rerender({ text: summary, reply_markup: { inline_keyboard: [] } });
      return;
    }

    case "back": {
      await showCurrentView();
      return;
    }

    case "edit": {
      const seg = draft.segments[action.seg];
      if (!seg) return;
      await rerender(
        renderSegmentCard(draft.id, seg, action.seg, draft.attachments, {
          standalone: false,
        }),
      );
      return;
    }

    case "toggleIncluded": {
      await mutateSegment(draft, action.seg, (s) => ({ ...s, included: !s.included }));
      const fresh = (await findDraftByShortId(action.draft)) ?? draft;
      const seg = fresh.segments[action.seg];
      await rerender(
        renderSegmentCard(fresh.id, seg, action.seg, fresh.attachments, {
          standalone: false,
        }),
      );
      return;
    }

    case "togglePhoto": {
      await mutateSegment(draft, action.seg, (s) => ({
        ...s,
        requiresPhoto: !s.requiresPhoto,
      }));
      await rerenderSegmentOrSummary(action.seg, action.draft, draft, rerender);
      return;
    }

    case "workerPicker": {
      const workers = await loadAssignableWorkers(user);
      await rerender(renderWorkerPicker(draft.id, action.seg, workers, action.page));
      return;
    }

    case "workerSet": {
      // Права проверяем ЗДЕСЬ, а не доверяем id из кнопки: подчинённых
      // могли поменять, пока карточка висела в чате.
      const workers = await loadAssignableWorkers(user);
      const picked = workers.find((w) => w.id === action.workerId);
      if (action.workerId !== 0 && !picked) {
        throw new Error("worker not assignable");
      }
      await mutateSegment(draft, action.seg, (s) => ({
        ...s,
        workerId: picked ? picked.id : null,
        workerName: picked ? picked.name : null,
      }));
      await rerenderSegmentOrSummary(action.seg, action.draft, draft, rerender);
      return;
    }

    case "recurPreset": {
      await mutateSegment(draft, action.seg, (s) => {
        switch (action.preset) {
          case "daily":
            return { ...s, isRecurring: true, weekDays: null, monthDay: null, dueDate: null };
          case "workdays":
            return { ...s, isRecurring: true, weekDays: [1, 2, 3, 4, 5], monthDay: null, dueDate: null };
          case "mwf":
            return { ...s, isRecurring: true, weekDays: [1, 3, 5], monthDay: null, dueDate: null };
          case "none":
            return { ...s, isRecurring: false, weekDays: null, monthDay: null };
        }
      });
      await rerenderSegmentOrSummary(action.seg, action.draft, draft, rerender);
      return;
    }

    case "duePreset": {
      await mutateSegment(draft, action.seg, (s) => {
        const due = presetToDueDate(action.preset);
        // Срок делает задачу разовой — иначе ежедневный сброс её воскресит.
        return due === null
          ? { ...s, dueDate: null }
          : { ...s, dueDate: due, isRecurring: false, weekDays: null, monthDay: null };
      });
      await rerenderSegmentOrSummary(action.seg, action.draft, draft, rerender);
      return;
    }

    case "filePicker": {
      if (draft.attachments.length === 0) return;
      await rerender(
        renderFilePicker(draft.id, draft.segments, draft.attachments, action.file),
      );
      return;
    }

    case "fileToggle":
    case "fileAll":
    case "fileNone": {
      const attachments = draft.attachments.map((a) => {
        if (a.key !== draft.attachments[action.file]?.key) return a;
        if (action.kind === "fileAll") return setFileToAll(a, draft.segments.length);
        if (action.kind === "fileNone") return clearFileTargets(a);
        return toggleFileTarget(a, action.seg);
      });
      await saveAttachments(draft.id, attachments);
      const fresh = (await findDraftByShortId(action.draft)) ?? draft;
      await rerender(
        renderFilePicker(fresh.id, fresh.segments, fresh.attachments, action.file),
      );
      return;
    }
  }
}

/** После правки поля возвращаем тот экран, с которого пришли. */
async function rerenderSegmentOrSummary(
  segIndex: number,
  shortId: string,
  draft: Draft,
  rerender: (view: { text: string; reply_markup: any }) => Promise<unknown>,
): Promise<void> {
  const fresh = (await findDraftByShortId(shortId)) ?? draft;
  if (fresh.segments.length === 1) {
    await rerender(
      renderSegmentCard(fresh.id, fresh.segments[0], 0, fresh.attachments, {
        standalone: true,
      }),
    );
    return;
  }
  const seg = fresh.segments[segIndex];
  if (!seg) return;
  await rerender(
    renderSegmentCard(fresh.id, seg, segIndex, fresh.attachments, {
      standalone: false,
    }),
  );
}

function mainView(draft: Draft) {
  return draft.segments.length === 1
    ? renderSegmentCard(draft.id, draft.segments[0], 0, draft.attachments, {
        standalone: true,
      })
    : renderSummaryCard(draft.id, draft.segments, draft.attachments, draft.truncated);
}

async function mutateSegment(
  draft: Draft,
  index: number,
  fn: (seg: NormalizedSegment) => NormalizedSegment,
): Promise<void> {
  if (!draft.segments[index]) return;
  const segments = draft.segments.map((s, i) => (i === index ? fn(s) : s));
  await saveSegments(draft.id, segments, draft.truncated);
}

/** Пресеты срока считаются от локальной полуночи сегодня. */
function presetToDueDate(preset: "today" | "tomorrow" | "week" | "none"): number | null {
  if (preset === "none") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (preset === "tomorrow") d.setDate(d.getDate() + 1);
  if (preset === "week") d.setDate(d.getDate() + 7);
  return Math.floor(d.getTime() / 1000);
}
