/* FuelBook service worker — hand-written, no Workbox.
 *
 * Scope of what this worker is allowed to do:
 *   1. cache-first for immutable same-origin build assets (/_next/static/**) and the icons
 *   2. network-first for navigations, falling back to a cached shell and then /offline
 *   3. nothing else — every other request goes straight to the network
 *
 * !!! NEVER CACHE API RESPONSES !!!
 * FuelBook is multi-tenant and token-authenticated. Two different users (often two
 * different pumps) share the same device and browser profile at the forecourt. A cached
 * API response keyed only by URL would be replayed to whoever asks for that URL next,
 * showing one pump's sales, cash or credit ledger to another tenant, and would also
 * survive logout. There is also no offline write queue in this app, so a cached-but-stale
 * read would silently make people reconcile against numbers that are no longer true.
 * Do not "optimise" this by adding an API cache, not even stale-while-revalidate.
 */

const VERSION = "v1";
const STATIC_CACHE = `fuelbook-static-${VERSION}`;
const SHELL_CACHE = `fuelbook-shell-${VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, SHELL_CACHE];

const OFFLINE_URL = "/offline";

const PRECACHE = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
];

// Deliberately no skipWaiting() here: swapping the app out from under someone who is
// half-way through entering a shift reading can leave a half-old page talking to new
// chunks. The new worker waits; the client shows a "Refresh" toast and posts SKIP_WAITING.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))));
      } catch {
        // Storage unavailable / quota / private mode — install anyway, we degrade to network-only.
      }
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith("fuelbook-") && !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key))
        );
      } catch {
        // ignore
      }
      try {
        await self.clients.claim();
      } catch {
        // ignore
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isCacheableResponse(response) {
  // Only basic (same-origin) 200 OK responses. Never opaque/cors responses: an opaque
  // response hides its status, so we could happily cache an error or a redirect.
  return !!response && response.status === 200 && response.type === "basic";
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    PRECACHE.includes(url.pathname)
  );
}

async function safeCachePut(cacheName, request, response) {
  try {
    if (!isCacheableResponse(response)) return;
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  } catch {
    // Caching is best-effort only; never let it affect what the page receives.
  }
}

async function safeCacheMatch(request) {
  try {
    return await caches.match(request);
  } catch {
    return undefined;
  }
}

// Cache-first — only for immutable, non-tenant-specific build output.
async function cacheFirst(request) {
  const cached = await safeCacheMatch(request);
  if (cached) return cached;
  const response = await fetch(request);
  await safeCachePut(STATIC_CACHE, request, response.clone());
  return response;
}

// Network-first for navigations. The network answer always wins, so a stale HTML shell is
// never preferred over a fresh one; the cache is only a fallback for a dead connection.
async function navigationNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await safeCachePut(SHELL_CACHE, request, response.clone());
    }
    return response;
  } catch {
    const cached = (await safeCacheMatch(request)) || (await safeCacheMatch(OFFLINE_URL));
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title><p>FuelBook is offline. Reconnect and try again.",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only ever touch plain GETs.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cross-origin (this includes the API origin, NEXT_PUBLIC_API_URL) — hands off.
  if (url.origin !== self.location.origin) return;

  // Same-origin API paths — hands off. See the tenancy note at the top of this file.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request).catch(() => fetch(request)));
  }

  // Everything else: let the browser do its normal thing.
});
