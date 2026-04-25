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
 * Приоритет источника:
 *   1. `journalLink.bonusAmountKopecks` — настраивается менеджером
 *      в /settings/journal-bonuses на стороне WeSetup. Это и есть
 *      источник истины.
 *   2. `task.price` — для свободных (не журнальных) задач, где админ
 *      сам ставит «стоимость». Этот fallback не учитывается тут — есть
 *      отдельный price-бейдж в GroupedTaskList.
 *   3. `JOURNAL_BONUS_RUB` (50 ₽) — древний legacy-фоллбек для задач,
 *      созданных до того как journalLink начал нести bonusAmountKopecks.
 *
 * Журналы из NO_BONUS_JOURNAL_CODES не дают бейдж даже если в kopecks
 * случайно > 0 (защита от опечатки в настройках).
 */
export function getJournalBonus(task: {
  journalLink?: string | null;
}): number | null {
  const link = parseJournalLink(task.journalLink ?? null);
  if (!link) return null;
  const code = link.kind.replace(/^wesetup-/i, "").toLowerCase();
  if (!code) return null;
  if (NO_BONUS_JOURNAL_CODES.has(code)) return null;

  if (typeof link.bonusAmountKopecks === "number") {
    if (link.bonusAmountKopecks <= 0) return null;
    return Math.round(link.bonusAmountKopecks / 100);
  }
  return JOURNAL_BONUS_RUB;
}
