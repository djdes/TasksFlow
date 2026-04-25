/**
 * Премия за журнальную задачу.
 *
 * В WeSetup есть набор «единичных» (single-fillMode) журналов: за день
 * один человек делает запись на всю смену, но обязательство видно
 * целому пулу подходящих сотрудников. Кто первый сделал — тому уйдёт
 * бонус. Это и есть UI-маркер «+50 ₽» на карточке.
 *
 * Список «обязательных» журналов (без бонуса) — это персональные
 * журналы, которые каждый сотрудник обязан вести лично каждый день
 * (per-employee), бонус был бы стимулом халявить. Гигиена, медкнижки,
 * health-check — личная ответственность, бонусом не балуем.
 *
 * Источник синхронизирован с WeSetup `PER_EMPLOYEE_DAILY_JOURNAL_CODES`
 * в `src/lib/daily-journal-codes.ts`. Если там добавится новый код —
 * добавить и сюда.
 */

import { parseJournalLink } from "@shared/journal-link";

/** Сумма премии в рублях за выполнение единичного журнала. */
export const JOURNAL_BONUS_RUB = 50;

/**
 * Журналы, которые НЕ дают бонус. Логика: эти журналы каждый
 * сотрудник заполняет лично, ежедневно — это часть базовой
 * дисциплины, бонусом стимулировать незачем.
 */
export const NO_BONUS_JOURNAL_CODES = new Set<string>([
  "hygiene",
  "health_check",
  "med_books",
]);

/**
 * Возвращает сумму бонуса (в рублях) для задачи или null, если задача
 * не из WeSetup-журнала или из списка «без бонуса».
 *
 * Источник кода журнала — `journalLink.kind` вида `wesetup-<code>`.
 * Free-mode задачи без journalLink бонуса не дают.
 */
export function getJournalBonus(task: {
  journalLink?: string | null;
}): number | null {
  const link = parseJournalLink(task.journalLink ?? null);
  if (!link) return null;
  // kind: "wesetup-<code>"; срезаем префикс.
  const code = link.kind.replace(/^wesetup-/i, "").toLowerCase();
  if (!code) return null;
  if (NO_BONUS_JOURNAL_CODES.has(code)) return null;
  return JOURNAL_BONUS_RUB;
}
