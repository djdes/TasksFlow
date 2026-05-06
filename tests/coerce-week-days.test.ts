/**
 * Тесты coerceWeekDays — нормализация weekDays из разных форм
 * (array / JSON-string / null) в clean array of integers [0..6].
 *
 * Используется в EditTask и DuplicateTaskDialog. Регрессия = форма
 * редактирования заполняется broken weekDays, валидация Zod падает
 * → юзер не может сохранить task с расписанием.
 */

import { describe, it, expect } from "vitest";
import { coerceWeekDays } from "../client/src/lib/coerce-week-days";

describe("coerceWeekDays — null/undefined/empty", () => {
  it("null → null", () => {
    expect(coerceWeekDays(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(coerceWeekDays(undefined)).toBeNull();
  });

  it("'' (пустая строка) → null", () => {
    expect(coerceWeekDays("")).toBeNull();
  });

  it("'   ' (whitespace) → null", () => {
    expect(coerceWeekDays("   ")).toBeNull();
  });
});

describe("coerceWeekDays — array input", () => {
  it("[1, 3, 5] → [1, 3, 5]", () => {
    expect(coerceWeekDays([1, 3, 5])).toEqual([1, 3, 5]);
  });

  it("[0, 6] → [0, 6] (граничные)", () => {
    expect(coerceWeekDays([0, 6])).toEqual([0, 6]);
  });

  it("[7, -1, 8] (out of range) → null (всё отфильтровано)", () => {
    expect(coerceWeekDays([7, -1, 8])).toBeNull();
  });

  it("[1, 7, 3] (один валидный, два out-of-range) → [1, 3]", () => {
    expect(coerceWeekDays([1, 7, 3])).toEqual([1, 3]);
  });

  it("[1.5, 3] (float) → [3] (Number.isInteger guard)", () => {
    expect(coerceWeekDays([1.5, 3])).toEqual([3]);
  });

  it("[NaN, 1] → [1]", () => {
    expect(coerceWeekDays([NaN, 1])).toEqual([1]);
  });

  it("[Infinity, 1, -Infinity] → [1] (Number.isInteger guard)", () => {
    // Freeze: Number.isInteger(Infinity) === false, filter отбрасывает
    // даже без явного Number.isFinite. Защита автоматическая.
    expect(coerceWeekDays([Infinity, 1, -Infinity])).toEqual([1]);
  });

  it("['1', 3] (string-element) → [3] (typeof number guard)", () => {
    expect(coerceWeekDays(["1", 3])).toEqual([3]);
  });

  it("[] (empty array) → null", () => {
    expect(coerceWeekDays([])).toBeNull();
  });
});

describe("coerceWeekDays — JSON-string input", () => {
  it("'[1,3,5]' (valid JSON-array) → [1, 3, 5]", () => {
    expect(coerceWeekDays("[1,3,5]")).toEqual([1, 3, 5]);
  });

  it("'[]' (JSON empty array) → null", () => {
    expect(coerceWeekDays("[]")).toBeNull();
  });

  it("malformed JSON → null", () => {
    expect(coerceWeekDays("not json{{")).toBeNull();
  });

  it("JSON-object (не array) → null", () => {
    expect(coerceWeekDays('{"foo":1}')).toBeNull();
  });

  it("JSON-string (не array) → null", () => {
    expect(coerceWeekDays('"abc"')).toBeNull();
  });

  it("JSON-number (не array) → null", () => {
    expect(coerceWeekDays("42")).toBeNull();
  });

  it("'[1, 7, 3]' (string с out-of-range) → [1, 3]", () => {
    // Defense-in-depth: даже если corrupted server-data, filter
    // отбросит мусорные значения.
    expect(coerceWeekDays("[1, 7, 3]")).toEqual([1, 3]);
  });
});

describe("coerceWeekDays — другие types", () => {
  it("number → null (не array, не string)", () => {
    expect(coerceWeekDays(42)).toBeNull();
  });

  it("object → null", () => {
    expect(coerceWeekDays({ foo: 1 })).toBeNull();
  });

  it("boolean → null", () => {
    expect(coerceWeekDays(true)).toBeNull();
  });
});
