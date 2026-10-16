/* The Dennison boutique pilot, run locally: npm run world:pilot (serve) or
   npm run world:pilot -- build (a static copy in dist-world-pilot/).
   It needs WORLD_PILOT_DATA: a folder holding fixture.json (a read-only snapshot of the World's
   functions) and img/ (the watches' Lightspeed photos, <product id>-t.png and -v.png). That data is
   never committed. Supabase is pointed at a host that does not exist, and preview/world-pilot/mock.ts
   answers in its place. */
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const data = process.env.WORLD_PILOT_DATA;
if (!data || !fs.existsSync(path.join(data, 'fixture.json'))) throw new Error('Set WORLD_PILOT_DATA to the folder holding fixture.json and img/');

const files = (): Record<string, () => Buffer> => {
  const out: Record<string, () => Buffer> = { 'fixture.json': () => fs.readFileSync(path.join(data, 'fixture.json')) };
  const img = path.join(data, 'img');
  const names = fs.existsSync(img) ? fs.readdirSync(img).filter((n) => /\.(png|jpe?g|webp)$/.test(n)) : [];
  for (const n of names) out[`img/${n}`] = () => fs.readFileSync(path.join(img, n));
  const ids = [...new Set(names.filter((n) => n.endsWith('-t.png')).map((n) => n.slice(0, -6)))];
  out['img/index.json'] = () => Buffer.from(JSON.stringify(ids));
  return out;
};

const pilotData = (): Plugin => ({
  name: 'world-pilot-data',
  configureServer(server) {
    const all = files();
    server.middlewares.use((req, res, next) => {
      const key = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
      const f = all[key];
      if (!f) return next();
      res.setHeader('content-type', key.endsWith('.json') ? 'application/json' : 'image/png');
      res.end(f());
    });
  },
  generateBundle() {
    for (const [fileName, f] of Object.entries(files())) this.emitFile({ type: 'asset', fileName, source: f() });
  },
});

export default defineConfig({
  root: path.resolve(__dirname, 'preview/world-pilot'),
  base: './',
  envDir: path.resolve(__dirname, 'preview/world-pilot'),     // no .env there: the real project's address never enters the build
  publicDir: false,
  plugins: [react(), pilotData()],
  define: {
    __BUILD_SHA__: JSON.stringify('pilot'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://mock.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('preview-anon-key'),
  },
  server: { host: true, port: 5180 },
  build: {
    outDir: path.resolve(__dirname, 'dist-world-pilot'), emptyOutDir: true,
    assetsInlineLimit: (file: string) => (file.includes('/src/world/') ? false : undefined),
  },
});
