import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Modal } from './ui';
import { summarise } from '../lib/metaBrands';
import { money, type DisplayRate } from '../lib/metaAds';

/**
 * The top of the Meta Campaigns page: spend, then performance, then brands.
 *
 * Numbers first. What is NOT on the page took as much deciding as what is, so
 * the reasoning lives behind the Info button rather than in front of it:
 * reach cannot be added up (Meta counts people, once per campaign), ratios
 * cannot be averaged, and a single "Results" figure across six objectives
 * would mean nothing. Those rules still hold — they are just not read aloud
 * every time somebody opens the page.
 */
export function MetaSummary({ rows, rate }: {
  rows: Record<string, any>[];
  /** Meta bills this account in USD; the shop thinks in KD. Everything here is
   *  drawn in KD at the rate an owner set, and the rate is shown beside it. */
  rate: DisplayRate;
}) {
  const s = useMemo(() => summarise(rows, rate), [rows, rate]);
  const [info, setInfo] = useState(false);
  if (!s.campaigns) return null;

  return (
    <div className="space-y-3 mb-5">
      <div className="grid grid-cols-3 gap-3">
        <Card label="Spend" value={money(s.spend, s.currency)} unit={s.currency} note={span(s)} dark />
        {/* Ours: total value over total spend. Meta's own ROAS is per
            campaign and is on each campaign's sheet. */}
        <Card label="Return" value={s.spend > 0 && s.purchaseValue > 0 ? `${(s.purchaseValue / s.spend).toFixed(2)}×` : '—'}
          note={s.purchaseValue > 0 ? `${money(s.purchaseValue, s.currency)} ${s.currency} sales` : 'no sales credited'} />
        <Card label="Purchases" value={count(s.purchases)}
          note={s.purchases > 0 ? `${money(s.spend / s.purchases, s.currency)} ${s.currency} each` : `${count(s.campaigns)} campaigns`} />
      </div>

      <Brands s={s} onInfo={() => setInfo(true)} />

      {info && <Methodology s={s} rate={rate} onClose={() => setInfo(false)} />}
    </div>
  );
}

/* ── figures ─────────────────────────────────────────────────────────────── */

const count = (n: number) => Math.round(n).toLocaleString('en-GB');
const month = (d: string | null) =>
  !d ? '' : new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const span = (s: ReturnType<typeof summarise>) =>
  s.earliest && s.latest ? `${month(s.earliest)} – ${month(s.latest)}` : '';

function Card({ label, value, unit, note, dark, wide }: {
  label: string; value: string; unit?: string; note?: string; dark?: boolean; wide?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3.5 ${wide ? 'col-span-2 lg:col-span-1' : ''} ${dark ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'}`}>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums leading-tight">
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-slate-400">{unit}</span>}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-slate-400 tabular-nums">{note}</p>}
    </div>
  );
}

/* ── brands ──────────────────────────────────────────────────────────────── */

function Brands({ s, onInfo }: { s: ReturnType<typeof summarise>; onInfo: () => void }) {
  const m = (n: number) => money(n, s.currency);
  const named = s.brands.filter((b) => b.kind === 'brand');
  const rest = s.brands.filter((b) => b.kind !== 'brand');
  const top = named.slice(0, 8);
  // Bars compare brands with each other: at the scale of the whole spend, where
  // one non-brand row can be most of the money, every brand is a pixel wide.
  const widest = Math.max(...top.map((b) => b.share), 0.0001);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-slate-800">Spend by brand</h2>
        <button type="button" onClick={onInfo} aria-label="How these figures are worked out"
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <span className="tabular-nums font-semibold text-slate-700">{s.brandShare.toFixed(0)}%</span> known <Info size={14} />
        </button>
      </div>
      {top.length ? (
        <ul className="space-y-2">
          {top.map((b) => (
            <li key={b.brand} className="grid grid-cols-[7rem_1fr_auto] sm:grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate text-slate-700" title={b.brand}>{b.brand}</span>
              <span className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.max((b.share / widest) * 100, 2)}%` }} />
              </span>
              <span className="tabular-nums text-xs text-slate-600 whitespace-nowrap">{m(b.spend)} {s.currency} · {b.share.toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-400">No brand known for this spend yet.</p>}
      {!!rest.length && (
        <p className="mt-3 text-[11px] text-slate-500">
          {rest.map((b) => `${b.brand} ${b.share.toFixed(0)}%`).join(' · ')}
          {named.length > top.length && ` · ${named.length - top.length} more brands`}
        </p>
      )}
    </div>
  );
}

/* ── the reasoning, on request ───────────────────────────────────────────── */

function Methodology({ s, rate, onClose }: {
  s: ReturnType<typeof summarise>; rate: DisplayRate; onClose: () => void;
}) {
  return (
    <Modal title="How these figures are worked out" onClose={onClose}>
      <ul className="space-y-2 text-sm text-slate-600 leading-relaxed list-disc pl-4">
        <li>Figures are Meta’s, unchanged. Totals add up the campaigns listed.</li>
        <li>Spend is shown in KD{rate.kwdPerUsd ? <> at <b>{rate.kwdPerUsd}</b> per USD</> : null}; each campaign’s sheet keeps Meta’s USD.</li>
        <li>No total reach, CTR or CPC: they can’t be added across campaigns.</li>
        <li>Purchases: {count(s.purchasingCampaigns)} of {count(s.campaigns)} campaigns reported one. A sale can be credited to two campaigns.</li>
        <li>Brands: set by hand ({s.storedShare.toFixed(0)}% of spend), else found in the ad text (Arabic spellings too), else read from the campaign name. Set missing ones on <b>Needs a brand</b>.</li>
      </ul>
    </Modal>
  );
}
