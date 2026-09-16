import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, Megaphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { Modal } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { MetaLinkChip, MetaFigureGrid } from '../components/MetaFigures';
import {
  loadCampaignPage, countAvailableCampaigns, loadMetaSyncState, whenSynced, staleHours,
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
  const { role } = useAuth();
  const canSync = ['admin', 'manager', 'marketing'].includes(role ?? '');

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
          {sync?.account_name ?? 'Meta ad account'} · figures in {sync?.currency ?? 'USD'}
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
          somebody should be looking at. Said plainly, on both. */}
      <p className="text-slate-500 text-sm mt-1 max-w-3xl">
        Every campaign that exists on the Meta ad account, exactly as Meta reports it. To record a
        budget, a client or a contract against one, use the{' '}
        <span className="inline-flex items-center gap-1 font-medium text-slate-600">
          <Megaphone size={13} /> Paid Ads Tracker
        </span>{' '}
        — that holds the campaigns you have chosen to track commercially.
      </p>

      <div className="flex flex-wrap items-center gap-3 mt-4 mb-3">
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
          {([['recent', 'Spending in the last 90 days'], ['all', 'All campaigns that spent']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setScope(v)}
              className={`px-3 py-2 font-medium ${scope === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400 mb-3">
        {searching
          ? `Searching every campaign that has spent${total ? ` (${total})` : ''} — ${sorted.length} match${sorted.length === 1 ? '' : 'es'}.`
          : scope === 'recent'
            ? `Showing ${sorted.length} campaign${sorted.length === 1 ? '' : 's'} that spent something in the last 90 days${total ? `, out of ${total} that have ever spent` : ''}. Meta reports almost every old campaign as Active, so spend — not status — is what separates the live board from the archive. Campaigns that never spent are kept in the data but not listed anywhere.`
            : `Showing ${sorted.length} campaign${sorted.length === 1 ? '' : 's'} that have ever spent${total && sorted.length < total ? ` — first 400 of ${total} by name` : ''}.`}
      </p>

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
                  <th className="text-left px-4 py-3 font-semibold">Objective</th>
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
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.objective ? String(r.objective).replace(/^OUTCOME_/, '').replace(/_/g, ' ').toLowerCase() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.__meta?.spend
                        ? <>{r.__meta.spend} <span className="text-slate-400 text-xs">{r.__meta.account_currency}</span></>
                        : <span className="text-slate-300 text-xs">no delivery</span>}
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
                <div className="flex items-baseline gap-3 mt-2 text-sm">
                  <span className="font-semibold tabular-nums">
                    {r.__meta?.spend ? `${r.__meta.spend} ${r.__meta.account_currency}` : 'no delivery'}
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
            <MetaFigureGrid f={open.__meta as MetaFigures} />
          </div>
        </Modal>
      )}
    </div>
  );
}
