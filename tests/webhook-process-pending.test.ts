/**
 * Тесты processPendingDeliveries — worker-side proceeding webhook очереди.
 *
 * Критичная функция: определяет когда retry, когда permanent-fail. Если
 * в логике баг — задачи WeSetup либо застревают в очереди вечно
 * (нет permanent-fail flag), либо преждевременно flag'аются как
 * failed (юзеры не понимают почему status mismatch с TasksFlow).
 *
 * Status codes (см. webhooks таблицу):
 *   0 = pending (ещё попробуем)
 *   1 = delivered (success, готово)
 *   2 = permanent failed (исчерпали ретраи / non-retriable / corrupted)
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
  listPendingWebhookDeliveries: vi.fn(),
  markWebhookDeliveryAttempt: vi.fn(),
};

vi.mock("../server/storage", () => ({ storage }));
vi.mock("../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  storage.listPendingWebhookDeliveries.mockReset();
  storage.markWebhookDeliveryAttempt.mockReset();
  storage.markWebhookDeliveryAttempt.mockResolvedValue(undefined);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(status: number): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => `body ${status}`,
  } as Response);
}

function mockFetchThrow(err: Error): void {
  globalThis.fetch = vi.fn().mockRejectedValue(err);
}

function row(over: Partial<any> = {}): any {
  return {
    id: 1,
    taskId: 100,
    eventType: "complete",
    targetUrl: "https://wesetup.example.com/api",
    apiKey: "key",
    payload: JSON.stringify({ taskId: 100 }),
    attempts: 1,
    nextRetryAt: 0,
    status: 0,
    ...over,
  };
}

describe("processPendingDeliveries — пустая очередь", () => {
  it("нет pending → {processed:0, delivered:0, permanentFailed:0}", async () => {
    storage.listPendingWebhookDeliveries.mockResolvedValue([]);
    const { processPendingDeliveries } = await import("../server/webhook-queue");

    const r = await processPendingDeliveries();
    expect(r).toEqual({ processed: 0, delivered: 0, permanentFailed: 0 });
    expect(storage.markWebhookDeliveryAttempt).not.toHaveBeenCalled();
  });
});

describe("processPendingDeliveries — corrupted payload", () => {
  it("payload not valid JSON → status=2 (permanentFailed) сразу", async () => {
    // Edge case: row из старого deploy с broken payload — нет смысла
    // ретраить. Mark permanently failed чтобы не зависал в pending.
    storage.listPendingWebhookDeliveries.mockResolvedValue([
      row({ payload: "not json {{{" }),
    ]);
    mockFetch(200); // даже если бы fetch успел — не должны до него дойти
    const { processPendingDeliveries } = await import("../server/webhook-queue");

    const r = await processPendingDeliveries();
    expect(r.permanentFailed).toBe(1);
    expect(r.delivered).toBe(0);

    const arg = storage.markWebhookDeliveryAttempt.mock.calls[0][0];
    expect(arg.status).toBe(2);
    expect(arg.lastError).toMatch(/corrupted/i);
    expect(globalThis.fetch).not.toHaveBeenCalled(); // НЕ дёргали fetch
  });
});

describe("processPendingDeliveries — success path", () => {
  it("2xx → status=1 (delivered), nextRetryAt=0", async () => {
    storage.listPendingWebhookDeliveries.mockResolvedValue([row()]);
    mockFetch(200);
    const { processPendingDeliveries } = await import("../server/webhook-queue");

    const r = await processPendingDeliveries();
    expect(r.delivered).toBe(1);
    expect(r.processed).toBe(1);

    const arg = storage.markWebhookDeliveryAttempt.mock.calls[0][0];
    expect(arg.status).toBe(1);
    expect(arg.attempts).toBe(2); // row.attempts=1 + 1
    expect(arg.lastError).toBeNull();
  });
});

describe("processPendingDeliveries — non-retriable 4xx", () => {
  it("400 → status=2 (permanentFailed) сразу, без проверки MAX_ATTEMPTS", async () => {
    storage.listPendingWebhookDeliveries.mockResolvedValue([row({ attempts: 1 })]);
    mockFetch(400);
    const { processPendingDeliveries } = await import("../server/webhook-queue");

    const r = await processPendingDeliveries();
    expect(r.permanentFailed).toBe(1);

    const arg = storage.markWebhookDeliveryAttempt.mock.calls[0][0];
    expect(arg.status).toBe(2);
    expect(arg.lastError).toMatch(/HTTP 400/);
  });
});

describe("processPendingDeliveries — retriable 5xx", () => {
  it("500 + attempts<MAX → status=0 (pending) с nextRetryAt из лестницы", async () => {
    storage.listPendingWebhookDeliveries.mockResolvedValue([row({ attempts: 1 })]);
    mockFetch(500);
    const { processPendingDeliveries } = await import("../server/webhook-queue");

    const r = await processPendingDeliveries();
    expect(r.delivered).toBe(0);
    expect(r.permanentFailed).toBe(0);

    const arg = storage.markWebhookDeliveryAttempt.mock.calls[0][0];
    expect(arg.status).toBe(0); // pending — повторим
    expect(arg.attempts).toBe(2);
    expect(arg.nextRetryAt).toBeGreaterThan(0); // из RETRY_LADDER_MIN
    expect(arg.lastError).toMatch(/HTTP 500/);
  });

  it("500 + attempts=MAX-1 → status=2 (исчерпали ретраи)", async () => {
    // RETRY_LADDER_MIN.length=6, attempts=5 → nextAttempt=6=MAX_ATTEMPTS → fail
    storage.listPendingWebhookDeliveries.mockResolvedValue([row({ attempts: 5 })]);
    mockFetch(500);
    const { processPendingDeliveries } = await import("../server/webhook-queue");

    const r = await processPendingDeliveries();
    expect(r.permanentFailed).toBe(1);

    const arg = storage.markWebhookDeliveryAttempt.mock.calls[0][0];
    expect(arg.status).toBe(2);
    expect(arg.attempts).toBe(6);
  });
});

describe("processPendingDeliveries — network error", () => {
  it("network error + attempts<MAX → status=0 (pending)", async () => {
    storage.listPendingWebhookDeliveries.mockResolvedValue([row({ attempts: 2 })]);
    mockFetchThrow(new Error("ECONNREFUSED"));
    const { processPendingDeliveries } = await import("../server/webhook-queue");

    const r = await processPendingDeliveries();
    expect(r.delivered).toBe(0);
    expect(r.permanentFailed).toBe(0);

    const arg = storage.markWebhookDeliveryAttempt.mock.calls[0][0];
    expect(arg.status).toBe(0);
    expect(arg.attempts).toBe(3);
    expect(arg.lastError).toMatch(/ECONNREFUSED/);
  });

  it("network error + attempts=MAX-1 → status=2 (permanent)", async () => {
    storage.listPendingWebhookDeliveries.mockResolvedValue([row({ attempts: 5 })]);
    mockFetchThrow(new Error("ETIMEDOUT"));
    const { processPendingDeliveries } = await import("../server/webhook-queue");

    const r = await processPendingDeliveries();
    expect(r.permanentFailed).toBe(1);

    const arg = storage.markWebhookDeliveryAttempt.mock.calls[0][0];
    expect(arg.status).toBe(2);
  });
});

describe("processPendingDeliveries — батч", () => {
  it("несколько строк с разными исходами → каждая обработана независимо", async () => {
    storage.listPendingWebhookDeliveries.mockResolvedValue([
      row({ id: 1, attempts: 1 }),
      row({ id: 2, attempts: 1 }),
      row({ id: 3, attempts: 1, payload: "not json" }),
    ]);
    // Чередуем: ok/fail-retriable/(corrupted skip'нет fetch для id=3)
    let n = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      n += 1;
      if (n === 1) return { ok: true, status: 200, text: async () => "" };
      return { ok: false, status: 500, text: async () => "down" };
    });
    const { processPendingDeliveries } = await import("../server/webhook-queue");

    const r = await processPendingDeliveries();
    expect(r.processed).toBe(3);
    expect(r.delivered).toBe(1);
    expect(r.permanentFailed).toBe(1); // corrupted id=3
    // 3 mark-вызова: delivered + retry + corrupted
    expect(storage.markWebhookDeliveryAttempt).toHaveBeenCalledTimes(3);
  });
});
