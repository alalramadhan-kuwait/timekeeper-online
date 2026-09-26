import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Badge, Spinner } from '../components/ui';

/**
 * Weekly Growth Review — the owner's summary first, the detail after.
 *
 * Every figure comes from growth_review() in the database, which reads what
 * the Meta and Lightspeed syncs stored. The Scale / Hold / Improve / Stop call
 * on each campaign is a stated rule, not a judgement, and the rules are shown
 * on the page so nobody has to take the call on trust.
 */

interface Review {
  window: { start: string; end: string; previous_start: string; previous_end: string };
  kwd_per_usd: number | null;
  meta: {
    spend_usd: number; spend_kd: number | null; purchases: number; value_usd: number; value_kd: number | null;
    roas: number | null; cpa_usd: number | null; ctr: number | null;
    previous: { spend_usd: number; purchases: number; value_usd: number };
  };
  shop: { online: { sales: number; kd: number } | null; whatsapp: { sales: number; kd: number } | null; all_kd: number | null };
  best_products: { name: string; brand: string | null; units: number; kd: number }[];
  best_creatives: { ad_id: string; name: string | null; spend_usd: number; purchases: number; value: number; ctr: number | null; permalink: string | null; thumbnail: string | null; body: string | null }[];
  campaigns: { campaign_id: string; name: string; objective: string; spend_usd: number; purchases: number; value_usd: number; conversations: number; ctr: number | null; roas: number | null; cpa_usd: number | null; max_daily_frequency: number | null; verdict: Verdict }[];
  weak: { name: string; spend_usd: number; verdict: Verdict }[];
  rules: { sales: string; messages: string; other: string };
}
type Verdict = 'Scale' | 'Hold' | 'Improve' | 'Stop';

const VERDICT: Record<Verdict, string> = {
  Scale: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Hold: 'bg-slate-100 text-slate-600 border-slate-200',
  Improve: 'bg-amber-100 text-amber-800 border-amber-200',
  Stop: 'bg-rose-100 text-rose-700 border-rose-200',
};

const kd = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })} KD`);
const usdToKd = (usd: number, rate: number | null) => (rate ? usd * rate : null);
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const yesterday = () => new Date(Date.now() + 3 * 3600_000 - 86400_000).toISOString().slice(0, 10);
const shift = (d: string, days: number) => new Date(new Date(d).getTime() + days * 86400_000).toISOString().slice(0, 10);

export function GrowthReviewPage() {
  const [end, setEnd] = useState(yesterday());
  const [r, setR] = useState<Review | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('growth_review', { p_end: end }).then(({ data, error }) => {
      setR((data as Review) ?? null);
      setErr(error?.message ?? null);
      setLoading(false);
    });
  }, [end]);

  if (loading) return <Spinner />;
  if (err || !r) return <p className="text-sm text-rose-700">The review could not be loaded: {err}</p>;

  const m = r.meta;
  const rate = r.kwd_per_usd;
  const spendDelta = m.previous.spend_usd ? ((m.spend_usd - m.previous.spend_usd) / m.previous.spend_usd) * 100 : null;
  const bestProduct = r.best_products[0];
  const bestCreative = r.best_creatives[0];
  const stop = r.campaigns.filter((c) => c.verdict === 'Stop');
  const scale = r.campaigns.filter((c) => c.verdict === 'Scale');
  const improve = r.campaigns.filter((c) => c.verdict === 'Improve');

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-xl font-bold text-slate-900">Weekly Growth Review</h1>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => setEnd(shift(end, -7))} aria-label="Previous week" className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronLeft size={16} /></button>
          <span className="tabular-nums text-slate-700 font-medium">{day(r.window.start)} – {day(r.window.end)}</span>
          <button onClick={() => setEnd(shift(end, 7))} disabled={end >= yesterday()} aria-label="Next week" className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-5">
        Meta’s figures are Meta’s attribution, in its own (Los Angeles) days; shop sales are Lightspeed’s, in Kuwait days.
        {rate ? ` USD shown in KD at ${rate}.` : ''}
      </p>

      {/* The owner's version: five lines */}
      <section className="rounded-xl bg-slate-900 text-white p-5 mb-6">
        <dl className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Headline label="Spent" value={kd(m.spend_kd)} sub={spendDelta != null ? `${spendDelta >= 0 ? '+' : ''}${spendDelta.toFixed(0)}% on last week` : undefined} />
          <Headline label="Meta sales" value={kd(m.value_kd)} sub={`${m.purchases} purchase${m.purchases === 1 ? '' : 's'}`} />
          <Headline label="Return on spend" value={m.roas != null ? `${m.roas}×` : '—'} sub={m.roas == null ? 'no attributed sales' : undefined} />
          <Headline label="Cost per purchase" value={m.cpa_usd != null ? kd(usdToKd(m.cpa_usd, rate)) : '—'} />
          <Headline label="Online + WhatsApp (Lightspeed)" value={kd((r.shop.online?.kd ?? 0) + (r.shop.whatsapp?.kd ?? 0))}
            sub={`${(r.shop.online?.sales ?? 0) + (r.shop.whatsapp?.sales ?? 0)} sales`} />
        </dl>
        <div className="mt-4 pt-4 border-t border-white/15 grid md:grid-cols-3 gap-3 text-sm">
          <p><span className="text-white/50">Best product · </span>{bestProduct ? `${bestProduct.name} (${kd(bestProduct.kd)})` : '—'}</p>
          <p><span className="text-white/50">Best creative · </span>{bestCreative ? (bestCreative.body?.slice(0, 50) || bestCreative.name || 'ad') : 'no ad spent 5+ USD'}</p>
          <p><span className="text-white/50">Decision · </span>
            {stop.length ? `Stop ${stop.length}` : ''}{stop.length && (scale.length || improve.length) ? ', ' : ''}
            {improve.length ? `improve ${improve.length}` : ''}{improve.length && scale.length ? ', ' : ''}
            {scale.length ? `scale ${scale.length}` : ''}
            {!stop.length && !improve.length && !scale.length ? (r.campaigns.length ? 'hold everything' : 'nothing ran') : ''}
          </p>
        </div>
      </section>

      {m.purchases === 0 && m.spend_usd > 0 && (
        <p className="mb-5 text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
          Meta credited no purchase to any ad this week while the website sold {r.shop.online?.sales ?? 0} times. Until
          purchase tracking is fixed (see Meta Campaigns), sales verdicts lean on clicks and are provisional.
        </p>
      )}

      {/* Campaigns and their call */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-700">Campaigns that spent</h2>
        <button onClick={() => setRules((x) => !x)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><Info size={13} /> How the call is made</button>
      </div>
      {rules && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 space-y-1">
          <p><b>Sales campaigns.</b> {r.rules.sales}</p>
          <p><b>WhatsApp campaigns.</b> {r.rules.messages}</p>
          <p><b>Everything else.</b> {r.rules.other}</p>
        </div>
      )}
      {r.campaigns.length === 0 ? (
        <p className="text-sm text-slate-400 mb-6">No campaign spent anything this week.</p>
      ) : (
        <div className="mb-6 bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Call</th>
                <th className="text-left px-3 py-2 font-semibold">Campaign</th>
                <th className="text-right px-3 py-2 font-semibold">Spend</th>
                <th className="text-right px-3 py-2 font-semibold">Purchases</th>
                <th className="text-right px-3 py-2 font-semibold">Return</th>
                <th className="text-right px-3 py-2 font-semibold">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.campaigns.map((c) => (
                <tr key={c.campaign_id}>
                  <td className="px-3 py-2"><Badge className={VERDICT[c.verdict]}>{c.verdict}</Badge></td>
                  <td className="px-3 py-2 max-w-[340px] truncate text-slate-700">{c.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{kd(usdToKd(c.spend_usd, rate))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.purchases || (c.conversations ? `${c.conversations} chats` : '—')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.roas != null ? `${c.roas}×` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.ctr != null ? `${c.ctr}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Best-selling online & WhatsApp</h2>
          {r.best_products.length ? (
            <ol className="space-y-1.5 text-sm">
              {r.best_products.map((p, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate text-slate-700">{p.name}{p.brand && <span className="text-slate-400"> · {p.brand}</span>}</span>
                  <span className="tabular-nums text-slate-500 shrink-0">{p.units} · {kd(p.kd)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-slate-400">No online or WhatsApp sales this week.</p>}
        </section>
        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Best creatives</h2>
          {r.best_creatives.length ? (
            <ol className="space-y-2 text-sm">
              {r.best_creatives.map((a) => (
                <li key={a.ad_id} className="flex items-start justify-between gap-3">
                  <span className="text-slate-700 line-clamp-2">{a.body || a.name || a.ad_id}</span>
                  <span className="text-right tabular-nums text-xs text-slate-500 shrink-0">
                    {a.purchases ? `${a.purchases} sold · ` : ''}{a.ctr != null ? `CTR ${a.ctr}%` : ''}
                    {a.permalink && <a href={a.permalink} target="_blank" rel="noopener noreferrer" className="block text-slate-400 hover:text-slate-700">post <ExternalLink size={10} className="inline" /></a>}
                  </span>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-slate-400">No ad spent 5 USD or more this week.</p>}
        </section>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Something to scale or test? <Link to="/campaign-proposals" className="underline hover:text-slate-700">Propose it</Link> — an owner approves it, and it is built on Meta paused.
      </p>
    </div>
  );
}

function Headline({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-white/50">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
      {sub && <dd className="text-[11px] text-white/50">{sub}</dd>}
    </div>
  );
}
