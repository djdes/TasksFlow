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
import { ApiError, apiRequest, getQueryFn, withTimeout } from "../client/src/lib/queryClient";

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

describe("apiRequest — friendly errors (тик 132)", () => {
  it("AbortError → ApiError со status=0 и русским сообщением", async () => {
    const abortErr = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    (globalThis.fetch as any).mockRejectedValue(abortErr);

    try {
      await apiRequest("GET", "/api/slow");
      expect.fail("expected ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(0);
      expect((err as ApiError).message).toMatch(/Сервер не отвечает/);
    }
  });

  it("TimeoutError (новое имя AbortSignal.timeout) тоже → ApiError", async () => {
    // В новых браузерах AbortSignal.timeout reject'ит с name=TimeoutError
    // вместо AbortError. Должны ловить оба.
    const timeoutErr = Object.assign(new Error("timeout"), {
      name: "TimeoutError",
    });
    (globalThis.fetch as any).mockRejectedValue(timeoutErr);

    try {
      await apiRequest("GET", "/api/slow");
      expect.fail("expected ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(0);
    }
  });

  it("TypeError «Failed to fetch» → ApiError «нет связи»", async () => {
    // fetch reject'ит TypeError на DNS-fail / connection-refused / CORS.
    (globalThis.fetch as any).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    try {
      await apiRequest("GET", "/api/test");
      expect.fail("expected ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(0);
      expect((err as ApiError).message).toMatch(/Нет связи/);
    }
  });
});

// ===================== withTimeout helper (тик 140) =====================
//
// Извлечён из 9 мест inlined boilerplate'а. Регрессия чтобы кто-то
// не сломал helper при будущей правке (например, забыл fallback на
// pure timeout для старых браузеров без AbortSignal.any).

describe("withTimeout helper", () => {
  it("возвращает AbortSignal", () => {
    const result = withTimeout(undefined, 30_000);
    expect(result).toBeInstanceOf(AbortSignal);
    expect(result.aborted).toBe(false);
  });

  it("без переданного signal — просто timeout signal", () => {
    const result = withTimeout(undefined, 30_000);
    expect(result.aborted).toBe(false);
    // Не проверяем что timeout actually fires — fake-timers heavyweight
  });

  it("с переданным signal — combine через AbortSignal.any (Node 20+)", () => {
    const userController = new AbortController();
    const result = withTimeout(userController.signal, 30_000);
    // Если AbortSignal.any доступен (Node 20+), abort'ить userController
    // должно abort'нуть combined signal:
    if ("any" in AbortSignal) {
      expect(result.aborted).toBe(false);
      userController.abort(new Error("user cancelled"));
      expect(result.aborted).toBe(true);
    } else {
      // Старый runtime — fallback на pure timeout, userController не
      // должен влиять.
      userController.abort();
      expect(result.aborted).toBe(false);
    }
  });

  it("уже aborted user signal → result aborted сразу", () => {
    if (!("any" in AbortSignal)) return; // skip на старом runtime
    const userController = new AbortController();
    userController.abort(new Error("pre-aborted"));
    const result = withTimeout(userController.signal, 30_000);
    expect(result.aborted).toBe(true);
  });
});

// ===================== getQueryFn — TanStack Query function =============
//
// Используется queryClient.defaultOptions.queries.queryFn для всех
// useQuery в проекте. Поведение at 401 критично:
//   • on401:"throw" → ApiError, useQuery попадает в onError → toast
//   • on401:"returnNull" → null, useQuery treats as data → Login flow
//
// Регрессия = либо bombard'им юзеров «Не авторизован» toast'ами на
// /me-запросе anonymous, либо silently глотаем real auth-errors.

describe("getQueryFn — on401 поведение", () => {
  it("on401='returnNull' + 401 → возвращает null (без throw)", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse({ ok: false, status: 401, body: '{"message":"Auth"}' }),
    );
    const fn = getQueryFn<unknown>({ on401: "returnNull" });
    const result = await fn({
      queryKey: ["/api/auth/me"],
      signal: new AbortController().signal,
      meta: undefined,
      client: {} as any,
    } as any);
    expect(result).toBeNull();
  });

  it("on401='throw' + 401 → throws ApiError(401)", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse({ ok: false, status: 401, body: '{"message":"Auth"}' }),
    );
    const fn = getQueryFn<unknown>({ on401: "throw" });
    await expect(
      fn({
        queryKey: ["/api/tasks"],
        signal: new AbortController().signal,
        meta: undefined,
        client: {} as any,
      } as any),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("happy path 200 → возвращает parsed JSON", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      text: async () => '[{"id":1}]',
      json: async () => [{ id: 1 }],
    } as Response);
    const fn = getQueryFn<{ id: number }[]>({ on401: "throw" });
    const result = await fn({
      queryKey: ["/api/tasks"],
      signal: new AbortController().signal,
      meta: undefined,
      client: {} as any,
    } as any);
    expect(result).toEqual([{ id: 1 }]);
  });

  it("queryKey собирается через '/' join (массив частей → URL)", async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      text: async () => "{}",
      json: async () => ({}),
    } as Response);
    const fn = getQueryFn<unknown>({ on401: "throw" });
    await fn({
      queryKey: ["/api/tasks", "100"],
      signal: new AbortController().signal,
      meta: undefined,
      client: {} as any,
    } as any);
    const callUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(callUrl).toBe("/api/tasks/100");
  });

  it("non-401 ошибка (500) → throws ApiError независимо от on401", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse({ ok: false, status: 500, body: '{"message":"Down"}' }),
    );
    const fn = getQueryFn<unknown>({ on401: "returnNull" });
    await expect(
      fn({
        queryKey: ["/api/tasks"],
        signal: new AbortController().signal,
        meta: undefined,
        client: {} as any,
      } as any),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
