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
