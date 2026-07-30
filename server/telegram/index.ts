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

import {
  loadTelegramConfig,
  TELEGRAM_FALLBACK_IP,
  type TelegramConfig,
} from "./config";
import { TelegramClient } from "./client";
import { TelegramPoller } from "./poller";
import { handleUpdate } from "./handle-update";
import { logger } from "../logger";

export type TelegramRuntime = {
  config: TelegramConfig;
  client: TelegramClient;
  poller: TelegramPoller | null;
  /**
   * Реальные id и username бота из getMe. Нужны для работы в группах:
   * по username опознаём упоминание, по id — reply на своё сообщение.
   */
  me: { id: number; username: string | null };
};

let runtime: TelegramRuntime | null = null;

/**
 * Почему бот не поднялся, если токен есть.
 *
 * Без этого «нет токена» и «токен есть, но Telegram недоступен»
 * выглядели одинаково — configured:false, и дальше только гадать.
 * Типичная причина второго — РФ-хостинг не резолвит api.telegram.org.
 */
let startupError: string | null = null;

export function getTelegramStartupError(): string | null {
  return startupError;
}

/** null, если бот не сконфигурирован. Роуты обязаны это проверять. */
export function getTelegramRuntime(): TelegramRuntime | null {
  return runtime;
}

export async function startTelegramBot(): Promise<void> {
  // let, а не const: при фолбэке на пришпиленный IP конфиг заменяется
  // на сработавший вариант, и runtime должен хранить именно его.
  let config = loadTelegramConfig();
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

  // getMe до всего остального: он же проверяет, что токен живой и сеть
  // до Bot API есть. Без username бот не сможет работать в группах.
  //
  // Если обычное соединение не прошло, пробуем ещё раз с пришпиленным
  // IPv4: РФ-хостинги не резолвят api.telegram.org по DNS/IPv6, хотя сам
  // адрес доступен. Раньше это означало «бот молчит, разбирайся по логам».
  const attempts: Array<{ cfg: TelegramConfig; label: string }> = [
    { cfg: config, label: "обычное соединение" },
  ];
  if (!config.apiIp && !config.httpProxy) {
    attempts.push({
      cfg: { ...config, apiIp: TELEGRAM_FALLBACK_IP },
      label: `пришпиленный IP ${TELEGRAM_FALLBACK_IP}`,
    });
  }

  let client: TelegramClient | null = null;
  let me: { id: number; username: string | null } | null = null;

  for (const attempt of attempts) {
    const candidate = new TelegramClient(attempt.cfg);
    try {
      const info = await candidate.getMe();
      client = candidate;
      me = { id: info.id, username: info.username ?? attempt.cfg.botUsername };
      config = attempt.cfg;
      startupError = null;
      logger.info(
        { botId: info.id, username: me.username, via: attempt.label },
        "[telegram] бот подключён",
      );
      break;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      startupError = `${attempt.label}: ${reason}`;
      logger.warn(
        { err: reason, via: attempt.label },
        "[telegram] getMe не прошёл",
      );
    }
  }

  if (!client || !me) {
    logger.error(
      { err: startupError },
      "[telegram] бот не поднялся: неверный токен либо нет сети до Bot API " +
        "даже по прямому IP. Помогут TELEGRAM_HTTP_PROXY или TELEGRAM_API_BASE_URL",
    );
    return;
  }

  runtime = { config, client, poller: null, me };

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
