import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "node:crypto";
import {
  verifyTelegramLoginHash,
  verifyTelegramAuthFreshness,
  telegramLoginPayloadSchema,
  TelegramLinkError,
} from "../server/telegram/link";

/**
 * Login Widget — единственный способ доказать, что Telegram-аккаунт
 * принадлежит тому, кто сидит в сессии. Дыра здесь = чужие задачи.
 */

const BOT_TOKEN = "8810015596:AAtest_token_for_unit_tests_only";

/** Подписывает payload так же, как это делает Telegram. */
function sign(payload: Record<string, string | number>, token = BOT_TOKEN) {
  const dataCheckString = Object.keys(payload)
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

function validPayload(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 123456789,
    first_name: "Ярослав",
    username: "yaroslav",
    auth_date: Math.floor(Date.now() / 1000),
  };
  const merged = { ...base, ...overrides };
  return { ...merged, hash: sign(merged as Record<string, string | number>) };
}

describe("verifyTelegramLoginHash", () => {
  it("валидная подпись проходит", () => {
    const p = telegramLoginPayloadSchema.parse(validPayload());
    expect(() => verifyTelegramLoginHash(p, BOT_TOKEN)).not.toThrow();
  });

  it("подпись чужим токеном отклоняется", () => {
    const raw = validPayload();
    raw.hash = sign(
      { id: raw.id, first_name: raw.first_name, username: raw.username, auth_date: raw.auth_date },
      "999:другой_токен",
    );
    const p = telegramLoginPayloadSchema.parse(raw);
    expect(() => verifyTelegramLoginHash(p, BOT_TOKEN)).toThrow(TelegramLinkError);
  });

  it("подменённый id ломает подпись — нельзя привязать чужой Telegram", () => {
    const raw = validPayload();
    const p = telegramLoginPayloadSchema.parse({ ...raw, id: 987654321 });
    expect(() => verifyTelegramLoginHash(p, BOT_TOKEN)).toThrow(/Подпись/);
  });

  it("подменённый username ломает подпись", () => {
    const raw = validPayload();
    const p = telegramLoginPayloadSchema.parse({ ...raw, username: "admin" });
    expect(() => verifyTelegramLoginHash(p, BOT_TOKEN)).toThrow(TelegramLinkError);
  });

  it("hash другой длины не роняет процесс, а отклоняется", () => {
    const raw = validPayload();
    const p = { ...telegramLoginPayloadSchema.parse(raw), hash: "abc123" };
    expect(() => verifyTelegramLoginHash(p as any, BOT_TOKEN)).toThrow(TelegramLinkError);
  });

  it("hash в верхнем регистре принимается", () => {
    const raw = validPayload();
    const p = telegramLoginPayloadSchema.parse({ ...raw, hash: raw.hash.toUpperCase() });
    expect(() => verifyTelegramLoginHash(p, BOT_TOKEN)).not.toThrow();
  });
});

describe("telegramLoginPayloadSchema", () => {
  it("hash обязан быть 64 hex", () => {
    expect(() =>
      telegramLoginPayloadSchema.parse({ ...validPayload(), hash: "не-хэш" }),
    ).toThrow();
  });

  it("id и auth_date приводятся из строк — виджет шлёт их строками", () => {
    const raw = validPayload();
    const p = telegramLoginPayloadSchema.parse({
      ...raw,
      id: String(raw.id),
      auth_date: String(raw.auth_date),
    });
    expect(p.id).toBe(raw.id);
    expect(typeof p.auth_date).toBe("number");
  });

  it("отрицательный id отклоняется", () => {
    expect(() => telegramLoginPayloadSchema.parse({ ...validPayload(), id: -1 })).toThrow();
  });
});

describe("verifyTelegramAuthFreshness", () => {
  const now = 1_800_000_000_000; // фиксированный «сейчас» в мс
  const nowSec = now / 1000;

  it("свежий auth_date проходит", () => {
    expect(() => verifyTelegramAuthFreshness(nowSec - 60, now)).not.toThrow();
  });

  it("почти сутки — ещё проходит", () => {
    expect(() => verifyTelegramAuthFreshness(nowSec - 23 * 3600, now)).not.toThrow();
  });

  it("старше суток — отказ: перехваченный payload не работает вечно", () => {
    expect(() => verifyTelegramAuthFreshness(nowSec - 25 * 3600, now)).toThrow(
      TelegramLinkError,
    );
  });

  it("небольшой clock skew в будущее допускается", () => {
    expect(() => verifyTelegramAuthFreshness(nowSec + 120, now)).not.toThrow();
  });

  it("далёкое будущее — отказ", () => {
    expect(() => verifyTelegramAuthFreshness(nowSec + 3600, now)).toThrow(
      TelegramLinkError,
    );
  });

  it("код ошибки — auth_expired, статус 400", () => {
    try {
      verifyTelegramAuthFreshness(nowSec - 48 * 3600, now);
      expect.unreachable("должно было бросить");
    } catch (err) {
      expect(err).toBeInstanceOf(TelegramLinkError);
      expect((err as TelegramLinkError).code).toBe("auth_expired");
      expect((err as TelegramLinkError).status).toBe(400);
    }
  });
});
