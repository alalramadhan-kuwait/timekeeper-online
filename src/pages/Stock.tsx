import { useEffect, useMemo, useState } from 'react';
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

interface ProductRow {
  product_id: string; name: string; sku: string | null; brand: string | null; supplier: string | null;
  price: number | null;
  perOutlet: Record<string, { qty: number; reorder: number | null }>;
  totalQty: number;
  low: boolean;
}

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
        p = { product_id: r.product_id, name: r.name, sku: r.sku, brand: r.brand, supplier: r.supplier, price: r.price, perOutlet: {}, totalQty: 0, low: false };
        map.set(r.product_id, p);
      }
      p.perOutlet[r.outlet] = { qty: Number(r.stock_on_hand), reorder: r.reorder_point != null ? Number(r.reorder_point) : null };
      p.totalQty += Number(r.stock_on_hand);
      if (r.reorder_point != null && Number(r.stock_on_hand) <= Number(r.reorder_point)) p.low = true;
    }
    let list = [...map.values()];
    if (brandFilter !== 'All') list = list.filter((p) => p.brand === brandFilter);
    if (lowOnly) list = list.filter((p) => p.low);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => [p.name, p.sku, p.brand, p.supplier].some((v) => (v ?? '').toLowerCase().includes(q)));
    }
    return list;
  }, [rows, brandFilter, lowOnly, search]);

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
                  href={clientId ? `https://secure.retail.lightspeed.app/connect?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` : undefined}
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
          <div className="flex flex-wrap gap-2 mb-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU, brand…"
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white w-64" />
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
              <option>All</option>
              {brands.map((b) => <option key={b}>{b}</option>)}
            </select>
            <button onClick={() => setLowOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${lowOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              <AlertTriangle size={13} /> Low stock
            </button>
            <div className="ml-auto text-sm text-slate-500 self-center">{products.length} products</div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 hidden sm:table-cell">SKU</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Brand</th>
                  {outlets.map((o) => <th key={o} className="px-4 py-3 text-right whitespace-nowrap">{o}</th>)}
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right hidden sm:table-cell">Price</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 && (
                  <tr><td colSpan={outlets.length + 4} className="px-4 py-8 text-center text-slate-400">No products match</td></tr>
                )}
                {products.slice(0, 500).map((p) => (
                  <tr key={p.product_id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${p.low ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-700 flex items-center gap-1.5">
                        {p.low && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                        <span className="truncate max-w-[260px]" title={p.name}>{p.name}</span>
                      </div>
                      <div className="text-xs text-slate-400 sm:hidden">{[p.sku, p.brand].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{p.sku ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{p.brand ?? '—'}</td>
                    {outlets.map((o) => {
                      const cell = p.perOutlet[o];
                      const isLow = cell && cell.reorder != null && cell.qty <= cell.reorder;
                      return (
                        <td key={o} className={`px-4 py-2.5 text-right font-medium ${!cell ? 'text-slate-300' : isLow ? 'text-amber-600' : cell.qty <= 0 ? 'text-red-500' : 'text-slate-700'}`}>
                          {cell ? cell.qty : '—'}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right font-semibold">{p.totalQty}</td>
                    <td className="px-4 py-2.5 text-right hidden sm:table-cell">{p.price != null ? `${formatKD(Number(p.price))} KD` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length > 500 && (
              <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                Showing first 500 of {products.length} — use search to narrow down.
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">amber</Badge> at/below reorder point
            <Badge className="bg-red-100 text-red-600 border-red-200">red</Badge> zero or negative stock
          </div>
        </>
      )}
    </div>
  );
}
