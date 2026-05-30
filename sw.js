// Service Worker — Kodachi Shop Manager PWA
const CACHE_NAME = 'kodachi-mgr-v1';

// File yang di-cache saat install (app shell)
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Sora:wght@300;400;500;600;700&display=swap'
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache satu per satu agar font gagal tidak batalkan semua
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: hapus cache lama ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first untuk API GAS, Cache-first untuk aset ─
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Apps Script & API calls → selalu network, jangan cache
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') && url.pathname.includes('/macros/') ||
    url.searchParams.has('action') ||
    url.searchParams.has('type')
  ) {
    event.respondWith(fetch(event.request).catch(() =>
      new Response(JSON.stringify({ status: 'error', message: 'Offline — tidak dapat terhubung ke server' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  // Font Google → cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // App shell (HTML, manifest, dsb) → Network-first, fallback cache
  event.respondWith(
    fetch(event.request).then(res => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return res;
    }).catch(() => caches.match(event.request))
  );
});
