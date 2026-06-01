import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generatePassword,
  generateMagicToken,
} from "../server/crypto-password";

describe("crypto-password", () => {
  it("hashPassword возвращает формат scrypt$14$salt$hash", () => {
    const h = hashPassword("secret123");
    const parts = h.split("$");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1]).toBe("14");
    expect(parts[2]).toMatch(/^[a-f0-9]{32}$/); // 16 байт соли
    expect(parts[3]).toMatch(/^[a-f0-9]{128}$/); // 64 байта ключа
  });

  it("verifyPassword true для верного пароля, false для неверного", () => {
    const h = hashPassword("correct horse");
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });

  it("verifyPassword false для мусора/null", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "notscrypt")).toBe(false);
    expect(verifyPassword("x", "bcrypt$14$a$b")).toBe(false);
  });

  it("два хэша одного пароля различаются (соль)", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("generatePassword нужной длины и без 0/O/1/l/I", () => {
    const p = generatePassword(12);
    expect(p).toHaveLength(12);
    expect(p).not.toMatch(/[0O1lI]/);
  });

  it("generateMagicToken — 32 hex символа", () => {
    expect(generateMagicToken()).toMatch(/^[a-f0-9]{32}$/);
  });
});
