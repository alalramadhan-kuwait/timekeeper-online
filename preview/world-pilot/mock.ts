/* A stand-in for Supabase, so the boutique pilot runs on a laptop or phone with no backend.

   It answers the World's owner-only functions from a read-only snapshot (fixture.json, captured
   from the live functions and never committed), refuses every change except the Manager's Desk,
   and keeps the desk in this browser's storage. Nothing here can reach the real project: the
   preview build points Supabase at https://mock.supabase.co, and anything unanswered fails. */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fixture = Record<string, any>;
const DESK_KEY = 'world-pilot-desk';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const refuse = (msg: string) => json({ code: 'P0001', message: msg, details: null, hint: null }, 400);

function readDesk(): any[] {
  try { return JSON.parse(localStorage.getItem(DESK_KEY) ?? '[]'); } catch { return []; }
}
function writeDesk(list: any[]) {
  try { localStorage.setItem(DESK_KEY, JSON.stringify(list)); } catch { /* the desk lasts until the page closes */ }
}

export function installMock(fx: Fixture) {
  const products: any[] = fx.boutique.products;
  const byId = new Map(products.map((p) => [p.product_id, p]));

  const rpc: Record<string, (a: any) => Response> = {
    stock_ai_allowed: () => json(true),
    world_snapshot: () => json(fx.snapshot),
    world_mall: () => json(fx.mall),
    world_po_status_log: () => json(fx.status_log),
    world_po_expected: () => json(fx.expected ?? {}),
    world_po_detail: (a) => {
      const d = fx.po_details.find((x: any) => x.po?.id === a.p_po_id);
      return d ? json(d) : refuse('That order is not in the preview snapshot.');
    },
    world_po_search: () => json({ results: [], total: 0 }),
    world_mission_history: () => json([]),
    world_boutique: (a) => (a.p_brand === fx.boutique.brand ? json(fx.boutique) : refuse('Only the Dennison boutique is in the pilot.')),
    world_discoveries: () => json(readDesk().filter((d) => !d.archived).map((d) => ({ ...d, now: byId.get(d.product_id) ?? null }))),
    world_discovery_save: (a) => {
      const w = byId.get(a.p_product_id);
      if (!w) return refuse('That watch is not in the boutique.');
      const note = typeof a.p_note === 'string' && a.p_note.trim() ? a.p_note.trim().slice(0, 300) : null;
      const id = crypto.randomUUID();
      writeDesk([{ id, product_id: w.product_id, brand: w.brand, name: w.name, note, by: 'You (preview)', at: new Date().toISOString(),
        then: { ...w, taken_at: new Date().toISOString() } }, ...readDesk()]);
      return json({ ok: true, id });
    },
    world_discovery_archive: (a) => { writeDesk(readDesk().map((d) => (d.id === a.p_id ? { ...d, archived: true } : d))); return json({ ok: true }); },
  };

  const tables: Record<string, any[]> = { purchase_order_items_view: fx.po_lines, purchase_orders: fx.po_methods };

  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.hostname !== 'mock.supabase.co') {
      if (url.origin === location.origin) return real(input, init);
      return refuse(`The preview does not go online (${url.hostname}).`);
    }
    await new Promise((r) => setTimeout(r, 120));       // a little of a real network's pause
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m) {
      const f = rpc[m[1]];
      if (!f) return refuse('The preview is read-only: nothing is changed.');
      return f(init?.body ? JSON.parse(String(init.body)) : {});
    }
    const t = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (t && tables[t[1]]) {
      let rows = tables[t[1]];
      for (const [k, v] of url.searchParams) {
        const inList = v.match(/^in\.\((.*)\)$/);
        if (inList) { const ids = new Set(inList[1].split(',').map((s) => s.replace(/"/g, ''))); rows = rows.filter((r) => ids.has(String(r[k]))); }
      }
      return json(rows);
    }
    return refuse('Not available in the preview.');
  };
}
