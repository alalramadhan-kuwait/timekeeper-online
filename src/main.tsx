import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import { registerSW } from './lib/push';
import './lib/pwaInstall'; // capture the browser install prompt early
import { initPlatform, restoreRoute, watchForUpdates } from './lib/platform';

// Before React renders: refuse the browser's own zoom, and put the app back on
// the page it was left on. Restoring the route first means the router mounts
// straight onto it rather than rendering the dashboard and then moving.
initPlatform();
restoreRoute();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

/* Tell the failsafe in index.html that the app is up, so it stands down — and
   clear the repair flag, so a failure weeks from now is still allowed its one
   silent recovery. */
window.__booted = true;
try { sessionStorage.removeItem('tk:recovering'); } catch { /* private mode */ }

// register the PWA service worker (production only — avoids clashing with dev HMR)
if (import.meta.env.PROD) {
  registerSW().then((reg) => { if (reg) watchForUpdates(reg); });
}

// when a notification is tapped, the service worker tells us where to go (reliable on iOS)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data;
    /* The worker found this device asking for a file the server no longer has,
       which means the shell it is running belongs to a replaced build. It has
       already thrown the stale cache away; the reload lands on the current one. */
    if (d && d.type === 'stale-shell') { window.location.reload(); return; }
    if (d && d.type === 'nav' && typeof d.hash === 'string') {
      const h = d.hash.startsWith('#') ? d.hash.slice(1) : d.hash;
      if (window.location.hash !== `#${h}`) window.location.hash = h;
    }
  });
}
