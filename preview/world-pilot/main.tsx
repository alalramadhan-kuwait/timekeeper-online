/* The Dennison boutique pilot, run locally against a read-only snapshot (see mock.ts). Not a
   site: npm run world:pilot serves it, and nothing it does reaches the real project. */
import { installMock } from './mock';
import '../../src/index.css';

async function start() {
  const fx = await fetch('./fixture.json').then((r) => r.json());
  // every watch the image check found a Lightspeed photo for, served from the snapshot's img/ folder
  const have: string[] = await fetch('./img/index.json').then((r) => r.json(), () => []);
  const has = new Set(have);
  for (const p of fx.boutique.products) {
    if (!p.image && has.has(p.product_id)) p.image = { thumb: `./img/${p.product_id}-t.png`, view: `./img/${p.product_id}-v.png`, source: 'lightspeed' };
  }
  installMock(fx);
  const [{ createRoot }, { HashRouter }, { default: WorldPage }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('../../src/world/WorldPage'),
  ]);
  createRoot(document.getElementById('root')!).render(
    <HashRouter><WorldPage onClose={() => alert('In the app, this returns to TK Online.')} /></HashRouter>,
  );
}
start();
