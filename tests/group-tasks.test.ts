/**
 * Тесты groupTasksByDate — иерархическая группировка для dashboard.
 *
 * Контекст: client/src/lib/group-tasks.ts. Date math — классическая
 * зона багов: timezone, year boundaries, undated tasks, "Сегодня"
 * lookup, sorting.
 *
 * Тесты используют фиксированный `now` для детерминизма (timezone-
 * independent — даты задаются через unix-секунды, форматирование
 * относительно `now` тоже).
 */

import { describe, it, expect } from "vitest";
import { groupTasksByDate } from "../client/src/lib/group-tasks";
import type { Task } from "../shared/schema";

function makeTask(
  id: number,
  createdAt: number | null,
  completedAt: number | null = null,
): Task {
  return {
    id,
    title: `Task ${id}`,
    workerId: null,
    requiresPhoto: false,
    photoUrl: null,
    photoUrls: null,
    examplePhotoUrl: null,
    isCompleted: false,
    weekDays: null,
    monthDay: null,
    isRecurring: true,
    price: 0,
    category: null,
    description: null,
    companyId: null,
    journalLink: null,
    createdAt: createdAt ?? 0,
    completedAt,
    claimedByWorkerId: null,
    verificationStatus: null,
    verifierWorkerId: null,
    verifiedByUserId: null,
    verifiedAt: null,
    rejectReason: null,
    submittedValues: null,
  } as Task;
}

// Используем local-time дату для now: 2026-05-06 (понедельник).
// Преобразуем в unix-seconds через те же local-time компоненты.
const NOW = new Date(2026, 4, 6, 12, 0, 0); // месяц 0-индексированный
const todayTs = Math.floor(NOW.getTime() / 1000);
const yesterdayTs = todayTs - 24 * 60 * 60;
const dayBeforeTs = todayTs - 2 * 24 * 60 * 60;
const lastMonthTs = Math.floor(
  new Date(2026, 3, 15, 10, 0, 0).getTime() / 1000,
); // апрель
const lastYearTs = Math.floor(
  new Date(2025, 11, 25, 10, 0, 0).getTime() / 1000,
); // декабрь 2025

describe("groupTasksByDate — пустой ввод", () => {
  it("[] → []", () => {
    expect(groupTasksByDate([], "createdAt", NOW)).toEqual([]);
  });
});

describe("groupTasksByDate — single task today", () => {
  it("одна сегодняшняя задача", () => {
    const result = groupTasksByDate(
      [makeTask(1, todayTs)],
      "createdAt",
      NOW,
    );
    expect(result.length).toBe(1);
    expect(result[0].yearKey).toBe("2026");
    expect(result[0].isCurrentYear).toBe(true);
    expect(result[0].months.length).toBe(1);
    expect(result[0].months[0].isCurrentMonthOfCurrentYear).toBe(true);
    expect(result[0].months[0].days.length).toBe(1);
    expect(result[0].months[0].days[0].isToday).toBe(true);
    expect(result[0].months[0].days[0].dayLabel).toBe("Сегодня");
  });
});

describe("groupTasksByDate — Сегодня / Вчера labels", () => {
  it("вчерашняя → 'Вчера'", () => {
    const result = groupTasksByDate(
      [makeTask(1, yesterdayTs)],
      "createdAt",
      NOW,
    );
    expect(result[0].months[0].days[0].dayLabel).toBe("Вчера");
    expect(result[0].months[0].days[0].isToday).toBe(false);
  });

  it("позавчерашняя → '4 мая'", () => {
    const result = groupTasksByDate(
      [makeTask(1, dayBeforeTs)],
      "createdAt",
      NOW,
    );
    expect(result[0].months[0].days[0].dayLabel).toBe("4 мая");
  });
});

describe("groupTasksByDate — undated tasks", () => {
  it("createdAt=0 → bucket 'undated'", () => {
    const result = groupTasksByDate(
      [makeTask(1, null)], // createdAt fallbacks to 0
      "createdAt",
      NOW,
    );
    expect(result.length).toBe(1);
    expect(result[0].yearKey).toBe("undated");
    expect(result[0].yearLabel).toBe("Без даты");
    expect(result[0].months[0].days[0].dayLabel).toBe("Без даты");
  });
});

describe("groupTasksByDate — completedAt fallback", () => {
  it("completedAt задан, createdAt=0 → группируется по completedAt", () => {
    const result = groupTasksByDate(
      [makeTask(1, 0, todayTs)],
      "completedAt",
      NOW,
    );
    expect(result[0].months[0].days[0].isToday).toBe(true);
  });

  it("completedAt=null → fallback на createdAt", () => {
    const result = groupTasksByDate(
      [makeTask(1, todayTs, null)],
      "completedAt",
      NOW,
    );
    expect(result[0].months[0].days[0].isToday).toBe(true);
  });
});

describe("groupTasksByDate — sorting (newest first)", () => {
  it("years отсортированы DESC", () => {
    const result = groupTasksByDate(
      [
        makeTask(1, lastYearTs),
        makeTask(2, todayTs),
      ],
      "createdAt",
      NOW,
    );
    expect(result[0].yearKey).toBe("2026");
    expect(result[1].yearKey).toBe("2025");
  });

  it("months внутри года отсортированы DESC", () => {
    const result = groupTasksByDate(
      [
        makeTask(1, lastMonthTs), // апрель 2026
        makeTask(2, todayTs), // май 2026
      ],
      "createdAt",
      NOW,
    );
    const yr2026 = result.find((y) => y.yearKey === "2026");
    expect(yr2026!.months[0].monthLabel).toBe("Май");
    expect(yr2026!.months[1].monthLabel).toBe("Апрель");
  });

  it("задачи внутри дня отсортированы по timestamp DESC", () => {
    const earlier = todayTs - 100;
    const later = todayTs - 50;
    const result = groupTasksByDate(
      [makeTask(1, earlier), makeTask(2, later)],
      "createdAt",
      NOW,
    );
    const dayTasks = result[0].months[0].days[0].tasks;
    expect(dayTasks[0].id).toBe(2); // позже первый
    expect(dayTasks[1].id).toBe(1);
  });
});

describe("groupTasksByDate — undated в конце", () => {
  it("undated идут после датированных", () => {
    const result = groupTasksByDate(
      [
        makeTask(1, null), // undated
        makeTask(2, todayTs),
      ],
      "createdAt",
      NOW,
    );
    expect(result[0].yearKey).toBe("2026");
    expect(result[result.length - 1].yearKey).toBe("undated");
  });
});

describe("groupTasksByDate — totalTasks counts", () => {
  it("year.totalTasks = sum месяцев = sum дней = sum tasks", () => {
    const result = groupTasksByDate(
      [
        makeTask(1, todayTs),
        makeTask(2, yesterdayTs),
        makeTask(3, lastMonthTs),
      ],
      "createdAt",
      NOW,
    );
    const yr2026 = result.find((y) => y.yearKey === "2026")!;
    expect(yr2026.totalTasks).toBe(3);
    const sumMonths = yr2026.months.reduce((s, m) => s + m.totalTasks, 0);
    expect(sumMonths).toBe(3);
  });
});
