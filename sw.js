const CACHE_NAME = "brushstrokes-cache-v18.3";

// Saari files jo offline chahiye
const urlsToCache = [
  "./",
  "index.html",
  "brushstroke.css",
  "app-shell.css",
  "brushstroke.js",
  "app-shell.js",
  "attendance-view.js",
  "manifest.json",
  "brushstroke.icon.jpeg"
];

// Install: files cache mein daalo
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate: purane cache versions delete karo
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: pehle internet se try karo, offline ho to cache se lao
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});