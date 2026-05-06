/**
 * Тесты expiresFromSession — defensive parsing для express-session
 * cookie.expires. Возвращает unix-seconds для INSERT в sessions.expires
 * (MySQL int column).
 *
 * Контекст:
 *   • express-session кладёт `cookie.expires` как Date instance когда
 *     maxAge задан в config'е сервера.
 *   • После JSON roundtrip (load из БД) Date становится ISO string —
 *     поддерживаем оба формата.
 *   • Если ничего не пришло — fallback на maxAge или 24 часа.
 *
 * Защищённые регрессии:
 *   • Invalid Date (new Date("garbage").getTime() === NaN) → fallback
 *     (раньше можно было записать NaN в MySQL int → ошибка вставки или
 *     0 → юзер мгновенно вышибается).
 *   • Empty string ISO ("") → NaN → fallback.
 *   • null/undefined cookie или session → fallback.
 *   • cookie.maxAge не number → 24 часа.
 *   • Возврат всегда integer (Math.floor) — MySQL int column не
 *     принимает float.
 */

import { describe, it, expect } from "vitest";
import { expiresFromSession } from "../server/session-store";
import type { SessionData } from "express-session";

const ONE_DAY_S = 24 * 60 * 60;

function makeSession(cookie: any): SessionData {
  return { cookie } as unknown as SessionData;
}

describe("expiresFromSession — Date instance", () => {
  it("Date object → unix-seconds", () => {
    const fixed = new Date("2026-05-06T12:00:00Z");
    const expectedSec = Math.floor(fixed.getTime() / 1000);
    expect(expiresFromSession(makeSession({ expires: fixed }))).toBe(
      expectedSec,
    );
  });

  it("Invalid Date (NaN getTime) → fallback (НЕ NaN-в-БД)", () => {
    // Регрессия: раньше invalid Date проходил `instanceof Date` и
    // ms=NaN записывался в MySQL int → query крашил или вставлял 0.
    // Поведение под защитой: `!Number.isFinite(ms)` → fallback на 24ч.
    const invalid = new Date("garbage");
    expect(Number.isNaN(invalid.getTime())).toBe(true);
    const result = expiresFromSession(makeSession({ expires: invalid }));
    const nowSec = Math.floor(Date.now() / 1000);
    // Должно быть ~24 часа в будущем
    expect(result).toBeGreaterThanOrEqual(nowSec + ONE_DAY_S - 5);
    expect(result).toBeLessThanOrEqual(nowSec + ONE_DAY_S + 5);
  });
});

describe("expiresFromSession — ISO string (после JSON roundtrip)", () => {
  it("валидная ISO → парсится", () => {
    const isoStr = "2026-05-06T12:00:00.000Z";
    const expectedSec = Math.floor(new Date(isoStr).getTime() / 1000);
    expect(expiresFromSession(makeSession({ expires: isoStr }))).toBe(
      expectedSec,
    );
  });

  it("malformed ISO ('garbage') → fallback", () => {
    const result = expiresFromSession(
      makeSession({ expires: "not-a-date" }),
    );
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThan(nowSec);
  });

  it("пустая строка → fallback (NaN getTime)", () => {
    const result = expiresFromSession(makeSession({ expires: "" }));
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThan(nowSec);
  });
});

describe("expiresFromSession — fallback на maxAge", () => {
  it("expires=null + maxAge=3600s (в мс) → now+3600s", () => {
    const result = expiresFromSession(
      makeSession({ expires: null, maxAge: 3600 * 1000 }),
    );
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(nowSec + 3595);
    expect(result).toBeLessThanOrEqual(nowSec + 3605);
  });

  it("expires=undefined + maxAge=number → now+maxAge", () => {
    const result = expiresFromSession(
      makeSession({ maxAge: 7200 * 1000 }),
    );
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(nowSec + 7195);
    expect(result).toBeLessThanOrEqual(nowSec + 7205);
  });

  it("ни expires, ни maxAge → 24 часа default", () => {
    const result = expiresFromSession(makeSession({}));
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(nowSec + ONE_DAY_S - 5);
    expect(result).toBeLessThanOrEqual(nowSec + ONE_DAY_S + 5);
  });

  it("maxAge не number (string) → 24 часа default", () => {
    const result = expiresFromSession(
      makeSession({ maxAge: "3600" as any }),
    );
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(nowSec + ONE_DAY_S - 5);
    expect(result).toBeLessThanOrEqual(nowSec + ONE_DAY_S + 5);
  });

  it("maxAge=null → 24 часа default", () => {
    const result = expiresFromSession(
      makeSession({ maxAge: null as any }),
    );
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(nowSec + ONE_DAY_S - 5);
    expect(result).toBeLessThanOrEqual(nowSec + ONE_DAY_S + 5);
  });
});

describe("expiresFromSession — corrupted session shape", () => {
  it("session без cookie → 24h default (не падаем)", () => {
    const result = expiresFromSession({} as SessionData);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(nowSec + ONE_DAY_S - 5);
    expect(result).toBeLessThanOrEqual(nowSec + ONE_DAY_S + 5);
  });

  it("session=null safety", () => {
    // Defensive: если express-session случайно передаст null
    // (по типам не должен, но runtime уже не TypeScript).
    const result = expiresFromSession(null as any);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(result).toBeGreaterThanOrEqual(nowSec + ONE_DAY_S - 5);
    expect(result).toBeLessThanOrEqual(nowSec + ONE_DAY_S + 5);
  });

  it("expires=number (raw timestamp ms) → fallback (НЕ instanceof Date)", () => {
    // Regression freeze: текущая семантика принимает только Date
    // или string. number не парсится — fallback на maxAge/24ч. Если
    // когда-то решим принимать raw number — этот тест засветится и
    // потребует решения о валидной семантике.
    const result = expiresFromSession(
      makeSession({ expires: Date.now() + 5 * 60 * 1000 }),
    );
    const nowSec = Math.floor(Date.now() / 1000);
    // Не 5min, а 24ч default
    expect(result).toBeGreaterThanOrEqual(nowSec + ONE_DAY_S - 5);
  });
});

describe("expiresFromSession — output format", () => {
  it("всегда integer (Math.floor)", () => {
    // MySQL int column не принимает float. Math.floor()
    // гарантирует — даже если ms кончается на .999.
    const result = expiresFromSession(
      makeSession({ expires: new Date(1747000000999) }),
    );
    expect(Number.isInteger(result)).toBe(true);
  });

  it("конвертируется ms → seconds (правильный divisor)", () => {
    const ms = 1747000000000;
    const expectedSec = 1747000000;
    expect(
      expiresFromSession(makeSession({ expires: new Date(ms) })),
    ).toBe(expectedSec);
  });
});
