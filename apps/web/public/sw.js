/// <reference lib="webworker" />

const CACHE_NAME = "innovator-v2";
const STATIC_CACHE = "innovator-static-v2";
const API_CACHE = "innovator-api-v2";
const OFFLINE_QUEUE_STORE = "innovator-offline-queue";

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
];

// API routes whose responses should be cached for offline access
const CACHEABLE_API_ROUTES = [
  "/api/history",
  "/api/tracker",
  "/api/analytics",
  "/api/metering",
  "/api/session-templates",
];

const self = globalThis as unknown as ServiceWorkerGlobalScope;

// ---- IndexedDB for offline queue ----

function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_STORE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("responses")) {
        db.createObjectStore("responses", { keyPath: "url" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueRequest(url: string, method: string, body: string | null): Promise<void> {
  const db = await openOfflineDB();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").add({
    url,
    method,
    body,
    timestamp: Date.now(),
    status: "pending",
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function cacheResponse(url: string, data: unknown): Promise<void> {
  const db = await openOfflineDB();
  const tx = db.transaction("responses", "readwrite");
  tx.objectStore("responses").put({
    url,
    data,
    cachedAt: Date.now(),
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function getCachedResponse(url: string): Promise<unknown | null> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("responses", "readonly");
    const request = tx.objectStore("responses").get(url);
    request.onsuccess = () => resolve(request.result?.data ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function processOfflineQueue(): Promise<void> {
  const db = await openOfflineDB();
  const tx = db.transaction("queue", "readwrite");
  const store = tx.objectStore("queue");
  const allRequest = store.getAll();

  await new Promise<void>((resolve, reject) => {
    allRequest.onsuccess = async () => {
      const items = allRequest.result;
      for (const item of items) {
        if (item.status !== "pending") continue;
        try {
          const response = await fetch(item.url, {
            method: item.method,
            headers: { "Content-Type": "application/json" },
            body: item.body,
          });
          if (response.ok) {
            const deleteTx = db.transaction("queue", "readwrite");
            deleteTx.objectStore("queue").delete(item.id);
          }
        } catch {
          // Still offline, keep in queue
        }
      }
      resolve();
    };
    allRequest.onerror = () => reject(allRequest.error);
  });
}

// ---- Service Worker Events ----

// Install: precache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  const validCaches = [STATIC_CACHE, API_CACHE, CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !validCaches.includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: enhanced caching strategies
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET for cache strategies (but handle POST queuing below)
  if (event.request.method !== "GET") {
    // Queue POST requests when offline for background sync
    if (event.request.method === "POST" && url.pathname.startsWith("/api/")) {
      event.respondWith(handleOfflinePost(event.request));
    }
    return;
  }

  // Network-first for cacheable API routes with IndexedDB fallback
  if (url.pathname.startsWith("/api/")) {
    const isCacheable = CACHEABLE_API_ROUTES.some((route) =>
      url.pathname === route || url.pathname.startsWith(route + "/")
    );

    if (isCacheable) {
      event.respondWith(networkFirstWithIndexedDB(event.request));
      return;
    }
    // Don't cache other API routes
    return;
  }

  // Cache-first for static assets
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(cacheFirstStrategy(event.request, STATIC_CACHE));
    return;
  }

  // Network-first for pages (HTML navigation)
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirstStrategy(event.request, CACHE_NAME));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirstStrategy(event.request, CACHE_NAME));
});

// Background sync: process queued requests when back online
self.addEventListener("sync", (event: Event) => {
  const syncEvent = event as Event & { tag: string; waitUntil: (p: Promise<void>) => void };
  if (syncEvent.tag === "offline-queue") {
    syncEvent.waitUntil(processOfflineQueue());
  }
});

// Listen for online events to trigger sync
self.addEventListener("message", (event) => {
  if (event.data?.type === "ONLINE_STATUS_CHANGED" && event.data.isOnline) {
    processOfflineQueue();
  }
});

// ---- Strategies ----

async function handleOfflinePost(request: Request): Promise<Response> {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Offline: queue the request for later
    const body = await request.text();
    await queueRequest(request.url, request.method, body);

    // Register background sync if available
    if ("sync" in self.registration) {
      await (self.registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
        .sync.register("offline-queue");
    }

    return new Response(
      JSON.stringify({
        queued: true,
        message: "Request queued for when you're back online",
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function networkFirstWithIndexedDB(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Cache response in IndexedDB for richer offline data
      const cloned = response.clone();
      const data = await cloned.json();
      await cacheResponse(request.url, data);
    }
    return response;
  } catch {
    // Try IndexedDB cache
    const cached = await getCachedResponse(request.url);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "indexeddb",
        },
      });
    }

    // Fall back to Cache API
    const cacheResponse2 = await caches.match(request);
    if (cacheResponse2) return cacheResponse2;

    return new Response(
      JSON.stringify({ error: "Offline — no cached data available" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function cacheFirstStrategy(request: Request, cacheName: string): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

async function networkFirstStrategy(request: Request, cacheName: string): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
  }
}

// Handle push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json() as { title: string; body: string; url?: string };
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: data.url ?? "/" },
      })
    );
  } catch {
    // Ignore malformed push data
  }
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
