import { Badge } from './ui';
import { resultFor, whenSynced, type MetaFigures } from '../lib/metaAds';

/* Whether the link still points at a live campaign. Said in words, not left to
   an empty cell: "no figures" and "this campaign is gone" look identical
   otherwise, and only one of them needs somebody to do something. */
export function MetaLinkChip({ f }: { f: MetaFigures }) {
  const cls = f.link_state === 'live' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : f.link_state === 'stopped' ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-rose-100 text-rose-700 border-rose-200';
  return <Badge className={cls}>{f.status_label}</Badge>;
}

export function MetaFigureGrid({ f }: { f: MetaFigures }) {
  const res = resultFor(f);
  const cells: { label: string; value: string | null }[] = [
    { label: `Spend (${f.account_currency ?? '—'})`, value: f.spend },
    { label: 'Impressions', value: f.impressions },
    { label: 'Reach', value: f.reach },
    { label: 'Clicks', value: f.clicks },
    { label: 'CTR', value: f.ctr },
    { label: 'CPC', value: f.cpc },
    { label: 'CPM', value: f.cpm },
    ...(res ? [{ label: res.label, value: res.value }] : []),
  ];
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-2">As reported by Meta</p>
      {/* Both stated outright rather than tucked into one grey line: a figure
          is only worth reading once you know what period it covers and how old
          it is. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Campaign status</p>
          <div className="mt-0.5"><MetaLinkChip f={f} /></div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Meta reporting period</p>
          <p className="text-sm text-slate-700 tabular-nums">
            {f.date_start && f.date_stop ? `${f.date_start} → ${f.date_stop}` : 'No delivery yet'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Last synced</p>
          <p className="text-sm text-slate-700">{whenSynced(f.synced_at)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{c.label}</p>
            <p className="text-sm font-semibold text-slate-800 tabular-nums break-all">{c.value ?? '—'}</p>
          </div>
        ))}
      </div>
      {f.link_state === 'missing' && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-2">
          Meta did not return this campaign on the last successful sync. It has most likely been
          deleted. The figures above are the last ones Meta sent; pick another campaign to start
          reporting again.
        </p>
      )}
      {f.link_state === 'stopped' && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
          This campaign is {f.status_label.toLowerCase()} on Meta, so the figures stop moving until
          it runs again.
        </p>
      )}
      <p className="text-[11px] text-slate-400 mt-2">
        Figures are Meta’s and are shown unchanged — not recalculated, not converted.
      </p>
    </div>
  );
}

