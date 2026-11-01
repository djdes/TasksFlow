// Бот, который не достучался до Telegram при старте, переподключается сам,
// а не молчит до следующего перезапуска процесса.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMe = vi.fn();
const created: unknown[] = [];

vi.mock("../server/telegram/config", () => ({
  TELEGRAM_FALLBACK_IP: "149.154.167.220",
  loadTelegramConfig: () => ({
    botToken: "123:abc",
    botId: "123",
    botUsername: "tf_test_bot",
    // webhook без адреса: после подключения бот выходит до поллера — тесту поллер не нужен.
    mode: "webhook",
    webhookUrl: null,
    webhookSecret: null,
    apiBaseUrl: "https://api.telegram.org",
    httpProxy: undefined,
    apiIp: undefined,
  }),
}));
vi.mock("../server/telegram/client", () => ({
  TelegramClient: class {
    constructor(cfg: unknown) {
      created.push(cfg);
    }
    getMe = getMe;
    setMyCommands = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock("../server/telegram/poller", () => ({ TelegramPoller: class {} }));
vi.mock("../server/telegram/handle-update", () => ({ handleUpdate: vi.fn() }));
vi.mock("../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

async function freshModule() {
  vi.resetModules();
  return import("../server/telegram");
}

describe("startTelegramBot: повтор подключения", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getMe.mockReset();
    created.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("сеть недоступна при старте — подключается сам на следующей попытке", async () => {
    const tg = await freshModule();
    getMe.mockRejectedValue(new Error("fetch failed"));

    await tg.startTelegramBot();
    expect(tg.getTelegramRuntime()).toBeNull();
    expect(tg.getTelegramStartupError()).toContain("fetch failed");
    expect(getMe).toHaveBeenCalledTimes(2); // обычное соединение + пришпиленный IP

    getMe.mockResolvedValue({ id: 123, username: "tf_test_bot" });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(tg.getTelegramRuntime()?.me).toEqual({ id: 123, username: "tf_test_bot" });
    expect(tg.getTelegramStartupError()).toBeNull();
    tg.stopTelegramBot();
  });

  it("пауза между попытками растёт", async () => {
    const tg = await freshModule();
    getMe.mockRejectedValue(new Error("fetch failed"));

    await tg.startTelegramBot();
    await vi.advanceTimersByTimeAsync(30_000); // 2-я попытка
    expect(getMe).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(30_000); // до 3-й ещё 30 с
    expect(getMe).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(30_000); // 3-я — через минуту
    expect(getMe).toHaveBeenCalledTimes(6);
    tg.stopTelegramBot();
  });

  it("второй старт при поднятом боте ничего не создаёт", async () => {
    const tg = await freshModule();
    getMe.mockResolvedValue({ id: 123, username: "tf_test_bot" });

    await tg.startTelegramBot();
    const clients = created.length;
    await tg.startTelegramBot();
    expect(created.length).toBe(clients);
    tg.stopTelegramBot();
  });

  it("stopTelegramBot отменяет запланированный повтор", async () => {
    const tg = await freshModule();
    getMe.mockRejectedValue(new Error("fetch failed"));

    await tg.startTelegramBot();
    tg.stopTelegramBot();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(getMe).toHaveBeenCalledTimes(2);
  });
});
