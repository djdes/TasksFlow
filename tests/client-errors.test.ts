/**
 * POST /api/client-errors — приём отчётов об ошибках браузера.
 * Проверяем контракт ответа (204/400/413/429, всегда JSON при ошибке),
 * вычистку ПД перед логом и троттлинг Telegram-алертов.
 */
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logger = { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() };
vi.mock("../server/logger", () => ({ logger }));

const { registerClientErrorRoutes, scrubSensitive, __resetClientErrorAlerts } = await import(
  "../server/client-errors"
);

function buildApp() {
  const app = express();
  registerClientErrorRoutes(app);
  return app;
}

const VALID = {
  kind: "error",
  message: "TypeError: x is undefined",
  stack: "TypeError: x is undefined\n    at Dashboard (https://tasksflow.ru/assets/main-0ASrbHcW.js:2:123)",
  path: "/dashboard",
  release: "main-0ASrbHcW.js",
  userAgent: "Mozilla/5.0",
};

beforeEach(() => {
  logger.warn.mockReset();
  __resetClientErrorAlerts();
  delete process.env.ALERT_TELEGRAM_BOT_TOKEN;
  delete process.env.ALERT_TELEGRAM_CHAT_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/client-errors", () => {
  it("валидный отчёт → 204 и запись в лог", async () => {
    const r = await request(buildApp()).post("/api/client-errors").send(VALID);
    expect(r.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [payload] = logger.warn.mock.calls[0];
    expect(payload.clientError).toMatchObject({ kind: "error", path: "/dashboard", release: "main-0ASrbHcW.js" });
  });

  it("вычищает email, телефон, токены и query из пути", async () => {
    const r = await request(buildApp())
      .post("/api/client-errors")
      .send({
        ...VALID,
        message: "Ошибка для anna@example.com, +7 (999) 123-45-67, ключ a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
        path: "/join/0123456789abcdef0123456789abcdef?phone=79991234567#x",
      });
    expect(r.status).toBe(204);
    const { clientError } = logger.warn.mock.calls[0][0];
    expect(clientError.message).toBe("Ошибка для [email], [phone], ключ [token]");
    expect(clientError.path).toBe("/join/:token");
  });

  it("обрезает стек до 4 КБ", async () => {
    const r = await request(buildApp())
      .post("/api/client-errors")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ ...VALID, stack: "at x ".repeat(1400) }));
    expect(r.status).toBe(204);
    expect(logger.warn.mock.calls[0][0].clientError.stack.length).toBeLessThanOrEqual(4096);
  });

  it("принимает text/plain (запасной путь sendBeacon)", async () => {
    const r = await request(buildApp())
      .post("/api/client-errors")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify(VALID));
    expect(r.status).toBe(204);
  });

  it("неизвестный kind → 400 JSON", async () => {
    const r = await request(buildApp()).post("/api/client-errors").send({ ...VALID, kind: "nope" });
    expect(r.status).toBe(400);
    expect(r.body.message).toBeTruthy();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("битый JSON → 400 JSON, не HTML", async () => {
    const r = await request(buildApp())
      .post("/api/client-errors")
      .set("Content-Type", "application/json")
      .send("{oops");
    expect(r.status).toBe(400);
    expect(r.headers["content-type"]).toMatch(/json/);
  });

  it("тело больше 8 КБ → 413 JSON", async () => {
    const r = await request(buildApp())
      .post("/api/client-errors")
      .send({ ...VALID, message: "x".repeat(9000) });
    expect(r.status).toBe(413);
    expect(r.headers["content-type"]).toMatch(/json/);
  });

  it("после 30 отчётов в минуту с одного IP → 429", async () => {
    const app = buildApp();
    for (let i = 0; i < 30; i += 1) {
      const ok = await request(app).post("/api/client-errors").send(VALID);
      expect(ok.status).toBe(204);
    }
    const r = await request(app).post("/api/client-errors").send(VALID);
    expect(r.status).toBe(429);
  });
});

describe("Telegram-алерт", () => {
  it("одна и та же ошибка — не чаще раза в 10 минут, другая — отдельно", async () => {
    process.env.ALERT_TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.ALERT_TELEGRAM_CHAT_ID = "-100";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const app = buildApp();

    await request(app).post("/api/client-errors").send(VALID);
    await request(app).post("/api/client-errors").send(VALID);
    await request(app).post("/api/client-errors").send({ ...VALID, message: "RangeError: другое" });
    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.telegram.org/bot123:abc/sendMessage");
  });

  it("без секретов алерт не отправляется", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await request(buildApp()).post("/api/client-errors").send(VALID);
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("scrubSensitive", () => {
  it("не трогает обычные имена чанков в стеке", () => {
    const stack = "at f (https://tasksflow.ru/assets/CompanySettings-r-Gre4cD.js:1:200)";
    expect(scrubSensitive(stack)).toBe(stack);
  });
});
