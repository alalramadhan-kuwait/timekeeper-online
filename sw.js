/* Timekeeper service worker — the app shell held offline, Web Push, and a new
   version offered rather than imposed.

   PRECACHE is rewritten at build time with the hashed filenames Vite emits,
   which is also what makes this file differ between builds — the only signal a
   browser uses to decide a worker has changed. */
const BUILD = '1f258687457d';
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./assets/index-0Xfoj8cT.css",
  "./assets/index-cU8PekuQ.js"
];
const CACHE = 'tk-' + BUILD;

self.addEventListener('install', (event) => {
  /* Deliberately no skipWaiting: the running page is asked first, so an update
     cannot replace the app underneath someone halfway through a form. */
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async (u) => {
      // cache:"reload" so a stale copy in the HTTP cache cannot be installed as the new one
      try { c.put(u, await fetch(new Request(u, { cache: 'reload' }))); } catch (_e) { /* one missing file must not fail the install */ }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('tk-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* What is safe to serve from a cache, and what is never.

   The shell — the HTML and Vite's content-hashed JavaScript and CSS — is
   immutable for a given build, so it is served from the cache and the app opens
   at once, with or without a network.

   Everything the app reads while it runs is live business data from Supabase.
   A cached sales figure is not a faster answer, it is a wrong one, so those
   requests are cross-origin and never touched here. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_e) { return; }
  if (url.origin !== self.location.origin) return;         // Supabase, and anything else

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
      try { return await fetch(req); }
      catch (_e) {
        return new Response('Offline, and Timekeeper is not installed on this device yet.',
          { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
      return res;
    } catch (_e) {
      return hit || new Response('', { status: 504 });
    }
  })());
});

/* ── Web Push — unchanged ────────────────────────────────────────── */
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
