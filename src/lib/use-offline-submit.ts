"use client";

import { useCallback, useEffect, useState } from "react";
import {
  enqueue,
  flushQueue,
  queueSize,
  subscribeQueueChange,
} from "@/lib/offline-queue";

type SubmitInput = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  /** Метка для UI в очереди (e.g. «Температура Морозильник #2 · 21.04»). */
  label?: string;
  group?: string;
};

type SubmitResult =
  | { status: "online"; response: Response }
  | { status: "queued"; reason: string };

/**
 * submitWithOfflineFallback — пытается отправить запрос. Если сеть
 * оффлайн ИЛИ fetch падает с TypeError (чаще всего network disconnect),
 * кладёт payload в IndexedDB-очередь и возвращает `{status:"queued"}`.
 */
export async function submitWithOfflineFallback(
  input: SubmitInput
): Promise<SubmitResult> {
  const canTryOnline =
    typeof navigator === "undefined" || navigator.onLine !== false;
  if (canTryOnline) {
    try {
      const response = await fetch(input.url, {
        method: input.method,
        headers:
          input.body !== undefined
            ? { "Content-Type": "application/json" }
            : undefined,
        body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      });
      if (response.ok) return { status: "online", response };
      // Не-OK не кидаем в очередь — это бизнес-ошибка, caller разберётся.
      return { status: "online", response };
    } catch (err) {
      // fall through to queue
      await enqueue(input);
      return {
        status: "queued",
        reason: err instanceof Error ? err.message : "network error",
      };
    }
  }
  await enqueue(input);
  return { status: "queued", reason: "browser offline" };
}

/**
 * Хук: размер очереди + онлайн-статус + автофлеш когда интернет
 * возвращается. Возвращает кнопку «Отправить сейчас» для UI.
 */
export function useOfflineQueue(): {
  online: boolean;
  pending: number;
  flushNow: () => Promise<void>;
  busy: boolean;
} {
  // Важно: на первом рендере всегда `true` — иначе если клиент сейчас
  // offline, navigator.onLine вернёт false, а серверный SSR отрендерил
  // true → React ругается «Hydration failed». Реальное значение
  // читаем в useEffect после монтирования.
  const [online, setOnline] = useState<boolean>(true);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPending(await queueSize());
    } catch {
      // IndexedDB может не работать в приватном режиме — тихо игнорируем.
    }
  }, []);

  useEffect(() => {
    // Подхватываем реальное состояние сети уже после монтирования —
    // так SSR и первый client-render совпадают, а если браузер offline,
    // переключимся на следующем тике.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOnline(false);
    }
    void refresh();
    const unsub = subscribeQueueChange(() => void refresh());
    const onOnline = () => {
      setOnline(true);
      void flushNow();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const flushNow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await flushQueue();
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [busy, refresh]);

  return { online, pending, flushNow, busy };
}
