/**
 * Тесты computeNextStreak — pure-функция расчёта следующего streak
 * (дней подряд закрытия задач).
 *
 * UX-критическая логика: streak — психологический мотиватор для
 * пожилых сотрудников «5 дней подряд». Случайное изменение reset-
 * правил (например, +1 даже когда уже сегодня было) превратит
 * мотивацию в сюрприз и поломает доверие.
 */

import { describe, it, expect } from "vitest";
import {
  computeNextStreak,
  dateKey,
  parseStreakStored,
  todayKey,
  yesterdayKey,
  type StreakStored,
} from "../client/src/hooks/use-streak";

const TODAY = "2026-05-06";
const YESTERDAY = "2026-05-05";

describe("computeNextStreak — didCompleteSomethingToday=false", () => {
  it("без сохранённого → 0 (показываем «нет серии»)", () => {
    expect(computeNextStreak(null, TODAY, YESTERDAY, false)).toBe(0);
  });

  it("сохранённый 5 → возвращает 5 (без обновления)", () => {
    const stored: StreakStored = { days: 5, lastDate: YESTERDAY };
    expect(computeNextStreak(stored, TODAY, YESTERDAY, false)).toBe(5);
  });
});

describe("computeNextStreak — didCompleteSomethingToday=true", () => {
  it("без сохранённого → 1 (новая серия)", () => {
    expect(computeNextStreak(null, TODAY, YESTERDAY, true)).toBe(1);
  });

  it("lastDate=today → idempotent (не +1 на повторный рендер)", () => {
    // Самый важный кейс: компонент re-render'ится много раз за день,
    // streak не должен превратиться в 100+ если воркер закрыл одну
    // задачу.
    const stored: StreakStored = { days: 7, lastDate: TODAY };
    expect(computeNextStreak(stored, TODAY, YESTERDAY, true)).toBe(7);
  });

  it("lastDate=yesterday → +1 (продолжение серии)", () => {
    const stored: StreakStored = { days: 7, lastDate: YESTERDAY };
    expect(computeNextStreak(stored, TODAY, YESTERDAY, true)).toBe(8);
  });

  it("lastDate=2 дня назад → reset на 1 (пропустил день)", () => {
    const stored: StreakStored = { days: 7, lastDate: "2026-05-04" };
    expect(computeNextStreak(stored, TODAY, YESTERDAY, true)).toBe(1);
  });

  it("lastDate=неделю назад → reset на 1", () => {
    const stored: StreakStored = { days: 7, lastDate: "2026-04-29" };
    expect(computeNextStreak(stored, TODAY, YESTERDAY, true)).toBe(1);
  });

  it("lastDate=будущая дата → reset на 1 (clock skew protection)", () => {
    // Если кто-то покрутил clock назад → перевёл вперёд → у воркера
    // в storage future-date. Не +1 (не «продолжение»), а reset:
    // более безопасное поведение чем нагнать стрик через clock.
    const stored: StreakStored = { days: 100, lastDate: "2026-05-10" };
    expect(computeNextStreak(stored, TODAY, YESTERDAY, true)).toBe(1);
  });

  it("огромный streak +1 не overflow", () => {
    const stored: StreakStored = { days: 999, lastDate: YESTERDAY };
    expect(computeNextStreak(stored, TODAY, YESTERDAY, true)).toBe(1000);
  });
});

describe("computeNextStreak — boundary semantics", () => {
  it("today === yesterday (странный календарь) → idempotent", () => {
    // Не должно произойти, но проверяем что функция не падает.
    const stored: StreakStored = { days: 5, lastDate: TODAY };
    expect(computeNextStreak(stored, TODAY, TODAY, true)).toBe(5);
  });

  it("первый день после reset (stored.days=0)", () => {
    // Edge: stored есть но days=0 (legacy migration)
    const stored: StreakStored = { days: 0, lastDate: YESTERDAY };
    expect(computeNextStreak(stored, TODAY, YESTERDAY, true)).toBe(1);
  });
});

describe("parseStreakStored — defensive corrupted-localStorage", () => {
  it("null/undefined/'' → null", () => {
    expect(parseStreakStored(null)).toBeNull();
    expect(parseStreakStored(undefined)).toBeNull();
    expect(parseStreakStored("")).toBeNull();
  });

  it("malformed JSON → null", () => {
    expect(parseStreakStored("not json{{")).toBeNull();
  });

  it("JSON-null literal → null (без crash)", () => {
    expect(parseStreakStored("null")).toBeNull();
  });

  it("array вместо object → null", () => {
    expect(parseStreakStored("[1,2]")).toBeNull();
  });

  it("number вместо object → null", () => {
    expect(parseStreakStored("42")).toBeNull();
  });

  it("days отсутствует → null", () => {
    expect(parseStreakStored('{"lastDate":"2026-05-05"}')).toBeNull();
  });

  it("lastDate отсутствует → null", () => {
    expect(parseStreakStored('{"days":5}')).toBeNull();
  });

  it("days=1.5 (float) → null (Number.isInteger guard)", () => {
    // Регрессия: без isInteger guard'а UI показал бы «1.5 дней».
    expect(
      parseStreakStored('{"days":1.5,"lastDate":"2026-05-05"}'),
    ).toBeNull();
  });

  it("days=-3 (negative) → null", () => {
    expect(
      parseStreakStored('{"days":-3,"lastDate":"2026-05-05"}'),
    ).toBeNull();
  });

  it("happy path → объект", () => {
    expect(
      parseStreakStored('{"days":7,"lastDate":"2026-05-05"}'),
    ).toEqual({ days: 7, lastDate: "2026-05-05" });
  });

  it("days=0 (legacy migration) → объект", () => {
    expect(
      parseStreakStored('{"days":0,"lastDate":"2026-05-05"}'),
    ).toEqual({ days: 0, lastDate: "2026-05-05" });
  });
});

describe("dateKey — формат YYYY-MM-DD", () => {
  it("обычная дата → правильный формат", () => {
    expect(dateKey(new Date(2026, 4, 6))).toBe("2026-05-06");
  });

  it("январь — month=0 → '01' (padStart)", () => {
    expect(dateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("декабрь — month=11 → '12'", () => {
    expect(dateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("первый день месяца — pad на 2 цифры", () => {
    expect(dateKey(new Date(2026, 8, 1))).toBe("2026-09-01");
  });

  it("9 сентября → '2026-09-09' (оба компонента pad)", () => {
    expect(dateKey(new Date(2026, 8, 9))).toBe("2026-09-09");
  });
});

describe("yesterdayKey — границы месяца/года", () => {
  it("обычно (середина месяца) → -1 день", () => {
    expect(yesterdayKey(new Date(2026, 4, 6))).toBe("2026-05-05");
  });

  it("1 марта → 28 февраля (не високосный)", () => {
    // 2026 не високосный (делится на 4 но не на 100... 2026/4=506.5 — нет!
    // Wait: 2026/4=506.5, не целое — НЕ високосный → 28 days февраль).
    expect(yesterdayKey(new Date(2026, 2, 1))).toBe("2026-02-28");
  });

  it("1 марта 2024 → 29 февраля (високосный)", () => {
    // 2024 високосный.
    expect(yesterdayKey(new Date(2024, 2, 1))).toBe("2024-02-29");
  });

  it("1 января → 31 декабря предыдущего года", () => {
    expect(yesterdayKey(new Date(2026, 0, 1))).toBe("2025-12-31");
  });

  it("1 мая → 30 апреля", () => {
    expect(yesterdayKey(new Date(2026, 4, 1))).toBe("2026-04-30");
  });
});

describe("todayKey — без аргумента использует new Date()", () => {
  it("формат YYYY-MM-DD", () => {
    const result = todayKey();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(result)).toBe(true);
  });

  it("с явным аргументом → predictable", () => {
    expect(todayKey(new Date(2026, 0, 15))).toBe("2026-01-15");
  });
});
