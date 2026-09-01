/* Timekeeper service worker — Web Push + install shell. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Timekeeper';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: data.url || '#/inbox' },
    tag: data.tag || undefined,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '#/inbox';
  // normalize to a hash string like "#/purchase-orders?focus=123"
  let hash = raw.startsWith('/#') ? raw.slice(1) : raw;
  if (!hash.startsWith('#')) hash = '#' + (hash.startsWith('/') ? hash : '/' + hash);
  const scope = self.registration.scope; // https://host/timekeeper-online/
  const target = scope + hash;
  event.waitUntil((async () => {
    const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cls) {
      try { await c.focus(); } catch (_e) { /* ignore */ }
      // postMessage is what reliably re-routes an already-open PWA on iOS
      try { c.postMessage({ type: 'nav', hash }); } catch (_e) { /* ignore */ }
      try { if (c.navigate) await c.navigate(target); } catch (_e) { /* ignore */ }
      return;
    }
    await self.clients.openWindow(target);
  })());
});
