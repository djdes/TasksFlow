import { describe, it, expect } from "vitest";
import { detectIdentity, normalizePhoneRu } from "../client/src/public/landing/identity";

describe("detectIdentity", () => {
  it("распознаёт email и нормализует", () => {
    expect(detectIdentity("  Ivan@Gmail.com ")).toEqual({ kind: "email", email: "ivan@gmail.com" });
  });
  it("распознаёт телефон в разных форматах → +7XXXXXXXXXX", () => {
    expect(detectIdentity("+7 999 123-45-67")).toEqual({ kind: "phone", phone: "+79991234567" });
    expect(detectIdentity("89991234567")).toEqual({ kind: "phone", phone: "+79991234567" });
    expect(detectIdentity("9991234567")).toEqual({ kind: "phone", phone: "+79991234567" });
    expect(detectIdentity("7 (999) 123 45 67")).toEqual({ kind: "phone", phone: "+79991234567" });
  });
  it("мусор → unknown", () => {
    expect(detectIdentity("").kind).toBe("unknown");
    expect(detectIdentity("просто текст").kind).toBe("unknown");
    expect(detectIdentity("123").kind).toBe("unknown");
  });
  it("normalizePhoneRu возвращает null для не-телефона", () => {
    expect(normalizePhoneRu("123")).toBeNull();
    expect(normalizePhoneRu("abc")).toBeNull();
  });
});
