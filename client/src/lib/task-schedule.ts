import { getDueStatus, parseDueDateInput } from "@shared/task-visibility";
import { MONTHS, WEEKDAYS } from "@/lib/greeting";

/**
 * Расписание задачи человеческими словами — сводка над полями «Срок»,
 * «Дни недели», «День месяца» и «Повтор» в создании и правке задачи.
 * Считает так же, как isTaskVisibleOn: день месяца И день недели должны
 * совпасть, срок делает задачу разовой и отменяет остальное.
 */

/** Порядок кнопок: неделя с понедельника; value — как у Date#getDay(). */
export const WEEK_DAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
] as const;

/** «По понедельникам», «по средам». */
const DATIVE: Record<number, string> = {
  1: "понедельникам",
  2: "вторникам",
  3: "средам",
  4: "четвергам",
  5: "пятницам",
  6: "субботам",
  0: "воскресеньям",
};

const ORDER = WEEK_DAYS.map((d) => d.value as number);

function joinWords(words: string[], last: string): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} ${last} ${words[words.length - 1]}`;
}

export type ScheduleInput = {
  /** YYYY-MM-DD из поля «Срок» или пусто. */
  dueDateInput?: string | null;
  weekDays?: readonly number[] | null;
  /** Из формы приходит строкой («15»), из задачи — числом. */
  monthDay?: string | number | null;
  isRecurring?: boolean | null;
};

export type ScheduleSummary = {
  /** Когда задача видна сотруднику. */
  when: string;
  /** Что после выполнения. */
  repeat: string;
  /** Подсказка о подвохе: 31-е бывает не каждый месяц и т. п. */
  note: string | null;
};

/**
 * @param nowSec «сейчас» — для года в сроке и «уже просрочена».
 */
export function describeSchedule(input: ScheduleInput, nowSec: number = Math.floor(Date.now() / 1000)): ScheduleSummary {
  // Та же проверка, что при сохранении: «31 февраля» срока не делает.
  const dueSec = parseDueDateInput(input.dueDateInput);
  if (dueSec !== null) {
    const date = new Date(dueSec * 1000);
    const year = date.getFullYear() === new Date(nowSec * 1000).getFullYear() ? "" : ` ${date.getFullYear()}`;
    const overdue = getDueStatus(dueSec, nowSec).kind === "overdue";
    return {
      when: `Разово, срок — ${date.getDate()} ${MONTHS[date.getMonth()]}${year}`,
      repeat: overdue
        ? "Срок уже прошёл — задача сразу будет с отметкой «Просрочено»"
        : "Видна сразу; после срока не исчезнет, а получит отметку «Просрочено»",
      note: null,
    };
  }

  const days = Array.from(new Set((input.weekDays ?? []).filter((d) => ORDER.includes(d)))).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const allWeek = days.length === 0 || days.length === 7;
  const monthDay = Number(input.monthDay) || null;

  let when: string;
  if (monthDay) {
    when = allWeek
      ? `${monthDay}-го числа каждого месяца`
      : `${monthDay}-го числа, если это ${joinWords(days.map((d) => WEEKDAYS[d]), "или")}`;
  } else if (allWeek) {
    when = "Каждый день";
  } else if (days.join() === "1,2,3,4,5") {
    when = "По будням";
  } else if (days.join() === "6,0") {
    when = "По выходным";
  } else {
    when = `По ${joinWords(days.map((d) => DATIVE[d]), "и")}`;
  }

  const repeat =
    input.isRecurring === false
      ? "Один раз: выполненная так и останется выполненной, заново не начнётся"
      : "В полночь начинается заново — выполнение с фото остаётся в истории";

  const notes: string[] = [];
  if (monthDay && !allWeek) notes.push("Совпадает редко: нужны и число, и день недели сразу.");
  if (monthDay && monthDay > 28) notes.push(`В месяцах без ${monthDay}-го числа задачи не будет.`);

  return { when, repeat, note: notes.length ? notes.join(" ") : null };
}
