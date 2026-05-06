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
