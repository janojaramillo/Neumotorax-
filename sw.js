/* Neumotórax Neo — service worker
   Navegación: red primero (con tiempo límite) y respaldo en caché → siempre abre, con o sin internet.
   Fuentes: caché oportunista. Cambie VERSION al publicar una nueva versión del index.html. */
const VERSION = 'ptx-neo-v1.0.0';
const CORE = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(CORE.map((u) =>
        fetch(u, { cache: 'reload' }).then((r) => { if (r.ok) return c.put(u, r); }).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Página principal: red primero (3,5 s), si falla → caché
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const fresh = await withTimeout(fetch(req), 3500);
        if (fresh && fresh.ok) { cache.put('./index.html', fresh.clone()); return fresh; }
        throw new Error('bad');
      } catch (e) {
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('<h1>Sin conexión</h1><p>Abra la app una vez con internet para guardarla.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // Google Fonts: caché primero, actualiza en segundo plano; nunca bloquea
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
    })());
    return;
  }

  // Resto del mismo origen: caché y luego red
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => {
        if (r && r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
        return r;
      }).catch(() => hit))
    );
  }
});
