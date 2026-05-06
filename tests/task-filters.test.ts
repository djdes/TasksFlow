/**
 * Тесты isTaskVisibleOn и passesChipFilters.
 *
 * UX-критическая видимость задач — если фильтры сломаются, воркер
 * просто не увидит задачу в её день и не выполнит. Деньги
 * потеряются, премия не начислится.
 */

import { describe, it, expect } from "vitest";
import {
  isTaskVisibleOn,
  passesChipFilters,
  type ChipFilters,
} from "../client/src/lib/task-filters";

const MON = 1;
const FRI = 5;
const SAT = 6;

describe("isTaskVisibleOn — без расписания", () => {
  it("monthDay=null + weekDays=null → видна в любой день", () => {
    expect(isTaskVisibleOn({ monthDay: null, weekDays: null }, MON, 6)).toBe(
      true,
    );
    expect(isTaskVisibleOn({ monthDay: null, weekDays: null }, SAT, 31)).toBe(
      true,
    );
  });

  it("monthDay=undefined + weekDays=undefined → видна", () => {
    expect(isTaskVisibleOn({}, MON, 6)).toBe(true);
  });

  it("weekDays=[] (пустой массив) → видна (не filter)", () => {
    expect(isTaskVisibleOn({ weekDays: [] }, MON, 6)).toBe(true);
  });
});

describe("isTaskVisibleOn — monthDay фильтр", () => {
  it("monthDay=15, сегодня 15 → видна", () => {
    expect(isTaskVisibleOn({ monthDay: 15 }, MON, 15)).toBe(true);
  });

  it("monthDay=15, сегодня 16 → не видна", () => {
    expect(isTaskVisibleOn({ monthDay: 15 }, MON, 16)).toBe(false);
  });

  it("monthDay=1, сегодня 1 → видна (первое число месяца)", () => {
    expect(isTaskVisibleOn({ monthDay: 1 }, MON, 1)).toBe(true);
  });

  it("monthDay=31, сегодня 31 → видна", () => {
    expect(isTaskVisibleOn({ monthDay: 31 }, MON, 31)).toBe(true);
  });
});

describe("isTaskVisibleOn — weekDays фильтр", () => {
  it("weekDays=[1,3,5] (Пн/Ср/Пт), сегодня Пн → видна", () => {
    expect(
      isTaskVisibleOn({ weekDays: [1, 3, 5] }, MON, 6),
    ).toBe(true);
  });

  it("weekDays=[1,3,5], сегодня Сб → не видна", () => {
    expect(
      isTaskVisibleOn({ weekDays: [1, 3, 5] }, SAT, 6),
    ).toBe(false);
  });

  it("weekDays=[0] (только воскресенье), сегодня Пт → не видна", () => {
    expect(isTaskVisibleOn({ weekDays: [0] }, FRI, 6)).toBe(false);
  });
});

describe("isTaskVisibleOn — оба фильтра вместе (AND)", () => {
  it("monthDay=15 + weekDays=[1,3,5]: оба матчат → видна", () => {
    expect(
      isTaskVisibleOn({ monthDay: 15, weekDays: [1, 3, 5] }, MON, 15),
    ).toBe(true);
  });

  it("monthDay=15 OK, weekDays mismatch → не видна", () => {
    expect(
      isTaskVisibleOn({ monthDay: 15, weekDays: [1, 3, 5] }, SAT, 15),
    ).toBe(false);
  });

  it("weekDays OK, monthDay mismatch → не видна", () => {
    expect(
      isTaskVisibleOn({ monthDay: 15, weekDays: [1, 3, 5] }, MON, 16),
    ).toBe(false);
  });
});

describe("passesChipFilters — нет активных чипов → всегда true", () => {
  const noChips: ChipFilters = { photo: false, bonus: false, journal: false };

  it("любой task → true", () => {
    expect(passesChipFilters({}, noChips)).toBe(true);
    expect(
      passesChipFilters({ requiresPhoto: false, price: 0 }, noChips),
    ).toBe(true);
  });
});

describe("passesChipFilters — chipPhoto", () => {
  const photoOnly: ChipFilters = { photo: true, bonus: false, journal: false };

  it("requiresPhoto=true → match", () => {
    expect(passesChipFilters({ requiresPhoto: true }, photoOnly)).toBe(true);
  });

  it("requiresPhoto=false → no match", () => {
    expect(passesChipFilters({ requiresPhoto: false }, photoOnly)).toBe(false);
  });

  it("requiresPhoto=null/undefined → no match (как false)", () => {
    expect(passesChipFilters({}, photoOnly)).toBe(false);
    expect(
      passesChipFilters({ requiresPhoto: null }, photoOnly),
    ).toBe(false);
  });
});

describe("passesChipFilters — chipBonus (price > 0)", () => {
  const bonusOnly: ChipFilters = { photo: false, bonus: true, journal: false };

  it("price=100 → match", () => {
    expect(passesChipFilters({ price: 100 }, bonusOnly)).toBe(true);
  });

  it("price=0 → no match", () => {
    expect(passesChipFilters({ price: 0 }, bonusOnly)).toBe(false);
  });

  it("price=-50 (мусор в БД) → no match", () => {
    expect(passesChipFilters({ price: -50 }, bonusOnly)).toBe(false);
  });

  it("price=null → no match", () => {
    expect(passesChipFilters({ price: null }, bonusOnly)).toBe(false);
  });

  it("price=undefined → no match", () => {
    expect(passesChipFilters({}, bonusOnly)).toBe(false);
  });
});

describe("passesChipFilters — chipJournal", () => {
  const journalOnly: ChipFilters = {
    photo: false,
    bonus: false,
    journal: true,
  };

  it("journalLink set → match", () => {
    expect(
      passesChipFilters({ journalLink: '{"kind":"wesetup-cleaning"}' }, journalOnly),
    ).toBe(true);
  });

  it("journalLink=null → no match", () => {
    expect(
      passesChipFilters({ journalLink: null }, journalOnly),
    ).toBe(false);
  });

  it("journalLink=undefined → no match", () => {
    expect(passesChipFilters({}, journalOnly)).toBe(false);
  });
});

describe("passesChipFilters — все чипы (AND)", () => {
  const allOn: ChipFilters = { photo: true, bonus: true, journal: true };

  it("все 3 удовлетворены → match", () => {
    expect(
      passesChipFilters(
        {
          requiresPhoto: true,
          price: 50,
          journalLink: "x",
        },
        allOn,
      ),
    ).toBe(true);
  });

  it("один из 3 не удовлетворён → no match", () => {
    expect(
      passesChipFilters(
        { requiresPhoto: true, price: 50, journalLink: null },
        allOn,
      ),
    ).toBe(false);
    expect(
      passesChipFilters(
        { requiresPhoto: false, price: 50, journalLink: "x" },
        allOn,
      ),
    ).toBe(false);
    expect(
      passesChipFilters(
        { requiresPhoto: true, price: 0, journalLink: "x" },
        allOn,
      ),
    ).toBe(false);
  });
});
