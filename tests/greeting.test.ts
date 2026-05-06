/**
 * Тесты приветствия по времени суток + форматирование даты.
 *
 * UX-критическая логика: «Доброе утро» в 16:00 = баг. Если кто-то
 * сместит границы (например, evening начинается с 18 вместо 17), эти
 * тесты сразу засветятся.
 */

import { describe, it, expect } from "vitest";
import {
  formatDateLabel,
  firstNameOf,
  getTimeOfDay,
  greetingByTime,
} from "../client/src/lib/greeting";

describe("getTimeOfDay — границы (05/11/17/22)", () => {
  // Inclusive с нижней стороны.
  it("00:00 → night", () => expect(getTimeOfDay(0)).toBe("night"));
  it("04:59 → night (3:59 точно ночь)", () => {
    // hour=4 → ниже 5 → night
    expect(getTimeOfDay(4)).toBe("night");
  });
  it("05:00 → morning (граница утра)", () => {
    expect(getTimeOfDay(5)).toBe("morning");
  });
  it("10:59 → morning (последний час утра)", () => {
    expect(getTimeOfDay(10)).toBe("morning");
  });
  it("11:00 → day (граница дня)", () => {
    expect(getTimeOfDay(11)).toBe("day");
  });
  it("16:59 → day", () => {
    expect(getTimeOfDay(16)).toBe("day");
  });
  it("17:00 → evening (граница вечера)", () => {
    expect(getTimeOfDay(17)).toBe("evening");
  });
  it("21:59 → evening", () => {
    expect(getTimeOfDay(21)).toBe("evening");
  });
  it("22:00 → night (граница ночи)", () => {
    expect(getTimeOfDay(22)).toBe("night");
  });
  it("23:59 → night", () => {
    expect(getTimeOfDay(23)).toBe("night");
  });
});

describe("greetingByTime — русские строки", () => {
  it("morning → Доброе утро", () =>
    expect(greetingByTime("morning")).toBe("Доброе утро"));
  it("day → Добрый день", () =>
    expect(greetingByTime("day")).toBe("Добрый день"));
  it("evening → Добрый вечер", () =>
    expect(greetingByTime("evening")).toBe("Добрый вечер"));
  it("night → Доброй ночи", () =>
    expect(greetingByTime("night")).toBe("Доброй ночи"));
});

describe("formatDateLabel", () => {
  it("ср, 6 мая (среда=3, май=4)", () => {
    // 6 мая 2026 — среда (Wikipedia: 6 May 2026 = Wednesday)
    const d = new Date(2026, 4, 6);
    expect(formatDateLabel(d)).toBe("среда, 6 мая");
  });

  it("воскресенье, 1 января", () => {
    // 1 января 2023 = воскресенье
    const d = new Date(2023, 0, 1);
    expect(formatDateLabel(d)).toBe("воскресенье, 1 января");
  });

  it("31 декабря", () => {
    const d = new Date(2025, 11, 31);
    expect(formatDateLabel(d)).toContain("31 декабря");
  });
});

describe("firstNameOf", () => {
  it("«Иван Петров» → «Иван»", () => {
    expect(firstNameOf("Иван Петров")).toBe("Иван");
  });

  it("единственное слово → возвращает целиком", () => {
    expect(firstNameOf("Мария")).toBe("Мария");
  });

  it("trim лишних пробелов («  Иван  Петров  » → «Иван»)", () => {
    expect(firstNameOf("  Иван  Петров  ")).toBe("Иван");
  });

  it("null → null", () => {
    expect(firstNameOf(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(firstNameOf(undefined)).toBeNull();
  });

  it("пустая строка → null", () => {
    expect(firstNameOf("")).toBeNull();
  });

  it("только пробелы → null", () => {
    expect(firstNameOf("   ")).toBeNull();
  });

  it("3 имени («Иван Иванович Петров» → «Иван»)", () => {
    expect(firstNameOf("Иван Иванович Петров")).toBe("Иван");
  });
});
