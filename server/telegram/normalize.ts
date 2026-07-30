/**
 * Нормализация ответа воркера.
 *
 * Ответ AI — недоверенный вход, ничем не лучше пользовательского. Он
 * может прислать чужой workerId, строку вместо числа, 500 пунктов
 * чек-листа или описание на 50 КБ. Всё это чинится здесь, ДО записи в
 * драфт, чтобы дальше по коду сегмент был заведомо валиден.
 *
 * Дефолты намеренно консервативные (см. таблицу в спеке):
 *   workerId       null   — не угадываем, руководитель ткнёт кнопку
 *   requiresPhoto  true   — продукт про фотоотчёт
 *   isRecurring    false  — разовая безопаснее: не воскреснет молча
 *   price          0      — премия только по явному указанию
 */

import { randomUUID } from "node:crypto";
import { parseDueDateInput } from "@shared/task-visibility";

/** Больше 10 задач из одного сообщения — почти наверняка разбор поехал. */
export const MAX_SEGMENTS = 10;
const MAX_CHECKLIST_ITEMS = 30;
const MAX_TITLE = 255;
const MAX_TITLE_FALLBACK = 80;
const MAX_DESCRIPTION = 5000;
const MAX_CATEGORY = 100;
const MAX_CHECKLIST_TITLE = 200;

export type NormalizedSegment = {
  id: string;
  title: string;
  description: string | null;
  workerId: number | null;
  workerName: string | null;
  requiresPhoto: boolean;
  price: number;
  category: string | null;
  isRecurring: boolean;
  weekDays: number[] | null;
  monthDay: number | null;
  /** unix sec локальной полуночи. */
  dueDate: number | null;
  checklist: string[];
  /** Снимается тумблером «Исключить» в карточке. */
  included: boolean;
};

export type NormalizeResult = {
  segments: NormalizedSegment[];
  /** Сколько сегментов отброшено лимитом — карточка скажет об этом честно. */
  truncated: number;
};

/**
 * @param raw       строка JSON от воркера
 * @param allowedWorkerIds  id, которым автор ВПРАВЕ ставить задачи
 * @param sourceMessage     исходный текст — фолбэк для заголовка
 */
export function normalizeWorkerResponse(
  raw: string,
  allowedWorkerIds: number[],
  sourceMessage: string,
): NormalizeResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const segmentsRaw = (parsed as { segments?: unknown })?.segments;
  if (!Array.isArray(segmentsRaw) || segmentsRaw.length === 0) return null;

  const allowed = new Set(allowedWorkerIds);
  const truncated = Math.max(0, segmentsRaw.length - MAX_SEGMENTS);
  const segments = segmentsRaw
    .slice(0, MAX_SEGMENTS)
    .map((s) => normalizeSegment(s, allowed, sourceMessage));

  return { segments, truncated };
}

function normalizeSegment(
  raw: unknown,
  allowed: Set<number>,
  sourceMessage: string,
): NormalizedSegment {
  const s = (raw ?? {}) as Record<string, unknown>;

  // Исполнитель обязан быть из списка, отфильтрованного по правам автора.
  // Иначе — null. Это последний рубеж: даже если промпт «уговорят»
  // выдать чужой id, задача сюда не пройдёт.
  const workerIdRaw = toInt(s.workerId);
  const workerId =
    workerIdRaw !== null && allowed.has(workerIdRaw) ? workerIdRaw : null;

  const dueDate = normalizeDueDate(s.dueDate);
  // Срок и повторение взаимоисключены: повторяющаяся задача сбрасывается
  // ежедневно и «съела» бы срок.
  const isRecurring = dueDate !== null ? false : toBool(s.isRecurring, false);

  return {
    id: typeof s.id === "string" && s.id.trim() ? s.id.trim().slice(0, 16) : randomUUID().slice(0, 8),
    title: normalizeTitle(s.title, sourceMessage),
    description: clampText(s.description, MAX_DESCRIPTION),
    workerId,
    workerName: workerId !== null ? clampText(s.workerName, 255) : null,
    // Дефолт true: продукт построен на фотоотчётах, снимается явно.
    requiresPhoto: toBool(s.requiresPhoto, true),
    price: Math.max(0, toInt(s.price) ?? 0),
    category: clampText(s.category, MAX_CATEGORY),
    isRecurring,
    weekDays: dueDate !== null ? null : normalizeWeekDays(s.weekDays),
    monthDay: dueDate !== null ? null : normalizeMonthDay(s.monthDay),
    dueDate,
    checklist: normalizeChecklist(s.checklist),
    included: true,
  };
}

function normalizeTitle(value: unknown, sourceMessage: string): string {
  const title = clampText(value, MAX_TITLE);
  if (title) return title;
  // Фолбэк: первая строка сообщения, обрезанная по границе слова.
  const firstLine = sourceMessage.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "Задача";
  if (firstLine.length <= MAX_TITLE_FALLBACK) return firstLine;
  const cut = firstLine.slice(0, MAX_TITLE_FALLBACK);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
}

function normalizeWeekDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days = Array.from(
    new Set(
      value
        .map((d) => toInt(d))
        .filter((d): d is number => d !== null && d >= 0 && d <= 6),
    ),
  ).sort((a, b) => a - b);
  return days.length > 0 ? days : null;
}

function normalizeMonthDay(value: unknown): number | null {
  const n = toInt(value);
  if (n === null || n < 1 || n > 31) return null;
  return n;
}

/**
 * `YYYY-MM-DD` → unix sec локальной полуночи. Прошедшие даты принимаем
 * как есть: «задача уже просрочена» — валидный сценарий, руководитель
 * может ставить задачу задним числом.
 */
function normalizeDueDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  return parseDueDateInput(value);
}

function normalizeChecklist(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      // Модель иногда отдаёт объекты вместо строк — принимаем и это.
      if (item && typeof item === "object" && "title" in item) {
        return String((item as { title: unknown }).title ?? "").trim();
      }
      return "";
    })
    .filter((t) => t.length > 0)
    .map((t) => t.slice(0, MAX_CHECKLIST_TITLE))
    .slice(0, MAX_CHECKLIST_ITEMS);
}

function clampText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Числа от модели приходят и строками — принимаем оба варианта. */
function toInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "да") return true;
    if (v === "false" || v === "0" || v === "нет") return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

/**
 * Черновик без AI: первая строка — заголовок, остальное — описание.
 * Бот обязан оставаться рабочим, когда диспетчер офлайн.
 */
export function buildManualDraft(sourceMessage: string): NormalizedSegment {
  const lines = sourceMessage.split("\n");
  const rest = lines.slice(1).join("\n").trim();
  return {
    id: randomUUID().slice(0, 8),
    title: normalizeTitle(null, sourceMessage),
    description: rest ? rest.slice(0, MAX_DESCRIPTION) : null,
    workerId: null,
    workerName: null,
    requiresPhoto: true,
    price: 0,
    category: null,
    isRecurring: false,
    weekDays: null,
    monthDay: null,
    dueDate: null,
    checklist: [],
    included: true,
  };
}
