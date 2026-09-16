import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Modal } from './ui';
import { summarise, type BrandRow } from '../lib/metaBrands';

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
export function MetaSummary({ rows }: { rows: Record<string, any>[] }) {
  const s = useMemo(() => summarise(rows), [rows]);
  const [info, setInfo] = useState(false);
  if (!s.campaigns) return null;

  return (
    <div className="space-y-3 mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card label="Total spend" value={money(s.spend)} unit={s.currency} note={span(s)} dark />
        <Card label="Impressions" value={count(s.impressions)} />
        <Card label="Clicks" value={count(s.clicks)} />
        <Card label="Purchases" value={count(s.purchases)} />
        <Card label="Spending campaigns" value={count(s.campaigns)} wide />
      </div>

      <Brands s={s} onInfo={() => setInfo(true)} />

      {info && <Methodology s={s} onClose={() => setInfo(false)} />}
    </div>
  );
}

/* ── figures ─────────────────────────────────────────────────────────────── */

const money = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
const count = (n: number) => Math.round(n).toLocaleString('en-GB');
const month = (d: string | null) =>
  !d ? '' : new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const span = (s: ReturnType<typeof summarise>) =>
  s.earliest && s.latest ? `${month(s.earliest)} – ${month(s.latest)}` : '';

/** Spend per purchase. Ours, not Meta's — Meta has no per-brand figure to
 *  report — and only shown where there is something to divide by. */
const costPer = (b: BrandRow) => (b.purchases > 0 ? b.spend / b.purchases : null);

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
  const named = s.brands.filter((b) => b.kind === 'brand');
  const rest = s.brands.filter((b) => b.kind !== 'brand');
  const top = named.slice(0, 10);
  // Bars compare brands with each other: at the scale of the whole spend, where
  // one non-brand row is most of the money, every brand is a pixel wide.
  const widest = Math.max(...top.map((b) => b.share), 0.0001);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Brands</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            <span className="font-semibold text-slate-800 tabular-nums">{s.brandShare.toFixed(0)}%</span>
            <span className="text-slate-400"> of spend assigned</span>
          </span>
          <button type="button" onClick={onInfo} aria-label="How these figures are worked out"
            className="text-slate-400 hover:text-slate-700">
            <Info size={15} />
          </button>
        </div>
      </div>

      {/* The whole spend, split three ways — the one chart that has to sum to 100. */}
      <div className="mt-3 flex h-2.5 rounded-full overflow-hidden bg-slate-100">
        <div className="bg-slate-800" style={{ width: `${s.brandShare}%` }} />
        {rest.map((b) => (
          <div key={b.brand} className={b.kind === 'shop' ? 'bg-slate-400' : 'bg-slate-200'}
            style={{ width: `${b.share}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <Key tone="bg-slate-800" name={`${named.length} brands`} value={money(s.brandSpend)}
          pct={s.brandShare} currency={s.currency} />
        {rest.map((b) => (
          <Key key={b.brand} tone={b.kind === 'shop' ? 'bg-slate-400' : 'bg-slate-200'}
            name={b.brand} value={money(b.spend)} pct={b.share} currency={s.currency} />
        ))}
      </div>

      {!!top.length && (
        <div className="mt-4 overflow-x-auto">
          <table className="text-sm w-full max-w-3xl min-w-[22rem] sm:min-w-[32rem]">
            <thead className="text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="text-left font-semibold pb-1.5 w-32">Brand</th>
                <th className="pb-1.5 w-40 hidden sm:table-cell" />
                <th className="text-right font-semibold pb-1.5 pl-3">Spend</th>
                <th className="text-right font-semibold pb-1.5 pl-4">Share</th>
                <th className="text-right font-semibold pb-1.5 pl-4">Purchases</th>
                <th className="text-right font-semibold pb-1.5 pl-4">Cost&nbsp;/&nbsp;purchase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {top.map((b) => {
                const cp = costPer(b);
                return (
                  <tr key={b.brand}>
                    <td className="py-1.5 pr-3 text-slate-700 truncate max-w-[8rem]" title={b.brand}>{b.brand}</td>
                    <td className="py-1.5 hidden sm:table-cell">
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-slate-800"
                          style={{ width: `${Math.max((b.share / widest) * 100, 2)}%` }} />
                      </div>
                    </td>
                    <td className="py-1.5 pl-3 text-right tabular-nums text-slate-800 whitespace-nowrap">{money(b.spend)}</td>
                    <td className="py-1.5 pl-4 text-right tabular-nums text-slate-400 whitespace-nowrap">{b.share.toFixed(1)}%</td>
                    <td className="py-1.5 pl-4 text-right tabular-nums text-slate-600">{b.purchases ? count(b.purchases) : '—'}</td>
                    <td className="py-1.5 pl-4 text-right tabular-nums text-slate-600 whitespace-nowrap">
                      {cp === null ? '—' : `${money(cp)} ${s.currency}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {named.length > top.length && (
            <p className="mt-2 text-[11px] text-slate-400">
              Top {top.length} of {named.length} brands by spend.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Key({ tone, name, value, pct, currency }: {
  tone: string; name: string; value: string; pct: number; currency: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-500">
      <span className={`w-2 h-2 rounded-sm ${tone}`} />
      <span>{name}</span>
      <span className="tabular-nums text-slate-700 font-medium">{value} {currency}</span>
      <span className="tabular-nums text-slate-400">{pct.toFixed(0)}%</span>
    </span>
  );
}

/* ── the reasoning, on request ───────────────────────────────────────────── */

function Methodology({ s, onClose }: { s: ReturnType<typeof summarise>; onClose: () => void }) {
  return (
    <Modal title="How these figures are worked out" onClose={onClose}>
      <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
        <p>
          Every per-campaign figure is the string Meta sent — not rounded, not converted, not
          recalculated. The five totals above are sums of those figures for the campaigns listed
          below, so they always match what is on screen, search included.
        </p>
        <Section title="What is deliberately not shown">
          <p>
            <b>Reach</b> counts people, once per campaign. Somebody reached by thirty campaigns
            would count thirty times in a total, so there is no honest account-wide reach.
          </p>
          <p>
            <b>CTR, CPC and CPM</b> are ratios. Averaging them across campaigns does not give the
            account's ratio, and re-deriving them from the totals would mean calculating a Meta
            metric rather than showing Meta's. Each campaign's own values are in the table.
          </p>
          <p>
            <b>A combined "Results"</b> would add purchases to app installs to link clicks to
            conversations — six objectives run on this account — and mean nothing. Purchases is
            shown alone because it is one thing throughout.
          </p>
        </Section>
        <Section title="Purchases">
          <p>
            Meta's Purchases, web and app counted once. {count(s.purchasingCampaigns)} of the{' '}
            {count(s.campaigns)} campaigns listed reported one. A customer shown two campaigns
            before buying can be credited to both, so a cross-campaign total can run slightly ahead
            of orders.
          </p>
        </Section>
        <Section title="Brands">
          <p>
            A brand set on a campaign always wins. Where nobody has set one, the brand is read from
            the campaign name, which works for a minority of the spend: most campaigns here are
            boosted Instagram posts, and Meta names those after the post's own caption, truncated
            mid-word and usually before the brand appears.
          </p>
          <p>
            <b>Whole shop</b> is campaigns that were never for one brand — retargeting, the
            catalogue, the app, straps, seasonal sales. <b>Unknown</b> is a campaign nobody can
            place. Neither is guessed at. <b>Several brands</b> is a campaign that really did cover
            more than one: Meta reports a single figure for it, so it is counted once under its own
            row rather than split between brands or added to each.
          </p>
          <p>
            Grouping by brand, and cost per purchase, are ours — Meta has no per-brand figure to
            report. {s.storedShare.toFixed(0)}% of the spend shown has a brand set by hand; the
            rest is read from names. Set brands on the <b>Needs a brand</b> tab.
          </p>
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-1">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
