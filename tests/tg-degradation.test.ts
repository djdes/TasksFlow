import { describe, it, expect, vi, afterEach } from "vitest";
import {
  requestTaskParse,
  loadPfAiConfig,
  failureMessage,
  type WorkerEnvelope,
} from "../server/telegram/pf-ai";

/**
 * Бот обязан оставаться рабочим, когда AI недоступен: любой отказ ведёт
 * в ручной черновик, сообщение руководителя не теряется никогда.
 */

const CONFIG = {
  apiUrl: "https://pf.example.com/api",
  agentToken: "pfat_test",
  projectId: "bcc868e6-853c-4c8b-a592-6f3fcb20a298",
};

const ENVELOPE: WorkerEnvelope = {
  app: "tasksflow",
  v: 1,
  today: "2026-07-30",
  dow: 4,
  author: { name: "Ярослав", role: "admin" },
  members: [{ id: 12, name: "Олег", position: "повар" }],
  categories: [],
  hasPhotos: 0,
  message: "помыть холодильник",
};

function mockFetch(responses: Array<{ status: number; body?: unknown }>) {
  let call = 0;
  const fn = vi.fn(async () => {
    const r = responses[Math.min(call, responses.length - 1)];
    call++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadPfAiConfig", () => {
  it("без любой из трёх переменных → null (AI просто выключен)", () => {
    expect(loadPfAiConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      loadPfAiConfig({ PF_API_URL: "x", PF_AGENT_TOKEN: "y" } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("трейлинг-слеш в API_URL срезается", () => {
    const c = loadPfAiConfig({
      PF_API_URL: "https://pf.example.com/api/",
      PF_AGENT_TOKEN: "pfat_x",
      PF_TASKSFLOW_PROJECT_ID: "id",
    } as NodeJS.ProcessEnv);
    expect(c?.apiUrl).toBe("https://pf.example.com/api");
  });
});

describe("requestTaskParse: деградация", () => {
  it("конфига нет → not_configured, сеть не трогаем", async () => {
    const f = mockFetch([{ status: 200 }]);
    const r = await requestTaskParse(ENVELOPE, null);
    expect(r).toEqual({ ok: false, reason: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });

  it("429 → rate_limited", async () => {
    mockFetch([{ status: 429 }]);
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("503 (ai_not_configured / no_dispatcher) → ai_unavailable", async () => {
    mockFetch([{ status: 503, body: { error: "no_dispatcher_for_project" } }]);
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toMatchObject({ ok: false, reason: "ai_unavailable" });
  });

  it("201 без jobId → ai_unavailable, а не падение", async () => {
    mockFetch([{ status: 201, body: {} }]);
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toMatchObject({ ok: false, reason: "ai_unavailable" });
  });

  it("сетевая ошибка → network", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toMatchObject({ ok: false, reason: "network" });
  });

  it("job failed → job_failed с деталью", async () => {
    mockFetch([
      { status: 201, body: { jobId: "j1" } },
      { status: 200, body: { status: "failed", error: "tasksflow_bad_json" } },
    ]);
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toMatchObject({ ok: false, reason: "job_failed", detail: "tasksflow_bad_json" });
  });

  it("job cancelled (5-минутный cleanup в PF) → job_failed", async () => {
    mockFetch([
      { status: 201, body: { jobId: "j1" } },
      { status: 200, body: { status: "cancelled", error: "dispatcher_timeout" } },
    ]);
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toMatchObject({ ok: false, reason: "job_failed" });
  });

  it("succeeded с пустым improvedText → bad_json", async () => {
    mockFetch([
      { status: 201, body: { jobId: "j1" } },
      { status: 200, body: { status: "succeeded", improvedText: "" } },
    ]);
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toMatchObject({ ok: false, reason: "bad_json" });
  });
});

describe("requestTaskParse: long-poll", () => {
  it("504 — это НЕ ошибка, а истёкшее окно: продолжаем ждать", async () => {
    const f = mockFetch([
      { status: 201, body: { jobId: "j1" } },
      { status: 504, body: { error: "timeout", status: "queued" } },
      { status: 200, body: { status: "succeeded", improvedText: '{"segments":[]}' } },
    ]);
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toEqual({ ok: true, raw: '{"segments":[]}' });
    // enqueue + два поллинга
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("статус queued/running тоже не прерывает ожидание", async () => {
    const f = mockFetch([
      { status: 201, body: { jobId: "j1" } },
      { status: 200, body: { status: "running" } },
      { status: 200, body: { status: "succeeded", improvedText: "{}" } },
    ]);
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toMatchObject({ ok: true });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("если окно так и не закрылось — timeout после лимита попыток", async () => {
    const f = mockFetch([
      { status: 201, body: { jobId: "j1" } },
      { status: 504 },
    ]);
    const r = await requestTaskParse(ENVELOPE, CONFIG);
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    // enqueue + ровно 6 поллингов, дальше не крутим
    expect(f).toHaveBeenCalledTimes(7);
  });

  it("успешный разбор отдаёт сырой текст без интерпретации", async () => {
    const raw = '{"version":1,"segments":[{"title":"Помыть"}]}';
    mockFetch([
      { status: 201, body: { jobId: "j1" } },
      { status: 200, body: { status: "succeeded", improvedText: raw } },
    ]);
    expect(await requestTaskParse(ENVELOPE, CONFIG)).toEqual({ ok: true, raw });
  });
});

describe("requestTaskParse: запрос к очереди", () => {
  it("шлёт mode=improve с projectId и конвертом в text", async () => {
    const f = mockFetch([
      { status: 201, body: { jobId: "j1" } },
      { status: 200, body: { status: "succeeded", improvedText: "{}" } },
    ]);
    await requestTaskParse(ENVELOPE, CONFIG);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://pf.example.com/api/agent/ai-prompt-jobs");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer pfat_test");
    const body = JSON.parse(init.body as string);
    expect(body.mode).toBe("improve");
    expect(body.projectId).toBe(CONFIG.projectId);
    expect(JSON.parse(body.text).app).toBe("tasksflow");
  });

  it("слишком большой конверт не отправляется вовсе", async () => {
    const f = mockFetch([{ status: 201, body: { jobId: "j1" } }]);
    const huge = { ...ENVELOPE, message: "x".repeat(60_000) };
    const r = await requestTaskParse(huge, CONFIG);
    expect(r).toMatchObject({ ok: false, reason: "bad_json" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("failureMessage", () => {
  it("каждая причина даёт понятный текст без технических кодов", () => {
    for (const reason of [
      "not_configured", "rate_limited", "ai_unavailable",
      "timeout", "job_failed", "bad_json", "network",
    ] as const) {
      const msg = failureMessage(reason);
      expect(msg.length).toBeGreaterThan(10);
      expect(msg).not.toContain("_");
    }
  });

  it("про лимит сказано прямо", () => {
    expect(failureMessage("rate_limited")).toContain("Лимит");
  });
});
