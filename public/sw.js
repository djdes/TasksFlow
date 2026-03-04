const CACHE_NAME = "haccp-v1";
const STATIC_ASSETS = [
  "/",
  "/login",
  "/manifest.json",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== "GET") {
    // For POST to /api/journals, queue offline entries
    if (event.request.method === "POST" && url.pathname === "/api/journals") {
      event.respondWith(handleOfflineJournalPost(event.request));
      return;
    }
    return;
  }

  // API calls: network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r || new Response(JSON.stringify({ error: "Офлайн" }), {
          headers: { "Content-Type": "application/json" },
          status: 503,
        })))
    );
    return;
  }

  // Static: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && !url.pathname.startsWith("/_next/")) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Return offline page for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("/");
        }
        return new Response("Офлайн", { status: 503 });
      });
    })
  );
});

// Offline journal entry queue
const OFFLINE_QUEUE_KEY = "haccp-offline-queue";

async function handleOfflineJournalPost(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Network failed — queue the entry
    const body = await request.json();
    const queue = JSON.parse(await getFromIDB(OFFLINE_QUEUE_KEY) || "[]");
    queue.push({
      url: request.url,
      body,
      timestamp: Date.now(),
    });
    await saveToIDB(OFFLINE_QUEUE_KEY, JSON.stringify(queue));

    return new Response(JSON.stringify({
      queued: true,
      message: "Запись сохранена в офлайн-очереди. Будет отправлена при восстановлении связи.",
    }), {
      headers: { "Content-Type": "application/json" },
      status: 202,
    });
  }
}

// Sync queued entries when back online
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-journals") {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  const queueStr = await getFromIDB(OFFLINE_QUEUE_KEY);
  if (!queueStr) return;

  const queue = JSON.parse(queueStr);
  const remaining = [];

  for (const item of queue) {
    try {
      await fetch(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
    } catch {
      remaining.push(item);
    }
  }

  if (remaining.length > 0) {
    await saveToIDB(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  } else {
    await deleteFromIDB(OFFLINE_QUEUE_KEY);
  }
}

// Simple IndexedDB helpers for the service worker
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("haccp-sw", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFromIDB(key) {
  const db = await openIDB();
  return new Promise((resolve) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function saveToIDB(key, value) {
  const db = await openIDB();
  return new Promise((resolve) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
  });
}

async function deleteFromIDB(key) {
  const db = await openIDB();
  return new Promise((resolve) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => resolve();
  });
}
