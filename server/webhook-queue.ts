/**
 * @fileoverview Webhook delivery queue для надёжной доставки task
 * complete/uncomplete событий в WeSetup.
 *
 * Модель:
 *   1. Хендлер /api/tasks/:id/uncomplete и /api/wesetup/complete-with-values
 *      вызывают `attemptOrEnqueue()`, который:
 *        a. Делает первую попытку POST'а на WeSetup сразу.
 *        b. На успех — НЕ создаёт row в очереди.
 *        c. На сетевой сбой / 5xx — создаёт row с next_retry_at=
 *           "сейчас + 5 мин".
 *   2. Background worker в server/index.ts крутит интервал:
 *        SELECT pending where next_retry_at<=now LIMIT 50
 *      и для каждого делает повторную попытку.
 *   3. Backoff-лестница из 6 шагов (см. RETRY_LADDER_MIN). После
 *      исчерпания — status=2 (failed permanently), мы оставляем
 *      запись для расследования (не удаляем).
 *
 * Не ретраим:
 *   • 4xx (кроме 429/408) — это «правильно failed» (нет ключа,
 *     задача неизвестна и т.д.)
 *   • 200/2xx — успех
 *
 * Ретраим:
 *   • Network errors (ECONNREFUSED, timeout)
 *   • 5xx
 *   • 429 Too Many Requests (с честным backoff)
 *   • 408 Request Timeout
 */

import { storage } from "./storage";
import { logger } from "./logger";

/**
 * Backoff-лестница в минутах. attempts=0 — это первая попытка
 * (мгновенная). attempts=1 — через 5 мин. И т.д.
 */
const RETRY_LADDER_MIN = [0, 5, 15, 60, 6 * 60, 24 * 60] as const;
const MAX_ATTEMPTS = RETRY_LADDER_MIN.length;

const FETCH_TIMEOUT_MS = 10_000;

export type WebhookEventType = "complete" | "uncomplete";

function computeNextRetryAt(attempts: number): number {
  const delayMin =
    RETRY_LADDER_MIN[Math.min(attempts, RETRY_LADDER_MIN.length - 1)];
  return Math.floor(Date.now() / 1000) + delayMin * 60;
}

/** Should this HTTP error trigger a retry? */
function isRetriable(status: number): boolean {
  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;
  return false;
}

/**
 * Try delivering immediately. On success — return without enqueuing.
 * On retriable failure — enqueue with attempts=1 and next_retry_at
 * set по лестнице. On non-retriable 4xx — log + drop (we won't keep
 * pinging WeSetup with a bad payload).
 */
export async function attemptOrEnqueue(input: {
  taskId: number;
  eventType: WebhookEventType;
  targetUrl: string;
  apiKey: string;
  payload: object;
}): Promise<{ delivered: boolean; enqueued: boolean }> {
  const body = JSON.stringify(input.payload);
  try {
    const response = await fetchWithTimeout(input.targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (response.ok) {
      return { delivered: true, enqueued: false };
    }
    if (!isRetriable(response.status)) {
      logger.warn(
        {
          taskId: input.taskId,
          eventType: input.eventType,
          status: response.status,
        },
        "[webhook-queue] WeSetup вернул non-retriable 4xx — drop",
      );
      return { delivered: false, enqueued: false };
    }
    await storage.enqueueWebhookDelivery({
      taskId: input.taskId,
      eventType: input.eventType,
      targetUrl: input.targetUrl,
      apiKey: input.apiKey,
      payload: body,
      nextRetryAt: computeNextRetryAt(1),
    });
    logger.info(
      {
        taskId: input.taskId,
        eventType: input.eventType,
        status: response.status,
      },
      "[webhook-queue] WeSetup retriable error — enqueued",
    );
    return { delivered: false, enqueued: true };
  } catch (err) {
    // Network error / timeout — точно ретраим.
    await storage.enqueueWebhookDelivery({
      taskId: input.taskId,
      eventType: input.eventType,
      targetUrl: input.targetUrl,
      apiKey: input.apiKey,
      payload: body,
      nextRetryAt: computeNextRetryAt(1),
    });
    logger.warn(
      {
        taskId: input.taskId,
        eventType: input.eventType,
        err: err instanceof Error ? err.message : String(err),
      },
      "[webhook-queue] WeSetup network error — enqueued",
    );
    return { delivered: false, enqueued: true };
  }
}

/** Один проход worker'а: pull pending due → попытка → backoff/finalize. */
export async function processPendingDeliveries(): Promise<{
  processed: number;
  delivered: number;
  permanentFailed: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  const pending = await storage.listPendingWebhookDeliveries(50, now);
  let delivered = 0;
  let permanentFailed = 0;

  for (const row of pending) {
    const nextAttempt = row.attempts + 1;
    let body: object;
    try {
      body = JSON.parse(row.payload) as object;
    } catch {
      // Корраптнутый payload — нет смысла ретраить.
      await storage.markWebhookDeliveryAttempt({
        id: row.id,
        attempts: nextAttempt,
        status: 2,
        nextRetryAt: 0,
        lastError: "payload corrupted (not valid JSON)",
      });
      permanentFailed += 1;
      continue;
    }

    try {
      const response = await fetchWithTimeout(row.targetUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${row.apiKey}`,
          "Content-Type": "application/json",
        },
        body: row.payload,
      });
      if (response.ok) {
        await storage.markWebhookDeliveryAttempt({
          id: row.id,
          attempts: nextAttempt,
          status: 1,
          nextRetryAt: 0,
          lastError: null,
        });
        delivered += 1;
        continue;
      }
      // Non-2xx
      const errText = await safeBodyText(response);
      const message = `HTTP ${response.status}: ${errText.slice(0, 200)}`;
      if (!isRetriable(response.status) || nextAttempt >= MAX_ATTEMPTS) {
        await storage.markWebhookDeliveryAttempt({
          id: row.id,
          attempts: nextAttempt,
          status: 2,
          nextRetryAt: 0,
          lastError: message,
        });
        permanentFailed += 1;
        logger.warn(
          { id: row.id, taskId: row.taskId, attempts: nextAttempt, message },
          "[webhook-queue] permanent fail",
        );
      } else {
        await storage.markWebhookDeliveryAttempt({
          id: row.id,
          attempts: nextAttempt,
          status: 0,
          nextRetryAt: computeNextRetryAt(nextAttempt),
          lastError: message,
        });
      }
      void body;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (nextAttempt >= MAX_ATTEMPTS) {
        await storage.markWebhookDeliveryAttempt({
          id: row.id,
          attempts: nextAttempt,
          status: 2,
          nextRetryAt: 0,
          lastError: message,
        });
        permanentFailed += 1;
        logger.warn(
          { id: row.id, taskId: row.taskId, attempts: nextAttempt, message },
          "[webhook-queue] permanent fail (network)",
        );
      } else {
        await storage.markWebhookDeliveryAttempt({
          id: row.id,
          attempts: nextAttempt,
          status: 0,
          nextRetryAt: computeNextRetryAt(nextAttempt),
          lastError: message,
        });
      }
    }
  }

  return { processed: pending.length, delivered, permanentFailed };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "(не удалось прочитать тело ответа)";
  }
}

