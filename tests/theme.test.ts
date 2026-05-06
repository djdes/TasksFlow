/**
 * Тесты parseThemePreference и resolveThemeFromPreference из
 * ThemeContext.tsx.
 *
 * Регрессия: если случайно отрсивать validation сравнения, мусор в
 * localStorage начнёт ломать UI — например, theme=«purple» зальёт
 * fallback HTMLstreaks без классов и юзер увидит нестилизованную
 * страницу.
 */

import { describe, it, expect } from "vitest";
import {
  parseThemePreference,
  resolveThemeFromPreference,
} from "../client/src/contexts/ThemeContext";

describe("parseThemePreference", () => {
  it("'light' → 'light'", () => {
    expect(parseThemePreference("light")).toBe("light");
  });
  it("'dark' → 'dark'", () => {
    expect(parseThemePreference("dark")).toBe("dark");
  });
  it("'system' → 'system'", () => {
    expect(parseThemePreference("system")).toBe("system");
  });
  it("null → 'system' (default)", () => {
    expect(parseThemePreference(null)).toBe("system");
  });
  it("undefined → 'system'", () => {
    expect(parseThemePreference(undefined)).toBe("system");
  });
  it("'' → 'system' (мусор)", () => {
    expect(parseThemePreference("")).toBe("system");
  });
  it("'purple' → 'system' (хакерский garbage)", () => {
    expect(parseThemePreference("purple")).toBe("system");
  });
  it("'LIGHT' → 'system' (case-sensitive!)", () => {
    // Защита: не нормализуем регистр. localStorage пишется только
    // через setPreference, а тот всегда передаёт lowercase. Если
    // что-то странное — fallback на system.
    expect(parseThemePreference("LIGHT")).toBe("system");
  });
});

describe("resolveThemeFromPreference", () => {
  it("preference=light → light (независимо от systemPrefersDark)", () => {
    expect(resolveThemeFromPreference("light", true)).toBe("light");
    expect(resolveThemeFromPreference("light", false)).toBe("light");
  });

  it("preference=dark → dark (независимо от system)", () => {
    expect(resolveThemeFromPreference("dark", true)).toBe("dark");
    expect(resolveThemeFromPreference("dark", false)).toBe("dark");
  });

  it("preference=system + system=dark → dark", () => {
    expect(resolveThemeFromPreference("system", true)).toBe("dark");
  });

  it("preference=system + system=light → light", () => {
    expect(resolveThemeFromPreference("system", false)).toBe("light");
  });
});
