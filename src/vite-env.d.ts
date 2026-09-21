/// <reference types="vite/client" />

/** Set once React has rendered, so the boot failsafe in index.html stands down. */
interface Window { __booted?: boolean }
