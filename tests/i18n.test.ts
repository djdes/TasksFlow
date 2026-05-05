/**
 * Тесты Russian plural-form selector. Защита от случайного удаления
 * исключения 11-14 в pluralizeRu — без него регрессия незаметная,
 * только верификатор с 11+ submits увидит ломаный текст.
 *
 * Контекст: тики 23-24 фиксили грубую проверку count < 5 в двух
 * компонентах (VerificationBanner, StreakAchievement), вытащили в
 * общий helper client/src/lib/i18n.ts.
 */

import { describe, it, expect } from "vitest";
import { pluralizeRu, plural } from "../client/src/lib/i18n";

describe("pluralizeRu — базовые формы 1-10", () => {
  it("1 → one", () => expect(pluralizeRu(1)).toBe("one"));
  it("2 → few", () => expect(pluralizeRu(2)).toBe("few"));
  it("3 → few", () => expect(pluralizeRu(3)).toBe("few"));
  it("4 → few", () => expect(pluralizeRu(4)).toBe("few"));
  it("5 → many", () => expect(pluralizeRu(5)).toBe("many"));
  it("6 → many", () => expect(pluralizeRu(6)).toBe("many"));
  it("7 → many", () => expect(pluralizeRu(7)).toBe("many"));
  it("8 → many", () => expect(pluralizeRu(8)).toBe("many"));
  it("9 → many", () => expect(pluralizeRu(9)).toBe("many"));
  it("10 → many", () => expect(pluralizeRu(10)).toBe("many"));
  it("0 → many (особенность RU)", () => expect(pluralizeRu(0)).toBe("many"));
});

describe("pluralizeRu — исключение 11-14 (тик 23 фикс)", () => {
  it("11 → many (НЕ one)", () => expect(pluralizeRu(11)).toBe("many"));
  it("12 → many (НЕ few)", () => expect(pluralizeRu(12)).toBe("many"));
  it("13 → many (НЕ few)", () => expect(pluralizeRu(13)).toBe("many"));
  it("14 → many (НЕ few)", () => expect(pluralizeRu(14)).toBe("many"));
  it("15 → many", () => expect(pluralizeRu(15)).toBe("many"));
  it("19 → many", () => expect(pluralizeRu(19)).toBe("many"));
  it("20 → many", () => expect(pluralizeRu(20)).toBe("many"));
});

describe("pluralizeRu — двух- и трёхзначные числа повторяют правило", () => {
  // Раньше count < 5 ломалось на 21+: "21 задача" → "Заявок" (баг).
  it("21 → one (как 1)", () => expect(pluralizeRu(21)).toBe("one"));
  it("22 → few (как 2)", () => expect(pluralizeRu(22)).toBe("few"));
  it("23 → few", () => expect(pluralizeRu(23)).toBe("few"));
  it("24 → few", () => expect(pluralizeRu(24)).toBe("few"));
  it("25 → many", () => expect(pluralizeRu(25)).toBe("many"));
  it("30 → many", () => expect(pluralizeRu(30)).toBe("many"));
  it("31 → one", () => expect(pluralizeRu(31)).toBe("one"));
  it("100 → many", () => expect(pluralizeRu(100)).toBe("many"));
  it("101 → one", () => expect(pluralizeRu(101)).toBe("one"));
  it("111 → many (исключение 11-14 переносится на сотни)", () =>
    expect(pluralizeRu(111)).toBe("many"));
  it("112 → many", () => expect(pluralizeRu(112)).toBe("many"));
  it("121 → one", () => expect(pluralizeRu(121)).toBe("one"));
  it("122 → few", () => expect(pluralizeRu(122)).toBe("few"));
});

describe("plural() shortcut", () => {
  it("plural(1, день, дня, дней) → 'день'", () =>
    expect(plural(1, "день", "дня", "дней")).toBe("день"));

  it("plural(2, день, дня, дней) → 'дня'", () =>
    expect(plural(2, "день", "дня", "дней")).toBe("дня"));

  it("plural(11, день, дня, дней) → 'дней' (исключение)", () =>
    expect(plural(11, "день", "дня", "дней")).toBe("дней"));

  it("plural(21, день, дня, дней) → 'день' (тик 24 регрессия)", () =>
    expect(plural(21, "день", "дня", "дней")).toBe("день"));

  it("plural(22, день, дня, дней) → 'дня' (тик 24 регрессия)", () =>
    expect(plural(22, "день", "дня", "дней")).toBe("дня"));

  it("plural(0, день, дня, дней) → 'дней'", () =>
    expect(plural(0, "день", "дня", "дней")).toBe("дней"));
});

describe("pluralizeRu — отрицательные числа (Math.abs)", () => {
  it("-1 → one", () => expect(pluralizeRu(-1)).toBe("one"));
  it("-12 → many (исключение работает на abs)", () =>
    expect(pluralizeRu(-12)).toBe("many"));
});
