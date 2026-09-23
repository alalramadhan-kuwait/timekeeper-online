import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/* The service worker ships as a plain file in public/, because it has to be
   served from the site root to control the whole app and must not go through
   the module pipeline. But it cannot know Vite's content-hashed filenames until
   the build has run, so they are written into it here.
 *
 * The build id is a hash of that list, which means it changes when — and only
 * when — the output changes. That is what a browser compares to decide a worker
 * is new, so an unchanged build never nags anyone about an update, and a changed
 * one always reaches them. */
function serviceWorkerManifest(): Plugin {
  return {
    name: 'tk-service-worker-manifest',
    apply: 'build',
    enforce: 'post',
    writeBundle(options, bundle) {
      const out = options.dir ?? 'dist';
      const sw = resolve(out, 'sw.js');
      if (!existsSync(sw)) return;

      const assets = Object.keys(bundle)
        .filter((f) => /\.(js|css)$/.test(f))
        .sort()
        .map((f) => './' + f);

      const precache = [
        './',
        './index.html',
        './manifest.webmanifest',
        './icon-192.png',
        './icon-512.png',
        './icon-maskable-512.png',
        './apple-touch-icon.png',
        ...assets,
      ];

      const build = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);

      let src = readFileSync(sw, 'utf8');
      src = src.replace("const BUILD = '__BUILD__';", `const BUILD = '${build}';`);
      src = src.replace(
        /const PRECACHE = \[[^\]]*\];/,
        'const PRECACHE = ' + JSON.stringify(precache, null, 2) + ';',
      );
      if (src.includes('__BUILD__')) {
        throw new Error('the service worker build placeholder was not replaced');
      }
      writeFileSync(sw, src);
      // eslint-disable-next-line no-console
      console.log(`  service worker: build ${build}, ${precache.length} files precached`);
    },
  };
}

/* The exact build, shown after the version so anyone can tell whether a fresh
   deploy has reached their phone. CI sets GITHUB_SHA; a local build shows the
   version alone. The shop app has done this since it had a version at all. */
const buildSha = (process.env.GITHUB_SHA ?? '').slice(0, 7);

export default defineConfig(({ command }) => ({
  plugins: [react(), serviceWorkerManifest()],
  // GitHub Pages serves under /timekeeper-online/; keep dev at /
  base: command === 'build' ? '/timekeeper-online/' : '/',
  server: { port: 5180 },
  define: { __BUILD_SHA__: JSON.stringify(buildSha) },
}));
