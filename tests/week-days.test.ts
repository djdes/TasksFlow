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

  it("float [1.5, 3] → 'Ср' (не integer пропускается)", () => {
    // Регрессия: без Number.isInteger guard'а 1.5 проходил range-check,
    // но WEEK_DAY_SHORT_NAMES[1.5] = undefined → join выдавал
    // «Пн, , Ср» (пустая ячейка между запятыми).
    expect(formatWeekDaysShort([1.5, 3])).toBe("Ср");
  });

  it("NaN отфильтровывается", () => {
    // typeof NaN === 'number', но Number.isInteger(NaN) === false.
    expect(formatWeekDaysShort([NaN, 1, 3])).toBe("Пн, Ср");
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

  it("[0,6] → 'По выходным' (Сб и Вс вместе — словом)", () => {
    expect(formatWeekDaysShort([0, 6])).toBe("По выходным");
  });

  it("[6,0,1] → 'Пн, Сб, Вс'", () => {
    expect(formatWeekDaysShort([6, 0, 1])).toBe("Пн, Сб, Вс");
  });

  it("вся неделя [0..6] → 'Каждый день'", () => {
    expect(formatWeekDaysShort([0, 1, 2, 3, 4, 5, 6])).toBe("Каждый день");
  });

  it("вся неделя в обратном порядке → тот же результат", () => {
    expect(formatWeekDaysShort([6, 5, 4, 3, 2, 1, 0])).toBe("Каждый день");
  });

  it("вся неделя с дубликатами → 'Каждый день'", () => {
    expect(formatWeekDaysShort([0, 1, 1, 2, 3, 4, 5, 6, 6])).toBe("Каждый день");
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

describe("formatWeekDaysShort — будни, выходные, диапазоны", () => {
  it("Пн–Пт → 'По будням'", () => {
    expect(formatWeekDaysShort([1, 2, 3, 4, 5])).toBe("По будням");
  });

  it("будни в другом порядке → 'По будням'", () => {
    expect(formatWeekDaysShort([5, 4, 3, 2, 1])).toBe("По будням");
  });

  it("Пн–Чт → диапазон", () => {
    expect(formatWeekDaysShort([1, 2, 3, 4])).toBe("Пн–Чт");
  });

  it("Пн–Ср и Пт → диапазон плюс день", () => {
    expect(formatWeekDaysShort([5, 1, 3, 2])).toBe("Пн–Ср, Пт");
  });

  it("Пн–Сб → диапазон, а не «По будням»", () => {
    expect(formatWeekDaysShort([1, 2, 3, 4, 5, 6])).toBe("Пн–Сб");
  });

  it("Вт–Вс → диапазон с воскресеньем в конце", () => {
    expect(formatWeekDaysShort([0, 2, 3, 4, 5, 6])).toBe("Вт–Вс");
  });

  it("два дня подряд остаются списком, а не диапазоном", () => {
    expect(formatWeekDaysShort([1, 2])).toBe("Пн, Вт");
  });

  it("неделя не заворачивается через воскресенье", () => {
    // Сб, Вс, Пн — не «Сб–Пн»: неделя начинается с понедельника.
    expect(formatWeekDaysShort([6, 0, 1])).toBe("Пн, Сб, Вс");
  });

  it("Пт, Сб, Вс → диапазон", () => {
    expect(formatWeekDaysShort([5, 6, 0])).toBe("Пт–Вс");
  });

  it("невалидные значения не мешают «Каждый день»", () => {
    expect(formatWeekDaysShort([0, 1, 2, 3, 4, 5, 6, 7, 1.5])).toBe("Каждый день");
  });
});

describe("formatWeekDaysShort — readonly array compat", () => {
  it("принимает readonly array", () => {
    const days: readonly number[] = [1, 3] as const;
    expect(formatWeekDaysShort(days)).toBe("Пн, Ср");
  });
});
