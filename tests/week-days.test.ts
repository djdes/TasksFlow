/**
 * Тесты formatWeekDaysShort.
 *
 * Sort-порядок русский (Пн начало, Вс конец) — Date.getDay() даёт
 * 0=Вс..6=Сб (US convention). Регрессия: если кто-то отрсивит «Вс
 * как 7 для sort» хак, на бейджах появится «Вс, Пн, Ср, Пт» вместо
 * правильного «Пн, Ср, Пт, Вс».
 */

import { describe, it, expect } from "vitest";
import { formatWeekDaysShort } from "../client/src/lib/week-days";

describe("formatWeekDaysShort — пустые / невалидные", () => {
  it("[] → ''", () => {
    expect(formatWeekDaysShort([])).toBe("");
  });

  it("[7, 8, -1] (out of range) → ''", () => {
    expect(formatWeekDaysShort([7, 8, -1])).toBe("");
  });

  it("[1, 7] (один валидный, один нет) → 'Пн'", () => {
    expect(formatWeekDaysShort([1, 7])).toBe("Пн");
  });
});

describe("formatWeekDaysShort — single day", () => {
  it("[0] → 'Вс'", () => {
    expect(formatWeekDaysShort([0])).toBe("Вс");
  });
  it("[1] → 'Пн'", () => {
    expect(formatWeekDaysShort([1])).toBe("Пн");
  });
  it("[6] → 'Сб'", () => {
    expect(formatWeekDaysShort([6])).toBe("Сб");
  });
});

describe("formatWeekDaysShort — multiple, русский порядок", () => {
  it("[1,3,5] → 'Пн, Ср, Пт' (уже отсортировано)", () => {
    expect(formatWeekDaysShort([1, 3, 5])).toBe("Пн, Ср, Пт");
  });

  it("[5,3,1] → 'Пн, Ср, Пт' (sort работает)", () => {
    expect(formatWeekDaysShort([5, 3, 1])).toBe("Пн, Ср, Пт");
  });

  it("[0,6] → 'Сб, Вс' (Вс ПОСЛЕ Сб, не первым!)", () => {
    expect(formatWeekDaysShort([0, 6])).toBe("Сб, Вс");
  });

  it("[6,0,1] → 'Пн, Сб, Вс'", () => {
    expect(formatWeekDaysShort([6, 0, 1])).toBe("Пн, Сб, Вс");
  });

  it("вся неделя [0..6] → 'Пн, Вт, Ср, Чт, Пт, Сб, Вс'", () => {
    expect(formatWeekDaysShort([0, 1, 2, 3, 4, 5, 6])).toBe(
      "Пн, Вт, Ср, Чт, Пт, Сб, Вс",
    );
  });

  it("вся неделя в обратном порядке → тот же результат", () => {
    expect(formatWeekDaysShort([6, 5, 4, 3, 2, 1, 0])).toBe(
      "Пн, Вт, Ср, Чт, Пт, Сб, Вс",
    );
  });
});

describe("formatWeekDaysShort — дубликаты", () => {
  it("[1,1,3] → 'Пн, Ср' (дубликаты убраны)", () => {
    expect(formatWeekDaysShort([1, 1, 3])).toBe("Пн, Ср");
  });

  it("[0,0,0] → 'Вс'", () => {
    expect(formatWeekDaysShort([0, 0, 0])).toBe("Вс");
  });
});

describe("formatWeekDaysShort — readonly array compat", () => {
  it("принимает readonly array", () => {
    const days: readonly number[] = [1, 3] as const;
    expect(formatWeekDaysShort(days)).toBe("Пн, Ср");
  });
});
