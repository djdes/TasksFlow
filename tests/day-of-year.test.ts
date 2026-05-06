/**
 * Тесты dayOfYearLocal / pickByDayOfYear из TipOfTheDay.tsx.
 *
 * Логика «совет дня меняется в полночь по локальному времени»
 * критична для UX — если в 23:59 один tip, а в 00:01 другой
 * (разный), это ОК. Но если перескок происходит в неожиданное
 * время или одно и то же видно 2 дня — UX-баг.
 */

import { describe, it, expect } from "vitest";
import {
  dayOfYearLocal,
  pickByDayOfYear,
} from "../client/src/lib/day-of-year";

describe("dayOfYearLocal", () => {
  it("1 января → 1 (или 0/1 в зависимости от ISO)", () => {
    const d = new Date(2026, 0, 1, 12, 0, 0);
    // Используем локальный month 0=январь, getDate=1.
    // Реализация: diff от Dec 31 prev year. 1 янв полдень должно быть 1.
    expect(dayOfYearLocal(d)).toBe(1);
  });

  it("31 декабря → 365 (366 в високосный)", () => {
    const d2026 = new Date(2026, 11, 31, 12, 0, 0); // 2026 не високосный
    expect(dayOfYearLocal(d2026)).toBe(365);

    const d2024 = new Date(2024, 11, 31, 12, 0, 0); // 2024 високосный
    expect(dayOfYearLocal(d2024)).toBe(366);
  });

  it("два соседних дня в полдень дают +1", () => {
    const day1 = new Date(2026, 5, 15, 12, 0, 0);
    const day2 = new Date(2026, 5, 16, 12, 0, 0);
    expect(dayOfYearLocal(day2) - dayOfYearLocal(day1)).toBe(1);
  });

  it("23:59 и 00:01 следующего дня → разные дни (rollover в полночь)", () => {
    // Worker, закрывающий смену в 23:59, должен видеть один tip;
    // в 00:01 — следующий.
    const lateNight = new Date(2026, 5, 15, 23, 59, 0);
    const earlyMorning = new Date(2026, 5, 16, 0, 1, 0);
    expect(dayOfYearLocal(earlyMorning)).not.toBe(dayOfYearLocal(lateNight));
  });

  it("один и тот же день в разное время → одинаковый day", () => {
    const morning = new Date(2026, 5, 15, 6, 0, 0);
    const evening = new Date(2026, 5, 15, 22, 0, 0);
    expect(dayOfYearLocal(morning)).toBe(dayOfYearLocal(evening));
  });
});

describe("pickByDayOfYear", () => {
  const ITEMS = ["tip-A", "tip-B", "tip-C"] as const;

  it("стабильно в течение одного дня", () => {
    const morning = new Date(2026, 5, 15, 6, 0, 0);
    const evening = new Date(2026, 5, 15, 22, 0, 0);
    expect(pickByDayOfYear(morning, ITEMS)).toBe(
      pickByDayOfYear(evening, ITEMS),
    );
  });

  it("3 последовательных дня → cycle через 3 items", () => {
    const day1 = new Date(2026, 5, 1, 12, 0, 0);
    const day2 = new Date(2026, 5, 2, 12, 0, 0);
    const day3 = new Date(2026, 5, 3, 12, 0, 0);
    const day4 = new Date(2026, 5, 4, 12, 0, 0);
    const picks = [day1, day2, day3, day4].map((d) =>
      pickByDayOfYear(d, ITEMS),
    );
    // День 4 даёт тот же что день 1 (cycle)
    expect(picks[3]).toBe(picks[0]);
    // 1, 2, 3 — все разные (3 items в массиве)
    expect(new Set([picks[0], picks[1], picks[2]]).size).toBe(3);
  });

  it("пустой массив → throw (защита от опечатки)", () => {
    expect(() => pickByDayOfYear(new Date(), [])).toThrow();
  });

  it("один item → всегда возвращает его", () => {
    const single = ["only-tip"] as const;
    const day1 = new Date(2026, 0, 1);
    const day2 = new Date(2026, 11, 31);
    expect(pickByDayOfYear(day1, single)).toBe("only-tip");
    expect(pickByDayOfYear(day2, single)).toBe("only-tip");
  });
});
