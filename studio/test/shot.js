// Renders the studio page at iPhone size with a stub of the artifact runtime (db docs from a JSON file;
// optional __page / __cands keys hold recorded Supabase replies for the connector stub).
// usage: node shot.js <page.html> <data.json> <outdir> [hash ...]
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const [page_, data_, out, ...hashes] = process.argv.slice(2);
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + fs.readFileSync(page_, 'utf8') + '</body></html>';
const data = JSON.parse(fs.readFileSync(data_, 'utf8'));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 14'] });
  await ctx.addInitScript((data) => {
    const snap = (id, d) => ({ id, exists: d != null, data: () => d });
    window.claude = { use: async (k) => k === 'db' ? {
      collection: (c) => ({ onSnapshot: (cb) => { setTimeout(() => cb({ docs: Object.entries(data[c] || {}).map(([id, d]) => snap(id, d)) }), 30); return () => {}; }, add: async () => ({}) }),
      doc: (p) => ({ onSnapshot: (cb) => { const [c, id] = p.split('/'); setTimeout(() => cb(snap(id, (data[c] || {})[id] ?? null)), 30); return () => {}; }, update: async (x) => { window.__updates = [...(window.__updates || []), [p, x]]; }, set: async (x) => { window.__updates = [...(window.__updates || []), [p, x]]; } }),
    } : k === 'mcp' && data.__page ? {
      // Supabase connector stub: answers studio_page / studio_candidates with recorded real replies
      callTool: async (server, tool, args) => { await new Promise((ok) => setTimeout(ok, 80)); window.__sql = [...(window.__sql || []), args.query.slice(0, 60)];
        return { payload: { result: /studio_candidates/.test(args.query) ? data.__cands : /studio_page/.test(args.query) ? data.__page : '<untrusted-data-z>\n[]\n</untrusted-data-z>' } }; },
    } : k === 'comments' ? { canSendToClaude: async () => 'unavailable' } : null };
  }, data);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('http://x/') ? r.fulfill({ status: 404, body: '' }) : r.continue()));
  await page.goto('http://x/');
  await page.route('http://x/', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://x/');
  for (const h of hashes.length ? hashes : ['films']) {
    if (h.startsWith('click:')) { await page.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error('no ' + s); el.click(); }, h.slice(6)); await page.waitForTimeout(700); const f = path.join(out, `${h.replace(/[^a-z0-9-]/gi, '_')}.png`); await page.screenshot({ path: f }); console.log(h, f); continue; }
    await page.evaluate((h) => { location.hash = h.replace(/~$/, ''); }, h);
    await page.waitForTimeout(600);
    if (!h.endsWith('~')) await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
    await page.waitForTimeout(150);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    const f = path.join(out, `${h.replace(/[^a-z0-9-]/gi, '_')}.png`);
    await page.screenshot({ path: f, fullPage: true });
    console.log(h, 'overflow:', w.sw > w.cw ? `YES ${w.sw}>${w.cw}` : 'no', f);
  }
  console.log('errors:', errors.length ? errors : 'none');
  console.log('sql:', await page.evaluate(() => window.__sql || []));
  console.log('writes:', await page.evaluate(() => (window.__updates || []).map(([p]) => p)));
  await browser.close();
})();
