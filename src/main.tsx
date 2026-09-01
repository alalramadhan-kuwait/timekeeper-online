import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from './lib/push';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// register the PWA service worker (production only — avoids clashing with dev HMR)
if (import.meta.env.PROD) registerSW();

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
