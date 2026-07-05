const STATIC_CACHE = "flashcard-static-v15";
const IMAGE_CACHE = "flashcard-images-v2";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./js/app.js",
  "./js/constants.js",
  "./js/storage.js",
  "./js/db.js",
  "./js/api.js",
  "./js/sync.js",
  "./js/ui.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== IMAGE_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((networkResponse) => {
          if (request.method === "GET") {
            caches
              .open(STATIC_CACHE)
              .then((cache) => {
                try {
                  const clone = networkResponse.clone();
                  return cache.put(request, clone);
                } catch {
                  return Promise.resolve();
                }
              })
              .catch(() => Promise.resolve());
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Google Drive images are intentionally not intercepted here.
  // iOS Safari is more reliable when Drive image requests are handled directly by the browser.
});
