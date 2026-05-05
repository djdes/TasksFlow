/**
 * Тесты AES-256-GCM шифрования API ключей.
 *
 * Контекст: server/api-key-crypto.ts. encryptApiKey/decryptApiKey
 * используются для feature «Показать ключ» — когда admin хочет
 * восстановить plaintext отозванного/потерянного интеграционного
 * ключа без перевыпуска. Если encrypt/decrypt сломается — все
 * encrypted-копии в БД станут нечитаемы, юзер должен будет «Перевыпустить».
 *
 * Тесты покрывают:
 *   • encrypt → decrypt round-trip совпадает с input
 *   • Каждый encrypt с тем же plaintext даёт разный ciphertext (IV).
 *   • Tampering с ciphertext → decrypt бросает (auth tag check работает).
 *   • Malformed формат → throw с понятной ошибкой.
 *   • SESSION_SECRET fallback работает если API_KEY_REVEAL_SECRET не задан.
 *   • isApiKeyRevealEnabled отражает наличие подходящего secret.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptApiKey,
  decryptApiKey,
  isApiKeyRevealEnabled,
  generateApiKey,
  hashApiKey,
} from "../server/api-key-crypto";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Setup-env.ts уже задаёт SESSION_SECRET=test-secret-do-not-use-...,
  // так что fallback есть из коробки. Явно задаём API_KEY_REVEAL_SECRET
  // для основных тестов чтобы предсказуемо.
  process.env.API_KEY_REVEAL_SECRET = "test-reveal-secret-1234567890ABCDEF";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("encryptApiKey / decryptApiKey round-trip", () => {
  it("plaintext восстанавливается после шифрования", () => {
    const plaintext = "tfk_abc123XYZ-_";
    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).not.toContain(plaintext); // ciphertext не светит исходник
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  it("работает с длинным plaintext (47 символов — реальный размер ключа)", () => {
    const plaintext = generateApiKey();
    expect(plaintext.length).toBe(47); // tfk_ + 43 base64url
    const encrypted = encryptApiKey(plaintext);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  it("работает с короткой строкой", () => {
    const plaintext = "x";
    expect(decryptApiKey(encryptApiKey(plaintext))).toBe(plaintext);
  });

  it("каждый encrypt даёт разный ciphertext (random IV)", () => {
    const plaintext = "tfk_same_input";
    const enc1 = encryptApiKey(plaintext);
    const enc2 = encryptApiKey(plaintext);
    expect(enc1).not.toBe(enc2);
    // Но оба расшифровываются в одно и то же
    expect(decryptApiKey(enc1)).toBe(plaintext);
    expect(decryptApiKey(enc2)).toBe(plaintext);
  });
});

describe("decryptApiKey — защита от tampering", () => {
  it("malformed строка (нет 3-х частей) → throw", () => {
    expect(() => decryptApiKey("garbage")).toThrow(/malformed/i);
    expect(() => decryptApiKey("a.b")).toThrow(/malformed/i);
    expect(() => decryptApiKey("a.b.c.d")).toThrow(/malformed/i);
  });

  it("изменённый ciphertext → throw (auth tag не совпадает)", () => {
    const plaintext = "tfk_test";
    const encrypted = encryptApiKey(plaintext);
    const [iv, tag, ct] = encrypted.split(".");
    // Меняем последний символ ciphertext
    const tampered = `${iv}.${tag}.${ct.slice(0, -2)}AA`;
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it("изменённый IV → throw", () => {
    const plaintext = "tfk_test";
    const encrypted = encryptApiKey(plaintext);
    const [iv, tag, ct] = encrypted.split(".");
    // Меняем IV — из-за GCM auth tag тоже не сойдётся
    const ivBuf = Buffer.from(iv, "base64");
    ivBuf[0] ^= 0xff;
    const tampered = `${ivBuf.toString("base64")}.${tag}.${ct}`;
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it("изменённый auth tag → throw", () => {
    const plaintext = "tfk_test";
    const encrypted = encryptApiKey(plaintext);
    const [iv, tag, ct] = encrypted.split(".");
    const tagBuf = Buffer.from(tag, "base64");
    tagBuf[0] ^= 0xff;
    const tampered = `${iv}.${tagBuf.toString("base64")}.${ct}`;
    expect(() => decryptApiKey(tampered)).toThrow();
  });
});

describe("isApiKeyRevealEnabled", () => {
  it("true когда API_KEY_REVEAL_SECRET >= 16 символов", () => {
    process.env.API_KEY_REVEAL_SECRET = "1234567890ABCDEF"; // ровно 16
    expect(isApiKeyRevealEnabled()).toBe(true);
  });

  it("false когда API_KEY_REVEAL_SECRET < 16 (отбрасывается, fallback на SESSION_SECRET)", () => {
    process.env.API_KEY_REVEAL_SECRET = "short";
    // SESSION_SECRET в setup-env.ts — длиннее 16, fallback должен сработать
    expect(isApiKeyRevealEnabled()).toBe(true);
  });

  it("false когда оба secret'а отсутствуют", () => {
    delete process.env.API_KEY_REVEAL_SECRET;
    delete process.env.SESSION_SECRET;
    expect(isApiKeyRevealEnabled()).toBe(false);
  });

  it("использует SESSION_SECRET fallback если API_KEY_REVEAL_SECRET нет", () => {
    delete process.env.API_KEY_REVEAL_SECRET;
    process.env.SESSION_SECRET = "long-enough-session-secret-1234";
    expect(isApiKeyRevealEnabled()).toBe(true);
  });
});

describe("generateApiKey", () => {
  it("формат tfk_ + 43 base64url-символа = 47 total", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^tfk_[A-Za-z0-9_-]{43}$/);
    expect(key.length).toBe(47);
  });

  it("каждый вызов даёт разный ключ (32 bytes энтропии)", () => {
    const keys = new Set([
      generateApiKey(),
      generateApiKey(),
      generateApiKey(),
      generateApiKey(),
      generateApiKey(),
    ]);
    expect(keys.size).toBe(5);
  });
});

describe("hashApiKey", () => {
  it("SHA-256 hex, 64 символа", () => {
    const hash = hashApiKey("tfk_test_value");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("одинаковый input → одинаковый hash (детерминизм)", () => {
    expect(hashApiKey("same")).toBe(hashApiKey("same"));
  });

  it("разный input → разный hash", () => {
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });
});
