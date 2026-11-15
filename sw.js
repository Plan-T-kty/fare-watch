/* Keeps the last seen copy of the app so it still opens without a connection. Always tries the network first. */
const CACHE = 'fare-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const key = url.origin + url.pathname;   // the data files are asked for with a changing ?t= value
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(key).then(hit => hit || Response.error()))
  );
});
