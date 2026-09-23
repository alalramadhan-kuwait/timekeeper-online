/// <reference types="vite/client" />

/** Set once React has rendered, so the boot failsafe in index.html stands down. */
interface Window { __booted?: boolean }

/** The deployed commit, seven characters; empty in a local build. */
declare const __BUILD_SHA__: string;
