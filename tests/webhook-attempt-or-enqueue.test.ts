/**
 * Тесты attemptOrEnqueue — точка входа в webhook delivery очередь.
 *
 * Раньше webhook-queue.test.ts покрывал только pure helpers
 * (RETRY_LADDER_MIN, computeNextRetryAt, isRetriable). Главная функция
 * — attemptOrEnqueue — НЕ была покрыта. Регрессия в её логике =
 * либо webhook silently drop'ается (юзер выполнил задачу — WeSetup
 * не получил event), либо очередь забивается дубликатами.
 *
 * 3 ключевых поведения:
 *   • 2xx success → {delivered:true, enqueued:false}, очередь не
 *     задействуется
 *   • non-retriable 4xx → {delivered:false, enqueued:false}, drop
 *     (нет смысла ретраить «нет такой задачи в WeSetup»)
 *   • retriable 5xx / 429 / 408 / network error → enqueue с attempts=1
 *     (синхронная попытка уже была!) и nextRetryAt по лестнице
 *
 * Регрессия attempts=0 → 5min retry дублируется в начале лестницы
 * (см. webhook-backoff.ts комментарий «Тик 7»).
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

const storage = {
  enqueueWebhookDelivery: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../server/storage", () => ({ storage }));

// logger.info/warn — silent в тестах, чтобы не флудить stdout.
vi.mock("../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  storage.enqueueWebhookDelivery.mockReset();
  storage.enqueueWebhookDelivery.mockResolvedValue(undefined);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchOk(status = 200): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => "",
  } as Response);
}

function mockFetchError(status: number): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => `error ${status}`,
  } as Response);
}

function mockFetchThrow(err: Error): void {
  globalThis.fetch = vi.fn().mockRejectedValue(err);
}

const INPUT = {
  taskId: 100,
  eventType: "complete" as const,
  targetUrl: "https://wesetup.example.com/api/integrations/tasksflow/complete",
  apiKey: "wesetup-key-123",
  payload: { taskId: 100, isCompleted: true },
};

describe("attemptOrEnqueue — success path", () => {
  it("2xx → delivered=true, enqueued=false (очередь не trigger'ится)", async () => {
    mockFetchOk(200);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");

    const r = await attemptOrEnqueue(INPUT);

    expect(r).toEqual({ delivered: true, enqueued: false });
    expect(storage.enqueueWebhookDelivery).not.toHaveBeenCalled();
  });

  it("204 No Content → тоже delivered=true", async () => {
    mockFetchOk(204);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");

    const r = await attemptOrEnqueue(INPUT);
    expect(r.delivered).toBe(true);
    expect(storage.enqueueWebhookDelivery).not.toHaveBeenCalled();
  });
});

describe("attemptOrEnqueue — non-retriable 4xx (drop)", () => {
  it("400 → enqueued=false, delivered=false (drop, не дёргаем очередь)", async () => {
    // 400 = «WeSetup сказал нет такой задачи / неверный payload» —
    // ретраить бессмысленно, спам-фол очереди.
    mockFetchError(400);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");

    const r = await attemptOrEnqueue(INPUT);
    expect(r).toEqual({ delivered: false, enqueued: false });
    expect(storage.enqueueWebhookDelivery).not.toHaveBeenCalled();
  });

  it("404 → drop", async () => {
    mockFetchError(404);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");
    const r = await attemptOrEnqueue(INPUT);
    expect(r.enqueued).toBe(false);
    expect(storage.enqueueWebhookDelivery).not.toHaveBeenCalled();
  });

  it("401 → drop (auth ошибка не self-fixable retry'ями)", async () => {
    mockFetchError(401);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");
    const r = await attemptOrEnqueue(INPUT);
    expect(r.enqueued).toBe(false);
  });
});

describe("attemptOrEnqueue — retriable errors (enqueue)", () => {
  it("500 → enqueued=true с attempts=1 (синхронная попытка уже была)", async () => {
    // КРИТИЧНО: attempts=1, не 0! Иначе worker в первый retry
    // computeNextRetryAt(1)=5min, ОПЯТЬ (computeNextRetryAt(1))=5min,
    // и реальная лестница 5/5/15/60 вместо задуманной 5/15/60.
    // См. server/webhook-backoff.ts комментарий «Тик 7».
    mockFetchError(500);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");

    const r = await attemptOrEnqueue(INPUT);
    expect(r).toEqual({ delivered: false, enqueued: true });
    expect(storage.enqueueWebhookDelivery).toHaveBeenCalledTimes(1);
    const arg = storage.enqueueWebhookDelivery.mock.calls[0][0];
    expect(arg.attempts).toBe(1);
    expect(arg.taskId).toBe(INPUT.taskId);
    expect(arg.eventType).toBe(INPUT.eventType);
    expect(arg.targetUrl).toBe(INPUT.targetUrl);
    // payload сериализован в строку
    expect(typeof arg.payload).toBe("string");
    expect(JSON.parse(arg.payload)).toEqual(INPUT.payload);
  });

  it("502/503/504 → enqueue", async () => {
    for (const status of [502, 503, 504]) {
      storage.enqueueWebhookDelivery.mockClear();
      mockFetchError(status);
      const { attemptOrEnqueue } = await import("../server/webhook-queue");
      const r = await attemptOrEnqueue(INPUT);
      expect(r.enqueued).toBe(true);
      expect(storage.enqueueWebhookDelivery).toHaveBeenCalledTimes(1);
    }
  });

  it("429 (Too Many Requests) → enqueue", async () => {
    mockFetchError(429);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");
    const r = await attemptOrEnqueue(INPUT);
    expect(r.enqueued).toBe(true);
  });

  it("408 (Request Timeout) → enqueue", async () => {
    mockFetchError(408);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");
    const r = await attemptOrEnqueue(INPUT);
    expect(r.enqueued).toBe(true);
  });
});

describe("attemptOrEnqueue — network/timeout (enqueue)", () => {
  it("network error → enqueue с attempts=1", async () => {
    mockFetchThrow(new Error("ECONNREFUSED"));
    const { attemptOrEnqueue } = await import("../server/webhook-queue");

    const r = await attemptOrEnqueue(INPUT);
    expect(r).toEqual({ delivered: false, enqueued: true });
    expect(storage.enqueueWebhookDelivery).toHaveBeenCalledTimes(1);
    const arg = storage.enqueueWebhookDelivery.mock.calls[0][0];
    expect(arg.attempts).toBe(1);
  });
});

describe("attemptOrEnqueue — payload + auth headers", () => {
  it("шлёт Authorization: Bearer <apiKey> и Content-Type:application/json", async () => {
    mockFetchOk(200);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");
    await attemptOrEnqueue(INPUT);

    const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${INPUT.apiKey}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("payload сериализован в JSON.stringify", async () => {
    mockFetchOk(200);
    const { attemptOrEnqueue } = await import("../server/webhook-queue");
    await attemptOrEnqueue(INPUT);

    const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
    expect(typeof init.body).toBe("string");
    expect(JSON.parse(init.body as string)).toEqual(INPUT.payload);
  });
});
