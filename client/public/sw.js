/**
 * Service worker TasksFlow: офлайн-страница, кэш хешированных ассетов и
 * push-уведомления. Регистрируется из client/src/lib/pwa.ts.
 *
 * Что НЕ кэшируем и почему:
 *  - HTML-страницы: старый index.html ссылается на /assets/index-*.js,
 *    которых после деплоя уже нет → «Failed to load module script».
 *  - /api/*: в CacheStorage оседали ответы с данными пользователя, и на
 *    общем планшете после смены пользователя офлайн показывал чужое.
 */
const VERSION = "v4";
const STATIC_CACHE = `tasksflow-static-${VERSION}`;
// Хешированные файлы неизменны — переживают смену версии SW, но не больше MAX_ASSETS.
const ASSET_CACHE = "tasksflow-assets";
const MAX_ASSETS = 160;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/manifest.json", "/favicon.svg", "/icons/icon-192.png", "/icons/badge-96.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, ASSET_CACHE]);
      for (const name of await caches.keys()) {
        if (!keep.has(name)) await caches.delete(name);
      }
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

async function trimAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Страницы — всегда из сети; без сети — офлайн-страница.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          return await fetch(request);
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(ASSET_CACHE)
              .then((cache) => cache.put(request, copy))
              .then(trimAssets),
          );
        }
        return response;
      })(),
    );
  }
});

// ---------- Push ----------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "TasksFlow";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: "ru",
      // Одинаковый tag заменяет прошлое уведомление, а не копит стопку.
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
      data: { url: data.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL("/dashboard", self.location.origin);
  try {
    const candidate = new URL(event.notification.data?.url || "/dashboard", self.location.origin);
    if (candidate.origin === self.location.origin) target = candidate;
  } catch {
    // битый url — открываем кабинет
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const own = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (own) {
        await own.focus();
        if (own.url !== target.href) {
          // navigate() работает только для вкладок под этим SW — иначе просим страницу.
          try {
            await own.navigate(target.href);
          } catch {
            own.postMessage({ type: "tf:navigate", url: target.pathname + target.search });
          }
        }
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

function base64UrlToBytes(value) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Браузер сменил подписку сам (истекла) — переподписываемся без участия человека.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const config = await fetch("/api/push/config", { credentials: "include" }).then((r) => (r.ok ? r.json() : null));
      const key = config && config.web && config.web.publicKey;
      if (!key) return;
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(key),
      });
      await fetch("/api/push/subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "web",
          subscription: subscription.toJSON(),
          replaces: event.oldSubscription ? event.oldSubscription.endpoint : null,
        }),
      });
    })().catch(() => {}),
  );
});
