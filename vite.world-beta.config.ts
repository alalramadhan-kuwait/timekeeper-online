/* Time Keeper World private beta: a separate static site with its own address
   (alalramadhan-kuwait.github.io/tk-world-beta/), built from this repository's
   World code and published to its own repository, so TK Online's deploy is
   never involved. Build: npm run world:beta (output in dist-world-beta/). */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname, 'beta/world'),
  base: '/tk-world-beta/',
  envDir: __dirname,
  publicDir: false,
  plugins: [react()],
  define: { __BUILD_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7)) },
  build: {
    outDir: path.resolve(__dirname, 'dist-world-beta'), emptyOutDir: true,
    // as in the main config: Phaser cannot load the World's art as inline data, so it stays as files
    assetsInlineLimit: (file: string) => (file.includes('/src/world/') ? false : undefined),
  },
});
