/**
 * Тесты getUserShortName и getUserInitials.
 *
 * Русские имена «Иванов Сергей» традиционно ломают non-locale
 * форматтеры — они дают «ИВ» (первые 2 символа первого слова) вместо
 * правильного «ИС» (первая буква имени + первая буква отчества/
 * фамилии). Этот тест прибивает корректное поведение.
 */

import { describe, it, expect } from "vitest";
import {
  getUserShortName,
  getUserInitials,
} from "../client/src/lib/user-display";

describe("getUserShortName", () => {
  it("«Иван Петров» → «Петров»", () => {
    expect(getUserShortName({ name: "Иван Петров", phone: "+79991" })).toBe(
      "Петров",
    );
  });

  it("«Мария» (1 слово) → «Мария»", () => {
    expect(getUserShortName({ name: "Мария", phone: "+79992" })).toBe("Мария");
  });

  it("«Иван Петрович Сидоров» (3 слова) → «Сидоров» (последнее)", () => {
    expect(
      getUserShortName({ name: "Иван Петрович Сидоров", phone: "+79993" }),
    ).toBe("Сидоров");
  });

  it("name=null → phone", () => {
    expect(getUserShortName({ name: null, phone: "+79994" })).toBe("+79994");
  });

  it("name='' → phone", () => {
    expect(getUserShortName({ name: "", phone: "+79995" })).toBe("+79995");
  });

  it("user=null → «Не назначен»", () => {
    expect(getUserShortName(null)).toBe("Не назначен");
    expect(getUserShortName(undefined)).toBe("Не назначен");
  });

  it("trim лишних пробелов («  Иван Петров  » → «Петров»)", () => {
    expect(
      getUserShortName({ name: "  Иван Петров  ", phone: "+79996" }),
    ).toBe("Петров");
  });
});

describe("getUserInitials — РУССКАЯ regression (Иванов Сергей → ИС, не ИВ)", () => {
  it("«Иванов Сергей» → «ИС»", () => {
    expect(getUserInitials({ name: "Иванов Сергей", phone: "+79991" })).toBe(
      "ИС",
    );
  });

  it("«Иван Петров» → «ИП»", () => {
    expect(getUserInitials({ name: "Иван Петров", phone: "+79992" })).toBe(
      "ИП",
    );
  });

  it("3+ слов → первые 2 («Иван Петрович Сидоров» → «ИП»)", () => {
    expect(
      getUserInitials({ name: "Иван Петрович Сидоров", phone: "+79993" }),
    ).toBe("ИП");
  });
});

describe("getUserInitials — fallback paths", () => {
  it("1 слово → первые 2 буквы upper («Мария» → «МА»)", () => {
    expect(getUserInitials({ name: "Мария", phone: "+79991" })).toBe("МА");
  });

  it("1 буква → одна буква upper («о» → «О»)", () => {
    expect(getUserInitials({ name: "о", phone: "+79991" })).toBe("О");
  });

  it("name=null → первые 2 buchstaben phone", () => {
    expect(getUserInitials({ name: null, phone: "+79991234567" })).toBe("+7");
  });

  it("name='' → phone fallback", () => {
    expect(getUserInitials({ name: "", phone: "+79991234567" })).toBe("+7");
  });

  it("name='   ' (только пробелы) → '?'", () => {
    expect(getUserInitials({ name: "   ", phone: "" })).toBe("?");
  });

  it("user=null → '?'", () => {
    expect(getUserInitials(null)).toBe("?");
    expect(getUserInitials(undefined)).toBe("?");
  });

  it("латиница тоже работает («John Doe» → «JD»)", () => {
    expect(getUserInitials({ name: "John Doe", phone: "+12" })).toBe("JD");
  });
});
