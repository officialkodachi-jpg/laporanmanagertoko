// Service Worker — Kodachi Shop Manager PWA
// Ganti versi ini setiap upload file baru ke GitHub → PWA otomatis update
const CACHE_VERSION = 'v2';
const CACHE_NAME = 'kodachi-mgr-' + CACHE_VERSION;
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Sora:wght@300;400;500;600;700&display=swap'
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    })
    // skipWaiting dipanggil manual setelah user tap "Update"
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

// ── Message: terima perintah dari halaman ─────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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

// ── Background Keepalive: kirim ping ke app tiap 60 detik ─────
// Tujuan: walau app di-minimize (PWA iOS/Android), SW masih hidup
// dan bisa membangunkan app untuk cek router toko & push lokasi.
// iOS memberi SW window ~30 detik per siklus background — cukup untuk ping.
function bgPing() {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'bg-ping', ts: Date.now() });
      });
    });
}

// Mulai 10 detik setelah SW aktif, lalu looping tiap 60 detik
setTimeout(function loop() {
  bgPing();
  setTimeout(loop, 60 * 1000);
}, 10 * 1000);

// ── Periodic Background Sync (Chrome Android) ─────────────────
// Kalau browser support, ini lebih andal dari setTimeout di atas
self.addEventListener('periodicsync', event => {
  if (event.tag === 'loc-keepalive') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        .then(clients => clients.forEach(c => c.postMessage({ type: 'bg-ping', ts: Date.now() })))
    );
  }
});
