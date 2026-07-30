/**
 * Минимальный клиент Telegram Bot API.
 *
 * ВАЖНО: undici.fetch, а НЕ глобальный fetch. Глобальный использует undici,
 * встроенный в Node, и dispatcher от внешнего пакета undici другой мажорной
 * версии даёт «invalid onRequestStart method». Тот же приём и по той же
 * причине используется в ProjectsFlow (HttpTelegramClient).
 *
 * Все запросы идут через единственный чокпоинт tgFetch, который подмешивает
 * ProxyAgent — иначе легко забыть прокси в одном методе и получить
 * ETIMEDOUT только на нём.
 */

import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from "undici";
import type { TelegramConfig } from "./config";

export type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TgPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TgDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TgMessage = {
  message_id: number;
  from?: TgUser;
  /** title есть у group/supergroup — используем для понятных логов. */
  chat: { id: number; type: string; title?: string };
  date: number;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: TgDocument;
  media_group_id?: string;
  reply_to_message?: TgMessage;
};

export type TgCallbackQuery = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

export type TgInlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type TgReplyMarkup = {
  inline_keyboard: TgInlineKeyboardButton[][];
};

/** Ошибка уровня Bot API: сохраняем код, чтобы отличать 403 «бот заблокирован». */
export class TelegramApiError extends Error {
  readonly errorCode: number | null;
  readonly method: string;

  constructor(method: string, description: string, errorCode: number | null) {
    super(`${method}: ${description}`);
    this.name = "TelegramApiError";
    this.method = method;
    this.errorCode = errorCode;
  }
}

export class TelegramClient {
  private readonly base: string;
  private readonly fileBase: string;
  private readonly dispatcher: Dispatcher | undefined;

  constructor(config: TelegramConfig) {
    const cleaned = config.apiBaseUrl.replace(/\/$/, "");
    this.base = `${cleaned}/bot${config.botToken}`;
    this.fileBase = `${cleaned}/file/bot${config.botToken}`;
    this.dispatcher = config.httpProxy
      ? new ProxyAgent(config.httpProxy)
      : undefined;
  }

  /** Единственная точка исходящих запросов — здесь подмешивается прокси. */
  private async call<T>(
    method: string,
    payload?: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<T> {
    const init: Parameters<typeof undiciFetch>[1] & {
      dispatcher?: Dispatcher;
    } = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (this.dispatcher) init.dispatcher = this.dispatcher;

    const res = await undiciFetch(`${this.base}/${method}`, init);
    const body = (await res.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
      error_code?: number;
    };
    if (!body.ok) {
      throw new TelegramApiError(
        method,
        body.description ?? `HTTP ${res.status}`,
        body.error_code ?? res.status,
      );
    }
    return body.result as T;
  }

  async sendMessage(params: {
    chat_id: number;
    text: string;
    parse_mode?: "HTML" | "MarkdownV2";
    reply_markup?: TgReplyMarkup;
    reply_to_message_id?: number;
    disable_web_page_preview?: boolean;
  }): Promise<TgMessage> {
    return this.call<TgMessage>("sendMessage", {
      disable_web_page_preview: true,
      ...params,
    });
  }

  async editMessageText(params: {
    chat_id: number;
    message_id: number;
    text: string;
    parse_mode?: "HTML" | "MarkdownV2";
    reply_markup?: TgReplyMarkup;
  }): Promise<unknown> {
    return this.call("editMessageText", {
      disable_web_page_preview: true,
      ...params,
    });
  }

  /**
   * Ответ на нажатие кнопки. Обязателен: без него у пользователя
   * бесконечно крутится «часики» на кнопке.
   */
  async answerCallbackQuery(params: {
    callback_query_id: string;
    text?: string;
    show_alert?: boolean;
  }): Promise<unknown> {
    return this.call("answerCallbackQuery", params);
  }

  async sendPhoto(params: {
    chat_id: number;
    photo: string;
    caption?: string;
    parse_mode?: "HTML";
    reply_markup?: TgReplyMarkup;
  }): Promise<TgMessage> {
    return this.call<TgMessage>("sendPhoto", params);
  }

  async sendMediaGroup(params: {
    chat_id: number;
    media: Array<{ type: "photo"; media: string; caption?: string }>;
  }): Promise<TgMessage[]> {
    return this.call<TgMessage[]>("sendMediaGroup", params);
  }

  /**
   * Кто мы. Username берём отсюда, а не из env: в группах бот обязан
   * узнавать упоминание себя, и полагаться на то, что руками проставили
   * TELEGRAM_BOT_USERNAME, нельзя — ошибутся один раз, и бот молча
   * перестанет отвечать в группах.
   */
  async getMe(): Promise<{ id: number; username?: string; first_name?: string }> {
    return this.call("getMe");
  }

  async setMyCommands(
    commands: Array<{ command: string; description: string }>,
  ): Promise<unknown> {
    return this.call("setMyCommands", { commands });
  }

  async setWebhook(url: string, secretToken: string): Promise<unknown> {
    return this.call("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  }

  async deleteWebhook(): Promise<unknown> {
    return this.call("deleteWebhook", { drop_pending_updates: false });
  }

  /**
   * Long-poll. timeout — секунды удержания соединения Telegram'ом;
   * HTTP-таймаут берём с запасом, иначе рвём соединение раньше сервера.
   */
  async getUpdates(offset: number, timeoutSec: number): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>(
      "getUpdates",
      {
        offset,
        timeout: timeoutSec,
        allowed_updates: ["message", "callback_query"],
      },
      (timeoutSec + 15) * 1000,
    );
  }

  /** Путь файла на серверах Telegram по file_id (живёт ~1 час). */
  async getFile(fileId: string): Promise<{ file_path?: string; file_size?: number }> {
    return this.call("getFile", { file_id: fileId });
  }

  /**
   * Скачивание файла. Возвращает Buffer, чтобы вызывающий сам решил,
   * куда его класть (у нас — uploads/ с генерируемым именем).
   */
  async downloadFile(filePath: string, maxBytes: number): Promise<Buffer> {
    const init: Parameters<typeof undiciFetch>[1] & {
      dispatcher?: Dispatcher;
    } = { signal: AbortSignal.timeout(60_000) };
    if (this.dispatcher) init.dispatcher = this.dispatcher;

    const res = await undiciFetch(`${this.fileBase}/${filePath}`, init);
    if (!res.ok) {
      throw new TelegramApiError("downloadFile", `HTTP ${res.status}`, res.status);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new TelegramApiError(
        "downloadFile",
        `файл больше лимита (${buf.byteLength} > ${maxBytes})`,
        null,
      );
    }
    return buf;
  }
}
