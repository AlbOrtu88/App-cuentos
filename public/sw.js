// Service worker: guarda la interfaz para que abra rápido y sin conexión.
// La API y los cuentos (/api, /media) van a la red; sin conexión se sirven los cuentos
// que el VIP guardó en el dispositivo (caché 'cuentos-offline', la llena app.js).
const CACHE = 'cuentos-v11';
const OFFLINE = 'cuentos-offline';
const SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/icon.svg', '/img/cabecera.webp', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== OFFLINE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/media/') || /^\/api\/story\/[a-f0-9-]{36}$/.test(url.pathname)) {
    event.respondWith(fetch(event.request).catch(() => fromOffline(event.request)));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;

  // Red primero para tener siempre la última versión; si no hay conexión, la copia guardada.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/'))),
  );
});

// Respuesta guardada para escuchar sin conexión. Los navegadores piden el audio por
// trozos (Range), así que se contesta con el trozo pedido.
async function fromOffline(request) {
  const cache = await caches.open(OFFLINE);
  const hit = await cache.match(request.url);
  if (!hit) return Response.error();
  const range = request.headers.get('Range');
  if (!range) return hit;
  const buf = await hit.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const start = m && m[1] ? parseInt(m[1], 10) : 0;
  const end = m && m[2] ? Math.min(parseInt(m[2], 10), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
