/**
 * Тесты streakHint — мотивационный текст под streak в StatHero.
 *
 * Pinned UX-копирайт: воркер видит свою серию каждое утро, и текст
 * формирует психологическое отношение («первый день» vs «крутая
 * серия!»). Изменение порогов или текстов = mostly product call,
 * тесты ловят случайное изменение через refactor.
 */

import { describe, it, expect } from "vitest";
import { streakHint } from "../client/src/lib/streak-hint";

describe("streakHint — границы", () => {
  it("1 день → 'первый день'", () => {
    expect(streakHint(1)).toBe("первый день");
  });

  it("2 → 'так держать'", () => {
    expect(streakHint(2)).toBe("так держать");
  });

  it("4 → 'так держать' (граница 5)", () => {
    expect(streakHint(4)).toBe("так держать");
  });

  it("5 → 'крутая серия!' (новый порог)", () => {
    expect(streakHint(5)).toBe("крутая серия!");
  });

  it("13 → 'крутая серия!' (граница 14)", () => {
    expect(streakHint(13)).toBe("крутая серия!");
  });

  it("14 → 'ты мотор смены' (новый порог)", () => {
    expect(streakHint(14)).toBe("ты мотор смены");
  });

  it("100 → 'ты мотор смены'", () => {
    expect(streakHint(100)).toBe("ты мотор смены");
  });
});

describe("streakHint — edge cases", () => {
  it("0 → 'так держать' (текущий fallback)", () => {
    // 0 не должен попасть сюда (StatHero render'ит streak только при
    // streakDays >= 1), но если попадёт — fallback не валит.
    expect(streakHint(0)).toBe("так держать");
  });

  it("-1 (мусор) → 'так держать' (defensive)", () => {
    expect(streakHint(-1)).toBe("так держать");
  });
});
