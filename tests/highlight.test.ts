/**
 * Тесты search-highlight splitter'а.
 *
 * Регрессия: если кто-то поломает escapeRegex, юзер с query типа
 * «(price)» или «...» получит crash в RegExp construction. Если
 * поломает alternating index match-detection — подсветка отвалится
 * для multi-occurrence query.
 */

import { describe, it, expect } from "vitest";
import {
  escapeRegex,
  splitForHighlight,
} from "../client/src/lib/highlight";

describe("escapeRegex", () => {
  it("обычная строка не меняется", () => {
    expect(escapeRegex("полы")).toBe("полы");
  });

  it("точка эскейпится", () => {
    expect(escapeRegex(".")).toBe("\\.");
  });

  it("регекс-meta символы все эскейпятся", () => {
    // Не использует ничего unicode-tricky — все ASCII regex meta.
    const meta = ".*+?^${}()|[]\\";
    const escaped = escapeRegex(meta);
    // Каждый meta символ должен быть преfixнут \.
    for (const c of meta) {
      expect(escaped).toContain(`\\${c}`);
    }
  });

  it("звёздочка не делает greedy regex (защита от ReDoS)", () => {
    // Если бы * не эскейпился, "abc".match(/(.*)/g) дал бы greedy
    // match — мы хотим literal match.
    expect(escapeRegex(".*")).toBe("\\.\\*");
  });
});

describe("splitForHighlight — пустой query", () => {
  it("query='' → один non-match сегмент со всем text", () => {
    expect(splitForHighlight("hello world", "")).toEqual([
      { text: "hello world", isMatch: false },
    ]);
  });

  it("query=null → один non-match", () => {
    expect(splitForHighlight("hello", null)).toEqual([
      { text: "hello", isMatch: false },
    ]);
  });

  it("query=undefined → один non-match", () => {
    expect(splitForHighlight("hello", undefined)).toEqual([
      { text: "hello", isMatch: false },
    ]);
  });

  it("query из одних пробелов → один non-match (trim'ится)", () => {
    expect(splitForHighlight("hello", "   ")).toEqual([
      { text: "hello", isMatch: false },
    ]);
  });
});

describe("splitForHighlight — нет совпадений", () => {
  it("text не содержит query → один non-match", () => {
    const result = splitForHighlight("hello world", "xyz");
    expect(result).toEqual([{ text: "hello world", isMatch: false }]);
  });
});

describe("splitForHighlight — single match", () => {
  it("text='Помыть пол', query='пол' (match в конце даёт trailing empty)", () => {
    // String.split с capture group возвращает trailing empty если match
    // в самом конце: ['Помыть ', 'пол', '']. Это нормально, пустой
    // segment isMatch=false render'ится как пустой <span>.
    const result = splitForHighlight("Помыть пол", "пол");
    expect(result.length).toBeGreaterThanOrEqual(2);
    const matches = result.filter((s) => s.isMatch);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe("пол");
  });

  it("query в начале text", () => {
    const result = splitForHighlight("полы помыть", "пол");
    // ['', 'пол', 'ы помыть']
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ text: "", isMatch: false });
    expect(result[1]).toEqual({ text: "пол", isMatch: true });
    expect(result[2]).toEqual({ text: "ы помыть", isMatch: false });
  });
});

describe("splitForHighlight — case insensitive", () => {
  it("UPPERCASE query, lowercase text → match", () => {
    const result = splitForHighlight("полы", "ПОЛЫ");
    expect(result.find((s) => s.isMatch)?.text).toBe("полы");
  });

  it("Mixed case", () => {
    const result = splitForHighlight("ПолЫ Помыть", "пол");
    const matches = result.filter((s) => s.isMatch);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe("Пол"); // preserves original case
  });
});

describe("splitForHighlight — multi-match (regression)", () => {
  it("два вхождения 'пол' → оба isMatch=true", () => {
    const result = splitForHighlight("полы и пол", "пол");
    const matches = result.filter((s) => s.isMatch);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.text === "пол")).toBe(true);
  });

  it("multiple 'b' в 'ababab'", () => {
    const result = splitForHighlight("ababab", "b");
    const matches = result.filter((s) => s.isMatch);
    expect(matches).toHaveLength(3);
  });
});

describe("splitForHighlight — regex meta в query", () => {
  it("query='.' → literal match точки (не wildcard)", () => {
    const result = splitForHighlight("a.b.c", ".");
    const matches = result.filter((s) => s.isMatch);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.text === ".")).toBe(true);
  });

  it("query='()' → literal, не crash", () => {
    expect(() => splitForHighlight("test", "()")).not.toThrow();
  });

  it("query='(.*)' → literal", () => {
    const result = splitForHighlight("(.*)x(.*)", "(.*)");
    const matches = result.filter((s) => s.isMatch);
    expect(matches).toHaveLength(2);
  });
});

describe("splitForHighlight — unicode и emoji", () => {
  it("emoji в query → literal match", () => {
    const result = splitForHighlight("Молодец 😀 продолжай!", "😀");
    const matches = result.filter((s) => s.isMatch);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe("😀");
  });

  it("кириллица с диакритикой (ё/й)", () => {
    const result = splitForHighlight("ёжик и йогурт", "ё");
    const matches = result.filter((s) => s.isMatch);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe("ё");
  });

  it("кириллица case-insensitive (Ё → ё)", () => {
    const result = splitForHighlight("Ёжик и йогурт", "ё");
    const matches = result.filter((s) => s.isMatch);
    // toLowerCase русских обычно работает: Ё → ё
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
