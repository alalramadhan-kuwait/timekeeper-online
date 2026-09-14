/* Everything the app needs to behave like something installed rather than a
   page that happens to be open: the browser's own zoom refused, the place you
   were remembered, and a new version offered rather than imposed. */

import { isStandalone } from './pwaInstall';

/* ── zoom ─────────────────────────────────────────────────────────
   The viewport tag says the interface does not scale, and Chrome
   obeys it. Safari decided years ago to ignore user-scalable, so the
   gesture events are refused here too. Double tap is handled in the
   stylesheet by touch-action: manipulation, which is the right way
   round — refusing it here would mean swallowing the second of two
   quick taps on the same button. */
function refuseZoom() {
  const stop = (e: Event) => e.preventDefault();
  (['gesturestart', 'gesturechange', 'gestureend'] as const).forEach((t) =>
    document.addEventListener(t, stop, { passive: false }),
  );
  /* ctrl/⌘ with the wheel is the trackpad pinch — refused on a touch device,
     left alone on a desktop. Zooming a page of dense tables with a keyboard or
     a trackpad is a reasonable thing to do at a desk, and taking it away would
     be an accessibility loss for no gain: the complaint this answers is the
     phone in a pocket, not the laptop. */
  if (window.matchMedia('(pointer: coarse)').matches) {
    window.addEventListener(
      'wheel',
      (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); },
      { passive: false },
    );
  }
}

/* ── where you were ───────────────────────────────────────────────
   Closing the app from the home screen and opening it again used to
   land on the dashboard whatever you had been doing. The route is
   remembered and restored — but only when the app was opened cold at
   its start URL, so a link, a notification or a typed address always
   wins, and only for a shift's length, because coming back the next
   morning to yesterday's half-read page is worse than starting at the
   top. */
const ROUTE_KEY = 'tk:lastRoute';
const ROUTE_TTL = 8 * 60 * 60 * 1000;

function rememberRoute() {
  const save = () => {
    const h = window.location.hash;
    if (!h || h === '#/' ) return;
    try { localStorage.setItem(ROUTE_KEY, JSON.stringify({ hash: h, at: Date.now() })); } catch { /* private mode */ }
  };
  window.addEventListener('hashchange', save);
  // a route change inside the app does not always fire hashchange in time
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  setInterval(save, 5000);
}

export function restoreRoute() {
  const h = window.location.hash;
  if (h && h !== '#/' && h !== '#') return;          // asked for somewhere specific
  if (!isStandalone()) return;                        // a browser tab keeps browser behaviour
  try {
    const raw = localStorage.getItem(ROUTE_KEY);
    if (!raw) return;
    const { hash, at } = JSON.parse(raw) as { hash: string; at: number };
    if (!hash || typeof at !== 'number' || Date.now() - at > ROUTE_TTL) return;
    window.location.replace(window.location.pathname + window.location.search + hash);
  } catch { /* nothing to restore */ }
}

/* ── a new version ────────────────────────────────────────────────
   The worker installs the new build in the background and waits. The
   app says so and reloads only when asked, because a dashboard that
   reloads itself while someone is typing into a form is worse than one
   that is a version behind for another minute. */
let bar: HTMLElement | null = null;
let reloading = false;

function updateBar(onTake: () => void) {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.id = 'tk-update';
  bar.innerHTML =
    '<span>A new version is ready.</span>' +
    '<button type="button" class="tk-go">Update</button>' +
    '<button type="button" class="tk-later">Later</button>';
  document.body.appendChild(bar);
  bar.querySelector('.tk-go')!.addEventListener('click', onTake);
  bar.querySelector('.tk-later')!.addEventListener('click', () => bar!.classList.remove('tk-show'));
  return bar;
}

export function watchForUpdates(reg: ServiceWorkerRegistration) {
  const take = () => {
    const w = reg.waiting;
    if (!w) { window.location.reload(); return; }
    reloading = true;
    w.postMessage({ type: 'SKIP_WAITING' });
    // controllerchange is the proper signal; this covers a browser that never sends it
    setTimeout(() => { if (reloading) window.location.reload(); }, 2500);
  };
  const offer = () => {
    const el = updateBar(take);
    void el.offsetHeight;
    el.classList.add('tk-show');
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) { reloading = false; window.location.reload(); }
  });

  // already waiting from an earlier visit; controller is null on a first install,
  // and that one is not an update to announce
  if (reg.waiting && navigator.serviceWorker.controller) offer();
  reg.addEventListener('updatefound', () => {
    const nw = reg.installing;
    if (!nw) return;
    nw.addEventListener('statechange', () => {
      if (nw.state === 'installed' && navigator.serviceWorker.controller) offer();
    });
  });

  // coming back to the app is the natural moment to find out whether it moved on
  let last = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - last < 9e5) return;             // a quarter of an hour
    last = Date.now();
    reg.update().catch(() => {});
  });
}

export function initPlatform() {
  refuseZoom();
  rememberRoute();
}
