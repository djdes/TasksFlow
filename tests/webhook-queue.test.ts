/**
 * Тесты webhook backoff lestnitsa (тик 7 фикс).
 *
 * Контекст: раньше attemptOrEnqueue() писал attempts=0 после первого
 * синхронного fail'а, и worker на первом ретрае ставил attempts=1 +
 * computeNextRetryAt(1)=5min — то же что было выставлено при enqueue.
 * Реальная лестница: sync → 5 → 5 → 15 → 60 → 360 → 1440 (дубликат
 * 5min). После фикса: sync → 5 → 15 → 60 → 360 → 1440 — соответствует
 * комментарию RETRY_LADDER_MIN.
 *
 * Тесты проверяют что:
 *   1. RETRY_LADDER_MIN не меняется случайно (5/15/60/6h/24h).
 *   2. computeNextRetryAt берёт правильную задержку из лестницы.
 *   3. clamp на верхней границе работает (attempts > MAX_ATTEMPTS).
 *   4. isRetriable правильно классифицирует HTTP коды.
 */

import { describe, it, expect, vi } from "vitest";
// Импортим из webhook-backoff (pure-логика без storage-зависимостей),
// не из webhook-queue (который тянет MYSQL env vars).
import {
  RETRY_LADDER_MIN,
  MAX_ATTEMPTS,
  computeNextRetryAt,
  isRetriable,
} from "../server/webhook-backoff";

describe("RETRY_LADDER_MIN", () => {
  it("содержит ровно 6 шагов (для 5 ретраев + sync)", () => {
    expect(RETRY_LADDER_MIN.length).toBe(6);
    expect(MAX_ATTEMPTS).toBe(6);
  });

  it("первый шаг 0 (синхронная попытка)", () => {
    expect(RETRY_LADDER_MIN[0]).toBe(0);
  });

  it("монотонно неубывает (backoff не должен сокращаться)", () => {
    for (let i = 1; i < RETRY_LADDER_MIN.length; i++) {
      expect(RETRY_LADDER_MIN[i]).toBeGreaterThanOrEqual(
        RETRY_LADDER_MIN[i - 1],
      );
    }
  });

  it("строгая монотонность для retry-шагов (нет дубликатов после 0)", () => {
    // Тик 7 фикс: дубликат 5min в начале (5/5/15/...). После фикса
    // лестница строго возрастает на retry-шагах.
    for (let i = 2; i < RETRY_LADDER_MIN.length; i++) {
      expect(RETRY_LADDER_MIN[i]).toBeGreaterThan(RETRY_LADDER_MIN[i - 1]);
    }
  });

  it("документированная лестница: 0/5/15/60/360/1440", () => {
    // Если эти значения меняются — backoff window для permanent fail
    // меняется. Сейчас sum = 0+5+15+60+360+1440 = 1880 min ≈ 31 час.
    expect([...RETRY_LADDER_MIN]).toEqual([0, 5, 15, 60, 360, 1440]);
  });
});

describe("computeNextRetryAt", () => {
  it("attempts=0 → now (синхронная попытка, без задержки)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T12:00:00Z"));
    const expectedSec = Math.floor(Date.now() / 1000);
    expect(computeNextRetryAt(0)).toBe(expectedSec);
    vi.useRealTimers();
  });

  it("attempts=1 → +5 минут (первый ретрай)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T12:00:00Z"));
    const nowSec = Math.floor(Date.now() / 1000);
    expect(computeNextRetryAt(1)).toBe(nowSec + 5 * 60);
    vi.useRealTimers();
  });

  it("attempts=2 → +15 минут", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T12:00:00Z"));
    const nowSec = Math.floor(Date.now() / 1000);
    expect(computeNextRetryAt(2)).toBe(nowSec + 15 * 60);
    vi.useRealTimers();
  });

  it("attempts=5 → +1440 минут (24 часа, последний шаг)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T12:00:00Z"));
    const nowSec = Math.floor(Date.now() / 1000);
    expect(computeNextRetryAt(5)).toBe(nowSec + 24 * 60 * 60);
    vi.useRealTimers();
  });

  it("attempts > MAX → clamp на последнюю задержку", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T12:00:00Z"));
    const nowSec = Math.floor(Date.now() / 1000);
    // 999 попыток — clamp до RETRY_LADDER_MIN[5] = 1440 min
    expect(computeNextRetryAt(999)).toBe(nowSec + 24 * 60 * 60);
    vi.useRealTimers();
  });
});

describe("isRetriable", () => {
  it("5xx → true", () => {
    expect(isRetriable(500)).toBe(true);
    expect(isRetriable(502)).toBe(true);
    expect(isRetriable(503)).toBe(true);
    expect(isRetriable(599)).toBe(true);
  });

  it("408 (Request Timeout) → true", () => {
    expect(isRetriable(408)).toBe(true);
  });

  it("429 (Too Many Requests) → true", () => {
    expect(isRetriable(429)).toBe(true);
  });

  it("400 (Bad Request) → false (наша вина, ретраить нет смысла)", () => {
    expect(isRetriable(400)).toBe(false);
  });

  it("401 (Unauthorized) → false (ключ невалидный)", () => {
    expect(isRetriable(401)).toBe(false);
  });

  it("404 (Not Found) → false", () => {
    expect(isRetriable(404)).toBe(false);
  });

  it("200 OK → false (success)", () => {
    expect(isRetriable(200)).toBe(false);
  });
});
