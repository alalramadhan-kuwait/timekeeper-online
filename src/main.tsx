import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
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
    <App />
  </React.StrictMode>,
);

// register the PWA service worker (production only — avoids clashing with dev HMR)
if (import.meta.env.PROD) {
  registerSW().then((reg) => { if (reg) watchForUpdates(reg); });
}

// when a notification is tapped, the service worker tells us where to go (reliable on iOS)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.type === 'nav' && typeof d.hash === 'string') {
      const h = d.hash.startsWith('#') ? d.hash.slice(1) : d.hash;
      if (window.location.hash !== `#${h}`) window.location.hash = h;
    }
  });
}
