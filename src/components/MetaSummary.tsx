import { useMemo } from 'react';
import { summarise, type BrandRow } from '../lib/metaBrands';

/**
 * The top of the Meta Campaigns page: what we spent, what came back, and which
 * brands it went to.
 *
 * Four figures, not nine. The ones left out were left out on purpose:
 *
 *  · Reach cannot be added up. Meta reports it as PEOPLE, counted once per
 *    campaign — the same person reached by thirty campaigns is thirty in a
 *    total and one in reality. A "Total reach" card would be wrong by a factor
 *    nobody could estimate.
 *  · CTR, CPC and CPM are ratios. The average of per-campaign ratios is not the
 *    account's ratio, and re-deriving them from the totals would be computing a
 *    Meta metric ourselves. Meta's own value for each sits in the table below.
 *  · A single "Results" number would add purchases to app installs to link
 *    clicks to conversations — six different objectives run on this account —
 *    and mean nothing. Purchases is shown on its own instead, which is
 *    comparable because it is one thing.
 */
export function MetaSummary({ rows }: { rows: Record<string, any>[] }) {
  const s = useMemo(() => summarise(rows), [rows]);
  if (!s.campaigns) return null;

  const money = (n: number) =>
    n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const count = (n: number) => Math.round(n).toLocaleString('en-GB');
  const month = (d: string | null) =>
    !d ? '' : new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const span = s.earliest && s.latest ? `${month(s.earliest)} – ${month(s.latest)}` : '';

  return (
    <div className="space-y-4 mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          label="Total spend"
          value={money(s.spend)}
          unit={s.currency}
          note={`${count(s.campaigns)} campaign${s.campaigns === 1 ? '' : 's'}${span ? ` · ${span}` : ''}`}
          strong
        />
        <Card label="Impressions" value={count(s.impressions)} note="Times the ads were shown" />
        <Card label="Clicks" value={count(s.clicks)} note="As Meta counts clicks" />
        <Card
          label="Purchases"
          value={count(s.purchases)}
          note={s.purchases
            ? `Reported by ${count(s.purchasingCampaigns)} of ${count(s.campaigns)} campaigns`
            : 'None reported for these campaigns'}
        />
      </div>

      <details className="text-xs text-slate-400">
        <summary className="cursor-pointer hover:text-slate-600 w-fit">
          Why reach, CTR, CPC and CPM are not totalled here
        </summary>
        <div className="mt-2 space-y-1.5 max-w-3xl leading-relaxed">
          <p>
            <span className="font-medium text-slate-500">Reach</span> counts people, once per
            campaign. Somebody reached by thirty campaigns would count thirty times in a total, so
            there is no honest account-wide reach to show. Meta's figure for each campaign is in the
            table.
          </p>
          <p>
            <span className="font-medium text-slate-500">CTR, CPC and CPM</span> are ratios. Averaging
            them across campaigns does not give the account's ratio, and working them out again from
            the totals would mean calculating a Meta metric ourselves rather than showing Meta's.
            Each campaign's own values are Meta's, shown unchanged.
          </p>
          <p>
            <span className="font-medium text-slate-500">A combined "Results"</span> would add
            purchases to app installs to link clicks to conversations started — this account runs six
            different objectives — and the sum would mean nothing. Purchases is shown by itself
            because it is one thing throughout.
          </p>
          <p>
            The four figures above are totals of the numbers Meta reported for the campaigns listed
            below. Each campaign's own figures are never altered. One caveat that applies to any
            cross-campaign total: a customer who was shown two campaigns before buying can be
            credited to both, so purchases summed across campaigns can run slightly ahead of orders.
          </p>
        </div>
      </details>

      <Brands s={s} />
    </div>
  );
}

function Card({ label, value, unit, note, strong }: {
  label: string; value: string; unit?: string; note?: string; strong?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3.5 ${strong ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'}`}>
      <p className={`text-[11px] uppercase tracking-wider font-semibold ${strong ? 'text-slate-400' : 'text-slate-400'}`}>{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums leading-tight">
        {value}
        {unit && <span className={`ml-1 text-xs font-medium ${strong ? 'text-slate-400' : 'text-slate-400'}`}>{unit}</span>}
      </p>
      {note && <p className={`mt-0.5 text-[11px] ${strong ? 'text-slate-400' : 'text-slate-400'}`}>{note}</p>}
    </div>
  );
}

/**
 * Spend and purchases by brand.
 *
 * Two scales on purpose, because one cannot do both jobs. A single bar of the
 * whole spend answers "where does the money go" — and on this account the
 * answer is that most of it is not for any one brand. But at that scale every
 * brand is a sliver a pixel wide, so the brand list underneath is drawn against
 * the largest BRAND instead, which is the comparison somebody scrolling to it
 * is actually making. The percentage beside each row is the true share of the
 * total in both places, so no bar can be read into a wrong number.
 *
 * "Whole shop" and "Unknown" are shown at their real size rather than dropped
 * into an "other" line. Hiding them would make a $13k brand look like the
 * biggest thing the shop does.
 */
function Brands({ s }: { s: ReturnType<typeof summarise> }) {
  const money = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
  const named = s.brands.filter((b) => b.kind === 'brand');
  const rest = s.brands.filter((b) => b.kind !== 'brand');
  const widestBrand = Math.max(...named.map((b) => b.share), 0.0001);
  const restShare = rest.reduce((t, b) => t + b.share, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-slate-800">Which brands the spend goes to</h2>
        <p className="text-xs text-slate-400">Brand read from the campaign name</p>
      </div>

      {/* The whole spend, split three ways. This is the honest headline: it is
          where the brand-level view stops being most of the picture. */}
      <div className="mt-3 flex h-3 rounded-full overflow-hidden bg-slate-100">
        <div className="bg-slate-800" style={{ width: `${s.brandShare}%` }} />
        {rest.map((b) => (
          <div key={b.brand} className={b.kind === 'shop' ? 'bg-slate-400' : 'bg-slate-200'}
            style={{ width: `${b.share}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <Key tone="bg-slate-800"
          text={`Named brands ${s.brandShare.toFixed(0)}% · ${money(s.brandSpend)} ${s.currency} · ${named.length} brand${named.length === 1 ? '' : 's'}`} />
        {rest.map((b) => (
          <Key key={b.brand} tone={b.kind === 'shop' ? 'bg-slate-400' : 'bg-slate-200'}
            text={`${b.brand} ${b.share.toFixed(0)}% · ${money(b.spend)} ${s.currency}`} />
        ))}
      </div>

      {(s.topBySpend || s.topByPurchases) && (
        <div className="flex flex-wrap gap-2 mt-4">
          {s.topBySpend && (
            <Chip label="Top brand by spend" value={s.topBySpend.brand}
              note={`${money(s.topBySpend.spend)} ${s.currency}`} />
          )}
          {s.topByPurchases && s.topByPurchases.purchases > 0 && (
            <Chip label="Top brand by purchases" value={s.topByPurchases.brand}
              note={`${money(s.topByPurchases.purchases)} purchases`} />
          )}
        </div>
      )}

      {named.length > 0 && (
        <>
          <div className="mt-4 mb-1.5 flex items-baseline gap-2">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              The {named.length} named brand{named.length === 1 ? '' : 's'}
            </p>
            <p className="text-[11px] text-slate-400">
              bars compare brands with each other · % is share of all spend
            </p>
          </div>
          <div className="space-y-1.5">
            {named.map((b) => <Bar key={b.brand} b={b} max={widestBrand} currency={s.currency} />)}
          </div>
        </>
      )}

      <p className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed max-w-3xl">
        {restShare > 50 && (
          <>
            <span className="font-medium text-slate-500">
              Most of the spend is not for one brand.
            </span>{' '}
          </>
        )}
        <span className="font-medium text-slate-500">Whole shop</span> is campaigns that were never
        for one brand — retargeting, the catalogue, the app, straps, seasonal sales.{' '}
        <span className="font-medium text-slate-500">Unknown</span> is mostly boosted Instagram
        posts: Meta names those after the post’s own caption and truncates it, often mid-word and
        before the brand appears. Neither is guessed at. Grouping by brand is our own; every
        campaign’s figures underneath stay exactly as Meta reported them.
      </p>
    </div>
  );
}

function Key({ tone, text }: { tone: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-sm ${tone}`} />
      {text}
    </span>
  );
}

function Chip({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-500 tabular-nums">{note}</p>
    </div>
  );
}

function Bar({ b, max, currency }: { b: BrandRow; max: number; currency: string }) {
  const money = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });
  const tone = b.kind === 'brand' ? 'bg-slate-800' : b.kind === 'shop' ? 'bg-slate-400' : 'bg-slate-300';
  return (
    <div className="flex items-center gap-2 sm:gap-3 text-sm">
      <span className={`w-28 sm:w-44 shrink-0 truncate ${b.kind === 'brand' ? 'text-slate-700' : 'text-slate-400 italic'}`}
        title={b.brand}>
        {b.brand}
      </span>
      {/* The bar is the first thing to give up room on a narrow screen. The
          money is why anyone opened the page; the bar only ranks it. */}
      <div className="flex-1 max-w-md h-2 rounded-full bg-slate-100 overflow-hidden min-w-[1.5rem]">
        <div className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.max((b.share / max) * 100, 1.5)}%` }} />
      </div>
      <span className="w-10 sm:w-11 text-right text-xs text-slate-400 tabular-nums shrink-0">{b.share.toFixed(1)}%</span>
      <span className="w-24 text-right tabular-nums text-slate-700 shrink-0 whitespace-nowrap">
        {money(b.spend)} <span className="text-[10px] text-slate-400">{currency}</span>
      </span>
      <span className="w-24 text-right text-xs text-slate-500 tabular-nums shrink-0 hidden md:inline whitespace-nowrap">
        {b.purchases ? `${money(b.purchases)} bought` : <span className="text-slate-300">—</span>}
      </span>
      <span className="w-24 text-right text-xs text-slate-400 tabular-nums shrink-0 hidden lg:inline whitespace-nowrap">
        {b.campaigns} campaign{b.campaigns === 1 ? '' : 's'}
      </span>
    </div>
  );
}
