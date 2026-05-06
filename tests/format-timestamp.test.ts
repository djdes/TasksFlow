/**
 * Тесты formatTimestamp — Unix-секунды → человеко-читаемое локализованное
 * datetime для admin-таблиц (ApiKeys, Integrations, etc).
 *
 * Раньше функция дублировалась в 2 местах, теперь shared. Тесты
 * фиксируют edge cases, которые легко случайно сломать.
 */

import { describe, it, expect } from "vitest";
import { formatTimestamp } from "../client/src/lib/format-timestamp";

describe("formatTimestamp — null/zero placeholder", () => {
  it("ts=0 → '—' (никогда не использовался)", () => {
    expect(formatTimestamp(0)).toBe("—");
  });

  it("ts=null → '—'", () => {
    expect(formatTimestamp(null)).toBe("—");
  });

  it("ts=undefined → '—'", () => {
    expect(formatTimestamp(undefined)).toBe("—");
  });

  it("ts=NaN → '—' (corrupted data)", () => {
    expect(formatTimestamp(NaN)).toBe("—");
  });

  it("ts=Infinity → '—' (corrupted data)", () => {
    expect(formatTimestamp(Infinity)).toBe("—");
  });

  it("ts=-Infinity → '—'", () => {
    expect(formatTimestamp(-Infinity)).toBe("—");
  });
});

describe("formatTimestamp — реальные timestamps", () => {
  it("ts > 0 → строка не равна '—'", () => {
    // 1700000000 = 2023-11-14
    const result = formatTimestamp(1700000000);
    expect(result).not.toBe("—");
    expect(result.length).toBeGreaterThan(0);
  });

  it("ts > 0 → формат содержит дату (ru-RU)", () => {
    // ru-RU использует разделители '.' для даты и ',' между date/time
    const result = formatTimestamp(1700000000);
    // Хотя toLocaleString не deterministic между runtimes, нам важно
    // что это string и не fallback. Проверяем что есть какие-то цифры.
    expect(/\d/.test(result)).toBe(true);
  });

  it("негативный timestamp (legacy bug?) → строка (Date обрабатывает)", () => {
    // -1 → 1969-12-31 23:59:59 UTC. Не '—' потому что Number.isFinite(-1) true.
    const result = formatTimestamp(-1);
    expect(result).not.toBe("—");
  });
});

describe("formatTimestamp — multiplication on 1000", () => {
  it("input в секундах → multiplied на 1000 для ms-based Date", () => {
    // Защита от регрессии: если кто-то забудет * 1000, Date(ts) даст
    // 1970+несколько секунд вместо реальной даты.
    const tsSec = 1700000000;
    const expected = new Date(tsSec * 1000).toLocaleString("ru-RU");
    expect(formatTimestamp(tsSec)).toBe(expected);
  });
});
