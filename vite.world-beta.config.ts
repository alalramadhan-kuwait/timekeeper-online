/* Time Keeper World private beta: a separate static site with its own address
   (alalramadhan-kuwait.github.io/timekeeper-online/world-beta/), built from
   this repository's World code and committed to main as static files under
   public/world-beta/: TK Online's own code never includes the World. Build:
   npm run world:beta (output in dist-world-beta/).
   The same build makes the Watch Mall preview beside it, at .../world-mall/:
   npm run world:mall (output in dist-world-mall/). */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const site = process.env.WORLD_SITE === 'world-mall' ? 'world-mall' : 'world-beta';
const title = site === 'world-mall' ? 'Watch Mall · preview' : 'Time Keeper World · beta';

export default defineConfig({
  root: path.resolve(__dirname, 'beta/world'),
  base: `/timekeeper-online/${site}/`,
  envDir: __dirname,
  publicDir: false,
  plugins: [react(), { name: 'site-title', transformIndexHtml: (html) => html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`) }],
  define: { __BUILD_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7)) },
  build: {
    outDir: path.resolve(__dirname, `dist-${site}`), emptyOutDir: true,
    // as in the main config: Phaser cannot load the World's art as inline data, so it stays as files
    assetsInlineLimit: (file: string) => (file.includes('/src/world/') ? false : undefined),
  },
});
