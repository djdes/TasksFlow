/**
 * Service Worker для PWA
 * Обеспечивает оффлайн работу и кеширование
 */

const CACHE_NAME = "tasksflow-v2";
// Не кешируем "/" и "/dashboard" — это HTML-страницы, ссылающиеся на хешированные
// /assets/index-*.js. Если закэшировать старый index.html, после нового деплоя
// старый bundle уже не существует на сервере и nginx-fallback отдаёт HTML с
// MIME text/html вместо application/javascript → "Failed to load module script".
// Кешируем только manifest и иконки.
const STATIC_ASSETS = [
  "/manifest.json",
];

// Install event - кешируем статические ресурсы
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching static assets");
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Активируем сразу, не дожидаясь закрытия старых вкладок
  self.skipWaiting();
});

// Activate event - чистим старые кеши
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    })
  );
  // Берем контроль над всеми страницами сразу
  self.clients.claim();
});

// Fetch event:
//   - HTML / навигация       → Network First (никогда не показываем старый index.html
//                              со ссылкой на исчезнувший /assets/index-*.js)
//   - /api/*                  → Network First (всегда свежие данные)
//   - /assets/* (immutable)   → Cache First   (хешированные имена, экономим трафик)
//   - всё остальное           → Network only
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  const isNavigate =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (isNavigate) {
    event.respondWith(
      fetch(request).catch(() => caches.match("/manifest.json"))
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // По умолчанию — просто проксируем сеть.
});

// Push notifications (для будущего использования)
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || "Task Delegate";
  const options = {
    body: data.body || "У вас новое уведомление",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: data.url || "/dashboard",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Клик по уведомлению
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data));
});
