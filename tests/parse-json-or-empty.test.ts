/**
 * Тесты parseJsonOrEmpty — resilient JSON parser для server error
 * responses в use-tasks/TaskViewDialog.
 *
 * Контракт: всегда возвращает Record<string, unknown> (валидный
 * object), никогда не throws. Регрессия в guard'ах = `data.message`
 * call'ы дают TypeError на non-object payload (`null.message`).
 */

import { describe, it, expect } from "vitest";
import { parseJsonOrEmpty } from "../client/src/lib/parse-json-or-empty";

describe("parseJsonOrEmpty — empty / null", () => {
  it("null → {}", () => {
    expect(parseJsonOrEmpty(null)).toEqual({});
  });

  it("undefined → {}", () => {
    expect(parseJsonOrEmpty(undefined)).toEqual({});
  });

  it("'' → {}", () => {
    expect(parseJsonOrEmpty("")).toEqual({});
  });

  it("'   ' (whitespace) → {}", () => {
    expect(parseJsonOrEmpty("   ")).toEqual({});
  });
});

describe("parseJsonOrEmpty — malformed JSON", () => {
  it("not json{{ → {}", () => {
    expect(parseJsonOrEmpty("not json{{")).toEqual({});
  });

  it("HTML response → {} (не throws)", () => {
    // Edge case: server вернул HTML 502/503 страницу вместо JSON.
    expect(parseJsonOrEmpty("<html><body>503</body></html>")).toEqual({});
  });
});

describe("parseJsonOrEmpty — non-object JSON", () => {
  it("'null' → {} (JSON null literal)", () => {
    // КРИТИЧНО: без guard'а на `parsed === null`, callers получили бы
    // null и `null.message` бросал TypeError.
    expect(parseJsonOrEmpty("null")).toEqual({});
  });

  it("'42' (number) → {}", () => {
    expect(parseJsonOrEmpty("42")).toEqual({});
  });

  it("'\"hello\"' (string) → {}", () => {
    expect(parseJsonOrEmpty('"hello"')).toEqual({});
  });

  it("'[1,2,3]' (array) → {} (Array.isArray guard)", () => {
    // Регрессия: без Array.isArray check, callers получили бы array,
    // и `data.message` undefined но `data[0]=1` — surprising.
    expect(parseJsonOrEmpty("[1,2,3]")).toEqual({});
  });

  it("'true' (boolean) → {}", () => {
    expect(parseJsonOrEmpty("true")).toEqual({});
  });
});

describe("parseJsonOrEmpty — happy path", () => {
  it("'{}' → {}", () => {
    expect(parseJsonOrEmpty("{}")).toEqual({});
  });

  it("'{\"message\":\"Ошибка\"}' → объект с message", () => {
    const result = parseJsonOrEmpty('{"message":"Ошибка"}');
    expect(result.message).toBe("Ошибка");
  });

  it("complex object → preserves structure", () => {
    const result = parseJsonOrEmpty(
      '{"success":true,"photoUrls":["a","b"],"taskId":42}',
    );
    expect(result.success).toBe(true);
    expect(result.photoUrls).toEqual(["a", "b"]);
    expect(result.taskId).toBe(42);
  });
});
