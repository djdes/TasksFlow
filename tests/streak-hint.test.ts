/**
 * Тесты streakHint — мотивационный текст под streak в StatHero.
 *
 * Pinned UX-копирайт: воркер видит свою серию каждое утро, и текст
 * формирует психологическое отношение («первый день» vs «крутая
 * серия!»). Изменение порогов или текстов = mostly product call,
 * тесты ловят случайное изменение через refactor.
 */

import { describe, it, expect } from "vitest";
import {
  bonusHint,
  completedHint,
  streakHint,
  todayHint,
} from "../client/src/lib/streak-hint";

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

describe("todayHint — «Сегодня» tile", () => {
  it("totalCount=0 → 'Задач нет' (приоритет)", () => {
    expect(todayHint(0, 0)).toBe("Задач нет");
    // remaining ignored когда totalCount=0
    expect(todayHint(5, 0)).toBe("Задач нет");
  });

  it("remaining=0 → 'Все сделано!'", () => {
    expect(todayHint(0, 5)).toBe("Все сделано!");
  });

  it("remaining > 0 → 'из N'", () => {
    expect(todayHint(3, 10)).toBe("из 10");
    expect(todayHint(1, 1)).toBe("из 1");
  });
});

describe("completedHint — «Сделано» tile", () => {
  it("totalCount=0 → 'Поехали!' (нет задач — мотивация)", () => {
    expect(completedHint(0, 0)).toBe("Поехали!");
    // progress ignored когда totalCount=0
    expect(completedHint(0.5, 0)).toBe("Поехали!");
  });

  it("progress=0 + есть задачи → '0%'", () => {
    expect(completedHint(0, 10)).toBe("0%");
  });

  it("progress=1 (всё сделано) → '100%'", () => {
    expect(completedHint(1, 10)).toBe("100%");
  });

  it("progress округляется (0.333 → 33%)", () => {
    expect(completedHint(0.333, 10)).toBe("33%");
    expect(completedHint(0.666, 10)).toBe("67%");
  });
});

describe("bonusHint — «Премия» tile", () => {
  it("0 → 'сделай первым' (мотивация)", () => {
    expect(bonusHint(0)).toBe("сделай первым");
  });

  it("1 → 'копится'", () => {
    expect(bonusHint(1)).toBe("копится");
  });

  it("большое значение → 'копится'", () => {
    expect(bonusHint(50000)).toBe("копится");
  });

  it("отрицательный balance (corrupted) → 'сделай первым' (defensive)", () => {
    // Не должно случиться, но если случилось — не показываем «копится».
    expect(bonusHint(-100)).toBe("сделай первым");
  });
});
