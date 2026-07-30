import { describe, it, expect } from "vitest";
import { loadTelegramConfig } from "../server/telegram/config";

/**
 * Имя переменной с токеном — источник реального инцидента: в
 * ProjectsFlow и DocsFlow она зовётся TELEGRAM_BOT_TOKEN, и её кладут по
 * привычке. Раньше бот такой токен игнорировал и молчал без объяснений.
 */

const TOKEN = "8810015596:AAtest";

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return extra as NodeJS.ProcessEnv;
}

describe("loadTelegramConfig: имя переменной с токеном", () => {
  it("TASKSFLOW_BOT_TOKEN работает", () => {
    expect(loadTelegramConfig(env({ TASKSFLOW_BOT_TOKEN: TOKEN }))?.botToken).toBe(TOKEN);
  });

  it("TELEGRAM_BOT_TOKEN тоже работает — как в ProjectsFlow и DocsFlow", () => {
    expect(loadTelegramConfig(env({ TELEGRAM_BOT_TOKEN: TOKEN }))?.botToken).toBe(TOKEN);
  });

  it("при обоих заданных выигрывает TASKSFLOW_BOT_TOKEN — он специфичнее", () => {
    const c = loadTelegramConfig(
      env({ TASKSFLOW_BOT_TOKEN: TOKEN, TELEGRAM_BOT_TOKEN: "999:other" }),
    );
    expect(c?.botToken).toBe(TOKEN);
  });

  it("ни одной переменной → null, бот просто не стартует", () => {
    expect(loadTelegramConfig(env())).toBeNull();
  });

  it("пробелы вокруг токена срезаются — частая ошибка копипасты", () => {
    expect(loadTelegramConfig(env({ TELEGRAM_BOT_TOKEN: `  ${TOKEN}  ` }))?.botToken).toBe(TOKEN);
  });

  it("пустая строка не считается токеном", () => {
    expect(loadTelegramConfig(env({ TASKSFLOW_BOT_TOKEN: "   " }))).toBeNull();
  });
});

describe("loadTelegramConfig: botId", () => {
  it("botId — часть токена до двоеточия, она публична", () => {
    expect(loadTelegramConfig(env({ TELEGRAM_BOT_TOKEN: TOKEN }))?.botId).toBe("8810015596");
  });
});

describe("loadTelegramConfig: режим", () => {
  it("auto без вебхука → polling (не требует входящей доступности)", () => {
    expect(loadTelegramConfig(env({ TELEGRAM_BOT_TOKEN: TOKEN }))?.mode).toBe("polling");
  });

  it("auto с URL и секретом → webhook", () => {
    const c = loadTelegramConfig(
      env({
        TELEGRAM_BOT_TOKEN: TOKEN,
        TELEGRAM_WEBHOOK_URL: "https://tasksflow.ru/api/telegram/webhook",
        TELEGRAM_WEBHOOK_SECRET: "s3cret",
      }),
    );
    expect(c?.mode).toBe("webhook");
  });

  it("auto с URL, но БЕЗ секрета → polling: вебхук без секрета небезопасен", () => {
    const c = loadTelegramConfig(
      env({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_URL: "https://x/y" }),
    );
    expect(c?.mode).toBe("polling");
  });

  it("явный off выключает бота", () => {
    expect(loadTelegramConfig(env({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_MODE: "off" }))?.mode).toBe("off");
  });

  it("регистр режима не важен", () => {
    expect(
      loadTelegramConfig(env({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_MODE: "POLLING" }))?.mode,
    ).toBe("polling");
  });
});

describe("loadTelegramConfig: сеть", () => {
  it("по умолчанию api.telegram.org без прокси", () => {
    const c = loadTelegramConfig(env({ TELEGRAM_BOT_TOKEN: TOKEN }));
    expect(c?.apiBaseUrl).toBe("https://api.telegram.org");
    expect(c?.httpProxy).toBeUndefined();
    expect(c?.apiIp).toBeUndefined();
  });

  it("TELEGRAM_API_IP подхватывается — обход DNS-блокировки как в DocsFlow", () => {
    const c = loadTelegramConfig(
      env({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_IP: "149.154.167.220" }),
    );
    expect(c?.apiIp).toBe("149.154.167.220");
  });

  it("relay-URL перекрывает дефолтный хост", () => {
    const c = loadTelegramConfig(
      env({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_BASE_URL: "https://relay.example.com/" }),
    );
    expect(c?.apiBaseUrl).toBe("https://relay.example.com/");
  });

  it("botDeepLink строится только когда известен username", () => {
    expect(loadTelegramConfig(env({ TELEGRAM_BOT_TOKEN: TOKEN }))?.botDeepLink).toBeNull();
    expect(
      loadTelegramConfig(env({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: "thetasksflowbot" }))
        ?.botDeepLink,
    ).toBe("https://t.me/thetasksflowbot?start=ready");
  });
});
