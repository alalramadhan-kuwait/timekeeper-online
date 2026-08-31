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
  const path = (event.notification.data && event.notification.data.url) || '';
  const scope = self.registration.scope; // e.g. https://host/timekeeper-online/
  let target;
  if (path.startsWith('/#')) target = scope + path.slice(1);
  else if (path.startsWith('#')) target = scope + path;
  else target = new URL(path || '.', scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      for (const c of cls) { if ('focus' in c) { if (c.navigate) c.navigate(target); return c.focus(); } }
      return self.clients.openWindow(target);
    })
  );
});
