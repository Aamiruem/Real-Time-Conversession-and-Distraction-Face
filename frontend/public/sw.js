// Presence AI service worker: makes the app installable, opens instantly on repeat visits and shows the app
// shell offline. Never caches the API, WebSockets or anything personal.
const VERSION = "presence-v1";
const SHELL = ["/app.html", "/icon.svg", "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = async (req) => {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) return; // always live

  // hashed build files and AI models never change under the same name: serve from cache, fetch once
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/mediapipe/")) {
    e.respondWith(cacheFirst(req));
    return;
  }
  // pages: always the newest version when online, the cached app shell when offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(async () => (await caches.match(req)) ?? (await caches.match("/app.html")) ?? Response.error()),
    );
  }
});
