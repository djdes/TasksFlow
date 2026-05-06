/**
 * Классификация task'ов по типу — journal/verifier/обычная.
 *
 * Извлечено из Dashboard.tsx. UX-критическая логика: журнальные
 * задачи на клик открывают TaskFormFiller (заполнить форму журнала),
 * обычные — TaskViewDialog. Если классификатор сломается, воркер
 * увидит «не ту» форму и запутается.
 */

import { parseJournalLinkRaw } from "./journal-link-parse";

type ClassifiableTask = {
  category?: string | null;
  journalLink?: string | null;
};

/**
 * journal task = есть journalLink ИЛИ category начинается с «WeSetup · ».
 *
 * Префикс «WeSetup · » — legacy convention для категорий, проставляемых
 * sync-кодом WeSetup. У новых задач есть journalLink (приоритетный
 * источник), у старых — только category.
 */
export function isJournalTask(task: ClassifiableTask): boolean {
  if (task.journalLink) return true;
  const category = task.category ?? "";
  return category.startsWith("WeSetup · ");
}

/**
 * verifier task = задача-«проверь чужую» в Phase 2 двухстадийной
 * верификации. Определяется журнальным links'ом:
 *   • taskScope === "verifier"
 *   • ИЛИ kind начинается с "wesetup-verifier"
 *
 * UI: verifier-задача показывается заведующей в её dashboard'е под
 * отдельным секцией «На проверке», а не в «Что сделать».
 */
export function isVerifierTask(task: { journalLink?: string | null }): boolean {
  const link = parseJournalLinkRaw(task.journalLink ?? null);
  if (!link) return false;
  if (link.taskScope === "verifier") return true;
  const kind = typeof link.kind === "string" ? link.kind : "";
  return kind.startsWith("wesetup-verifier");
}
