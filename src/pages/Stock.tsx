import { Fragment, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { RefreshCw, PlugZap, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
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
  const [movementFilter, setMovementFilter] = useState<Movement | null>(null);
  const [prodSort, setProdSort] = useState<{ col: string; asc: boolean } | null>(null);
  const [brandSort, setBrandSort] = useState<{ col: string; asc: boolean } | null>(null);
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
    if (movementFilter) list = list.filter((p) => p.movement === movementFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => [p.name, p.sku, p.brand, p.supplier].some((v) => (v ?? '').toLowerCase().includes(q)));
    }
    // group related items: brand A→Z (no-brand last), then name
    list.sort((a, b) =>
      (a.brand ?? '￿').localeCompare(b.brand ?? '￿') || a.name.localeCompare(b.name));
    // explicit column sort overrides the brand grouping
    if (prodSort) {
      const get = (p: ProductRow): string | number => {
        switch (prodSort.col) {
          case 'name': return p.name;
          case 'sku': return p.sku ?? '';
          case 'total': return p.totalQty;
          case 'value': return p.totalQty * Number(p.price ?? 0);
          case 'price': return Number(p.price ?? 0);
          case 'sold30': return p.units30;
          case 'lastSold': return p.lastSold ?? '';
          default: return 0;
        }
      };
      list.sort((a, b) => {
        const av = get(a), bv = get(b);
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return prodSort.asc ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, brandFilter, lowOnly, movementFilter, search, salesMap, costMap, prodSort]);

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

  const sortedBrandStats = useMemo(() => {
    if (!brandSort) return brandStats;
    const get = (b: (typeof brandStats)[number]): string | number => {
      switch (brandSort.col) {
        case 'brand': return b.brand;
        case 'units': return b.units;
        case 'value': return b.value;
        case 'cost': return b.cost;
        case 'margin': return b.margin;
        case 'sold30': return b.u30;
        case 'sold90': return b.u90;
        case 'rev90': return b.rev90;
        case 'sellThrough': return b.sellThrough;
        case 'movement': return b.movement;
        default: return 0;
      }
    };
    return [...brandStats].sort((a, b) => {
      const av = get(a), bv = get(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return brandSort.asc ? cmp : -cmp;
    });
  }, [brandStats, brandSort]);

  const toggleSort = (
    setter: Dispatch<SetStateAction<{ col: string; asc: boolean } | null>>,
  ) => (col: string) =>
    setter((s) => (s?.col === col ? (s.asc ? { col, asc: false } : null) : { col, asc: true }));

  const SortTh = ({ col, label, sort, onSort, className = '' }: {
    col: string; label: string;
    sort: { col: string; asc: boolean } | null;
    onSort: (col: string) => void;
    className?: string;
  }) => (
    <th
      className={`px-4 py-3 cursor-pointer select-none hover:text-slate-800 whitespace-nowrap ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sort?.col === col && (sort.asc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  );

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
          {/* Summary cards — 8 clickable shortcuts */}
          {(() => {
            const profit = totals.value - products.reduce((s, p) => s + p.costValue, 0);
            const fast = products.filter((p) => p.movement === 'fast');
            const slow = products.filter((p) => p.movement === 'slow');
            const dead = products.filter((p) => p.movement === 'dead');
            const lowCount = products.filter((p) => p.low).length;
            const fastValue = fast.reduce((s, p) => s + p.totalQty * Number(p.price ?? 0), 0);
            const slowValue = slow.reduce((s, p) => s + p.totalQty * Number(p.price ?? 0), 0);
            const rev90 = [...salesMap.values()].reduce((s, v) => s + Number(v.revenue_90d ?? 0), 0);
            const u90 = products.reduce((s, p) => s + p.units90, 0);
            const u30 = products.reduce((s, p) => s + p.units30, 0);
            const topRev = [...brandStats].sort((a, b) => b.rev90 - a.rev90)[0];
            const sellThrough = u90 + totals.units > 0 ? (u90 / (u90 + totals.units)) * 100 : 0;
            const resetFilters = () => { setLowOnly(false); setMovementFilter(null); setSearch(''); };

            const cards: { label: string; value: string; sub: string; accent?: string; onClick: () => void }[] = [
              {
                label: 'Stock retail value', value: `${formatKD(totals.value)} KD`,
                sub: `${totals.inStock} products · ${totals.units} units`,
                onClick: () => { resetFilters(); setView('products'); },
              },
              hasCost
                ? {
                    label: 'Potential profit in stock', value: `${formatKD(profit)} KD`, accent: 'text-emerald-600',
                    sub: totals.value > 0 ? `${((profit / totals.value) * 100).toFixed(0)}% average margin` : '—',
                    onClick: () => { resetFilters(); setView('brands'); },
                  }
                : {
                    label: 'Brands in stock', value: String(brandStats.length),
                    sub: `${totals.units} units total`,
                    onClick: () => { resetFilters(); setView('brands'); },
                  },
              {
                label: 'Sales — last 90 days', value: `${formatKD(rev90)} KD`, accent: 'text-emerald-600',
                sub: `top brand: ${topRev?.brand ?? '—'} (${formatKD(topRev?.rev90 ?? 0)} KD)`,
                onClick: () => { resetFilters(); setView('brands'); },
              },
              {
                label: 'Sell-through — 90 days', value: `${sellThrough.toFixed(0)}%`,
                sub: `${u90} units sold · ${u30} in last 30d`,
                onClick: () => { resetFilters(); setView('brands'); },
              },
              {
                label: 'Fast movers', value: `${formatKD(fastValue)} KD`, accent: 'text-emerald-600',
                sub: `${fast.length} products sold in last 30d`,
                onClick: () => { resetFilters(); setMovementFilter('fast'); setView('products'); },
              },
              {
                label: 'Slow movers', value: `${formatKD(slowValue)} KD`, accent: 'text-amber-600',
                sub: `${slow.length} products — sold in 90d, not 30d`,
                onClick: () => { resetFilters(); setMovementFilter('slow'); setView('products'); },
              },
              {
                label: 'Not-moving stock', value: `${formatKD(totals.deadValue)} KD`,
                accent: totals.deadValue > 0 ? 'text-rose-600' : 'text-emerald-600',
                sub: `${dead.length} products · ${totals.value > 0 ? ((totals.deadValue / totals.value) * 100).toFixed(0) : 0}% of stock value`,
                onClick: () => { resetFilters(); setMovementFilter('dead'); setView('products'); },
              },
              {
                label: 'Low stock', value: String(lowCount), accent: lowCount > 0 ? 'text-amber-600' : undefined,
                sub: 'at or below reorder point',
                onClick: () => { resetFilters(); setLowOnly(true); setView('products'); },
              },
            ];

            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {cards.map((c) => (
                  <button key={c.label} onClick={c.onClick}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 text-left hover:border-slate-400 hover:shadow-md transition-all">
                    <p className="text-xs text-slate-500 mb-0.5">{c.label}</p>
                    <p className={`text-xl font-bold ${c.accent ?? 'text-slate-800'}`}>{c.value}</p>
                    <p className="text-xs text-slate-400">{c.sub}</p>
                  </button>
                ))}
              </div>
            );
          })()}

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
            {(['fast', 'slow', 'dead'] as const).map((m) => (
              <button key={m} onClick={() => setMovementFilter((v) => (v === m ? null : m))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${movementFilter === m ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                {movementStyle[m].label}
              </button>
            ))}
            <div className="ml-auto text-sm text-slate-500 self-center">
              {view === 'brands' ? `${brandStats.length} brands` : `${products.length} products`}
            </div>
          </div>

          {view === 'brands' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <SortTh col="brand" label="Brand" sort={brandSort} onSort={toggleSort(setBrandSort)} />
                    <SortTh col="units" label="Units" sort={brandSort} onSort={toggleSort(setBrandSort)} className="text-right hidden sm:table-cell" />
                    <SortTh col="value" label="Stock value" sort={brandSort} onSort={toggleSort(setBrandSort)} className="text-right" />
                    {hasCost && <SortTh col="cost" label="Cost value" sort={brandSort} onSort={toggleSort(setBrandSort)} className="text-right hidden sm:table-cell" />}
                    {hasCost && <SortTh col="margin" label="Margin" sort={brandSort} onSort={toggleSort(setBrandSort)} className="text-right" />}
                    <SortTh col="sold30" label="Sold 30d" sort={brandSort} onSort={toggleSort(setBrandSort)} className="text-right" />
                    <SortTh col="sold90" label="Sold 90d" sort={brandSort} onSort={toggleSort(setBrandSort)} className="text-right hidden sm:table-cell" />
                    <SortTh col="rev90" label="Revenue 90d" sort={brandSort} onSort={toggleSort(setBrandSort)} className="text-right hidden sm:table-cell" />
                    <SortTh col="sellThrough" label="Sell-through" sort={brandSort} onSort={toggleSort(setBrandSort)} className="text-right hidden sm:table-cell" />
                    <SortTh col="movement" label="Movement" sort={brandSort} onSort={toggleSort(setBrandSort)} className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {sortedBrandStats.map((b) => (
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
                  <SortTh col="name" label="Product" sort={prodSort} onSort={toggleSort(setProdSort)} />
                  <SortTh col="sku" label="SKU" sort={prodSort} onSort={toggleSort(setProdSort)} className="hidden sm:table-cell" />
                  {outlets.map((o) => <th key={o} className="px-4 py-3 text-right whitespace-nowrap hidden md:table-cell">{o}</th>)}
                  <SortTh col="total" label="Total" sort={prodSort} onSort={toggleSort(setProdSort)} className="text-right" />
                  <SortTh col="value" label="Value" sort={prodSort} onSort={toggleSort(setProdSort)} className="text-right" />
                  <SortTh col="price" label="Price" sort={prodSort} onSort={toggleSort(setProdSort)} className="text-right hidden sm:table-cell" />
                  <SortTh col="sold30" label="Sold 30d" sort={prodSort} onSort={toggleSort(setProdSort)} className="text-right" />
                  <SortTh col="lastSold" label="Last sold" sort={prodSort} onSort={toggleSort(setProdSort)} className="text-right hidden sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {products.length === 0 && (
                  <tr><td colSpan={outlets.length + 7} className="px-4 py-8 text-center text-slate-400">No products in stock match</td></tr>
                )}
                {products.slice(0, 500).map((p, idx, arr) => {
                  const brandLabel = p.brand ?? 'No brand';
                  // brand group headers only in the default (brand-grouped) order
                  const newBrand = !prodSort && (idx === 0 || (arr[idx - 1].brand ?? 'No brand') !== brandLabel);
                  return (
                    <Fragment key={p.product_id}>{newBrand && (
                      <tr key={`hdr-${brandLabel}`} className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={outlets.length + 7} className="px-4 py-1.5 text-xs font-bold text-slate-600 uppercase tracking-wide">
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
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{formatKD(p.totalQty * Number(p.price ?? 0))} KD</td>
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
