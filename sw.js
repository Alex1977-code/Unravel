'use strict';
// Offline-Betrieb: Beim ersten Besuch mit Netz werden alle Spieldateien abgelegt, danach startet das Spiel auch im
// Flugzeugmodus. Mit Netz kommt die Seite selbst immer frisch vom Server (neueste Version); Skripte und Bilder tragen
// einen Versionsstempel und kommen aus dem Speicher, solange es sie in dieser Version schon gibt.
// VERSION und FILES füllt der Pages-Build (tools/make-sw.js) aus.
const VERSION = 'dev';
const FILES = [];
const CACHE = 'fadenfreunde-' + VERSION;
const FONTS = /^fonts\.(googleapis|gstatic)\.com$/;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(FILES.map((f) => c.add(new Request(f, { cache: 'reload' }))))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fadenfreunde-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (key, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) return;
    // Die Seite selbst: zuerst das Netz, ohne Netz die abgelegte Fassung
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
      const key = url.origin + url.pathname;
      e.respondWith(
        fetch(req).then((r) => put(key, r)).catch(() =>
          caches.match(key).then((r) => r || caches.match(req, { ignoreSearch: true }))
            .then((r) => r || caches.match(new URL('index.html', self.registration.scope).href))
            .then((r) => r || caches.match(self.registration.scope))),
      );
      return;
    }
    // Skripte, Stile, Texturen: aus dem Speicher, sonst Netz (und ablegen), ohne Netz notfalls eine ältere Fassung
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => put(req, r)).catch(() => caches.match(req, { ignoreSearch: true }))),
    );
    return;
  }

  // Schriften von Google: einmal laden, danach aus dem Speicher
  if (FONTS.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(req, r))));
  }
});
