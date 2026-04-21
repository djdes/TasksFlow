import type { Task } from "@shared/schema";

/**
 * Hierarchical grouping for the dashboard. We want «year → month → day»
 * so a worker who has three weeks of backlog can collapse old stuff and
 * only see today expanded. Cheap — O(n) once, render path just iterates
 * groups in order.
 *
 * `timestampField` picks which column drives the date:
 *   - active tasks → createdAt
 *   - completed tasks → completedAt (fall back to createdAt for legacy
 *     rows that predate the migration).
 */

const RU_MONTHS_GEN: Record<number, string> = {
  0: "января",
  1: "февраля",
  2: "марта",
  3: "апреля",
  4: "мая",
  5: "июня",
  6: "июля",
  7: "августа",
  8: "сентября",
  9: "октября",
  10: "ноября",
  11: "декабря",
};

const RU_MONTHS_NOM: Record<number, string> = {
  0: "Январь",
  1: "Февраль",
  2: "Март",
  3: "Апрель",
  4: "Май",
  5: "Июнь",
  6: "Июль",
  7: "Август",
  8: "Сентябрь",
  9: "Октябрь",
  10: "Ноябрь",
  11: "Декабрь",
};

export type DayGroup = {
  /** YYYY-MM-DD, or "undated" for legacy rows with no timestamp. */
  dayKey: string;
  dayLabel: string;
  isToday: boolean;
  tasks: Task[];
};

export type MonthGroup = {
  /** YYYY-MM */
  monthKey: string;
  monthLabel: string;
  isCurrentMonthOfCurrentYear: boolean;
  days: DayGroup[];
  totalTasks: number;
};

export type YearGroup = {
  /** YYYY */
  yearKey: string;
  yearLabel: string;
  isCurrentYear: boolean;
  months: MonthGroup[];
  totalTasks: number;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDayLabel(d: Date, now: Date): string {
  const same =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (same) return "Сегодня";

  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const isYesterday =
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate();
  if (isYesterday) return "Вчера";

  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`;
}

export function groupTasksByDate(
  tasks: Task[],
  timestampField: "createdAt" | "completedAt",
  now: Date = new Date()
): YearGroup[] {
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;

  type Bucket = { ts: number | null; tasks: Task[] };
  const byDay = new Map<string, Bucket>();
  const dayLabels = new Map<string, string>();
  // yearKey → monthKey → dayKey[]
  const yearMonthDayIndex = new Map<string, Map<string, string[]>>();

  for (const task of tasks) {
    const primary = task[timestampField] as number | null | undefined;
    const fallback = task.createdAt;
    const ts =
      typeof primary === "number" && primary > 0
        ? primary
        : typeof fallback === "number" && fallback > 0
          ? fallback
          : null;

    let yearKey: string;
    let monthKey: string;
    let dayKey: string;
    let dayLabel: string;
    if (ts === null) {
      yearKey = "undated";
      monthKey = "undated-00";
      dayKey = "undated-00-00";
      dayLabel = "Без даты";
    } else {
      const d = new Date(ts * 1000);
      yearKey = String(d.getFullYear());
      monthKey = `${yearKey}-${pad(d.getMonth() + 1)}`;
      dayKey = `${monthKey}-${pad(d.getDate())}`;
      dayLabel = formatDayLabel(d, now);
    }

    const bucket = byDay.get(dayKey) ?? { ts, tasks: [] };
    bucket.tasks.push(task);
    // Keep the most recent timestamp in the bucket so day ordering is
    // stable across multiple tasks with different seconds.
    if (ts !== null && (bucket.ts === null || ts > bucket.ts)) bucket.ts = ts;
    byDay.set(dayKey, bucket);

    let months = yearMonthDayIndex.get(yearKey);
    if (!months) {
      months = new Map();
      yearMonthDayIndex.set(yearKey, months);
    }
    let dayList = months.get(monthKey);
    if (!dayList) {
      dayList = [];
      months.set(monthKey, dayList);
    }
    if (!dayList.includes(dayKey)) dayList.push(dayKey);

    // Carry label in a side-map so we don't rebuild it per task.
    dayLabels.set(dayKey, dayLabel);
  }

  const years: YearGroup[] = [];
  for (const [yearKey, months] of Array.from(yearMonthDayIndex.entries())) {
    const yearOrder = yearKey === "undated" ? -1 : Number(yearKey);
    const monthList: MonthGroup[] = [];
    for (const [monthKey, dayKeys] of Array.from(months.entries())) {
      const monthIdx =
        monthKey === "undated-00" ? -1 : Number(monthKey.slice(5)) - 1;
      const monthLabel =
        monthIdx < 0
          ? "Без даты"
          : RU_MONTHS_NOM[monthIdx] ?? monthKey;
      const days: DayGroup[] = (dayKeys as string[])
        .map((dayKey: string) => {
          const bucket = byDay.get(dayKey)!;
          const timestampField2 = timestampField; // closure lint
          bucket.tasks.sort((a, b) => {
            const av =
              (a[timestampField2] as number | null | undefined) ??
              a.createdAt ??
              0;
            const bv =
              (b[timestampField2] as number | null | undefined) ??
              b.createdAt ??
              0;
            if (av !== bv) return bv - av;
            return (b.id || 0) - (a.id || 0);
          });
          return {
            dayKey,
            dayLabel: dayLabels.get(dayKey) ?? dayKey,
            isToday: dayKey === todayKey,
            tasks: bucket.tasks,
          };
        })
        .sort((a: DayGroup, b: DayGroup) => {
          // Newest day first. For undated, keep only one bucket so order
          // doesn't matter.
          const ats = byDay.get(a.dayKey)?.ts ?? 0;
          const bts = byDay.get(b.dayKey)?.ts ?? 0;
          return bts - ats;
        });

      monthList.push({
        monthKey,
        monthLabel,
        isCurrentMonthOfCurrentYear:
          yearOrder === nowYear && monthIdx === nowMonth,
        days,
        totalTasks: days.reduce((s, d) => s + d.tasks.length, 0),
      });
    }
    monthList.sort((a, b) => {
      const ai = Number(a.monthKey.slice(5)) || 0;
      const bi = Number(b.monthKey.slice(5)) || 0;
      return bi - ai;
    });

    years.push({
      yearKey,
      yearLabel: yearKey === "undated" ? "Без даты" : `${yearKey} год`,
      isCurrentYear: yearOrder === nowYear,
      months: monthList,
      totalTasks: monthList.reduce((s, m) => s + m.totalTasks, 0),
    });
  }

  years.sort((a, b) => {
    const ao = a.yearKey === "undated" ? -1 : Number(a.yearKey);
    const bo = b.yearKey === "undated" ? -1 : Number(b.yearKey);
    return bo - ao;
  });

  return years;
}

