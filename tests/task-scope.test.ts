/**
 * Тесты getTaskScope — personal/shared классификация.
 *
 * shared = «единичный» journal (один воркер делает на смену, бонус
 * первому). UI показывает табы только когда есть shared, а scope-
 * filter влияет на видимость задач. Регрессия = воркер видит чужие
 * shared-задачи или наоборот пропускает свои personal.
 */

import { describe, it, expect } from "vitest";
import { getTaskScope } from "../client/src/lib/task-scope";

describe("getTaskScope", () => {
  it("journalLink=null → personal", () => {
    expect(getTaskScope({ journalLink: null })).toBe("personal");
  });

  it("journalLink=undefined → personal", () => {
    expect(getTaskScope({})).toBe("personal");
  });

  it("journalLink с taskScope=shared → shared", () => {
    expect(
      getTaskScope({
        journalLink: '{"taskScope":"shared","kind":"wesetup-cleaning"}',
      }),
    ).toBe("shared");
  });

  it("journalLink с taskScope=personal → personal", () => {
    expect(
      getTaskScope({ journalLink: '{"taskScope":"personal"}' }),
    ).toBe("personal");
  });

  it("journalLink без taskScope → personal (default)", () => {
    expect(
      getTaskScope({ journalLink: '{"kind":"wesetup-cleaning"}' }),
    ).toBe("personal");
  });

  it("malformed JSON → personal (defensive)", () => {
    expect(getTaskScope({ journalLink: "not-json" })).toBe("personal");
  });

  it("journalLink='' (пустая строка) → personal", () => {
    // !raw → personal. Тест freeze: если кто-то поменяет на raw==null
    // или typeof raw !== 'string', пустая строка пройдёт в JSON.parse и
    // упадёт TypeError'ом.
    expect(getTaskScope({ journalLink: "" })).toBe("personal");
  });

  it("journalLink=массив (валидный JSON, не объект) → personal", () => {
    // JSON.parse([1,2,3]) → array. parsed.taskScope undefined → personal.
    // Защита от runtime errors на parsed.taskScope при не-object типах.
    expect(getTaskScope({ journalLink: "[1,2,3]" })).toBe("personal");
  });

  it("journalLink=число (валидный JSON, не объект) → personal", () => {
    expect(getTaskScope({ journalLink: "42" })).toBe("personal");
  });

  it("journalLink=null-JSON-литерал → personal", () => {
    // JSON.parse('null') === null. parsed?.taskScope crashes без guard'а.
    // Текущий код не использует optional chaining — null.taskScope даст
    // TypeError. Тест freeze'ит что обработка null'a через try/catch.
    expect(getTaskScope({ journalLink: "null" })).toBe("personal");
  });

  it("taskScope=произвольное значение → personal", () => {
    // Только строго "shared" даёт shared. Любое другое значение
    // (опечатка, legacy migration, etc) — personal по дефолту.
    expect(
      getTaskScope({ journalLink: '{"taskScope":"team"}' }),
    ).toBe("personal");
    expect(
      getTaskScope({ journalLink: '{"taskScope":""}' }),
    ).toBe("personal");
    expect(
      getTaskScope({ journalLink: '{"taskScope":null}' }),
    ).toBe("personal");
  });
});
