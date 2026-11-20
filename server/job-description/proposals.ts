/**
 * Ответ диспетчера → предложения задач (shared/job-description.ts JobProposal).
 *
 * Ответ модели — недоверенный вход: чинится здесь, до записи в базу. Формат —
 * тот же JSON `segments`, что у разбора Telegram, плюс два поля этой фичи:
 *   dueInDays — разовая задача первой недели («пройти инструктаж за 2 дня»);
 *   checklist[i].options — вопрос с вариантами («Температура в норме?» → «Да» / «Нет»).
 * Исполнителя модель не выбирает: задачи всегда для одного сотрудника.
 */

import { randomUUID } from "node:crypto";
import {
  JOB_DESCRIPTION_MAX_TASKS,
  JOB_ONBOARDING_MAX_DAYS,
  type JobProposal,
  type ProposalChecklistItem,
} from "@shared/job-description";
import { MAX_QUESTION_OPTION_LENGTH } from "@shared/checklist";

const MAX_TITLE = 255;
const MAX_DESCRIPTION = 2000;
const MAX_CHECKLIST = 12;
const MAX_ITEM_TITLE = 200;
const MAX_OPTIONS = 5;

/** JSON из ответа модели: без markdown-забора и болтовни вокруг. */
export function extractSegmentsJson(text: string | null | undefined): { segments: unknown[] } | null {
  if (!text) return null;
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1)) as { segments?: unknown };
    return obj && Array.isArray(obj.segments) ? { segments: obj.segments } : null;
  } catch {
    return null;
  }
}

const clamp = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v.trim()))) return Math.trunc(Number(v.trim()));
  return null;
}

function toBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "да" || t === "1") return true;
    if (t === "false" || t === "нет" || t === "0") return false;
  }
  if (typeof v === "number") return v !== 0;
  return fallback;
}

function normalizeChecklist(v: unknown, recurring: boolean): ProposalChecklistItem[] {
  if (!Array.isArray(v)) return [];
  const out: ProposalChecklistItem[] = [];
  for (const raw of v) {
    let title: string | null = null;
    let options: string[] | undefined;
    if (typeof raw === "string") title = clamp(raw, MAX_ITEM_TITLE);
    else if (raw && typeof raw === "object") {
      const o = raw as { title?: unknown; options?: unknown };
      title = clamp(o.title, MAX_ITEM_TITLE);
      if (Array.isArray(o.options)) {
        const opts = Array.from(new Set(o.options.map((x) => clamp(x, MAX_QUESTION_OPTION_LENGTH)).filter((x): x is string => !!x))).slice(0, MAX_OPTIONS);
        // Вопрос — только у регулярной задачи и минимум с двумя вариантами.
        if (recurring && opts.length >= 2) options = opts;
      }
    }
    if (!title) continue;
    out.push(options ? { title, options } : { title });
    if (out.length >= MAX_CHECKLIST) break;
  }
  return out;
}

function normalizeWeekDays(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const days = Array.from(new Set(v.map(toInt).filter((d): d is number => d !== null && d >= 0 && d <= 6))).sort((a, b) => a - b);
  return days.length > 0 && days.length < 7 ? days : null;
}

export function normalizeProposals(segments: unknown[]): JobProposal[] {
  const out: JobProposal[] = [];
  const seen = new Set<string>();
  for (const raw of segments) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const title = clamp(s.title, MAX_TITLE);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const due = toInt(s.dueInDays);
    const dueInDays = due !== null && due >= 1 ? Math.min(due, JOB_ONBOARDING_MAX_DAYS) : null;
    // Срок и повторение несовместимы: задача первой недели — разовая.
    const isRecurring = dueInDays !== null ? false : toBool(s.isRecurring, true);
    const monthDayRaw = toInt(s.monthDay);
    const confidence = typeof s.confidence === "number" && Number.isFinite(s.confidence) ? Math.max(0, Math.min(1, s.confidence)) : null;
    out.push({
      id: typeof s.id === "string" && /^[\w-]{1,16}$/.test(s.id) && !out.some((p) => p.id === s.id) ? s.id : randomUUID().slice(0, 8),
      title,
      description: clamp(s.description, MAX_DESCRIPTION),
      // Продукт про фотоотчёт: фото по умолчанию, снимается явно.
      requiresPhoto: toBool(s.requiresPhoto, true),
      category: clamp(s.category, 100),
      isRecurring,
      weekDays: isRecurring ? normalizeWeekDays(s.weekDays) : null,
      monthDay: isRecurring && monthDayRaw !== null && monthDayRaw >= 1 && monthDayRaw <= 31 ? monthDayRaw : null,
      dueInDays,
      checklist: normalizeChecklist(s.checklist, isRecurring),
      confidence,
    });
    if (out.length >= JOB_DESCRIPTION_MAX_TASKS) break;
  }
  return out;
}

/** Предложения из базы (JSON) — с той же нормализацией: строку могли записать старым кодом. */
export function parseStoredProposals(raw: string | null | undefined): JobProposal[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? normalizeProposals(v) : [];
  } catch {
    return [];
  }
}

/** Задача, созданная из инструкции: название при создании и исходное название предложения. */
export type CreatedTaskRef = { id: number; title: string | null; proposal?: string | null };

/** Созданные из инструкции задачи: [{ id, title, proposal }]; старый формат — просто id. */
export function parseCreatedTasks(raw: string | null | undefined): CreatedTaskRef[] {
  if (!raw) return [];
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((x): CreatedTaskRef | null => {
        if (typeof x === "number") return { id: x, title: null };
        if (!x || typeof x !== "object") return null;
        const o = x as { id?: unknown; title?: unknown; proposal?: unknown };
        const ref: CreatedTaskRef = { id: Number(o.id), title: str(o.title) };
        if (str(o.proposal)) ref.proposal = str(o.proposal);
        return ref;
      })
      .filter((x): x is CreatedTaskRef => !!x && Number.isInteger(x.id) && x.id > 0);
  } catch {
    return [];
  }
}
