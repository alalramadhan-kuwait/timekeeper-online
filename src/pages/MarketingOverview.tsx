import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Badge, Spinner } from '../components/ui';
import { loadMetaSyncState, type MetaSyncState } from '../lib/metaAds';
import { trackingState } from '../components/MetaHealth';

/**
 * Marketing Overview — the first page of Media & Marketing (replaces the
 * Weekly Growth Review, 27 Sep).
 *
 * One screen, read top to bottom: is anything wrong or waiting (the health
 * row), how the week went against the week before (four tiles), whether ad
 * spend moved sales (the chart), what the money is pushing next to what sells
 * (brand / where / account), each campaign's call, and the best sellers.
 *
 * The week comes from growth_review(); the chart, the pushing split and the
 * waiting counts from marketing_overview(). Both read what the Meta and
 * Lightspeed syncs stored; nothing here asks Meta directly.
 */

type Verdict = 'Scale' | 'Hold' | 'Improve' | 'Stop';
interface Review {
  window: { start: string; end: string };
  kwd_per_usd: number | null;
  meta: {
    spend_usd: number; purchases: number; value_usd: number;
    roas: number | null; cpa_usd: number | null;
    previous: { spend_usd: number; purchases: number; value_usd: number };
  };
  shop: { online: { sales: number; kd: number } | null; whatsapp: { sales: number; kd: number } | null };
  best_products: { name: string; brand: string | null; units: number; kd: number }[];
  campaigns: { campaign_id: string; name: string; spend_usd: number; purchases: number; conversations: number; roas: number | null; verdict: Verdict }[];
  rules: { sales: string; messages: string; other: string };
}
interface Overview {
  window: { start: string; end: string; days: number };
  spend_usd: number;
  last_spend_day: string | null;
  daily: { day: string; spend_usd: number; online_kd: number; whatsapp_kd: number }[];
  needs: { proposals: number; client_unpaid: number; client_unpaid_kd: number; client_no_report: number };
  pushing: {
    brand: { brand: string; spend_usd: number; spend_share: number | null; sales_kd: number; sales_share: number | null }[];
    unknown_share: number | null;
    unknown_campaigns: number;
    where: { dest: string; spend_usd: number; spend_share: number | null; campaigns: number }[];
    account: { account: string; spend_usd: number; spend_share: number | null }[];
    channels: { channel: string; sales_kd: number; sales: number; sales_share: number | null }[];
  };
}

const VERDICT: Record<Verdict, string> = {
  Scale: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Hold: 'bg-slate-100 text-slate-600 border-slate-200',
  Improve: 'bg-amber-100 text-amber-800 border-amber-200',
  Stop: 'bg-rose-100 text-rose-700 border-rose-200',
};
const CHANNEL: Record<string, string> = {
  online: 'Online (website & app)', whatsapp: 'WhatsApp', avenues: 'Avenues store', time_gallery: 'Time Gallery store',
};

const kd = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(Number(n)).toLocaleString('en-GB')} KD`);
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const yesterday = () => new Date(Date.now() + 3 * 3600_000 - 86400_000).toISOString().slice(0, 10);
const shift = (d: string, days: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);

export function MarketingOverviewPage() {
  const [end, setEnd] = useState(yesterday());
  const [span, setSpan] = useState<7 | 30 | 90>(30);
  const [r, setR] = useState<Review | null>(null);
  const [o, setO] = useState<Overview | null>(null);
  const [sync, setSync] = useState<MetaSyncState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { void loadMetaSyncState().then(setSync); }, []);
  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.rpc('growth_review', { p_end: end }),
      supabase.rpc('marketing_overview', { p_end: end, p_days: span }),
    ]).then(([a, b]) => {
      setR((a.data as Review) ?? null);
      setO((b.data as Overview) ?? null);
      setErr(a.error?.message ?? b.error?.message ?? null);
      setLoading(false);
    });
  }, [end, span, attempt]);

  if (loading && !r) return <Spinner />;
  if (err || !r || !o) return (
    <div className="text-sm text-rose-700 space-y-2">
      <p>The overview could not be loaded{err ? `: ${err}` : '.'}</p>
      <button onClick={() => setAttempt((a) => a + 1)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50">Try again</button>
    </div>
  );

  const rate = r.kwd_per_usd ?? 0;
  const m = r.meta;
  const p = m.previous;
  const prevRoas = p.spend_usd > 0 && p.value_usd > 0 ? p.value_usd / p.spend_usd : null;
  const prevCpa = p.purchases > 0 ? p.spend_usd / p.purchases : null;
  const shopKd = (r.shop.online?.kd ?? 0) + (r.shop.whatsapp?.kd ?? 0);

  return (
    <div className="max-w-5xl min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Marketing Overview</h1>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => setEnd(shift(end, -7))} aria-label="Previous week" className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronLeft size={16} /></button>
          <span className="tabular-nums text-slate-700 font-medium">{day(r.window.start)} – {day(r.window.end)}</span>
          <button onClick={() => setEnd(shift(end, 7))} disabled={end >= yesterday()} aria-label="Next week" className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </div>

      <Health sync={sync} o={o} end={r.window.end} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Ad spend" value={kd(m.spend_usd * rate)} now={m.spend_usd} before={p.spend_usd} good={null} />
        <Tile label="Sales from ads" value={kd(m.value_usd * rate)} now={m.value_usd} before={p.value_usd} good="up" hint={`${m.purchases} purchase${m.purchases === 1 ? '' : 's'} Meta credits`} />
        <Tile label="Return" value={m.roas != null ? `${m.roas}×` : '—'} now={m.roas} before={prevRoas} good="up" />
        <Tile label="Cost per sale" value={m.cpa_usd != null ? kd(m.cpa_usd * rate) : '—'} now={m.cpa_usd} before={prevCpa} good="down" />
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-800">Ad spend and online sales, day by day</h2>
          <p className="text-xs text-slate-500">Online + WhatsApp this week: <b className="text-slate-800 tabular-nums">{kd(shopKd)}</b></p>
        </div>
        <DailyChart days={o.daily} rate={rate} />
      </section>

      <Pushing o={o} span={span} setSpan={setSpan} rate={rate} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Calls r={r} rate={rate} />
        <BestSellers r={r} />
      </div>

      <p className="text-xs text-slate-400">
        <Link to="/campaign-proposals" className="underline hover:text-slate-700">Propose a campaign</Link>
        {' · '}Meta: Los Angeles days · Shop: Kuwait days{rate ? ` · ${rate} KD/USD` : ''}
      </p>
    </div>
  );
}

/* ── health row ───────────────────────────────────────────────────────── */

const DOT = { good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500', none: 'bg-slate-300' } as const;

function Health({ sync, o, end }: { sync: MetaSyncState | null; o: Overview; end: string }) {
  const t = trackingState(sync);
  const quiet = !o.last_spend_day || o.last_spend_day < shift(end, -1);
  const n = o.needs;
  const waiting = n.proposals + n.client_unpaid + n.client_no_report > 0;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Pill to="/meta-campaigns" tone={!t ? 'none' : t.tone === 'emerald' ? 'good' : t.tone === 'amber' ? 'warn' : 'bad'}>
        {t ? t.title : 'Tracking not checked yet'}{t?.fbc != null && t.tone === 'emerald' ? ` · ${t.fbc}% linked` : ''}
      </Pill>
      <Pill to="/meta-campaigns" tone={quiet ? 'warn' : 'good'}>
        {quiet ? (o.last_spend_day ? `No ad spend since ${day(o.last_spend_day)}` : 'No ad spend yet') : 'Ads are running'}
      </Pill>
      {waiting ? <>
        {n.proposals > 0 && <Pill to="/campaign-proposals" tone="warn">{n.proposals} proposal{n.proposals === 1 ? '' : 's'} to decide</Pill>}
        {n.client_unpaid > 0 && <Pill to="/paid-ads" tone="warn">{kd(n.client_unpaid_kd)} unpaid by clients</Pill>}
        {n.client_no_report > 0 && <Pill to="/paid-ads" tone="warn">{n.client_no_report} client report{n.client_no_report === 1 ? '' : 's'} to send</Pill>}
      </> : <Pill tone="good">Nothing waiting for you</Pill>}
    </div>
  );
}

function Pill({ tone, to, children }: { tone: keyof typeof DOT; to?: string; children: React.ReactNode }) {
  const cls = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-700';
  const body = <><span className={`w-2 h-2 rounded-full ${DOT[tone]}`} aria-hidden />{children}</>;
  return to ? <Link to={to} className={`${cls} hover:border-slate-400`}>{body}</Link> : <span className={cls}>{body}</span>;
}

/* ── tiles ─────────────────────────────────────────────────────────────── */

function Tile({ label, value, now, before, good, hint }: {
  label: string; value: string; now: number | null; before: number | null; good: 'up' | 'down' | null; hint?: string;
}) {
  let delta: React.ReactNode = null;
  if (now != null && before != null && before > 0) {
    const change = ((now - before) / before) * 100;
    const up = change >= 0;
    const tone = good == null || Math.abs(change) < 1 ? 'text-slate-500' : (up === (good === 'up')) ? 'text-emerald-600' : 'text-rose-600';
    delta = <span className={`text-xs font-semibold tabular-nums ${tone}`}>{up ? '▲' : '▼'} {Math.abs(change).toFixed(0)}%</span>;
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 tabular-nums truncate">{value}</p>
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400 min-h-4">{delta}{delta && <span>vs last week</span>}{!delta && hint}</p>
      {delta && hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

/* ── daily chart: spend bars, sales line ───────────────────────────────── */

function DailyChart({ days, rate }: { days: Overview['daily']; rate: number }) {
  const W = 360, H = 170, L = 30, R = 38, T = 10, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const spend = days.map((d) => d.spend_usd * rate);
  const sales = days.map((d) => d.online_kd + d.whatsapp_kd);
  const maxS = Math.max(1, ...spend), maxL = Math.max(1, ...sales);
  const step = iw / days.length;
  const x = (i: number) => L + step * i + step / 2;
  const yS = (v: number) => T + ih - (v / maxS) * ih;
  const yL = (v: number) => T + ih - (v / maxL) * ih;
  const line = sales.map((v, i) => `${x(i)},${yL(v)}`).join(' ');
  const noSpend = spend.every((v) => v === 0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
           aria-label={`Ad spend and online sales for ${days.length} days`}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={L} x2={W - R} y1={T + ih - f * ih} y2={T + ih - f * ih} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        {spend.map((v, i) => (
          <rect key={i} x={x(i) - step * 0.28} width={step * 0.56} y={yS(v)} height={Math.max(0, T + ih - yS(v))} rx="3" fill="#f5c16c">
            <title>{`${day(days[i].day)}: ad spend ${kd(v)}`}</title>
          </rect>
        ))}
        <polyline points={line} fill="none" stroke="#059669" strokeWidth="2" strokeLinejoin="round" />
        {sales.map((v, i) => (
          <circle key={i} cx={x(i)} cy={yL(v)} r="3" fill="#059669"><title>{`${day(days[i].day)}: online + WhatsApp ${kd(v)}`}</title></circle>
        ))}
        {days.map((d, i) => (
          <text key={d.day} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#64748b">
            {new Date(`${d.day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })}
          </text>
        ))}
        <text x={L - 6} y={T + 4} textAnchor="end" fontSize="10.5" fill="#b7791f">{kd(maxS).replace(' KD', '')}</text>
        <text x={L - 6} y={T + ih} textAnchor="end" fontSize="10.5" fill="#b7791f">0</text>
        <text x={W - R + 6} y={T + 4} fontSize="10.5" fill="#059669">{kd(maxL).replace(' KD', '')}</text>
        <text x={W - R + 6} y={T + ih} fontSize="10.5" fill="#059669">0</text>
      </svg>
      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#f5c16c]" />Ad spend (KD, left)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-600" />Online + WhatsApp sales (KD, right)</span>
        {noSpend && <span className="text-amber-700">No ad spend these days</span>}
      </div>
    </div>
  );
}

/* ── what we're pushing ────────────────────────────────────────────────── */

function Pushing({ o, span, setSpan, rate, loading }: {
  o: Overview; span: 7 | 30 | 90; setSpan: (s: 7 | 30 | 90) => void; rate: number; loading: boolean;
}) {
  const [tab, setTab] = useState<'brand' | 'where' | 'account'>('brand');
  const P = o.pushing;
  const seg = 'px-2.5 py-1 rounded-md text-xs font-semibold';
  return (
    <section className={`bg-white rounded-xl border border-slate-200 p-4 ${loading ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-800">What we’re pushing</h2>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {([7, 30, 90] as const).map((d) => (
            <button key={d} onClick={() => setSpan(d)} className={`${seg} ${span === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{d} days</button>
          ))}
        </div>
      </div>
      <div className="flex gap-1 mb-3 border-b border-slate-100">
        {([['brand', 'Brand'], ['where', 'Where'], ['account', 'Account']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${tab === k ? 'border-slate-900 text-slate-900 font-semibold' : 'border-transparent text-slate-500'}`}>{l}</button>
        ))}
      </div>
      <p className="text-xs text-slate-500 mb-3">
        {kd(o.spend_usd * rate)} ad spend, {day(o.window.start)} – {day(o.window.end)}.
      </p>

      {tab === 'brand' && (
        o.pushing.brand.length === 0 ? <Empty /> : <>
          <div className="flex gap-4 text-[11px] text-slate-500 mb-2">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-amber-400" />Share of ad spend</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-emerald-500" />Share of sales (all shops)</span>
          </div>
          <ul className="space-y-2.5">
            {P.brand.map((b) => (
              <li key={b.brand} className="grid grid-cols-[7.5rem_1fr] sm:grid-cols-[10rem_1fr] gap-3 items-center">
                <span className={`text-sm truncate ${b.brand === 'Unknown' ? 'text-slate-400 italic' : 'text-slate-700'}`} title={b.brand}>{b.brand}</span>
                <span className="space-y-1">
                  <Bar pct={b.spend_share} color={b.brand === 'Unknown' ? 'bg-slate-300' : 'bg-amber-400'} label={b.spend_share != null ? `${b.spend_share}%` : '—'} />
                  {b.brand !== 'Unknown' && <Bar pct={b.sales_share} color="bg-emerald-500" label={b.sales_share != null ? `${b.sales_share}%` : '—'} />}
                </span>
              </li>
            ))}
          </ul>
          {(P.unknown_share ?? 0) > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {P.unknown_share}% of spend ({P.unknown_campaigns} campaign{P.unknown_campaigns === 1 ? '' : 's'}) has no known brand.{' '}
              <Link to="/meta-campaigns?scope=untagged" className="underline text-slate-700 hover:text-slate-900">Set brands</Link>
            </p>
          )}
        </>
      )}

      {tab === 'where' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <h3 className="text-xs font-semibold text-slate-600 mb-2">Ads sent people to</h3>
            {P.where.length === 0 ? <Empty /> : (
              <ul className="space-y-2">
                {P.where.map((w) => (
                  <li key={w.dest} className="grid grid-cols-[7.5rem_1fr] gap-3 items-center">
                    <span className="text-sm text-slate-700 truncate">{w.dest}</span>
                    <Bar pct={w.spend_share} color="bg-amber-400" label={`${w.spend_share ?? 0}%`} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-600 mb-2">Sales came from</h3>
            <ul className="space-y-2">
              {P.channels.map((c) => (
                <li key={c.channel} className="grid grid-cols-[7.5rem_1fr] gap-3 items-center">
                  <span className="text-sm text-slate-700 truncate" title={CHANNEL[c.channel] ?? c.channel}>{CHANNEL[c.channel] ?? c.channel}</span>
                  <Bar pct={c.sales_share} color="bg-emerald-500" label={`${c.sales_share ?? 0}%`} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'account' && (
        P.account.length === 0 ? <Empty /> : (
          <ul className="space-y-2">
            {P.account.map((a) => (
              <li key={a.account} className="grid grid-cols-[10rem_1fr] gap-3 items-center">
                <span className="text-sm text-slate-700 truncate">{a.account}</span>
                <Bar pct={a.spend_share} color="bg-amber-400" label={`${a.spend_share ?? 0}% · ${kd(a.spend_usd * rate)}`} />
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

function Bar({ pct, color, label }: { pct: number | null; color: string; label: string }) {
  const w = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <span className="flex items-center gap-2">
      <span className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </span>
      <span className="w-auto min-w-10 text-right text-xs tabular-nums text-slate-600 whitespace-nowrap">{label}</span>
    </span>
  );
}

const Empty = () => <p className="text-sm text-slate-400">No ad spend in these days.</p>;

/* ── calls and best sellers ────────────────────────────────────────────── */

function Calls({ r, rate }: { r: Review; rate: number }) {
  const [rules, setRules] = useState(false);
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-800">This week’s calls</h2>
        <button onClick={() => setRules((x) => !x)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><Info size={13} /> Rules</button>
      </div>
      {rules && (
        <div className="mb-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
          <p><b>Sales:</b> {r.rules.sales}</p>
          <p><b>Messages:</b> {r.rules.messages}</p>
          <p><b>Other:</b> {r.rules.other}</p>
        </div>
      )}
      {r.campaigns.length === 0 ? <p className="text-sm text-slate-400">No spend this week.</p> : (
        <ul className="divide-y divide-slate-100">
          {r.campaigns.map((c) => (
            <li key={c.campaign_id} className="flex items-center gap-3 py-2 min-w-0">
              <Badge className={VERDICT[c.verdict]}>{c.verdict}</Badge>
              <Link to={`/meta-campaigns?q=${encodeURIComponent(c.campaign_id)}`} dir="auto" className="flex-1 min-w-0 truncate text-sm text-slate-700 hover:text-slate-900 hover:underline" title={c.name}>
                {/* Boosted posts are all named "Instagram post: <caption>"; the caption is what tells them apart. */}
                {c.name.replace(/^Instagram post:\s*[\u200e\u2068]*/, '')}
              </Link>
              <span className="text-xs tabular-nums text-slate-500 shrink-0">{kd(c.spend_usd * rate)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BestSellers({ r }: { r: Review }) {
  const max = Math.max(1, ...r.best_products.map((p) => Number(p.kd)));
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 min-w-0">
      <h2 className="text-sm font-semibold text-slate-800 mb-2">Best sellers online & WhatsApp</h2>
      {r.best_products.length === 0 ? <p className="text-sm text-slate-400">None this week.</p> : (
        <ul className="space-y-2.5">
          {r.best_products.map((p, i) => (
            <li key={i} className="min-w-0">
              <div className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-slate-700" title={p.name}>{p.name}{p.brand && <span className="text-slate-400"> · {p.brand}</span>}</span>
                <span className="shrink-0 tabular-nums text-slate-500 text-xs">{p.units} · {kd(p.kd)}</span>
              </div>
              <span className="block mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(Number(p.kd) / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
