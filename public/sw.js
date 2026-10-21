// Service worker minimal : rend l'app installable et utilisable hors ligne
// (la lecture des reçus, elle, a besoin du réseau).
const CACHE = "scan-depenses-v1";
const SCOPE = "/scan-depenses/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([SCOPE, SCOPE + "index.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Ne jamais mettre en cache les appels API
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Réseau d'abord, cache en secours
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match(SCOPE + "index.html")))
  );
});
