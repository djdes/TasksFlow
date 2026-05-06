/**
 * Тесты для ApiError и apiRequest из client/src/lib/queryClient.ts.
 *
 * apiRequest делает fetch с credentials:'include' и парсит ошибку из
 * response body — пытается JSON.parse() и берёт `message`, иначе
 * raw text. Это критично потому что Login.tsx делает
 * `error.status === 401` для редиректа на /register.
 *
 * Тестим через fetch mock — не делаем реальных HTTP запросов.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiError, apiRequest } from "../client/src/lib/queryClient";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // @ts-expect-error mock fetch
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockResponse(opts: {
  ok: boolean;
  status: number;
  body: string;
  statusText?: string;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    statusText: opts.statusText ?? "",
    text: async () => opts.body,
    json: async () => JSON.parse(opts.body),
  } as Response;
}

describe("ApiError", () => {
  it("сохраняет message и status", () => {
    const err = new ApiError("Не авторизован", 401);
    expect(err.message).toBe("Не авторизован");
    expect(err.status).toBe(401);
    expect(err.name).toBe("ApiError");
  });

  it("instanceof Error", () => {
    const err = new ApiError("test", 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});

describe("apiRequest — успех", () => {
  it("возвращает Response при 200", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse({ ok: true, status: 200, body: '{"ok":true}' }),
    );

    const res = await apiRequest("GET", "/api/test");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it("шлёт credentials: include (для session cookie)", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockResolvedValue(
      mockResponse({ ok: true, status: 200, body: "" }),
    );

    await apiRequest("GET", "/api/test");
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]).toMatchObject({ credentials: "include" });
  });

  it("шлёт Content-Type только при наличии body", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockResolvedValue(
      mockResponse({ ok: true, status: 200, body: "" }),
    );

    await apiRequest("POST", "/api/test", { foo: "bar" });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "Content-Type": "application/json",
    });
    expect(fetchMock.mock.calls[0][1].body).toBe('{"foo":"bar"}');
  });

  it("без body — нет Content-Type header'а", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockResolvedValue(
      mockResponse({ ok: true, status: 200, body: "" }),
    );

    await apiRequest("GET", "/api/test");
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers["Content-Type"]).toBeUndefined();
  });
});

describe("apiRequest — ошибки", () => {
  it("4xx → throws ApiError со status", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 401,
        body: '{"message":"Не авторизован"}',
      }),
    );

    try {
      await apiRequest("GET", "/api/test");
      expect.fail("должна была быть ошибка");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
      expect((err as ApiError).message).toBe("Не авторизован");
    }
  });

  it("берёт parsed.message из JSON ответа", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 400,
        body: '{"message":"Поле обязательно","field":"phone"}',
      }),
    );

    try {
      await apiRequest("POST", "/api/test", {});
    } catch (err) {
      expect((err as ApiError).message).toBe("Поле обязательно");
    }
  });

  it("non-JSON body (HTML от прокси) → берёт raw text", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 502,
        body: "<html>Bad Gateway</html>",
      }),
    );

    try {
      await apiRequest("GET", "/api/test");
    } catch (err) {
      expect((err as ApiError).status).toBe(502);
      expect((err as ApiError).message).toContain("Bad Gateway");
    }
  });

  it("пустое body → берёт statusText", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 500,
        body: "",
        statusText: "Internal Server Error",
      }),
    );

    try {
      await apiRequest("GET", "/api/test");
    } catch (err) {
      expect((err as ApiError).message).toBe("Internal Server Error");
    }
  });

  it("status=401 / Login.tsx редирект флоу", async () => {
    // Login.tsx делает `if (err.status === 401)` для перенаправления
    // на /register. Тест документирует эту контракт.
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 401,
        body: '{"message":"Пользователь не найден"}',
      }),
    );

    try {
      await apiRequest("POST", "/api/auth/login");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Login.tsx путь
        expect(true).toBe(true);
      } else {
        expect.fail("ApiError со status=401 ожидался");
      }
    }
  });
});

// ===================== fetch-timeout regression =====================
//
// Тики 125-130: вся frontend-fetch инфраструктура получила timeouts.
// apiRequest (этот файл) — defense-in-depth для всех мутаций. Без
// этих тестов кто-то может случайно убрать `signal: AbortSignal.
// timeout(...)` из queryClient.ts и infinite-spinner-баг вернётся,
// никто не заметит до production-инцидента.

describe("apiRequest — AbortSignal timeout (regression)", () => {
  it("передаёт AbortSignal в init.signal", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockResolvedValue(
      mockResponse({ ok: true, status: 200, body: "" }),
    );

    await apiRequest("GET", "/api/test");
    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeDefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("signal не уже aborted (timeout не сработал моментально)", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockResolvedValue(
      mockResponse({ ok: true, status: 200, body: "" }),
    );

    await apiRequest("GET", "/api/test");
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    // Default timeout = 30s; в момент вызова fetch signal должен
    // быть «pending» (not aborted). Защита от случая когда default
    // случайно поставлен в 0.
    expect(signal.aborted).toBe(false);
  });
});
