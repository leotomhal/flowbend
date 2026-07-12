// flowbend Service Worker – echte Offline-Fähigkeit inkl. App-Runtime.
// Strategie:
//  - App-Shell (HTML/JS/Dexie/Icon): cache-first, damit die App auch beim
//    ersten Start ohne Netz aus dem Cache lädt (sobald einmal installiert).
//  - Daten (data/*.json): network-first mit Cache-Fallback, damit Änderungen
//    an poses/routines sofort greifen, aber offline die letzte Kopie bleibt.
const CACHE = "flowbend-1.2.0"; // wird beim Release automatisch auf den Tag gesetzt
const SHELL = [
  ".",
  "index.html",
  "app.js",
  "manifest.json",
  "vendor/dexie.min.js",
  "img/icon-192.png",
  "img/icon-512.png",
  "data/poses.json",
  "data/routines.json"
];

self.addEventListener("install", (event) => {
  // Kein sofortiges skipWaiting: der neue Worker wartet, bis die App das Update freigibt.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

// Die App gibt den wartenden Worker per Button frei ("Aktualisieren").
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isData = url.pathname.endsWith("/poses.json") || url.pathname.endsWith("/routines.json");

  if (isData) {
    // network-first
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // cache-first für die App-Shell
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => cached))
  );
});
