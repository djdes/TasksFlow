/**
 * Точка входа модуля Telegram-бота.
 *
 * Стартует из server/index.ts после registerRoutes. Если бот не
 * сконфигурирован (нет TASKSFLOW_BOT_TOKEN) — пишет одну строку в лог и
 * молча выходит: сервер обязан работать ровно как раньше.
 *
 * Runtime хранится синглтоном, потому что к нему обращаются и роуты
 * (webhook, /api/me/telegram), и фоновый таймер уборки драфтов.
 */

import { loadTelegramConfig, type TelegramConfig } from "./config";
import { TelegramClient } from "./client";
import { TelegramPoller } from "./poller";
import { handleUpdate } from "./handle-update";
import { logger } from "../logger";

export type TelegramRuntime = {
  config: TelegramConfig;
  client: TelegramClient;
  poller: TelegramPoller | null;
};

let runtime: TelegramRuntime | null = null;

/** null, если бот не сконфигурирован. Роуты обязаны это проверять. */
export function getTelegramRuntime(): TelegramRuntime | null {
  return runtime;
}

export async function startTelegramBot(): Promise<void> {
  const config = loadTelegramConfig();
  if (!config) {
    logger.info(
      "[telegram] TASKSFLOW_BOT_TOKEN не задан — бот не запущен, сервер работает без него",
    );
    return;
  }
  if (config.mode === "off") {
    logger.info("[telegram] TELEGRAM_MODE=off — бот отключён");
    return;
  }

  const client = new TelegramClient(config);
  runtime = { config, client, poller: null };

  // Меню команд. Не критично: если не прошло — бот работает, просто без
  // подсказок в интерфейсе Telegram.
  try {
    await client.setMyCommands([
      { command: "start", description: "Привязка и приветствие" },
      { command: "tasks", description: "Мои задачи на сегодня" },
      { command: "help", description: "Как пользоваться" },
    ]);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[telegram] setMyCommands не прошёл",
    );
  }

  if (config.mode === "webhook") {
    if (!config.webhookUrl || !config.webhookSecret) {
      logger.error(
        "[telegram] TELEGRAM_MODE=webhook, но не заданы TELEGRAM_WEBHOOK_URL / TELEGRAM_WEBHOOK_SECRET",
      );
      return;
    }
    try {
      await client.setWebhook(config.webhookUrl, config.webhookSecret);
      logger.info({ url: config.webhookUrl }, "[telegram] webhook установлен");
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "[telegram] setWebhook не прошёл — апдейты приходить не будут",
      );
    }
    return;
  }

  // Замыкаемся на runtime, а не на снимок полей: к моменту первого
  // апдейта в нём уже проставлен poller.
  const poller = new TelegramPoller(client, (update) =>
    handleUpdate(update, runtime!),
  );
  runtime.poller = poller;
  await poller.start();
}

export function stopTelegramBot(): void {
  runtime?.poller?.stop();
}
