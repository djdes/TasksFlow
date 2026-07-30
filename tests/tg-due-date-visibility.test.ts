import { describe, it, expect } from "vitest";
import {
  isTaskVisibleOn,
  getDueStatus,
  formatDueBadge,
  parseDueDateInput,
  formatDueDateInput,
} from "../shared/task-visibility";

/**
 * Задача со сроком не должна исчезать НИ ДО срока (сотрудник может
 * сделать раньше), НИ ПОСЛЕ (иначе просроченная работа пропадает вместе
 * с обязательством её сделать).
 */

const day = (y: number, m: number, d: number) =>
  Math.floor(new Date(y, m - 1, d, 0, 0, 0, 0).getTime() / 1000);

describe("isTaskVisibleOn без dueDate — прежнее поведение", () => {
  it("без расписания видна всегда", () => {
    expect(isTaskVisibleOn({}, 3, 15)).toBe(true);
  });

  it("weekDays ограничивают день недели", () => {
    expect(isTaskVisibleOn({ weekDays: [5] }, 5, 15)).toBe(true);
    expect(isTaskVisibleOn({ weekDays: [5] }, 3, 15)).toBe(false);
  });

  it("monthDay ограничивает число месяца", () => {
    expect(isTaskVisibleOn({ monthDay: 15 }, 3, 15)).toBe(true);
    expect(isTaskVisibleOn({ monthDay: 15 }, 3, 16)).toBe(false);
  });
});

describe("isTaskVisibleOn с dueDate", () => {
  it("задача со сроком видна всегда, независимо от дня недели", () => {
    const t = { dueDate: day(2026, 8, 3) };
    expect(isTaskVisibleOn(t, 0, 1)).toBe(true);
    expect(isTaskVisibleOn(t, 6, 31)).toBe(true);
  });

  it("срок перебивает расписание, даже несовпадающее", () => {
    const t = { dueDate: day(2026, 8, 3), weekDays: [5], monthDay: 20 };
    expect(isTaskVisibleOn(t, 1, 1)).toBe(true);
  });

  it("просроченная задача не скрывается", () => {
    expect(isTaskVisibleOn({ dueDate: day(2020, 1, 1) }, 3, 15)).toBe(true);
  });
});

describe("getDueStatus", () => {
  const now = day(2026, 7, 30) + 13 * 3600; // 30 июля, 13:00

  it("нет срока → none", () => {
    expect(getDueStatus(null, now).kind).toBe("none");
    expect(getDueStatus(undefined, now).kind).toBe("none");
  });

  it("срок сегодня → today, даже если время суток уже прошло", () => {
    expect(getDueStatus(day(2026, 7, 30), now).kind).toBe("today");
  });

  it("срок завтра → upcoming с daysLeft=1", () => {
    expect(getDueStatus(day(2026, 7, 31), now)).toEqual({
      kind: "upcoming",
      daysLeft: 1,
    });
  });

  it("срок вчера → overdue с daysOverdue=1", () => {
    expect(getDueStatus(day(2026, 7, 29), now)).toEqual({
      kind: "overdue",
      daysOverdue: 1,
    });
  });

  it("сравнение идёт по календарным дням, а не по 24-часовым интервалам", () => {
    // 23:59 сегодня против срока «сегодня» — всё ещё today, не overdue.
    const lateToday = day(2026, 7, 30) + 23 * 3600 + 59 * 60;
    expect(getDueStatus(day(2026, 7, 30), lateToday).kind).toBe("today");
  });

  it("через неделю — 7 дней", () => {
    expect(getDueStatus(day(2026, 8, 6), now)).toEqual({
      kind: "upcoming",
      daysLeft: 7,
    });
  });
});

describe("formatDueBadge", () => {
  const now = day(2026, 7, 30);

  it("сегодня / просрочено / до даты", () => {
    expect(formatDueBadge(day(2026, 7, 30), now)).toBe("сегодня");
    expect(formatDueBadge(day(2026, 7, 20), now)).toBe("просрочено");
    expect(formatDueBadge(day(2026, 8, 3), now)).toBe("до 3 авг");
  });

  it("нет срока → null", () => {
    expect(formatDueBadge(null, now)).toBeNull();
  });
});

describe("parseDueDateInput", () => {
  it("YYYY-MM-DD → локальная полночь, а не UTC", () => {
    const ts = parseDueDateInput("2026-08-03")!;
    const d = new Date(ts * 1000);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("пустое и битое → null", () => {
    expect(parseDueDateInput("")).toBeNull();
    expect(parseDueDateInput(null)).toBeNull();
    expect(parseDueDateInput(undefined)).toBeNull();
    expect(parseDueDateInput("03.08.2026")).toBeNull();
    expect(parseDueDateInput("2026-8-3")).toBeNull();
  });

  it("несуществующая дата не «переползает» в следующий месяц", () => {
    expect(parseDueDateInput("2026-02-31")).toBeNull();
    expect(parseDueDateInput("2026-13-01")).toBeNull();
  });

  it("високосный год обрабатывается корректно", () => {
    expect(parseDueDateInput("2028-02-29")).not.toBeNull();
    expect(parseDueDateInput("2026-02-29")).toBeNull();
  });
});

describe("formatDueDateInput", () => {
  it("roundtrip с parseDueDateInput", () => {
    const ts = parseDueDateInput("2026-08-03")!;
    expect(formatDueDateInput(ts)).toBe("2026-08-03");
  });

  it("null → пустая строка для input", () => {
    expect(formatDueDateInput(null)).toBe("");
    expect(formatDueDateInput(undefined)).toBe("");
  });

  it("однозначные месяц и день дополняются нулём", () => {
    expect(formatDueDateInput(parseDueDateInput("2026-01-05")!)).toBe("2026-01-05");
  });
});
