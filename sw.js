/* Timekeeper service worker — the app shell held offline, Web Push, and a new
   version offered rather than imposed.

   PRECACHE is rewritten at build time with the hashed filenames Vite emits,
   which is also what makes this file differ between builds — the only signal a
   browser uses to decide a worker has changed. */
const BUILD = 'e389328f9e88';
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./assets/Ads-JnUTI3lr.js",
  "./assets/AssignTasks-Dd56xJK-.js",
  "./assets/Attendance-BUUdHjoE.js",
  "./assets/ClientAds-qrI-7RP6.js",
  "./assets/Crm-CqLtqfkR.js",
  "./assets/CrudModule-_AIXXozH.js",
  "./assets/FollowUps-DHpVxdqg.js",
  "./assets/HistoryLog-DFqsZUZk.js",
  "./assets/Inbox-xgFIUDCA.js",
  "./assets/InfluencerProfile-CRmcDlD0.js",
  "./assets/Instagram-C-UdZ3O5.js",
  "./assets/Leave-3Ra3o9t6.js",
  "./assets/MarketingOverview-BrPlAM4B.js",
  "./assets/MetaHealth-DyM6jU4B.js",
  "./assets/MyPortal-Cu8mCOds.js",
  "./assets/NotificationSettings-DCXt6ca9.js",
  "./assets/Notifications-BLU8sIzY.js",
  "./assets/OpenShifts-edu8DIV1.js",
  "./assets/Payroll-Cb8bykRW.js",
  "./assets/Performance-B6MCScXe.js",
  "./assets/PurchaseOrders-GN8cSDM4.js",
  "./assets/Sales-Dfc1C5r_.js",
  "./assets/Settings-Bkj1nygk.js",
  "./assets/Stock-Dvtk1INi.js",
  "./assets/UserActivity-B673nkGN.js",
  "./assets/WhatsAppSheet-BQ85uV9h.js",
  "./assets/arrow-left-DjU_Nxdy.js",
  "./assets/calendar-clock-GwC7qVF0.js",
  "./assets/calendar-days-CgbrSVxe.js",
  "./assets/check-circle-DbqlZnOd.js",
  "./assets/chevron-up-j9MBq2GV.js",
  "./assets/chevrons-up-down-C2lkiua1.js",
  "./assets/clock-BqVdSqZB.js",
  "./assets/copy-BBq-eqy_.js",
  "./assets/file-text-XRAwtmD9.js",
  "./assets/getDay-DwaGprWn.js",
  "./assets/gift-DZ_YZlUf.js",
  "./assets/index-Da-BtzD9.js",
  "./assets/index-DnhN-AP1.css",
  "./assets/lateness-D3mSlk8W.js",
  "./assets/loader-2-C5T0oiLR.js",
  "./assets/locationType-Qvt4UEkh.js",
  "./assets/map-pin-BshA0Ia8.js",
  "./assets/message-circle-ogTPc9Cu.js",
  "./assets/modules-C_4gScwS.js",
  "./assets/pencil-Ct47VBOq.js",
  "./assets/phoneRules-g-3eP6Si.js",
  "./assets/refresh-cw-yCD-HP2J.js",
  "./assets/roles-Dj3F5JJE.js",
  "./assets/search-ZWNx5_Z7.js",
  "./assets/subMonths-3jdNrG0O.js",
  "./assets/trash-2-kgOLEkzN.js",
  "./assets/undo-2-H-J1-5Ex.js",
  "./assets/user-plus-GtjOfdPs.js"
];
const CACHE = 'tk-' + BUILD;

/* How long a navigation waits for the server before falling back to the copy on
   the device. Long enough for a phone on a shop's connection, short enough that
   nobody is left looking at nothing. */
const SHELL_TIMEOUT_MS = 3500;

/* The files without which the app is not an app. Icons and the manifest are
   nice to have offline; the HTML and Vite's hashed JavaScript and CSS are the
   difference between a working install and a blank screen. */
const essential = (u) => u === './' || u === './index.html' || /\.(js|css)$/.test(u);

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('install', (event) => {
  /* Deliberately no skipWaiting: the running page is asked first, so an update
     cannot replace the app underneath someone halfway through a form. */
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);

    /* Store only what the server actually returned, and wait for the write.
       Both halves of that were bugs, and together they are how a phone ended up
       serving a page whose scripts were missing. A 404 or a 503 — which is what
       GitHub Pages hands out for the seconds a deploy is landing — is a
       Response like any other, so it was cached as though it were the app. And
       because the put was never awaited, a worker killed straight after install
       (iOS does this readily) left the shell cached without the JavaScript it
       asks for. */
    const store = async (u) => {
      const res = await fetch(new Request(u, { cache: 'reload' }));
      if (!res.ok) throw new Error(u + ' -> ' + res.status);
      await c.put(u, res);
    };

    /* The shell installs completely or not at all. Failing here is the good
       outcome: the worker already running stays in charge, which is a working
       old version rather than a broken new one. */
    await Promise.all(PRECACHE.filter(essential).map(store));
    await Promise.all(PRECACHE.filter((u) => !essential(u)).map((u) => store(u).catch(() => {})));
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

/* This device is running a shell older than the site.

   Every deploy rebuilds the published branch from scratch, so the previous
   build's hashed filenames are gone from the server. A page holding on to one
   of them cannot be rescued — the script it needs does not exist anywhere any
   more. So throw the stale cache away and tell the app to start again; the
   reload lands on the build that is actually published. */
let recovering = false;
async function recoverFromStaleShell() {
  if (recovering) return;
  recovering = true;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('tk-')).map((k) => caches.delete(k)));
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const w of windows) { try { w.postMessage({ type: 'stale-shell' }); } catch (_e) { /* gone */ } }
}

/* What is safe to serve from a cache, and what is never.

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
      /* The server first, with a deadline.

         This used to answer every navigation from the cache and never ask the
         server again. A phone therefore stayed on whichever build it had until
         somebody noticed the update bar and tapped it — and because each deploy
         deletes the previous build's hashed files, that shell was asking for
         JavaScript the server no longer had. The 404 came back, nothing ran,
         and the result was a white page: silent, and survivable only by using a
         browser with no service worker at all.

         Offline still opens instantly. The cached shell is the fallback, and it
         is deliberately not overwritten with what the network returns, so it
         stays paired with the assets precached alongside it. */
      try {
        const fresh = await withTimeout(fetch(req), SHELL_TIMEOUT_MS);
        if (fresh && fresh.ok) return fresh;
      } catch (_e) { /* offline, or slower than the deadline */ }

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
      if (res && res.ok && res.type === 'basic') await c.put(req, res.clone());
      if (res && res.status === 404 && /\.(js|css)$/.test(url.pathname)) await recoverFromStaleShell();
      return res;
    } catch (_e) {
      return new Response('', { status: 504 });
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
