/**
 * Тесты getJournalBonus — расчёт суммы бонуса за журнальную задачу.
 *
 * Контекст: client/src/lib/journal-bonus.ts. Логика:
 *   1. Только для WeSetup-journal-bound задач (parseJournalLink не null)
 *   2. Если journal-code в NO_BONUS_JOURNAL_CODES (hygiene/health_check/
 *      med_books) — null. Эти журналы — личная дисциплина, бонусом
 *      не стимулируем.
 *   3. Если есть link.bonusAmountKopecks > 0 — возвращаем рубли.
 *   4. Если bonusAmountKopecks <= 0 — null (отключено).
 *   5. Если bonusAmountKopecks отсутствует (legacy-задачи) — fallback
 *      на JOURNAL_BONUS_RUB (50 ₽).
 *
 * Если кто-то сломает priority chain или забудет про NO_BONUS_JOURNAL_CODES
 * — упадут конкретные тесты с подсказкой что именно изменилось.
 */

import { describe, it, expect } from "vitest";
import {
  getJournalBonus,
  JOURNAL_BONUS_RUB,
  NO_BONUS_JOURNAL_CODES,
} from "../client/src/lib/journal-bonus";

function makeTask(linkObj: object | null) {
  return { journalLink: linkObj === null ? null : JSON.stringify(linkObj) };
}

const VALID_LINK = {
  kind: "wesetup-cleaning",
  baseUrl: "https://wesetup.ru",
  documentId: "doc1",
  rowKey: "row1",
};

describe("getJournalBonus — non-journal задачи", () => {
  it("null journalLink → null", () => {
    expect(getJournalBonus(makeTask(null))).toBeNull();
  });

  it("undefined journalLink → null", () => {
    expect(getJournalBonus({})).toBeNull();
  });

  it("малформированный JSON → null", () => {
    expect(getJournalBonus({ journalLink: "not-json" })).toBeNull();
  });

  it("валидный JSON но не journal-link shape → null", () => {
    expect(getJournalBonus({ journalLink: '{"foo":"bar"}' })).toBeNull();
  });
});

describe("getJournalBonus — bonusAmountKopecks источник истины", () => {
  it("kopecks=10000 → 100 рублей", () => {
    expect(
      getJournalBonus(makeTask({ ...VALID_LINK, bonusAmountKopecks: 10000 })),
    ).toBe(100);
  });

  it("kopecks=5000 → 50 рублей", () => {
    expect(
      getJournalBonus(makeTask({ ...VALID_LINK, bonusAmountKopecks: 5000 })),
    ).toBe(50);
  });

  it("kopecks=0 → null (бонус отключен)", () => {
    expect(
      getJournalBonus(makeTask({ ...VALID_LINK, bonusAmountKopecks: 0 })),
    ).toBeNull();
  });

  it("kopecks=-100 → null (защита от мусора)", () => {
    expect(
      getJournalBonus(makeTask({ ...VALID_LINK, bonusAmountKopecks: -100 })),
    ).toBeNull();
  });

  it("kopecks=12345 → округление до 123 рублей", () => {
    expect(
      getJournalBonus(makeTask({ ...VALID_LINK, bonusAmountKopecks: 12345 })),
    ).toBe(123);
  });
});

describe("getJournalBonus — legacy fallback (без kopecks)", () => {
  it("link без bonusAmountKopecks → JOURNAL_BONUS_RUB (50)", () => {
    expect(getJournalBonus(makeTask(VALID_LINK))).toBe(JOURNAL_BONUS_RUB);
    expect(getJournalBonus(makeTask(VALID_LINK))).toBe(50);
  });
});

describe("getJournalBonus — NO_BONUS_JOURNAL_CODES (личная дисциплина)", () => {
  // Эти журналы — личные ежедневные обязательства каждого сотрудника.
  // Стимулировать «первый сделал» бонусом — глупо, провоцирует халтуру.
  it("hygiene → null даже с явным kopecks", () => {
    expect(
      getJournalBonus(
        makeTask({ ...VALID_LINK, kind: "wesetup-hygiene", bonusAmountKopecks: 50000 }),
      ),
    ).toBeNull();
  });

  it("health_check → null", () => {
    expect(
      getJournalBonus(
        makeTask({ ...VALID_LINK, kind: "wesetup-health_check" }),
      ),
    ).toBeNull();
  });

  it("med_books → null", () => {
    expect(
      getJournalBonus(makeTask({ ...VALID_LINK, kind: "wesetup-med_books" })),
    ).toBeNull();
  });

  it("NO_BONUS_JOURNAL_CODES не пуст (если опустеет — кто-то снёс защиту)", () => {
    expect(NO_BONUS_JOURNAL_CODES.size).toBeGreaterThanOrEqual(3);
  });
});

describe("getJournalBonus — case-insensitive prefix", () => {
  it("kind=WESETUP-CLEANING → работает (uppercase prefix)", () => {
    expect(
      getJournalBonus(
        makeTask({ ...VALID_LINK, kind: "wesetup-cleaning" }),
      ),
    ).toBe(50);
  });

  it("kind=WESETUP-HYGIENE (uppercase) → null (NO_BONUS_JOURNAL_CODES match)", () => {
    // Регрессия: NO_BONUS_JOURNAL_CODES check'ается ПОСЛЕ
    // .toLowerCase(). Если кто-то уберёт toLowerCase, uppercase
    // hygiene пройдёт фильтр и юзер увидит «50 ₽» бонус за личную
    // гигиену — анти-цель design'а.
    expect(
      getJournalBonus(
        makeTask({ ...VALID_LINK, kind: "WESETUP-HYGIENE" }),
      ),
    ).toBeNull();
  });

  it("kind=Wesetup-Health_Check (mixed case) → null", () => {
    // Третий case test: смешанный регистр + underscore.
    expect(
      getJournalBonus(
        makeTask({ ...VALID_LINK, kind: "Wesetup-Health_Check" }),
      ),
    ).toBeNull();
  });
});
