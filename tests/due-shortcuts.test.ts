/**
 * Быстрые сроки разовой задачи («Устранить до»): даты по локальному
 * календарю, конец недели — воскресенье, без повторяющихся кнопок.
 */
import { describe, it, expect } from "vitest";
import { dueShortcuts, formatDueInput, toDateInputValue } from "../client/src/lib/task-schedule";

const map = (now: Date) => Object.fromEntries(dueShortcuts(now).map((s) => [s.key, s.value]));

describe("dueShortcuts", () => {
  it("среда, 4 ноября 2026", () => {
    expect(map(new Date(2026, 10, 4, 23, 30))).toEqual({
      today: "2026-11-04",
      tomorrow: "2026-11-05",
      after: "2026-11-06",
      week: "2026-11-08",
      month: "2026-11-30",
    });
  });

  it("суббота: «до конца недели» совпало с «послезавтра» — кнопка одна", () => {
    const keys = dueShortcuts(new Date(2026, 10, 7, 9)).map((s) => s.key);
    expect(keys).toEqual(["today", "tomorrow", "after", "month"]);
  });

  it("воскресенье: конец недели — сегодня", () => {
    const keys = dueShortcuts(new Date(2026, 10, 8, 9)).map((s) => s.key);
    expect(keys).toEqual(["today", "tomorrow", "after", "month"]);
  });

  it("переход через месяц и год", () => {
    expect(map(new Date(2026, 11, 30, 12))).toMatchObject({
      tomorrow: "2026-12-31",
      after: "2027-01-01",
      week: "2027-01-03",
    });
    // 31 декабря: «до конца месяца» — сегодня, кнопка не дублируется.
    expect(dueShortcuts(new Date(2026, 11, 31, 12)).some((s) => s.key === "month")).toBe(false);
  });

  it("февраль високосного года", () => {
    expect(map(new Date(2028, 1, 10)).month).toBe("2028-02-29");
  });
});

describe("formatDueInput", () => {
  const now = new Date(2026, 10, 4);
  it("подпись даты", () => {
    expect(formatDueInput("2026-11-06", now)).toBe("6 ноября, пятница");
    expect(formatDueInput("2027-01-01", now)).toBe("1 января 2027, пятница");
  });
  it("пусто и мусор", () => {
    expect(formatDueInput("", now)).toBeNull();
    expect(formatDueInput("2026-02-31", now)).toBeNull();
  });
  it("toDateInputValue", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
