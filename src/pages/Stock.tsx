import { Fragment, useEffect, useMemo, useState } from 'react';
import { RefreshCw, PlugZap, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Badge, Spinner } from '../components/ui';
import { formatKD } from '../lib/format';
import { useAuth } from '../context/AuthContext';

interface StockRow {
  product_id: string; outlet: string; sku: string | null; name: string; brand: string | null;
  supplier: string | null; price: number | null; stock_on_hand: number; reorder_point: number | null;
  synced_at: string;
}

interface SalesAgg { units_30d: number; units_90d: number; revenue_90d: number; last_sold: string | null }

type Movement = 'fast' | 'slow' | 'dead';

interface ProductRow {
  product_id: string; name: string; sku: string | null; brand: string | null; supplier: string | null;
  price: number | null;
  perOutlet: Record<string, { qty: number; reorder: number | null }>;
  totalQty: number;
  low: boolean;
  units30: number; units90: number; lastSold: string | null;
  movement: Movement;
  costValue: number; // Σ qty × avg cost — 0 when cost not visible to this role
}

const movementStyle: Record<Movement, { label: string; cls: string }> = {
  fast: { label: 'Fast', cls: 'bg-emerald-100 text-emerald-700' },
  slow: { label: 'Slow', cls: 'bg-amber-100 text-amber-700' },
  dead: { label: 'Not moving', cls: 'bg-rose-100 text-rose-600' },
};

const CALLBACK_URL = 'https://ttshgrujnycapugrmyxs.supabase.co/functions/v1/lightspeed-oauth-callback';

export default function StockPage() {
  const { role } = useAuth();
  const canSync = ['admin', 'manager'].includes(role ?? '');
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<{ finished_at: string | null; status: string; error: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('All');
  const [lowOnly, setLowOnly] = useState(false);
  const [deadOnly, setDeadOnly] = useState(false);
  const [view, setView] = useState<'products' | 'brands'>('brands');
  const [salesMap, setSalesMap] = useState<Map<string, SalesAgg>>(new Map());
  const [costMap, setCostMap] = useState<Map<string, number>>(new Map()); // `${product_id}|${outlet}` → cost (managers only, enforced by RLS)
  const [clientId, setClientId] = useState('');

  async function load() {
    setLoading(true);
    // page through all rows (PostgREST caps a single request at 1000)
    const all: StockRow[] = [];
    for (let fromIdx = 0; ; fromIdx += 1000) {
      const { data, error } = await supabase.from('lightspeed_stock').select('*')
        .order('name').range(fromIdx, fromIdx + 999);
      if (error || !data?.length) break;
      all.push(...(data as StockRow[]));
      if (data.length < 1000) break;
    }
    setRows(all);
    const salesAll: (SalesAgg & { product_id: string })[] = [];
    for (let fromIdx = 0; ; fromIdx += 1000) {
      const { data, error } = await supabase.from('lightspeed_product_sales').select('*').range(fromIdx, fromIdx + 999);
      if (error || !data?.length) break;
      salesAll.push(...(data as (SalesAgg & { product_id: string })[]));
      if (data.length < 1000) break;
    }
    setSalesMap(new Map(salesAll.map((s) => [s.product_id, s])));
    // cost table is readable by admin/manager only (RLS) — others just get no rows
    const costs = new Map<string, number>();
    for (let fromIdx = 0; ; fromIdx += 1000) {
      const { data, error } = await supabase.from('lightspeed_stock_cost').select('product_id, outlet, cost').range(fromIdx, fromIdx + 999);
      if (error || !data?.length) break;
      for (const c of data as { product_id: string; outlet: string; cost: number | null }[]) {
        if (c.cost != null) costs.set(`${c.product_id}|${c.outlet}`, Number(c.cost));
      }
      if (data.length < 1000) break;
    }
    setCostMap(costs);
    const { data: log } = await supabase.from('lightspeed_sync_log')
      .select('finished_at, status, error').order('started_at', { ascending: false }).limit(1);
    setLastSync(log?.[0] ?? null);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    const { data, error } = await supabase.functions.invoke('lightspeed-sync', { body: {} });
    if (error) setSyncMsg(`Sync failed: ${error.message}`);
    else if (data?.error) setSyncMsg(`Sync failed: ${data.error}`);
    else setSyncMsg(`Synced ${data?.products ?? '?'} products ✓`);
    setSyncing(false);
    load();
  }

  const outlets = useMemo(() => [...new Set(rows.map((r) => r.outlet))].sort(), [rows]);
  const brands = useMemo(() => [...new Set(rows.map((r) => r.brand).filter(Boolean) as string[])].sort(), [rows]);

  const products = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const r of rows) {
      let p = map.get(r.product_id);
      if (!p) {
        const s = salesMap.get(r.product_id);
        const u30 = Number(s?.units_30d ?? 0), u90 = Number(s?.units_90d ?? 0);
        p = {
          product_id: r.product_id, name: r.name, sku: r.sku, brand: r.brand, supplier: r.supplier, price: r.price,
          perOutlet: {}, totalQty: 0, low: false,
          units30: u30, units90: u90, lastSold: s?.last_sold ?? null,
          movement: u30 > 0 ? 'fast' : u90 > 0 ? 'slow' : 'dead',
          costValue: 0,
        };
        map.set(r.product_id, p);
      }
      p.perOutlet[r.outlet] = { qty: Number(r.stock_on_hand), reorder: r.reorder_point != null ? Number(r.reorder_point) : null };
      p.totalQty += Number(r.stock_on_hand);
      p.costValue += Number(r.stock_on_hand) * (costMap.get(`${r.product_id}|${r.outlet}`) ?? 0);
      if (r.reorder_point != null && Number(r.stock_on_hand) <= Number(r.reorder_point)) p.low = true;
    }
    // only items actually in stock
    let list = [...map.values()].filter((p) => p.totalQty > 0);
    if (brandFilter !== 'All') list = list.filter((p) => p.brand === brandFilter);
    if (lowOnly) list = list.filter((p) => p.low);
    if (deadOnly) list = list.filter((p) => p.movement === 'dead');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => [p.name, p.sku, p.brand, p.supplier].some((v) => (v ?? '').toLowerCase().includes(q)));
    }
    // group related items: brand A→Z (no-brand last), then name
    list.sort((a, b) =>
      (a.brand ?? '￿').localeCompare(b.brand ?? '￿') || a.name.localeCompare(b.name));
    return list;
  }, [rows, brandFilter, lowOnly, deadOnly, search, salesMap, costMap]);

  const hasCost = costMap.size > 0;

  const totals = useMemo(() => {
    const inStock = products.length;
    const units = products.reduce((s, p) => s + p.totalQty, 0);
    const value = products.reduce((s, p) => s + p.totalQty * Number(p.price ?? 0), 0);
    const deadValue = products.filter((p) => p.movement === 'dead').reduce((s, p) => s + p.totalQty * Number(p.price ?? 0), 0);
    const perOutlet: Record<string, number> = {};
    for (const p of products) for (const [o, c] of Object.entries(p.perOutlet)) perOutlet[o] = (perOutlet[o] ?? 0) + c.qty;
    return { inStock, units, value, deadValue, perOutlet };
  }, [products]);

  // Brand analytics — value, units, movement per brand (from filtered product list minus brand filter)
  const brandStats = useMemo(() => {
    const map = new Map<string, { units: number; value: number; cost: number; u30: number; u90: number; rev90: number; deadValue: number; items: number }>();
    for (const p of products) {
      const b = p.brand ?? 'No brand';
      const e = map.get(b) ?? { units: 0, value: 0, cost: 0, u30: 0, u90: 0, rev90: 0, deadValue: 0, items: 0 };
      e.units += p.totalQty;
      e.value += p.totalQty * Number(p.price ?? 0);
      e.cost += p.costValue;
      e.u30 += p.units30;
      e.u90 += p.units90;
      e.rev90 += Number(salesMap.get(p.product_id)?.revenue_90d ?? 0);
      if (p.movement === 'dead') e.deadValue += p.totalQty * Number(p.price ?? 0);
      e.items += 1;
      map.set(b, e);
    }
    return [...map.entries()]
      .map(([brand, e]) => ({
        brand, ...e,
        movement: (e.u30 > 0 ? 'fast' : e.u90 > 0 ? 'slow' : 'dead') as Movement,
        sellThrough: e.u90 + e.units > 0 ? (e.u90 / (e.u90 + e.units)) * 100 : 0,
        margin: e.value > 0 ? ((e.value - e.cost) / e.value) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [products, salesMap]);

  if (loading) return <Spinner />;

  const connected = rows.length > 0 || lastSync?.status === 'ok';
  const syncedAt = rows[0]?.synced_at;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Stock (Lightspeed)</h1>
          <p className="text-sm text-slate-500">
            Read-only mirror of Lightspeed inventory, synced automatically every morning at 8:00.
            {syncedAt && <> Stock as of <b>{new Date(syncedAt).toLocaleString('en-GB', { timeZone: 'Asia/Kuwait' })}</b>.</>}
          </p>
        </div>
        {canSync && connected && (
          <button onClick={syncNow} disabled={syncing}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>

      {syncMsg && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm border ${syncMsg.includes('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {syncMsg}
        </div>
      )}
      {lastSync?.status === 'error' && (
        <div className="mb-3 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          Last sync failed: {lastSync.error}
        </div>
      )}

      {!connected ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <PlugZap size={18} className="text-amber-500" />
            <h2 className="font-bold text-slate-800">Connect Lightspeed (one-time setup)</h2>
          </div>
          <ol className="list-decimal ml-5 space-y-2 text-sm text-slate-600">
            <li>
              Create a free developer account at{' '}
              <a href="https://developers.retail.lightspeed.app/register" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                developers.retail.lightspeed.app
              </a>{' '}and add a new application.
            </li>
            <li>
              Set the app's <b>redirect URI</b> to:
              <code className="block mt-1 px-2 py-1 bg-slate-100 rounded text-xs break-all">{CALLBACK_URL}</code>
            </li>
            <li>
              In Supabase → Edge Functions → Secrets, add <code>LS_CLIENT_ID</code> and <code>LS_CLIENT_SECRET</code> from the app you created.
            </li>
            <li>
              Paste your Client ID below and click Connect — sign in to Lightspeed and press <b>Allow</b>:
              <div className="flex gap-2 mt-2">
                <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                <a
                  href={clientId ? `https://secure.retail.lightspeed.app/connect?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&state=tkonline-${Date.now()}` : undefined}
                  target="_blank" rel="noopener noreferrer"
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${clientId ? 'bg-slate-900 text-white hover:bg-slate-700' : 'bg-slate-200 text-slate-400 pointer-events-none'}`}
                >
                  Connect →
                </a>
              </div>
            </li>
            <li>Come back here and press <b>Sync now</b> (or wait for the 8:00 auto-sync).</li>
          </ol>
          {canSync && (
            <button onClick={syncNow} disabled={syncing}
              className="mt-4 flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Run first sync'}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Summary cards — marketing focus */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <p className="text-xs text-slate-500 mb-0.5">Stock retail value</p>
              <p className="text-xl font-bold text-slate-800">{formatKD(totals.value)} KD</p>
              <p className="text-xs text-slate-400">
                {totals.inStock} products · {totals.units} units
                {hasCost && <> · <span className="text-emerald-600 font-medium">{formatKD(totals.value - products.reduce((s, p) => s + p.costValue, 0))} KD potential profit</span></>}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <p className="text-xs text-slate-500 mb-0.5">Not-moving stock value</p>
              <p className={`text-xl font-bold ${totals.deadValue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatKD(totals.deadValue)} KD</p>
              <p className="text-xs text-slate-400">no sales in 90 days — marketing target</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <p className="text-xs text-slate-500 mb-0.5">Units sold — 30 days</p>
              <p className="text-xl font-bold text-emerald-600">{products.reduce((s, p) => s + p.units30, 0)}</p>
              <p className="text-xs text-slate-400">{products.reduce((s, p) => s + p.units90, 0)} in 90 days</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <p className="text-xs text-slate-500 mb-0.5">Best mover (30d)</p>
              <p className="text-xl font-bold text-slate-800 truncate" title={[...brandStats].sort((a, b) => b.u30 - a.u30)[0]?.brand}>
                {[...brandStats].sort((a, b) => b.u30 - a.u30)[0]?.brand ?? '—'}
              </p>
              <p className="text-xs text-slate-400">{[...brandStats].sort((a, b) => b.u30 - a.u30)[0]?.u30 ?? 0} units sold</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
              {(['brands', 'products'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 capitalize ${view === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {v}
                </button>
              ))}
            </div>
            {view === 'products' && (
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU, brand…"
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white w-56" />
            )}
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
              <option>All</option>
              {brands.map((b) => <option key={b}>{b}</option>)}
            </select>
            <button onClick={() => setLowOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${lowOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              <AlertTriangle size={13} /> Low stock
            </button>
            <button onClick={() => setDeadOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${deadOnly ? 'bg-rose-500 text-white border-rose-500' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              Not moving
            </button>
            <div className="ml-auto text-sm text-slate-500 self-center">
              {view === 'brands' ? `${brandStats.length} brands` : `${products.length} products`}
            </div>
          </div>

          {view === 'brands' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="px-4 py-3">Brand</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Units</th>
                    <th className="px-4 py-3 text-right">Stock value</th>
                    {hasCost && <th className="px-4 py-3 text-right hidden sm:table-cell">Cost value</th>}
                    {hasCost && <th className="px-4 py-3 text-right">Margin</th>}
                    <th className="px-4 py-3 text-right">Sold 30d</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Sold 90d</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Revenue 90d</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Sell-through</th>
                    <th className="px-4 py-3 text-right">Movement</th>
                  </tr>
                </thead>
                <tbody>
                  {brandStats.map((b) => (
                    <tr key={b.brand} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                      onClick={() => { setBrandFilter(b.brand === 'No brand' ? 'All' : b.brand); setView('products'); }}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">
                        {b.brand}
                        <span className="text-xs text-slate-400 font-normal ml-1.5 hidden sm:inline">{b.items} items</span>
                        <span className="block text-xs text-slate-400 font-normal sm:hidden">{b.units} units · {b.items} items</span>
                      </td>
                      <td className="px-4 py-2.5 text-right hidden sm:table-cell">{b.units}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-800">{formatKD(b.value)} KD</td>
                      {hasCost && <td className="px-4 py-2.5 text-right text-slate-500 hidden sm:table-cell">{formatKD(b.cost)} KD</td>}
                      {hasCost && (
                        <td className={`px-4 py-2.5 text-right font-medium ${b.margin >= 40 ? 'text-emerald-600' : b.margin >= 20 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {b.margin.toFixed(0)}%
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">{b.u30 || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 hidden sm:table-cell">{b.u90 || '—'}</td>
                      <td className="px-4 py-2.5 text-right hidden sm:table-cell">{b.rev90 ? `${formatKD(b.rev90)} KD` : '—'}</td>
                      <td className="px-4 py-2.5 text-right hidden sm:table-cell text-slate-500">{b.sellThrough.toFixed(0)}%</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${movementStyle[b.movement].cls}`}>
                          {movementStyle[b.movement].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                Click a brand to see its products · Sell-through = sold 90d ÷ (sold 90d + in stock)
              </div>
            </div>
          )}

          {view === 'products' && (<>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 hidden sm:table-cell">SKU</th>
                  {outlets.map((o) => <th key={o} className="px-4 py-3 text-right whitespace-nowrap hidden md:table-cell">{o}</th>)}
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right hidden sm:table-cell">Price</th>
                  <th className="px-4 py-3 text-right">Sold 30d</th>
                  <th className="px-4 py-3 text-right hidden sm:table-cell">Last sold</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 && (
                  <tr><td colSpan={outlets.length + 6} className="px-4 py-8 text-center text-slate-400">No products in stock match</td></tr>
                )}
                {products.slice(0, 500).map((p, idx, arr) => {
                  const brandLabel = p.brand ?? 'No brand';
                  const newBrand = idx === 0 || (arr[idx - 1].brand ?? 'No brand') !== brandLabel;
                  return (
                    <Fragment key={p.product_id}>{newBrand && (
                      <tr key={`hdr-${brandLabel}`} className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={outlets.length + 6} className="px-4 py-1.5 text-xs font-bold text-slate-600 uppercase tracking-wide">
                          {brandLabel}
                          <span className="ml-2 font-normal text-slate-400 normal-case">
                            {arr.filter((x) => (x.brand ?? 'No brand') === brandLabel).length} items
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr key={p.product_id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${p.low ? 'bg-amber-50/60' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-700 flex items-center gap-1.5">
                          {p.low && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                          <span className="truncate max-w-[260px]" title={p.name}>{p.name}</span>
                        </div>
                        <div className="text-xs text-slate-400 sm:hidden">{p.sku ?? ''}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{p.sku ?? '—'}</td>
                      {outlets.map((o) => {
                        const cell = p.perOutlet[o];
                        const qty = cell?.qty ?? 0;
                        const isLow = cell && cell.reorder != null && qty <= cell.reorder;
                        return (
                          <td key={o} className="px-4 py-2.5 text-right hidden md:table-cell">
                            {qty > 0 ? (
                              <span className={`inline-block min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold ${isLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {qty}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right font-bold text-slate-800">{p.totalQty}</td>
                      <td className="px-4 py-2.5 text-right hidden sm:table-cell">{p.price != null ? `${formatKD(Number(p.price))} KD` : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        {p.units30 > 0
                          ? <span className="text-emerald-600 font-semibold">{p.units30}</span>
                          : p.movement === 'dead'
                            ? <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${movementStyle.dead.cls}`}>Not moving</span>
                            : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-400 hidden sm:table-cell">{p.lastSold ?? 'never (90d)'}</td>
                    </tr></Fragment>
                  );
                })}
              </tbody>
            </table>
            {products.length > 500 && (
              <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                Showing first 500 of {products.length} — use search to narrow down.
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">amber</Badge> at/below reorder point · items with zero stock everywhere are hidden
          </div>
          </>)}
        </>
      )}
    </div>
  );
}
