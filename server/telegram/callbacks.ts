/**
 * Парсер и сборщик `callback_data`.
 *
 * Жёсткое ограничение Telegram — 64 БАЙТА на callback_data. Поэтому:
 *   • действия однобуквенные;
 *   • draftId в коллбэке короткий (12 hex), полный UUID лежит в БД;
 *   • разделитель `:`.
 *
 * callback_data приходит от клиента и НЕ доверенный: пользователь может
 * прислать что угодно. Парсер обязан пережить любой мусор, а вызывающий —
 * заново проверить права и владение драфтом.
 */

/** Telegram режет callback_data больше этого. */
export const MAX_CALLBACK_BYTES = 64;

export type CallbackAction =
  /** Создать все включённые сегменты. */
  | { kind: "create"; draft: string }
  | { kind: "cancel"; draft: string }
  /** Открыть правку сегмента / вернуться к сводной карточке. */
  | { kind: "edit"; draft: string; seg: number }
  | { kind: "back"; draft: string }
  /** Тогл «включена в создание». */
  | { kind: "toggleIncluded"; draft: string; seg: number }
  /** Пикер исполнителя (page) и выбор конкретного. */
  | { kind: "workerPicker"; draft: string; seg: number; page: number }
  | { kind: "workerSet"; draft: string; seg: number; workerId: number }
  | { kind: "togglePhoto"; draft: string; seg: number }
  | { kind: "recurPreset"; draft: string; seg: number; preset: RecurPreset }
  | { kind: "duePreset"; draft: string; seg: number; preset: DuePreset }
  /** Распределение файлов по задачам. */
  | { kind: "filePicker"; draft: string; file: number; page: number }
  | { kind: "fileToggle"; draft: string; file: number; seg: number }
  | { kind: "fileAll"; draft: string; file: number }
  | { kind: "fileNone"; draft: string; file: number }
  /** Мои задачи: открыть карточку, запросить фото, обновить список. */
  | { kind: "taskOpen"; taskId: number }
  | { kind: "taskPhoto"; taskId: number }
  | { kind: "taskItemPhoto"; taskId: number; itemId: string }
  | { kind: "tasksRefresh" }
  /** Групповое меню: чьи задачи показать и задачи конкретного сотрудника. */
  | { kind: "workerMenu" }
  | { kind: "workerTasks"; workerId: number };

export type RecurPreset = "daily" | "workdays" | "mwf" | "none";
export type DuePreset = "today" | "tomorrow" | "week" | "none";

const RECUR_PRESETS: RecurPreset[] = ["daily", "workdays", "mwf", "none"];
const DUE_PRESETS: DuePreset[] = ["today", "tomorrow", "week", "none"];

/** Короткий id драфта для коллбэков: первые 12 hex-символов UUID. */
export function shortDraftId(fullId: string): string {
  return fullId.replace(/-/g, "").slice(0, 12);
}

export function buildCallback(action: CallbackAction): string {
  const data = encodeAction(action);
  if (Buffer.byteLength(data, "utf8") > MAX_CALLBACK_BYTES) {
    // Не молчаливое обрезание: обрезанный callback_data — это кнопка,
    // которая делает не то, что написано. Лучше упасть на разработке.
    throw new Error(`callback_data слишком длинный: ${data}`);
  }
  return data;
}

function encodeAction(a: CallbackAction): string {
  switch (a.kind) {
    case "create": return `c:${a.draft}`;
    case "cancel": return `x:${a.draft}`;
    case "edit": return `e:${a.draft}:${a.seg}`;
    case "back": return `b:${a.draft}`;
    case "toggleIncluded": return `i:${a.draft}:${a.seg}`;
    case "workerPicker": return `w:${a.draft}:${a.seg}:${a.page}`;
    case "workerSet": return `W:${a.draft}:${a.seg}:${a.workerId}`;
    case "togglePhoto": return `p:${a.draft}:${a.seg}`;
    case "recurPreset": return `r:${a.draft}:${a.seg}:${a.preset}`;
    case "duePreset": return `l:${a.draft}:${a.seg}:${a.preset}`;
    case "filePicker": return `f:${a.draft}:${a.file}:${a.page}`;
    case "fileToggle": return `F:${a.draft}:${a.file}:${a.seg}`;
    case "fileAll": return `fa:${a.draft}:${a.file}`;
    case "fileNone": return `fn:${a.draft}:${a.file}`;
    case "taskOpen": return `t:${a.taskId}`;
    case "taskPhoto": return `tp:${a.taskId}`;
    case "taskItemPhoto": return `ti:${a.taskId}:${a.itemId}`;
    case "tasksRefresh": return "tr";
    case "workerMenu": return "wm";
    case "workerTasks": return `wt:${a.workerId}`;
  }
}

/** null на любой мусор — вызывающий отвечает пользователю «кнопка устарела». */
export function parseCallback(data: string | undefined): CallbackAction | null {
  if (!data) return null;
  const parts = data.split(":");
  const op = parts[0];

  const draft = (i: number) => {
    const v = parts[i];
    return v && /^[a-f0-9]{1,32}$/i.test(v) ? v : null;
  };
  const num = (i: number) => {
    const v = parts[i];
    if (!v || !/^\d{1,9}$/.test(v)) return null;
    return Number(v);
  };

  switch (op) {
    case "c": {
      const d = draft(1);
      return d ? { kind: "create", draft: d } : null;
    }
    case "x": {
      const d = draft(1);
      return d ? { kind: "cancel", draft: d } : null;
    }
    case "b": {
      const d = draft(1);
      return d ? { kind: "back", draft: d } : null;
    }
    case "e": {
      const d = draft(1), s = num(2);
      return d && s !== null ? { kind: "edit", draft: d, seg: s } : null;
    }
    case "i": {
      const d = draft(1), s = num(2);
      return d && s !== null ? { kind: "toggleIncluded", draft: d, seg: s } : null;
    }
    case "p": {
      const d = draft(1), s = num(2);
      return d && s !== null ? { kind: "togglePhoto", draft: d, seg: s } : null;
    }
    case "w": {
      const d = draft(1), s = num(2), p = num(3);
      return d && s !== null && p !== null
        ? { kind: "workerPicker", draft: d, seg: s, page: p }
        : null;
    }
    case "W": {
      const d = draft(1), s = num(2), w = num(3);
      return d && s !== null && w !== null
        ? { kind: "workerSet", draft: d, seg: s, workerId: w }
        : null;
    }
    case "r": {
      const d = draft(1), s = num(2), preset = parts[3] as RecurPreset;
      return d && s !== null && RECUR_PRESETS.includes(preset)
        ? { kind: "recurPreset", draft: d, seg: s, preset }
        : null;
    }
    case "l": {
      const d = draft(1), s = num(2), preset = parts[3] as DuePreset;
      return d && s !== null && DUE_PRESETS.includes(preset)
        ? { kind: "duePreset", draft: d, seg: s, preset }
        : null;
    }
    case "f": {
      const d = draft(1), f = num(2), p = num(3);
      return d && f !== null && p !== null
        ? { kind: "filePicker", draft: d, file: f, page: p }
        : null;
    }
    case "F": {
      const d = draft(1), f = num(2), s = num(3);
      return d && f !== null && s !== null
        ? { kind: "fileToggle", draft: d, file: f, seg: s }
        : null;
    }
    case "fa": {
      const d = draft(1), f = num(2);
      return d && f !== null ? { kind: "fileAll", draft: d, file: f } : null;
    }
    case "fn": {
      const d = draft(1), f = num(2);
      return d && f !== null ? { kind: "fileNone", draft: d, file: f } : null;
    }
    case "t": {
      const t = num(1);
      return t !== null ? { kind: "taskOpen", taskId: t } : null;
    }
    case "tp": {
      const t = num(1);
      return t !== null ? { kind: "taskPhoto", taskId: t } : null;
    }
    case "ti": {
      const t = num(1), itemId = parts.slice(2).join(":");
      return t !== null && itemId && itemId.length <= 64
        ? { kind: "taskItemPhoto", taskId: t, itemId }
        : null;
    }
    case "tr":
      return { kind: "tasksRefresh" };
    case "wm":
      return { kind: "workerMenu" };
    case "wt": {
      const w = num(1);
      return w !== null ? { kind: "workerTasks", workerId: w } : null;
    }
    default:
      return null;
  }
}
