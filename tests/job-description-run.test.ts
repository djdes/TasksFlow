/**
 * Полный прогон инструкции: очередь → шлюз → задачи. Отдельный файл: здесь
 * шлюз и база подменены целиком, чтобы проверить сам цикл ожидания.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let current: Record<string, unknown> | null = null;
vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => (current ? [{ ...current }] : []) }) }),
    update: () => ({ set: (set: Record<string, unknown>) => ({ where: async () => { if (current) Object.assign(current, set); } }) }),
    delete: () => ({ where: async () => { current = null; } }),
  },
}));
vi.mock("../server/storage", () => ({
  storage: {
    getUserById: vi.fn(async (id: number) => ({ id, companyId: 42, name: "Олег", position: "повар" })),
    getTasks: vi.fn(async () => []),
    getCompanyById: vi.fn(async () => ({ id: 42, accessSettings: null })),
  },
}));
const createTaskForActor = vi.fn(async () => ({ id: 500 }));
vi.mock("../server/services/task-create", () => ({ createTaskForActor }));

const gateway = vi.hoisted(() => ({
  enqueueTextJob: vi.fn(),
  getTextJob: vi.fn(),
}));
vi.mock("../server/job-description/gateway", async (importOriginal) => {
  const real = await importOriginal<typeof import("../server/job-description/gateway")>();
  return { ...real, enqueueTextJob: gateway.enqueueTextJob, getTextJob: gateway.getTextJob };
});

const config = { url: "https://pf.test/api", token: "t" };
const answer = JSON.stringify({ segments: [{ title: "Мыть пол", isRecurring: true }] });

beforeEach(() => {
  vi.useFakeTimers();
  current = {
    userId: 7, companyId: 42, source: "text", fileName: null, content: "Мыть пол каждый день", status: "queued",
    gatewayJobId: null, attempts: 0, tasksCreated: 0, taskIds: null, error: null, createdBy: null, createdAt: 1, updatedAt: 1, sentAt: null,
  };
  gateway.enqueueTextJob.mockReset().mockResolvedValue("j1");
  gateway.getTextJob.mockReset();
  createTaskForActor.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("runJobDescription", () => {
  it("шлюз отвечает «работаю» сразу — опрашиваем с паузой, а не тысячами запросов", async () => {
    let calls = 0;
    gateway.getTextJob.mockImplementation(async () => {
      calls++;
      return calls < 4 ? { id: "j1", status: "running", text: null, error: null } : { id: "j1", status: "succeeded", text: answer, error: null };
    });
    const { runJobDescription } = await import("../server/job-description/service");
    const run = runJobDescription(7, config);
    await vi.advanceTimersByTimeAsync(9_000);
    await run;
    expect(calls).toBe(4);
    expect(gateway.enqueueTextJob).toHaveBeenCalledTimes(1);
    const sent = gateway.enqueueTextJob.mock.calls[0][1];
    expect(sent.input).toContain("Мыть пол каждый день");
    expect(sent.instructions).toContain("segments");
    expect(createTaskForActor).toHaveBeenCalledTimes(1);
    expect(current).toMatchObject({ status: "done", tasksCreated: 1, gatewayJobId: "j1" });
  });

  it("токен не подходит — сразу ошибка с подсказкой, без повторов", async () => {
    const { GatewayError } = await import("../server/job-description/gateway");
    gateway.enqueueTextJob.mockRejectedValue(new GatewayError("шлюз ответил 403", 403, false));
    const { runJobDescription } = await import("../server/job-description/service");
    await runJobDescription(7, config);
    expect(current).toMatchObject({ status: "failed" });
    expect(String(current?.error)).toMatch(/scope account/);
  });

  it("временный отказ — остаётся в очереди, счётчик попыток растёт", async () => {
    const { GatewayError } = await import("../server/job-description/gateway");
    gateway.enqueueTextJob.mockRejectedValue(new GatewayError("шлюз ответил 503", 503, true));
    const { runJobDescription } = await import("../server/job-description/service");
    await runJobDescription(7, config);
    expect(current).toMatchObject({ status: "queued", attempts: 1 });
  });

  it("диспетчер не взял задание — понятная причина", async () => {
    gateway.getTextJob.mockResolvedValue({ id: "j1", status: "cancelled", text: null, error: "dispatcher_timeout" });
    const { runJobDescription } = await import("../server/job-description/service");
    await runJobDescription(7, config);
    expect(current).toMatchObject({ status: "failed" });
    expect(String(current?.error)).toMatch(/Ralph не взял/);
  });

  it("без шлюза ничего не делаем — инструкция ждёт в очереди", async () => {
    const { runJobDescription } = await import("../server/job-description/service");
    await runJobDescription(7, null);
    expect(gateway.enqueueTextJob).not.toHaveBeenCalled();
    expect(current).toMatchObject({ status: "queued" });
  });
});
