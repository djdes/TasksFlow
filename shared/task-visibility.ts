/**
 * Видимость задачи по расписанию — общий код клиента и Telegram-бота.
 *
 * Переехало из client/src/lib/task-filters.ts: бот показывает «задачи на
 * сегодня» и обязан считать это ровно так же, как дашборд. Вторая
 * реализация расписания = «в боте задача есть, на сайте нет» и наоборот.
 *
 * Worker не видит чужие задачи, кроме как через эти фильтры —
 * случайная регрессия = «задача не показывается в её день».
 */

export type ScheduledTask = {
  weekDays?: readonly number[] | null;
  monthDay?: number | null;
  /** Unix sec локальной полуночи целевого дня. */
  dueDate?: number | null;
};

/**
 * Видна ли задача СЕГОДНЯ.
 *
 *   dueDate задан   → всегда видна (см. ниже)
 *   monthDay set + не сегодня → false
 *   weekDays set + не включает сегодня → false
 *   иначе → true (включая «совсем без расписания»)
 *
 * Задача со сроком НЕ скрывается ни до срока, ни после: до — чтобы
 * сотрудник мог сделать раньше, после — чтобы просроченная задача не
 * исчезала молча, а висела с красным бейджем. Скрывать просроченное
 * означало бы терять работу, которую всё ещё надо сделать.
 *
 * @param task         задача со схемой расписания
 * @param dayOfWeek    new Date().getDay() — 0=воскресенье..6=суббота
 * @param dayOfMonth   new Date().getDate() — 1..31
 */
export function isTaskVisibleOn(
  task: ScheduledTask,
  dayOfWeek: number,
  dayOfMonth: number,
): boolean {
  if (task.dueDate !== null && task.dueDate !== undefined) {
    return true;
  }
  if (task.monthDay !== null && task.monthDay !== undefined) {
    if (task.monthDay !== dayOfMonth) return false;
  }
  if (
    task.weekDays &&
    Array.isArray(task.weekDays) &&
    task.weekDays.length > 0
  ) {
    if (!task.weekDays.includes(dayOfWeek)) return false;
  }
  return true;
}

/**
 * `YYYY-MM-DD` → unix sec ЛОКАЛЬНОЙ полуночи. Пустая или битая строка → null.
 *
 * Именно локальной, а не UTC: `new Date("2026-08-03")` парсится как UTC-полночь,
 * и восточнее Гринвича срок уезжает на день назад. Поэтому собираем дату
 * покомпонентно.
 */
export function parseDueDateInput(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  // Отсекаем переполнение вроде 2026-02-31 → 3 марта.
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return Math.floor(date.getTime() / 1000);
}

/** unix sec → `YYYY-MM-DD` для <input type="date">. */
export function formatDueDateInput(
  unixSec: number | null | undefined,
): string {
  if (unixSec === null || unixSec === undefined) return "";
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type DueStatus =
  /** Срока нет — бейдж не показываем. */
  | { kind: "none" }
  /** Срок сегодня. */
  | { kind: "today" }
  /** Срок в будущем, daysLeft ≥ 1. */
  | { kind: "upcoming"; daysLeft: number }
  /** Срок прошёл, daysOverdue ≥ 1. */
  | { kind: "overdue"; daysOverdue: number };

/** Полночь дня, в который попадает unix-секунда, по локальному времени. */
export function startOfLocalDay(unixSec: number): number {
  const d = new Date(unixSec * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Статус срока на момент `nowSec`. Сравниваем полночь с полночью, а не
 * «разница в секундах / 86400»: иначе задача со сроком «сегодня»,
 * созданная в 23:00, к 00:30 показывала бы «осталось 0 дней» вместо
 * «просрочено», и наоборот.
 */
export function getDueStatus(
  dueDate: number | null | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
): DueStatus {
  if (dueDate === null || dueDate === undefined) return { kind: "none" };

  const dueDay = startOfLocalDay(dueDate);
  const today = startOfLocalDay(nowSec);
  const diffDays = Math.round((dueDay - today) / 86_400);

  if (diffDays === 0) return { kind: "today" };
  if (diffDays > 0) return { kind: "upcoming", daysLeft: diffDays };
  return { kind: "overdue", daysOverdue: -diffDays };
}

const MONTHS_GENITIVE = [
  "янв", "фев", "мар", "апр", "мая", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

/** Короткая подпись срока для бейджа: «до 3 авг», «сегодня», «просрочено». */
export function formatDueBadge(
  dueDate: number | null | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
): string | null {
  const status = getDueStatus(dueDate, nowSec);
  if (status.kind === "none") return null;
  if (status.kind === "today") return "сегодня";
  if (status.kind === "overdue") return "просрочено";

  const d = new Date((dueDate as number) * 1000);
  return `до ${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`;
}
