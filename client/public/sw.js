/**
 * Service Worker для PWA
 * Обеспечивает оффлайн работу и кеширование
 */

const CACHE_NAME = "tasksflow-v1";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
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

// Fetch event - стратегия Network First для API, Cache First для статики
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Пропускаем non-GET запросы
  if (request.method !== "GET") {
    return;
  }

  // API запросы - Network First
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Кешируем успешные GET запросы к API
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Если сеть недоступна, пробуем из кеша
          return caches.match(request);
        })
    );
    return;
  }

  // Статические файлы и страницы - Cache First, потом Network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Обновляем кеш в фоне
        fetch(request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response);
            });
          }
        });
        return cachedResponse;
      }

      // Если нет в кеше, идем в сеть
      return fetch(request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      });
    })
  );
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
