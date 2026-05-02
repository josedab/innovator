/// <reference lib="webworker" />

const CACHE_NAME = "innovator-v1";
const STATIC_CACHE = "innovator-static-v1";
const API_CACHE = "innovator-api-v1";

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
];

const self = globalThis as unknown as ServiceWorkerGlobalScope;

// Install: precache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for static assets, network-first for API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Network-first for API routes
  if (url.pathname.startsWith("/api/")) {
    // Cache completed investigation results for offline viewing
    if (url.pathname === "/api/history" || url.pathname.startsWith("/api/history/")) {
      event.respondWith(networkFirstStrategy(event.request, API_CACHE));
      return;
    }
    // Don't cache other API routes (they involve LLM calls)
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
