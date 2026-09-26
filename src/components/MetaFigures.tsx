import { Badge } from './ui';
import {
  resultFor, purchaseFigures, whenSynced, inDisplayCurrency, displayCode, money, rateNote,
  type MetaFigures, type DisplayRate,
} from '../lib/metaAds';

/* Whether the link still points at a live campaign. Said in words, not left to
   an empty cell: "no figures" and "this campaign is gone" look identical
   otherwise, and only one of them needs somebody to do something. */
export function MetaLinkChip({ f }: { f: MetaFigures }) {
  const cls = f.link_state === 'live' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : f.link_state === 'stopped' ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-rose-100 text-rose-700 border-rose-200';
  return <Badge className={cls}>{f.status_label}</Badge>;
}

const NO_RATE: DisplayRate = { kwdPerUsd: null, updatedAt: null };

export function MetaFigureGrid({ f, rate = NO_RATE }: { f: MetaFigures; rate?: DisplayRate }) {
  const res = resultFor(f);
  const pf = purchaseFigures(f);
  /* The sheet is the one place that shows Meta's own figures untouched, so the
     spend cell keeps its USD string and the KD sits under it as a second line
     rather than in place of it. This is what somebody checks against Ads
     Manager, and a converted number there would make every check fail. */
  const code = displayCode(f.account_currency, rate);
  const asKd = f.spend && code !== f.account_currency
    ? `${money(inDisplayCurrency(Number(f.spend), f.account_currency, rate), code)} ${code}`
    : null;
  const cells: { label: string; value: string | null }[] = [
    { label: `Spend (${f.account_currency ?? '—'})`, value: f.spend },
    { label: 'Impressions', value: f.impressions },
    { label: 'Reach', value: f.reach },
    { label: 'Clicks', value: f.clicks },
    { label: 'CTR', value: f.ctr },
    { label: 'CPC', value: f.cpc },
    { label: 'CPM', value: f.cpm },
    { label: 'Frequency', value: f.frequency ?? null },
    ...(res ? [{ label: res.label, value: res.value }] : []),
    /* Only when Meta reported a purchase: an empty ROAS cell on a campaign
       that was never selling reads like a failure it did not have. */
    ...(pf.purchases ? [
      { label: `Purchase value (${f.account_currency ?? '—'})`, value: pf.value },
      { label: 'Return on spend (Meta)', value: pf.roas ? `${pf.roas}×` : null },
      { label: `Cost per purchase (${f.account_currency ?? '—'})`, value: pf.cpa },
    ] : []),
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
            {c.label.startsWith('Spend') && asKd && (
              <p className="text-[11px] text-slate-400 tabular-nums">{asKd}</p>
            )}
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
        {asKd && ` The KD line under spend is ours, ${rateNote(rate)}; the ${f.account_currency} figure is Meta’s.`}
      </p>
    </div>
  );
}

