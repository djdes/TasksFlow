import { describe, it, expect } from "vitest";
import { avatarTone, shiftDateLabel, shiftPercent, AVATAR_TONES } from "../client/src/lib/shift-summary";

describe("shiftDateLabel", () => {
  it("пишет день недели и дату по-русски", () => {
    expect(shiftDateLabel(new Date(2026, 9, 23))).toBe("пятница, 23 октября");
    expect(shiftDateLabel(new Date(2026, 0, 1))).toBe("четверг, 1 января");
  });
});

describe("shiftPercent", () => {
  it("округляет и не делит на ноль", () => {
    expect(shiftPercent(2, 7)).toBe(29);
    expect(shiftPercent(0, 0)).toBe(0);
    expect(shiftPercent(7, 7)).toBe(100);
  });

  it("не выходит за 0..100", () => {
    expect(shiftPercent(9, 7)).toBe(100);
    expect(shiftPercent(-1, 7)).toBe(0);
  });
});

describe("avatarTone", () => {
  it("стабилен для одного id и различает соседей", () => {
    expect(avatarTone(2)).toBe(avatarTone(2));
    expect(avatarTone(2)).not.toBe(avatarTone(3));
  });

  it("всегда в пределах палитры, без id — null", () => {
    for (const id of [0, 1, 5, 6, 77, 1024]) {
      const tone = avatarTone(id)!;
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(AVATAR_TONES);
    }
    expect(avatarTone(null)).toBeNull();
    expect(avatarTone(undefined)).toBeNull();
    expect(avatarTone(Number.NaN)).toBeNull();
  });
});
