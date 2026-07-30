/**
 * Конфигурация Telegram-бота из env.
 *
 * Без TASKSFLOW_BOT_TOKEN модуль бота не стартует вовсе — сервер работает
 * ровно как раньше, в лог уходит одна строка. Это важно для dev-окружений
 * и для того, чтобы падение бота никогда не роняло сайт.
 */

export type TelegramMode = "webhook" | "polling" | "off";

export type TelegramConfig = {
  botToken: string;
  /** Публичен по дизайну: числовая часть токена до `:`. Нужен Login Widget'у. */
  botId: string;
  botUsername: string | null;
  mode: TelegramMode;
  webhookUrl: string | null;
  webhookSecret: string | null;
  /**
   * Relay вместо api.telegram.org. RU-хостинги местами не маршрутизируют
   * подсети Telegram — тогда либо сюда ставится свой relay, либо
   * поднимается httpProxy ниже.
   */
  apiBaseUrl: string;
  httpProxy: string | undefined;
  /** Ссылка на бота для кнопки «Открыть бота» после привязки. */
  botDeepLink: string | null;
};

/**
 * Собирает конфиг из env. Возвращает null, если бот не сконфигурирован —
 * вызывающий обязан это проверить и просто не поднимать модуль.
 */
export function loadTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig | null {
  const botToken = (env.TASKSFLOW_BOT_TOKEN || "").trim();
  if (!botToken) return null;

  const botId = botToken.split(":")[0] || "";
  const botUsername = (env.TELEGRAM_BOT_USERNAME || "").trim() || null;
  const webhookUrl = (env.TELEGRAM_WEBHOOK_URL || "").trim() || null;
  const webhookSecret = (env.TELEGRAM_WEBHOOK_SECRET || "").trim() || null;
  const apiBaseUrl =
    (env.TELEGRAM_API_BASE_URL || "").trim() || "https://api.telegram.org";
  const httpProxy = (env.TELEGRAM_HTTP_PROXY || "").trim() || undefined;

  const rawMode = (env.TELEGRAM_MODE || "auto").trim().toLowerCase();
  let mode: TelegramMode;
  if (rawMode === "off") {
    mode = "off";
  } else if (rawMode === "webhook") {
    mode = "webhook";
  } else if (rawMode === "polling") {
    mode = "polling";
  } else {
    // auto: webhook только если он полностью настроен (url + секрет),
    // иначе long-poll. Polling не требует входящей доступности вообще —
    // на RU-хостинге за прокси это единственный рабочий вариант.
    mode = webhookUrl && webhookSecret ? "webhook" : "polling";
  }

  return {
    botToken,
    botId,
    botUsername,
    mode,
    webhookUrl,
    webhookSecret,
    apiBaseUrl,
    httpProxy,
    botDeepLink: botUsername ? `https://t.me/${botUsername}?start=ready` : null,
  };
}
