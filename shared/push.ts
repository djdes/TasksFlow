import { z } from "zod";

/** GET /api/push/config — что умеет сервер. */
export type PushConfig = {
  web: { enabled: boolean; publicKey: string | null };
  apns: { enabled: boolean };
};

/** Уведомление: заголовок, текст и страница, которую открыть по нажатию. */
export type PushMessage = {
  title: string;
  body: string;
  url: string;
  /** Одинаковый tag заменяет прошлое уведомление на устройстве. */
  tag?: string;
  /** Сколько секунд push-сервис держит сообщение, если устройство офлайн. */
  ttl?: number;
};

const base64url = z.string().regex(/^[A-Za-z0-9_-]+=*$/, "Неверный ключ подписки");

export const webSubscriptionSchema = z.object({
  kind: z.literal("web"),
  subscription: z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({
      p256dh: base64url.min(80).max(100),
      auth: base64url.min(16).max(32),
    }),
  }),
  /** Старый endpoint, если браузер сменил подписку сам. */
  replaces: z.string().max(2000).nullish(),
});

export const apnsSubscriptionSchema = z.object({
  kind: z.literal("apns"),
  token: z.string().regex(/^[0-9a-fA-F]{64,200}$/, "Неверный токен устройства"),
  environment: z.enum(["sandbox", "production"]),
});

export const pushSubscriptionSchema = z.discriminatedUnion("kind", [webSubscriptionSchema, apnsSubscriptionSchema]);
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z
  .object({ endpoint: z.string().max(2000).optional(), token: z.string().max(200).optional() })
  .refine((v) => !!(v.endpoint || v.token), "Нужен endpoint или token");

/**
 * Push-сервисы браузеров. Сервер шлёт уведомление на endpoint из подписки —
 * без списка это был бы POST на любой адрес по выбору пользователя (SSRF).
 */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

export function isAllowedPushEndpoint(endpoint: string, extraHosts: readonly string[] = []): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return [...PUSH_SERVICE_HOSTS, ...extraHosts].some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
