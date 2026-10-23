import { describe, expect, it } from "vitest";
import { generatePin, newPinSchema, pinProblem, pinSchema } from "../shared/pin";

describe("pinProblem", () => {
  it("пропускает обычный PIN", () => {
    expect(pinProblem("4826")).toBeNull();
    expect(pinProblem("0391")).toBeNull();
  });

  it("требует ровно 4 цифры", () => {
    for (const bad of ["", "123", "12345", "12a4", " 123", "１２３４"]) {
      expect(pinProblem(bad)).toBe("PIN — это 4 цифры");
    }
  });

  it("отсеивает одинаковые цифры", () => {
    for (const pin of ["0000", "1111", "7777", "9999"]) {
      expect(pinProblem(pin)).toMatch(/одинаковые/);
    }
  });

  it("отсеивает цифры подряд, в том числе через 9→0", () => {
    for (const pin of ["1234", "4321", "0123", "6789", "9876", "8901", "2109"]) {
      expect(pinProblem(pin)).toMatch(/подряд/);
    }
  });

  it("отсеивает самые частые PIN", () => {
    for (const pin of ["1212", "2000", "1004", "6969"]) {
      expect(pinProblem(pin)).toMatch(/частый/);
    }
  });
});

describe("схемы PIN", () => {
  it("pinSchema принимает любые 4 цифры (вход по уже заданному PIN)", () => {
    expect(pinSchema.safeParse("1111").success).toBe(true);
    expect(pinSchema.safeParse("12").success).toBe(false);
  });

  it("newPinSchema отклоняет простые PIN с понятным текстом", () => {
    const r = newPinSchema.safeParse("1234");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.errors[0].message).toMatch(/подряд/);
    expect(newPinSchema.safeParse("4826").success).toBe(true);
  });
});

describe("generatePin", () => {
  it("всегда выдаёт непростой PIN из 4 цифр", () => {
    for (let i = 0; i < 500; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{4}$/);
      expect(pinProblem(pin)).toBeNull();
    }
  });

  it("пропускает простые варианты и берёт следующий", () => {
    const values = [0.11115, 0.12345, 0.48265];
    let i = 0;
    expect(generatePin(() => values[i++])).toBe("4826");
  });
});
