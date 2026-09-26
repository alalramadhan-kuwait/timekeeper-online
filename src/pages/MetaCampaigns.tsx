import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, Megaphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { Modal } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { MetaLinkChip, MetaFigureGrid } from '../components/MetaFigures';
import { MetaSummary } from '../components/MetaSummary';
import { MetaHealth } from '../components/MetaHealth';
import { CampaignBrandPicker } from '../components/CampaignBrandPicker';
import { loadBrands, attribute, type Brand, type StoredTag } from '../lib/metaBrands';
import {
  loadCampaignPage, countAvailableCampaigns, loadMetaSyncState, whenSynced, staleHours,
  rateFrom, inDisplayCurrency, displayCode, money,
  type CampaignScope, type MetaSyncState, type MetaFigures,
} from '../lib/metaAds';

/**
 * Meta Campaigns — the campaigns Meta has, as Meta reports them.
 *
 * Built as its own page rather than through the shared CRUD table, because
 * what it needs is the opposite of what that component does well: it must load
 * a SMALL default set out of 1,200 records, and its search has to reach the
 * ones it deliberately did not load. Filtering a list that is already in the
 * browser cannot do that.
 *
 * Read-only throughout. Nothing here is ours to edit.
 */
export function MetaCampaignsPage() {
  const { role, user } = useAuth();
  const canSync = ['admin', 'manager', 'marketing'].includes(role ?? '');
  const [brands, setBrands] = useState<Brand[]>([]);

  const [scope, setScope] = useState<CampaignScope>('recent');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');           // what is actually queried
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<MetaSyncState | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Record<string, any> | null>(null);

  // Typing shouldn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTerm(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await loadCampaignPage({ scope, search: term }));
    } finally {
      setLoading(false);
    }
  }, [scope, term]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void loadMetaSyncState().then(setSync);
    void countAvailableCampaigns().then(setTotal);
    void loadBrands().then(setBrands);
  }, []);

  /* A saved brand changes the figures at the top as well as the row, so it is
     written back into the list rather than re-fetched: the totals are computed
     from these rows, and a refetch would blink the whole page for one edit. */
  const tagged = useCallback((id: string, tag: StoredTag | null) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, __tag: tag } : r)));
    setOpen((o) => (o && o.id === id ? { ...o, __tag: tag } : o));
  }, []);

  async function refresh() {
    setBusy(true);
    try {
      await supabase.functions.invoke('meta-ads-sync', { body: { days: 14 } });
      await load();
    } finally {
      setBusy(false);
      void loadMetaSyncState().then(setSync);
    }
  }

  const rate = useMemo(() => rateFrom(sync), [sync]);
  const searching = term.trim().length > 0;
  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(b.__meta?.spend ?? -1) - Number(a.__meta?.spend ?? -1)),
    [rows],
  );

  const pill = !sync?.last_synced_at ? 'bg-slate-100 text-slate-500 border-slate-200'
    : staleHours(sync.last_synced_at) > 36 ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-emerald-100 text-emerald-700 border-emerald-200';

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      {sync?.last_error && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="font-semibold">Meta’s last sync did not finish.</span>{' '}
          These are the last campaigns Meta sent, from {whenSynced(sync.last_synced_at)}.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${pill}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Last successful sync: {whenSynced(sync?.last_synced_at)}
        </span>
        <span className="text-xs text-slate-400">
          {sync?.account_name ?? 'Meta ad account'} · spend in{' '}
          {displayCode(sync?.currency, rate)}
          {rate.kwdPerUsd ? ` at ${rate.kwdPerUsd} per USD` : ''}
        </span>
        {canSync && (
          <button onClick={refresh} disabled={busy}
            className="ml-auto flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> {busy ? 'Asking Meta…' : 'Refresh from Meta'}
          </button>
        )}
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Meta Campaigns</h1>
      {/* The two pages are easy to confuse, and the difference decides which one
          somebody should be looking at — but one line is enough to say it. */}
      <p className="text-slate-400 text-xs mt-1">
        Meta's own records. Budgets and contracts live in the{' '}
        <span className="inline-flex items-center gap-1 font-medium text-slate-500">
          <Megaphone size={12} /> Paid Ads Tracker
        </span>.
      </p>

      <div className="mt-4"><MetaHealth sync={sync} /></div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="meta-campaign-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or campaign ID…"
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              <X size={15} />
            </button>
          )}
        </div>
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          {([
            ['recent', 'Spending in the last 90 days'],
            ['all', 'All campaigns that spent'],
            ['untagged', 'Needs a brand'],
          ] as const).map(([v, label]) => (
            <button key={v} onClick={() => setScope(v)}
              className={`px-3 py-2 font-medium ${scope === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        {searching
          ? `${sorted.length} match${sorted.length === 1 ? '' : 'es'}${total ? ` in ${total} campaigns` : ''}.`
          : scope === 'recent'
            ? `${sorted.length} spent in the last 90 days${total ? `, of ${total} that have ever spent` : ''}.`
            : scope === 'untagged'
              ? `${sorted.length} without a brand, biggest spender first. Open one to set it — a brand set here beats what the name says.`
              : `${sorted.length} campaign${sorted.length === 1 ? '' : 's'} that have ever spent${total && sorted.length < total ? `, first 1,000 by name` : ''}.`}
      </p>

      {!loading && !!sorted.length && <MetaSummary rows={sorted} rate={rate} />}

      {loading ? (
        <div className="py-20 flex justify-center"><Spinner /></div>
      ) : !sorted.length ? (
        <div className="py-16 text-center text-slate-400">
          {searching ? `Nothing matches “${term}”.` : 'No campaign has spent anything in the last 90 days.'}
        </div>
      ) : (
        <>
          <div className="hidden lg:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Campaign</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Brand</th>
                  <th className="text-right px-4 py-3 font-semibold">Spend</th>
                  <th className="text-right px-4 py-3 font-semibold">Impressions</th>
                  <th className="text-right px-4 py-3 font-semibold">Clicks</th>
                  <th className="text-right px-4 py-3 font-semibold">CTR</th>
                  <th className="text-left px-4 py-3 font-semibold">Results</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-3">
                      <span className="block max-w-[26rem] truncate" title={r.name ?? ''}>{r.name || <span className="text-slate-400">Untitled</span>}</span>
                      <span className="block text-[11px] text-slate-400 font-mono">{r.id}</span>
                    </td>
                    <td className="px-4 py-3"><MetaLinkChip f={r.__meta as MetaFigures} /></td>
                    <td className="px-4 py-3 text-xs"><BrandCell r={r} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <SpendCell f={r.__meta as MetaFigures} rate={rate} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.__meta?.impressions ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.__meta?.clicks ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.__meta?.ctr ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.__result
                        ? <><span className="font-semibold tabular-nums">{r.__result.value}</span> <span className="text-slate-400">{r.__result.label}</span></>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {sorted.map((r) => (
              <button key={r.id} onClick={() => setOpen(r)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-slate-800 line-clamp-2">{r.name || 'Untitled'}</span>
                  <MetaLinkChip f={r.__meta as MetaFigures} />
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{r.id}</p>
                <div className="mt-1 text-xs"><BrandCell r={r} /></div>
                <div className="flex items-baseline gap-3 mt-2 text-sm">
                  <span className="font-semibold tabular-nums">
                    <SpendCell f={r.__meta as MetaFigures} rate={rate} />
                  </span>
                  {r.__result && <span className="text-xs text-slate-500">{r.__result.value} {r.__result.label}</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {open && (
        <Modal onClose={() => setOpen(null)} title={open.name || 'Campaign'}>
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-mono break-all">{open.id}</p>
            <CampaignBrandPicker
              key={open.id}
              campaignId={open.id}
              campaignName={open.name ?? null}
              tag={(open.__tag as StoredTag | null) ?? null}
              brands={brands}
              canEdit={canSync}
              userId={user?.id ?? null}
              onSaved={(t) => tagged(open.id, t)}
            />
            <MetaFigureGrid f={open.__meta as MetaFigures} rate={rate} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/** What this campaign is counted under, and whether anybody said so. The
 *  distinction is the whole point of the mapping table, so it is visible in the
 *  list rather than only inside the sheet. */
function BrandCell({ r }: { r: Record<string, any> }) {
  const a = attribute(r.name, r.__tag as StoredTag | null);
  const label = a.bucket === 'Several brands' && a.brands.length ? a.brands.join(' + ') : a.bucket;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={a.kind === 'brand' ? 'text-slate-700' : 'text-slate-400 italic'}>{label}</span>
      {a.source === 'stored'
        ? <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-px">set</span>
        : <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded px-1 py-px">from name</span>}
    </span>
  );
}

/** Spend as the page shows it, with Meta's own USD figure on hover. The KD is
 *  worked out here for display; the string Meta sent is never replaced. */
function SpendCell({ f, rate }: { f: MetaFigures; rate: import('../lib/metaAds').DisplayRate }) {
  if (!f?.spend) return <span className="text-slate-300 text-xs">no delivery</span>;
  const code = displayCode(f.account_currency, rate);
  const shown = inDisplayCurrency(Number(f.spend), f.account_currency, rate);
  return (
    <span title={code === f.account_currency ? undefined : `Meta: ${f.spend} ${f.account_currency}`}>
      {money(shown, code)} <span className="text-slate-400 text-xs">{code}</span>
    </span>
  );
}
