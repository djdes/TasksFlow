import { z } from "zod";

/**
 * Премия за задачу по умолчанию — настройка компании. Хранится ключом
 * `taskBonus` в companies.access_settings (JSON), без новой колонки.
 * Новые задачи получают её в поле «Премия», а при сохранении можно
 * поставить её и уже созданным задачам без премии.
 */
export const TASK_BONUS_MAX = 100_000;

/** Ориентир для расчёта в настройках: задач в день и рабочих дней в месяц. */
export const TASKS_PER_DAY = 6;
export const WORK_DAYS = 20;

export const taskBonusInputSchema = z.object({
  amount: z.number({ invalid_type_error: "Укажите сумму" }).int("Целое число рублей").min(0, "Не меньше 0").max(TASK_BONUS_MAX, "Слишком много"),
  /** Поставить сумму и уже созданным задачам без премии. */
  applyToExisting: z.boolean().optional().default(false),
});

/** Премия по умолчанию из access_settings; нет или мусор — 0 (выключено). */
export function parseTaskBonus(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const v = JSON.parse(raw)?.taskBonus;
    return Number.isInteger(v) && v > 0 && v <= TASK_BONUS_MAX ? v : 0;
  } catch {
    return 0;
  }
}

/** Слить новые поля в access_settings, не теряя остальные (employeeApproval и т. п.). */
export function mergeAccessJson(raw: string | null | undefined, patch: Record<string, unknown>): string {
  let base: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) base = parsed;
  } catch {
    /* мусор в базе — начинаем с чистого */
  }
  return JSON.stringify({ ...base, ...patch });
}

/** Сколько выйдет в месяц на человека: 30 ₽ × 6 задач × 20 дней = 3 600 ₽. */
export function monthlyBonus(amount: number, perDay = TASKS_PER_DAY, days = WORK_DAYS): number {
  return Math.max(0, Math.round(amount)) * perDay * days;
}

/** «3 600 ₽» с неразрывными пробелами. */
export function rub(n: number): string {
  return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
}
