/**
 * Push-уведомления: кому и что отправить.
 *
 *   sendToUsers()  — разослать сообщение на все устройства людей;
 *   notifySoon()   — то же, но события одного типа за 15 с складываются в
 *                    одно («Новых задач: 5»), а не сыплются пачкой;
 *   pushConfig()   — что включено (для GET /api/push/config).
 *
 * Транспорты: Web Push (браузер, PWA, Android-приложение) и APNs
 * (iOS-приложение). Невключённый транспорт просто пропускается.
 */
import type { PushConfig, PushMessage } from "@shared/push";
import type { PushSubscriptionRow } from "@shared/schema";
import { logger } from "../logger";
import { apnsFromEnv, sendApns, type ApnsConfig, type ApnsPayload } from "./apns";
import { pushStore, type PushStore } from "./store";
import type { SendResult } from "./types";
import { pushTopic, sendWebPush, vapidFromEnv, type VapidKeys, type WebTarget } from "./web";

export type { PushMessage } from "@shared/push";

export type PushDeps = {
  store: PushStore;
  web: ((target: WebTarget, payload: string, opts: { ttl: number; topic?: string }) => Promise<SendResult>) | null;
  apns:
    | ((token: string, environment: "sandbox" | "production", payload: ApnsPayload, opts: { ttl: number; collapseId?: string }) => Promise<SendResult>)
    | null;
};

let cached: { vapid: VapidKeys | null; apns: ApnsConfig | null } | null = null;

function transports() {
  if (!cached) cached = { vapid: vapidFromEnv(), apns: apnsFromEnv() };
  return cached;
}

/** Для тестов и смены env без перезапуска. */
export function resetPushConfig() {
  cached = null;
}

export function pushConfig(): PushConfig {
  const { vapid, apns } = transports();
  return { web: { enabled: !!vapid, publicKey: vapid?.publicKey ?? null }, apns: { enabled: !!apns } };
}

function defaultDeps(): PushDeps {
  const { vapid, apns } = transports();
  return {
    store: pushStore,
    web: vapid ? (target, payload, opts) => sendWebPush(vapid, target, payload, opts) : null,
    apns: apns ? (token, env, payload, opts) => sendApns(apns, token, env, payload, opts) : null,
  };
}

const DEFAULT_TTL = 12 * 3600;

async function deliver(sub: PushSubscriptionRow, message: PushMessage, deps: PushDeps): Promise<SendResult | null> {
  const ttl = message.ttl ?? DEFAULT_TTL;
  if (sub.kind === "web") {
    if (!deps.web || !sub.p256dh || !sub.auth) return null;
    const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.tag, ts: Date.now() });
    return deps.web({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload, { ttl, topic: pushTopic(message.tag) });
  }
  if (sub.kind === "apns") {
    if (!deps.apns) return null;
    const environment = sub.environment === "sandbox" ? "sandbox" : "production";
    return deps.apns(
      sub.endpoint,
      environment,
      { aps: { alert: { title: message.title, body: message.body }, sound: "default", "thread-id": message.tag }, url: message.url },
      { ttl, collapseId: message.tag },
    );
  }
  return null;
}

/** Разослать на все устройства людей. Возвращает, сколько доставлено и сколько подписок умерло. */
export async function sendToUsers(
  userIds: number[],
  message: PushMessage,
  deps: PushDeps = defaultDeps(),
): Promise<{ sent: number; removed: number }> {
  const ids = Array.from(new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0 || (!deps.web && !deps.apns)) return { sent: 0, removed: 0 };
  const subs = await deps.store.listForUsers(ids);
  let sent = 0;
  let removed = 0;
  // Не больше 8 запросов к push-сервисам одновременно.
  for (let i = 0; i < subs.length; i += 8) {
    await Promise.all(
      subs.slice(i, i + 8).map(async (sub) => {
        const result = await deliver(sub, message, deps).catch(() => "failed" as const);
        if (result === "ok") {
          sent++;
          await deps.store.markOk(sub.id).catch(() => {});
        } else if (result === "gone") {
          removed++;
          await deps.store.remove(sub.id).catch(() => {});
        } else if (result === "failed") {
          await deps.store.markFailed(sub.id).catch(() => {});
        }
      }),
    );
  }
  return { sent, removed };
}

/** Не дождаться отправки и не уронить запрос, который её вызвал. */
export function sendInBackground(userIds: number[], message: PushMessage) {
  void sendToUsers(userIds, message).catch((err) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[push] отправка не удалась");
  });
}

// ---------------------------------------------------------------------------
// Склейка частых событий: 10 задач подряд — одно уведомление.

type Pending = { timer: ReturnType<typeof setTimeout>; items: string[] };
const pending = new Map<string, Pending>();

export const COALESCE_MS = 15_000;

export function notifySoon(
  key: string,
  userId: number,
  item: string,
  build: (items: string[]) => PushMessage,
  send: (userIds: number[], message: PushMessage) => void = sendInBackground,
  delayMs = COALESCE_MS,
) {
  const fullKey = `${key}:${userId}`;
  const existing = pending.get(fullKey);
  if (existing) {
    existing.items.push(item);
    return;
  }
  const entry: Pending = {
    items: [item],
    timer: setTimeout(() => {
      pending.delete(fullKey);
      send([userId], build(entry.items));
    }, delayMs),
  };
  entry.timer.unref?.();
  pending.set(fullKey, entry);
}

/** Сколько событий ещё ждут склейки (для тестов). */
export function pendingCount() {
  return pending.size;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function listBody(items: string[], max = 3): string {
  const shown = items.slice(0, max).map((s) => clip(s, 60));
  const rest = items.length - shown.length;
  return shown.join(" · ") + (rest > 0 ? ` и ещё ${rest}` : "");
}

export function newTasksMessage(titles: string[]): PushMessage {
  if (titles.length === 1) return { title: "Новая задача", body: clip(titles[0], 120), url: "/dashboard", tag: "new-tasks" };
  return { title: `Новых задач: ${titles.length}`, body: listBody(titles), url: "/dashboard", tag: "new-tasks" };
}

export function awaitingReviewMessage(items: string[]): PushMessage {
  if (items.length === 1) return { title: "Ждёт проверки", body: clip(items[0], 120), url: "/admin/verification", tag: "verification" };
  return { title: `Ждут проверки: ${items.length}`, body: listBody(items), url: "/admin/verification", tag: "verification" };
}
