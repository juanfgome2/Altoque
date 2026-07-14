const CACHE_NAME = "altoque-app-shell-v34";
const APP_SHELL = [
  "/",
  "/index.html",
  "/Stylo.css",
  "/manifest.json",
  "/icons/altoque-icon-192.png",
  "/icons/altoque-icon-512.png",
  "/icons/altoque-maskable-192.png",
  "/icons/altoque-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/js/app.js",
  "/js/dom.js",
  "/js/firebase-config.js",
  "/js/firebase.js",
  "/js/format.js",
  "/js/render.js",
  "/js/router.js",
  "/js/services.js",
  "/js/state.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  const url = new URL(event.request.url);
  const isCriticalAsset =
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname === "/service-worker.js";

  if (isCriticalAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) =>
      cachedResponse || fetch(event.request).then((response) => {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        return response;
      })
    )
  );
});
