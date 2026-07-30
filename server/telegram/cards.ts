/**
 * Рендер карточек черновика и клавиатур к ним.
 *
 * Весь текст — parse_mode=HTML, поэтому всё, что пришло от пользователя
 * или от AI, обязано проходить через escapeHtml. Незакрытый тег ломает
 * не вёрстку, а весь sendMessage — Telegram отвечает 400.
 */

import { escapeHtml } from "./util";
import { buildCallback, shortDraftId, type DuePreset, type RecurPreset } from "./callbacks";
import type { NormalizedSegment } from "./normalize";
import type { DraftAttachment } from "./attachments";
import type { TgReplyMarkup } from "./client";
import { formatDueBadge } from "@shared/task-visibility";

const WEEK_DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
/** Сотрудников на страницу пикера: 8 кнопок ещё читаются на телефоне. */
export const WORKERS_PER_PAGE = 8;

export type CardView = {
  text: string;
  reply_markup: TgReplyMarkup;
};

export type WorkerOption = { id: number; name: string; position: string | null };

/** Строка-сводка полей сегмента: «👤 Олег · 📸 · 🔁 пт · 💰200». */
function segmentChips(seg: NormalizedSegment): string {
  const chips: string[] = [];
  chips.push(seg.workerName ? `👤 ${escapeHtml(seg.workerName)}` : "👤 не выбран");
  if (seg.requiresPhoto) chips.push("📸 фото");
  if (seg.isRecurring) {
    if (seg.weekDays?.length) {
      chips.push(`🔁 ${seg.weekDays.map((d) => WEEK_DAY_SHORT[d]).join(",")}`);
    } else if (seg.monthDay) {
      chips.push(`🔁 ${seg.monthDay} число`);
    } else {
      chips.push("🔁 каждый день");
    }
  }
  if (seg.dueDate) chips.push(`📅 ${formatDueBadge(seg.dueDate)}`);
  if (seg.price > 0) chips.push(`💰 ${seg.price} ₽`);
  if (seg.category) chips.push(`🏷 ${escapeHtml(seg.category)}`);
  return chips.join(" · ");
}

/** Карточка одного сегмента — и как единственная задача, и как экран правки. */
export function renderSegmentCard(
  draftId: string,
  seg: NormalizedSegment,
  segIndex: number,
  attachments: DraftAttachment[],
  opts: { standalone: boolean },
): CardView {
  const d = shortDraftId(draftId);
  const files = attachments.filter((a) =>
    a.targetSegmentIndexes.includes(segIndex),
  ).length;

  const lines = [
    opts.standalone ? "🆕 <b>Новая задача</b>" : `✏️ <b>Задача ${segIndex + 1}</b>`,
    segmentChips(seg),
  ];
  if (files > 0) lines.push(`📎 Пример фото: ${files}`);
  lines.push("");
  lines.push(`📝 <b>${escapeHtml(seg.title)}</b>`);
  if (seg.description) lines.push(escapeHtml(seg.description));
  if (seg.checklist.length > 0) {
    lines.push("");
    lines.push("<b>Чек-лист:</b>");
    lines.push(seg.checklist.map((c) => `• ${escapeHtml(c)}`).join("\n"));
  }
  if (!seg.included) {
    lines.push("");
    lines.push("<i>Задача исключена — создана не будет.</i>");
  }

  const keyboard: TgReplyMarkup["inline_keyboard"] = [];
  if (opts.standalone) {
    keyboard.push([
      { text: "✅ Создать", callback_data: buildCallback({ kind: "create", draft: d }) },
      { text: "✖️ Отмена", callback_data: buildCallback({ kind: "cancel", draft: d }) },
    ]);
  }
  keyboard.push([
    {
      text: "👤 Исполнитель",
      callback_data: buildCallback({ kind: "workerPicker", draft: d, seg: segIndex, page: 0 }),
    },
    {
      text: seg.requiresPhoto ? "📸 Фото: да" : "📸 Фото: нет",
      callback_data: buildCallback({ kind: "togglePhoto", draft: d, seg: segIndex }),
    },
  ]);
  keyboard.push(recurRow(d, segIndex));
  keyboard.push(dueRow(d, segIndex));

  if (!opts.standalone) {
    keyboard.push([
      {
        text: seg.included ? "🗑 Исключить" : "↩️ Вернуть",
        callback_data: buildCallback({ kind: "toggleIncluded", draft: d, seg: segIndex }),
      },
      { text: "⬅️ Назад", callback_data: buildCallback({ kind: "back", draft: d }) },
    ]);
  }

  return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
}

function recurRow(d: string, seg: number) {
  const presets: Array<[RecurPreset, string]> = [
    ["daily", "🔁 Каждый день"],
    ["workdays", "🔁 Будни"],
    ["none", "🔁 Разово"],
  ];
  return presets.map(([preset, text]) => ({
    text,
    callback_data: buildCallback({ kind: "recurPreset", draft: d, seg, preset }),
  }));
}

function dueRow(d: string, seg: number) {
  const presets: Array<[DuePreset, string]> = [
    ["today", "📅 Сегодня"],
    ["tomorrow", "📅 Завтра"],
    ["week", "📅 Неделя"],
    ["none", "📅 Без срока"],
  ];
  return presets.map(([preset, text]) => ({
    text,
    callback_data: buildCallback({ kind: "duePreset", draft: d, seg, preset }),
  }));
}

/** Сводная карточка для нескольких задач. */
export function renderSummaryCard(
  draftId: string,
  segments: NormalizedSegment[],
  attachments: DraftAttachment[],
  truncated: number,
): CardView {
  const d = shortDraftId(draftId);
  const included = segments.filter((s) => s.included);

  const lines = [`🆕 <b>Распознал задач: ${segments.length}</b>`, ""];
  segments.forEach((seg, i) => {
    const mark = seg.included ? `${i + 1}.` : `<s>${i + 1}.</s>`;
    lines.push(`${mark} <b>${escapeHtml(seg.title)}</b>`);
    lines.push(`   ${segmentChips(seg)}`);
  });
  if (truncated > 0) {
    lines.push("");
    lines.push(
      `<i>Показаны первые ${segments.length}, ещё ${truncated} не поместились — пришли их отдельным сообщением.</i>`,
    );
  }

  const keyboard: TgReplyMarkup["inline_keyboard"] = [
    [
      {
        text: `✅ Создать все (${included.length})`,
        callback_data: buildCallback({ kind: "create", draft: d }),
      },
      { text: "✖️ Отмена", callback_data: buildCallback({ kind: "cancel", draft: d }) },
    ],
  ];

  // Кнопки правки по 4 в ряд, чтобы влезало на телефоне.
  for (let i = 0; i < segments.length; i += 4) {
    keyboard.push(
      segments.slice(i, i + 4).map((_, j) => ({
        text: `✏️ ${i + j + 1}`,
        callback_data: buildCallback({ kind: "edit", draft: d, seg: i + j }),
      })),
    );
  }

  // Распределение файлов имеет смысл только когда задач больше одной.
  if (attachments.length > 0 && segments.length > 1) {
    keyboard.push([
      {
        text: `📎 Распределить файлы (${attachments.length})`,
        callback_data: buildCallback({ kind: "filePicker", draft: d, file: 0, page: 0 }),
      },
    ]);
  }

  return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
}

/** Пикер исполнителя, постранично. */
export function renderWorkerPicker(
  draftId: string,
  segIndex: number,
  workers: WorkerOption[],
  page: number,
): CardView {
  const d = shortDraftId(draftId);
  const pages = Math.max(1, Math.ceil(workers.length / WORKERS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const slice = workers.slice(
    safePage * WORKERS_PER_PAGE,
    safePage * WORKERS_PER_PAGE + WORKERS_PER_PAGE,
  );

  const keyboard: TgReplyMarkup["inline_keyboard"] = slice.map((w) => [
    {
      text: w.position ? `${w.name} · ${w.position}` : w.name,
      callback_data: buildCallback({
        kind: "workerSet",
        draft: d,
        seg: segIndex,
        workerId: w.id,
      }),
    },
  ]);

  keyboard.push([
    {
      text: "🚫 Без исполнителя",
      callback_data: buildCallback({ kind: "workerSet", draft: d, seg: segIndex, workerId: 0 }),
    },
  ]);

  if (pages > 1) {
    const nav = [];
    if (safePage > 0) {
      nav.push({
        text: "⬅️",
        callback_data: buildCallback({
          kind: "workerPicker", draft: d, seg: segIndex, page: safePage - 1,
        }),
      });
    }
    if (safePage < pages - 1) {
      nav.push({
        text: "➡️",
        callback_data: buildCallback({
          kind: "workerPicker", draft: d, seg: segIndex, page: safePage + 1,
        }),
      });
    }
    if (nav.length) keyboard.push(nav);
  }

  keyboard.push([
    { text: "⬅️ Назад", callback_data: buildCallback({ kind: "edit", draft: d, seg: segIndex }) },
  ]);

  return {
    text: `👤 <b>Кому поручить?</b>\nСтраница ${safePage + 1} из ${pages}`,
    reply_markup: { inline_keyboard: keyboard },
  };
}

/** Пикер «какому сегменту принадлежит файл N». */
export function renderFilePicker(
  draftId: string,
  segments: NormalizedSegment[],
  attachments: DraftAttachment[],
  fileIndex: number,
): CardView {
  const d = shortDraftId(draftId);
  const safeIndex = Math.min(Math.max(0, fileIndex), attachments.length - 1);
  const attachment = attachments[safeIndex];

  const keyboard: TgReplyMarkup["inline_keyboard"] = segments.map((seg, i) => [
    {
      text: `${attachment.targetSegmentIndexes.includes(i) ? "✅" : "⬜"} ${seg.title.slice(0, 40)}`,
      callback_data: buildCallback({ kind: "fileToggle", draft: d, file: safeIndex, seg: i }),
    },
  ]);

  keyboard.push([
    { text: "🔗 Ко всем", callback_data: buildCallback({ kind: "fileAll", draft: d, file: safeIndex }) },
    { text: "🧹 Очистить", callback_data: buildCallback({ kind: "fileNone", draft: d, file: safeIndex }) },
  ]);

  if (attachments.length > 1) {
    const nav = [];
    if (safeIndex > 0) {
      nav.push({
        text: "⬅️ Файл",
        callback_data: buildCallback({ kind: "filePicker", draft: d, file: safeIndex - 1, page: 0 }),
      });
    }
    if (safeIndex < attachments.length - 1) {
      nav.push({
        text: "Файл ➡️",
        callback_data: buildCallback({ kind: "filePicker", draft: d, file: safeIndex + 1, page: 0 }),
      });
    }
    if (nav.length) keyboard.push(nav);
  }

  keyboard.push([
    { text: "⬅️ К задачам", callback_data: buildCallback({ kind: "back", draft: d }) },
  ]);

  return {
    text: `📎 <b>Файл ${safeIndex + 1} из ${attachments.length}</b>\nК каким задачам приложить как пример?`,
    reply_markup: { inline_keyboard: keyboard },
  };
}

/** Итоговая сводка после создания — карточка редактируется в неё. */
export function renderCreatedSummary(
  results: Array<{ title: string; taskId: number | null; error: string | null }>,
): string {
  const ok = results.filter((r) => r.taskId !== null);
  const failed = results.filter((r) => r.taskId === null);

  const lines = [`✅ <b>Создано задач: ${ok.length}</b>`];
  if (failed.length > 0) lines.push(`⚠️ Не удалось: ${failed.length}`);
  lines.push("");
  for (const r of results) {
    lines.push(
      r.taskId !== null
        ? `✅ ${escapeHtml(r.title)} (#${r.taskId})`
        : `⚠️ ${escapeHtml(r.title)} — ${escapeHtml(r.error ?? "ошибка")}`,
    );
  }
  return lines.join("\n");
}
