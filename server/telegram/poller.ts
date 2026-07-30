/**
 * Long-poll getUpdates.
 *
 * Polling, а не webhook — потому что не требует входящей доступности
 * вообще: RU-хостинги режут подсети Telegram в обе стороны, и когда
 * исходящий трафик идёт через TELEGRAM_HTTP_PROXY, обратный вебхук всё
 * равно не долетит. Long-poll ходит через тот же прокси, что и sendMessage.
 */

import type { TelegramClient, TgUpdate } from "./client";
import { logger } from "../logger";

const POLL_TIMEOUT_SEC = 25;
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export class TelegramPoller {
  private offset = 0;
  private running = false;
  private backoffMs = BACKOFF_START_MS;

  constructor(
    private readonly client: TelegramClient,
    private readonly onUpdate: (update: TgUpdate) => Promise<void>,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Webhook и getUpdates взаимоисключающи: при активном вебхуке
    // getUpdates отвечает 409. Снимаем перед стартом.
    try {
      await this.client.deleteWebhook();
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[tg-poller] deleteWebhook не прошёл — продолжаем",
      );
    }

    logger.info("[tg-poller] запущен");
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.client.getUpdates(
          this.offset,
          POLL_TIMEOUT_SEC,
        );
        this.backoffMs = BACKOFF_START_MS;

        for (const update of updates) {
          // Двигаем offset ДО обработки: упавший апдейт не должен
          // обрабатываться бесконечно в цикле («ядовитое сообщение»).
          this.offset = Math.max(this.offset, update.update_id + 1);
          try {
            await this.onUpdate(update);
          } catch (err) {
            logger.error(
              {
                err: err instanceof Error ? err.message : String(err),
                updateId: update.update_id,
              },
              "[tg-poller] ошибка обработки апдейта",
            );
          }
        }
      } catch (err) {
        if (!this.running) break;
        logger.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            backoffMs: this.backoffMs,
          },
          "[tg-poller] getUpdates упал — backoff",
        );
        await sleep(this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
      }
    }
    logger.info("[tg-poller] остановлен");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
