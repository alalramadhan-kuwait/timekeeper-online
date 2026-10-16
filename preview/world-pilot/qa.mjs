// Dennison pilot QA on an iPhone 13 viewport, against the local preview (npm run world:pilot) and its mock:
// nothing reaches Supabase or Lightspeed. Needs playwright. Usage: node preview/world-pilot/qa.mjs <outdir> [test]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2];
const ONLY = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const APP = 'http://localhost:5180/';
const results = [];
const log = (t, ok, detail) => { results.push({ test: t, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', t, JSON.stringify(detail)); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function page({ query = '', routes } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.outbound = [];
  p.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://localhost') && !u.startsWith('blob:') && !u.startsWith('data:')) p.outbound.push(u); });
  if (routes) await routes(p);
  await p.goto(APP + query);
  await p.evaluate(() => { localStorage.removeItem('world-pilot-desk'); localStorage.setItem('tk-world-board-hint', '1'); });
  await p.waitForSelector('text=Mohammed suggests', { timeout: 90000 });
  await p.waitForTimeout(1500);
  return p;
}
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
const S = (p, fn, arg) => p.evaluate(fn, arg);
const view = (p) => S(p, () => {
  const s = window.__tkWorld.scene.getScene('world'); const c = s.cameras.main;
  const sel = s.chosen?.active ? s.chosen.getData('sel') : null;
  return { room: s.room, x: Math.round(c.midPoint.x * 10) / 10, y: Math.round(c.midPoint.y * 10) / 10, zoom: Math.round(c.zoom * 1000) / 1000,
    ring: s.selectRing.visible, sel: sel ? `${sel.type}:${sel.brand ?? sel.id ?? ''}` : null };
});
// the camera at rest: no glide running and not moving for half a second (this machine draws a few
// frames a second without a GPU, so a 0.6 s glide takes several seconds here)
async function settle(p, max = 40000) {
  const t0 = Date.now(); let last = null, still = 0;
  while (Date.now() - t0 < max) {
    const v = await S(p, () => { const s = window.__tkWorld.scene.getScene('world'); const c = s.cameras.main; return { busy: c.panEffect.isRunning || c.zoomEffect.isRunning || c.fadeEffect.isRunning, x: c.midPoint.x, y: c.midPoint.y, z: c.zoom }; });
    if (!v.busy && last && Math.abs(v.x - last.x) < 0.05 && Math.abs(v.y - last.y) < 0.05 && Math.abs(v.z - last.z) < 1e-5) { still += 250; if (still >= 500) return Date.now() - t0; } else still = 0;
    last = v; await p.waitForTimeout(250);
  }
  return -1;
}
const panelOpen = async (p) => (await p.getByRole('button', { name: /Step inside Dennison/ }).count()) > 0;
async function openDennisonPanel(p) {
  await p.getByRole('button', { name: 'Find a brand' }).click();
  await p.getByText('Dennison', { exact: true }).first().click();
  await p.waitForTimeout(1000);
  await settle(p);
}
async function enterByButton(p) {
  await p.getByRole('button', { name: /Step inside Dennison/ }).click();
  await p.waitForSelector('text=Dennison boutique', { timeout: 60000 });
  await p.waitForTimeout(2000);
}
const leaveToMall = async (p) => { await p.getByRole('button', { name: /^Mall$/ }).click(); await p.waitForTimeout(1000); await settle(p); };
const same = (a, b) => a.room === b.room && Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5 && Math.abs(a.zoom - b.zoom) <= 0.001 && a.sel === b.sel && a.ring === b.ring;
const visibleCard = (p) => S(p, () => { for (const b of document.querySelectorAll('[role=dialog] .grid-cols-2 button')) { const r = b.getBoundingClientRect(); if (r.top > 150 && r.bottom < innerHeight - 10) return { x: r.x + r.width / 2, y: r.y + r.height / 2, name: b.innerText.split('\n')[0] }; } return null; });
const bodyTop = (p) => S(p, () => document.querySelector('[role=dialog] .overflow-y-auto.min-h-0, [role=dialog] [class*="overflow-y-auto"]')?.scrollTop ?? -1);
const catBody = (p, fn) => S(p, fn);

const tests = {
  // 1. back to the mall exactly as it was
  async returnFromPanel() {
    const p = await page();
    await openDennisonPanel(p);
    const before = await view(p); const pBefore = await panelOpen(p);
    await shot(p, '1a-mall-before');
    await enterByButton(p);
    await leaveToMall(p);
    const after = await view(p); const pAfter = await panelOpen(p);
    await shot(p, '1b-mall-after');
    log('return to mall from the brand panel: camera, zoom, selection and panel', same(before, after) && pBefore && pAfter, { before, after, panelBefore: pBefore, panelAfter: pAfter });
    await p.context().close();
  },
  async returnFromDoor() {
    const p = await page();
    await openDennisonPanel(p);
    await p.getByRole('button', { name: 'Close' }).click();
    await p.waitForTimeout(1500);
    await settle(p);
    await S(p, () => { const c = window.__tkWorld.scene.getScene('world').cameras.main; c.scrollY -= 420; });
    await settle(p);
    const before = await view(p);
    const door = await S(p, () => {
      const s = window.__tkWorld.scene.getScene('world'); const c = s.cameras.main; const k = s.game.canvas.width / s.game.canvas.clientWidth;
      const walk = (l) => { for (const o of l) { const sel = o.getData?.('sel'); if (sel?.type === 'boutique-door' && o.type === 'Rectangle') return o; if (o.list) { const r = walk(o.list); if (r) return r; } } };
      const b = walk(s.children.list).getBounds(); return { x: (b.centerX - c.worldView.x) * c.zoom / k, y: (b.centerY - c.worldView.y) * c.zoom / k };
    });
    await p.touchscreen.tap(door.x, door.y);
    await p.waitForSelector('text=Dennison boutique', { timeout: 30000 });
    await p.waitForTimeout(2000);
    await leaveToMall(p);
    const after = await view(p); const pAfter = await panelOpen(p);
    log('return to mall after entering by the doormat: camera and zoom, no panel', same(before, after) && !pAfter, { before, after, panelAfter: pAfter });
    await p.context().close();
  },
  // 1 + 6. through the catalogue, a watch, the dock and back, then out
  async journey() {
    const p = await page();
    await openDennisonPanel(p);
    const before = await view(p);
    await enterByButton(p);
    await p.getByRole('button', { name: /Collection/ }).last().click();
    await p.waitForSelector('[role=dialog]');
    await p.getByRole('button', { name: /^On Order/ }).click();
    await p.waitForTimeout(500);
    await catBody(p, () => document.querySelector('[role=dialog] [class*="overflow-y-auto"]').scrollTo(0, 200));
    await p.waitForTimeout(500);
    const top0 = await bodyTop(p);
    const card = await visibleCard(p);
    await p.touchscreen.tap(card.x, card.y);
    await p.waitForTimeout(800);
    await S(p, () => { const d = [...document.querySelectorAll('[role=dialog] [class*="overflow-y-auto"]')].pop(); d.scrollTo(0, 99999); });
    await p.getByRole('button', { name: /^Open MAI-2138/ }).click();
    await p.waitForTimeout(2500);
    const atDock = await view(p);
    const dockSheet = await p.getByText('MAI-2138').count();
    await shot(p, '6a-dock');
    await p.getByRole('button', { name: 'Back', exact: true }).first().click();
    await p.waitForTimeout(2500);
    const backName = await p.locator('[role=dialog] h2').last().innerText().catch(() => '');
    // save to the desk with a note
    await S(p, () => { const d = [...document.querySelectorAll('[role=dialog] [class*="overflow-y-auto"]')].pop(); d.scrollTo(0, 99999); });
    await p.getByRole('button', { name: /Manager's Desk/ }).last().click();
    await p.locator('textarea').fill('QA: MAI-2138 still to come.');
    await p.getByRole('button', { name: /^Save/ }).first().click();
    await p.waitForSelector("text=On the Manager's Desk");
    await p.getByRole('button', { name: /Back to the Dennison collection/ }).click();
    await p.waitForTimeout(600);
    const top1 = await bodyTop(p);
    const lensKept = await p.getByRole('button', { name: /^On Order/ }).getAttribute('aria-pressed');
    log('catalogue keeps its filter and place across a watch and a trip to the Dock', top0 === top1 && lensKept === 'true', { scrollBefore: top0, scrollAfter: top1, filterOnOrder: lensKept, opened: card.name, dockSheetShown: dockSheet > 0, dockRoom: atDock.room, backToWatch: backName });
    await p.getByRole('button', { name: 'Back to the boutique' }).click();
    await p.waitForTimeout(1200);
    await leaveToMall(p);
    const after = await view(p);
    log('return to mall after the Dock trip: camera, zoom, selection and panel', same(before, after) && await panelOpen(p), { before, after });
    // the desk, and back into the boutique from it
    await p.getByRole('button', { name: 'Office' }).click();
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: "Manager's Desk" }).click();
    await p.waitForSelector('text=Saved watches');
    await shot(p, '6b-desk');
    const deskText = await p.locator('aside').innerText();
    const ok = /QA: MAI-2138/.test(deskText) && /Then \(/.test(deskText) && /Now/.test(deskText);
    await p.getByRole('button', { name: /Go to watch/ }).first().click();
    await p.waitForSelector('text=Dennison boutique', { timeout: 30000 });
    await p.waitForTimeout(1500);
    const opened = await p.locator('aside h2').first().innerText().catch(() => '');
    await shot(p, '6c-desk-to-watch');
    log('Manager\'s Desk keeps the note and the then/now figures; Go to watch opens it in the boutique', ok && /Oblique|Vector/.test(opened), { opened });
    await p.getByRole('button', { name: 'Close' }).click().catch(() => {});
    await leaveToMall(p);
    const office = await view(p); const deskBack = await p.getByText('Saved watches').count();
    log('leaving after opening a watch from the desk returns to the Office with the desk open', office.room === 'office' && deskBack > 0, { office });
    log('no requests left the machine (journey)', p.outbound.length === 0 && p.errors.length === 0, { outbound: p.outbound.slice(0, 3), errors: p.errors });
    await p.context().close();
  },
  // 3. the catalogue with every product
  async catalogue() {
    const p = await page();
    await openDennisonPanel(p); await enterByButton(p);
    await p.getByRole('button', { name: /Collection/ }).last().click();
    await p.waitForSelector('[role=dialog]');
    await p.waitForTimeout(800);
    await shot(p, '3a-catalogue');
    const data = await S(p, () => window.__tkWorld.scene.getScene('world').boutique.data.products.map((w) => ({ id: w.product_id, name: w.name, on_hand: w.on_hand, u90: w.u90, u365: w.u365, last: w.last_sale, cls: w.class, oo: w.open_pos.some((q) => q.outstanding > 0) })));
    const cards = await p.locator('[role=dialog] .grid-cols-2 > button').count();
    const layout = await S(p, () => {
      const vw = innerWidth; const bad = [];
      for (const b of document.querySelectorAll('[role=dialog] .grid-cols-2 > button')) {
        const r = b.getBoundingClientRect(); const n = b.querySelector('.line-clamp-2'); const nr = n.getBoundingClientRect();
        if (r.right > vw + 0.5 || r.left < -0.5) bad.push('outside:' + n.textContent);
        if (n.scrollHeight > n.clientHeight + 2 && nr.height > 34) bad.push('name overflow:' + n.textContent);
      }
      const heights = [...document.querySelectorAll('[role=dialog] .grid-cols-2 > button')].map((b) => Math.round(b.getBoundingClientRect().height));
      return { bad, docOverflow: document.documentElement.scrollWidth > vw, minH: Math.min(...heights), maxH: Math.max(...heights) };
    });
    const longest = [...data].sort((a, b) => b.name.length - a.name.length)[0].name;
    log('all products listed, nothing wider than the screen, long names clamped to two lines', cards === data.length && layout.bad.length === 0 && !layout.docOverflow, { products: data.length, cards, ...layout, longestName: longest });
    // filters: the counts add up and each shows exactly its watches
    const lens = { All: () => true, Fast: (w) => w.on_hand > 0 && w.cls === 'fast', Healthy: (w) => w.on_hand > 0 && w.cls === 'healthy', New: (w) => w.on_hand > 0 && w.cls === 'new', Slow: (w) => w.on_hand > 0 && w.cls === 'slow', Dead: (w) => w.on_hand > 0 && w.cls === 'dead', 'Sold Out': (w) => w.on_hand <= 0, 'On Order': (w) => w.oo };
    const fr = {};
    for (const [label, f] of Object.entries(lens)) {
      await p.getByRole('button', { name: new RegExp(`^${label} \\d`) }).click();
      await p.waitForTimeout(250);
      const shown = await p.locator('[role=dialog] .grid-cols-2 > button').count();
      fr[label] = { expected: data.filter(f).length, shown };
    }
    const sumOk = fr.Fast.expected + fr.Healthy.expected + fr.New.expected + fr.Slow.expected + fr.Dead.expected + fr['Sold Out'].expected === data.length;
    log('each filter shows exactly its watches, and the classes plus sold out add up to all', Object.values(fr).every((x) => x.expected === x.shown) && sumOk, fr);
    // sorting
    await p.getByRole('button', { name: /^All \d/ }).click();
    const order = async () => p.locator('[role=dialog] .grid-cols-2 > button .line-clamp-2').allInnerTexts();
    const tidy = (s) => s.replace(/\s{2,}/g, ' ').replace(/\s+-\s+/g, ' – ').trim();
    const last = (w) => (w.last ? Date.parse(w.last) : -Infinity);
    const exp = {
      sold90: [...data].sort((a, b) => b.u90 - a.u90 || b.u365 - a.u365 || a.name.localeCompare(b.name)),
      stock: [...data].sort((a, b) => b.on_hand - a.on_hand || a.name.localeCompare(b.name)),
      unsold: [...data].sort((a, b) => Number(b.on_hand > 0) - Number(a.on_hand > 0) || last(a) - last(b) || a.name.localeCompare(b.name)),
      name: [...data].sort((a, b) => a.name.localeCompare(b.name)),
    };
    const so = {};
    for (const k of Object.keys(exp)) {
      await p.locator('select[aria-label=Sort]').selectOption(k);
      await p.waitForTimeout(250);
      const got = await order();
      so[k] = got.every((n, i) => n === tidy(exp[k][i].name));
    }
    log('every sort order matches the data (sales movement, highest stock, longest unsold, name)', Object.values(so).every(Boolean), so);
    // rapid scrolling: flick to the bottom and back, then check what is on screen has its photo
    await p.locator('select[aria-label=Sort]').selectOption('sold90');
    const before = p.errors.length;
    const t0 = Date.now();
    await S(p, async () => {
      const d = document.querySelector('[role=dialog] [class*="overflow-y-auto"]');
      for (let i = 0; i <= 20; i++) { d.scrollTop = (d.scrollHeight * i) / 20; await new Promise((r) => setTimeout(r, 40)); }
      for (let i = 20; i >= 0; i -= 2) { d.scrollTop = (d.scrollHeight * i) / 20; await new Promise((r) => setTimeout(r, 40)); }
      d.scrollTop = d.scrollHeight / 2;
    });
    await p.waitForTimeout(1500);
    const imgs = await S(p, () => {
      const vh = innerHeight; let inView = 0, loaded = 0, broken = 0;
      for (const img of document.querySelectorAll('[role=dialog] .grid-cols-2 img')) {
        const r = img.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh) continue;
        inView++; if (img.complete && img.naturalWidth > 0) loaded++; else if (img.complete) broken++;
      }
      return { inView, loaded, broken, all: document.querySelectorAll('[role=dialog] .grid-cols-2 img').length, requested: performance.getEntriesByType('resource').filter((e) => e.name.includes('/img/') && e.name.endsWith('-v.png')).length };
    });
    await shot(p, '3b-after-rapid-scroll');
    log('rapid scrolling: no errors, every photo on screen loaded, only 350px views fetched', p.errors.length === before && imgs.inView > 0 && imgs.loaded === imgs.inView, { ms: Date.now() - t0, ...imgs });
    await p.context().close();
  },
  async missingImages() {
    const p = await page({ query: '?nophoto=10' });
    await openDennisonPanel(p); await enterByButton(p);
    await p.getByRole('button', { name: /Collection/ }).last().click();
    await p.locator('select[aria-label=Sort]').selectOption('name');
    await p.waitForTimeout(600);
    const placeholders = await p.locator('[role=dialog] .grid-cols-2 >> text=No photo yet').count();
    await shot(p, '3c-no-photo-placeholder');
    log('watches without a photo show the neutral placeholder (10 withheld)', placeholders === 10, { placeholders });
    await p.context().close();
  },
  // 7. images failing to load, and a slow network
  async imageFailures() {
    // every fourth photo fails, every time it is asked for (the game's loader retries a failed file)
    const seen = new Map(); const failed = new Set();
    const p = await page({ routes: async (pg) => pg.route(/\/img\/.*-(t|v)\.png$/, (r) => {
      const f = r.request().url().split('/img/')[1];
      if (!seen.has(f)) seen.set(f, seen.size + 1);
      if (seen.get(f) % 4 === 0) { failed.add(f); return r.abort('failed'); }
      return r.continue();
    }) });
    await openDennisonPanel(p); await enterByButton(p);
    await p.waitForTimeout(1500);
    const roomNoPhoto = await S(p, () => { let k = 0; const walk = (l) => { for (const o of l) { if (o.type === 'Text' && o.text === 'No photo') k++; if (o.list) walk(o.list); } }; walk(window.__tkWorld.scene.getScene('world').children.list); return k; });
    await shot(p, '7a-room-with-failed-photos');
    await p.getByRole('button', { name: /Collection/ }).last().click();
    await p.waitForTimeout(2000);
    const vfail = [...failed].filter((f) => f.endsWith('-v.png')).length;
    const cat = await S(p, () => ({ placeholders: (document.querySelector('[role=dialog] .grid-cols-2').innerText.match(/No photo yet/g) ?? []).length }));
    await shot(p, '7b-catalogue-with-failed-photos');
    const roomFailed = [...failed].filter((f) => f.endsWith('-t.png')).length;
    log('photos that fail to load: a placeholder in the room and in the catalogue, nothing breaks', roomFailed > 0 && roomNoPhoto === roomFailed && cat.placeholders === vfail && p.errors.length === 0, { failedRoomPhotos: roomFailed, roomPlaceholders: roomNoPhoto, failedCatalogue: vfail, catalogueePlaceholders: cat.placeholders, errors: p.errors });
    // the watch detail still opens with its photo missing
    const c = await visibleCard(p); await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(800);
    log('a watch still opens and shows its figures', await p.getByText('sold in 90 days').count() > 0, { opened: c.name });
    await p.context().close();
  },
  async slowNetwork() {
    const p0 = Date.now();
    const p = await page({ query: '?slow=2500', routes: async (pg) => pg.route(/\/img\/.*\.png$/, async (r) => { await new Promise((x) => setTimeout(x, 1500)); r.continue(); }) });
    const ready = Date.now() - p0;
    await openDennisonPanel(p);
    await p.getByRole('button', { name: /Step inside Dennison/ }).click();
    await p.waitForSelector('text=Opening the Dennison boutique', { timeout: 5000 });
    await shot(p, '7c-slow-opening');
    const t1 = Date.now();
    await p.waitForSelector('text=Dennison boutique', { timeout: 60000 });
    const entered = Date.now() - t1;
    await p.getByRole('button', { name: /Collection/ }).last().click();
    await p.waitForTimeout(400);
    await shot(p, '7d-slow-catalogue-loading');
    await p.waitForTimeout(3000);
    const loaded = await S(p, () => [...document.querySelectorAll('[role=dialog] .grid-cols-2 img')].filter((i) => i.complete && i.naturalWidth > 0).length);
    await shot(p, '7e-slow-catalogue-loaded');
    // open a watch and its order at the dock, slowly
    const c = await visibleCard(p); await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(600);
    await p.getByRole('button', { name: /Back to the Dennison collection/ }).click();
    await p.getByRole('button', { name: 'Back to the boutique' }).click();
    await leaveToMall(p);
    log('slow network (2.5 s per call, 1.5 s per photo): a loading notice, then the boutique, then photos as they arrive', loaded > 0 && p.errors.length === 0, { worldReadyMs: ready, enterMs: entered, photosLoadedAfter3s: loaded, errors: p.errors });
    await p.context().close();
  },
  async backendFailure() {
    const p = await page({ query: '?fail=world_boutique' });
    await openDennisonPanel(p);
    await p.getByRole('button', { name: /Step inside Dennison/ }).click();
    await p.waitForSelector("text=The boutique didn't open", { timeout: 10000 });
    await shot(p, '7f-boutique-failed');
    const v = await view(p);
    log('if the boutique cannot be read, the owner stays in the mall with a clear message', v.room === 'floor' && await panelOpen(p), { room: v.room });
    await p.context().close();
  },
  // 4. the board answers taps on itself, and only there
  async boardTaps() {
    const p = await page();
    await openDennisonPanel(p); await enterByButton(p);
    const geo = async () => S(p, () => {
      const s = window.__tkWorld.scene.getScene('world'); const c = s.cameras.main; const k = s.game.canvas.width / s.game.canvas.clientWidth;
      const B = { x0: 2.6, x1: 11.4, lo: 46, hi: 252 };
      const on = (t, h) => { const p = s.boutique['onWall'](t, h); return { x: (p.x - c.worldView.x) * c.zoom / k, y: (p.y - c.worldView.y) * c.zoom / k }; };
      return { inside: [0.12, 0.5, 0.88].flatMap((u) => [0.18, 0.5, 0.82].map((v) => on(B.x0 + u * (B.x1 - B.x0), B.lo + v * (B.hi - B.lo)))),
        outside: [on(B.x0 + 0.5, B.lo - 30), on(B.x1 - 0.5, B.lo - 30), on((B.x0 + B.x1) / 2, B.hi + 30), on(B.x0 - 0.6, (B.lo + B.hi) / 2)] };
    });
    const tryTap = async (pt) => {
      await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(450);
      const opened = (await p.locator('[role=dialog][aria-label="Dennison collection"]').count()) > 0;
      if (opened) { await p.getByRole('button', { name: 'Back to the boutique' }).click(); await p.waitForTimeout(350); }
      else await p.getByRole('button', { name: 'Close' }).click().catch(() => {});
      return opened;
    };
    const res = {};
    for (const [label, zoom] of [['entry view', null], ['closer', 1.6]]) {
      if (zoom) await S(p, (z) => { const s = window.__tkWorld.scene.getScene('world'); const c = s.cameras.main; c.setZoom(c.zoom * z); s.zoomTarget = c.zoom; c.centerOn(s.boutique.boardPoint().x, s.boutique.boardPoint().y + 80); }, zoom);
      await p.waitForTimeout(500);
      const g = await geo();
      const ins = g.inside.filter((q) => q.y > 200 && q.y < 760 && q.x > 5 && q.x < 385);
      const outs = g.outside.filter((q) => q.y > 200 && q.y < 760 && q.x > 5 && q.x < 385);
      let hit = 0, miss = 0;
      for (const q of ins) if (await tryTap(q)) hit++;
      for (const q of outs) if (await tryTap(q)) miss++;
      res[label] = { insideTaps: ins.length, opened: hit, outsideTaps: outs.length, wronglyOpened: miss };
    }
    await S(p, () => window.__tkWorld.scene.getScene('world').frameBoutique(false)); await p.waitForTimeout(400);
    await p.getByRole('button', { name: /Collection/ }).last().click();
    const button = (await p.locator('[role=dialog][aria-label="Dennison collection"]').count()) > 0;
    log('the Collection Board opens on every tap on it, never on taps beside it; the Collection button also opens it', Object.values(res).every((r) => r.opened === r.insideTaps && r.wronglyOpened === 0) && button, { ...res, collectionButton: button });
    await p.context().close();
  },
};

for (const [name, f] of Object.entries(tests)) {
  if (ONLY && ONLY !== name) continue;
  try { await f(); } catch (e) { log(name, false, { error: String(e.message).split('\n')[0] }); }
}
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
