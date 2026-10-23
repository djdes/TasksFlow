import { useCallback, useEffect, useState } from "react";
import type { PushConfig } from "@shared/push";
import { detectPlatform, nativeBridge } from "./pwa";

/**
 * Push на этом устройстве.
 *   браузер / PWA / Android-приложение — Web Push через service worker;
 *   iOS-приложение — APNs через мост WebViewController (push.register);
 *   Safari на iPhone без установки — только после «На экран Домой».
 */
export type PushSupport = "web" | "native-ios" | "ios-needs-install" | "unsupported";
export type PushStatus = "loading" | "unsupported" | "needs-install" | "server-off" | "denied" | "off" | "on";

type JsonInit = { method: "POST" | "DELETE"; body?: unknown };

async function json<T>(url: string, init?: JsonInit): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(data?.message || "Сервер не ответил");
  return data;
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (nativeBridge()) return "native-ios";
  const hasWebPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (hasWebPush) return "web";
  // Safari на iPhone даёт Web Push только установленному на экран «Домой» сайту.
  if (detectPlatform(navigator.userAgent, navigator.maxTouchPoints || 0) === "ios") return "ios-needs-install";
  return "unsupported";
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // На dev-сервере SW не регистрируется автоматически — регистрируем по запросу.
  return navigator.serviceWorker.register("/sw.js").catch(() => null);
}

type NativePushStatus = { permission: "granted" | "denied" | "default"; token: string; environment: string };

async function readStatus(config: PushConfig): Promise<PushStatus> {
  const support = pushSupport();
  if (support === "unsupported") return "unsupported";
  if (support === "ios-needs-install") return "needs-install";
  if (support === "native-ios") {
    if (!config.apns.enabled) return "server-off";
    const status = (await nativeBridge()!.call("push.status")) as NativePushStatus;
    if (status.permission === "denied") return "denied";
    return status.permission === "granted" && status.token && localStorage.getItem(NATIVE_FLAG) === status.token ? "on" : "off";
  }
  if (!config.web.enabled || !config.web.publicKey) return "server-off";
  if (Notification.permission === "denied") return "denied";
  const reg = await swRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

// Токен iOS, который этот вход уже отдал серверу.
const NATIVE_FLAG = "tf_push_native_token";

export async function enablePush(): Promise<void> {
  const config = await json<PushConfig>("/api/push/config");
  const support = pushSupport();
  if (support === "native-ios") {
    if (!config.apns.enabled) throw new Error("Уведомления для iPhone на сервере пока не включены");
    const result = (await nativeBridge()!.call("push.register")) as { token: string; environment: string };
    await json("/api/push/subscriptions", { method: "POST", body: { kind: "apns", token: result.token, environment: result.environment } });
    localStorage.setItem(NATIVE_FLAG, result.token);
    return;
  }
  if (support !== "web") throw new Error("Этот браузер не умеет получать уведомления");
  if (!config.web.publicKey) throw new Error("Уведомления на сервере пока не включены");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Уведомления запрещены в настройках браузера");
  const reg = await swRegistration();
  if (!reg) throw new Error("Не удалось подготовить уведомления — обновите страницу");
  await navigator.serviceWorker.ready;
  const key = base64UrlToBytes(config.web.publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Подписка под старый ключ сервера (сменили VAPID) — пересоздаём.
  const current = sub?.options?.applicationServerKey;
  if (sub && current && new Uint8Array(current).join() !== key.join()) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
  }
  await json("/api/push/subscriptions", { method: "POST", body: { kind: "web", subscription: sub.toJSON() } });
}

/** Выключить на этом устройстве. Сервер забывает подписку, браузер — тоже. */
export async function disablePush(): Promise<void> {
  const support = pushSupport();
  if (support === "native-ios") {
    const token = localStorage.getItem(NATIVE_FLAG);
    localStorage.removeItem(NATIVE_FLAG);
    if (token) await json("/api/push/subscriptions", { method: "DELETE", body: { token } });
    return;
  }
  const reg = await swRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await json("/api/push/subscriptions", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/**
 * Перед выходом из аккаунта: на общем планшете следующий человек не должен
 * получать уведомления предыдущего. Не дольше 2 секунд — выход важнее.
 */
export async function forgetThisDevice(): Promise<void> {
  if (pushSupport() === "unsupported" || pushSupport() === "ios-needs-install") return;
  await Promise.race([disablePush().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
}

export async function sendTestPush(): Promise<{ sent: number }> {
  return json<{ sent: number }>("/api/push/test", { method: "POST", body: {} });
}

export function usePushState() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const config = await json<PushConfig>("/api/push/config");
      setStatus(await readStatus(config));
    } catch {
      setStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не получилось");
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [refresh],
  );

  return {
    status,
    busy,
    error,
    enable: () => run(enablePush),
    disable: () => run(disablePush),
  };
}
