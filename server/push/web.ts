/**
 * Web Push (RFC 8030/8291): браузеры, установленные PWA и Android-приложение
 * (TWA показывает уведомления сайта от имени приложения).
 *
 * Ключи VAPID — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY в .env; деплой создаёт
 * их один раз (deploy.yml). Без ключей Web Push выключен.
 */
import webpush from "web-push";
import type { SendResult } from "./types";

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

export function vapidFromEnv(env: NodeJS.ProcessEnv = process.env): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const contact = env.VAPID_SUBJECT?.trim() || env.LEGAL_CONTACT_EMAIL?.trim() || "support@tasksflow.ru";
  const subject = /^(mailto:|https:\/\/)/.test(contact) ? contact : `mailto:${contact}`;
  return { publicKey, privateKey, subject };
}

export type WebTarget = { endpoint: string; p256dh: string; auth: string };

/** Topic у push-сервиса: не больше 32 символов base64url. */
export function pushTopic(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  const topic = tag.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);
  return topic || undefined;
}

export async function sendWebPush(
  keys: VapidKeys,
  target: WebTarget,
  payload: string,
  opts: { ttl: number; topic?: string },
): Promise<SendResult> {
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
      vapidDetails: keys,
      TTL: opts.ttl,
      urgency: "normal",
      topic: opts.topic,
      timeout: 10_000,
      // Как у Telegram: на хостинге в РФ иногда нужен прокси до push-сервисов.
      proxy: process.env.PUSH_HTTP_PROXY || undefined,
    });
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    // 404/410 — подписки больше нет (удалили сайт из разрешений, сменили браузер).
    if (status === 404 || status === 410) return "gone";
    return "failed";
  }
}
