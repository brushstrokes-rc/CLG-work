const CACHE_NAME = "brushstrokes-cache-v1";

// Saari files jo offline chahiye
const urlsToCache = [
  "./",
  "index.html",
  "brushstroke.css",
  "brushstroke.js",
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

// Fetch: pehle cache se try karo, na mile to internet se lao
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // agar dono fail ho (offline + cache mein nahi) to kuch nahi hoga
      });
    })
  );
});