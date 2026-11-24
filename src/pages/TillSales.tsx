/**
 * Till sales: one month of what rang through the tills, for the regular outlets
 * together or one of them, against its target. Opened from Today's Sales card
 * (the card link, each outlet row, the total row, the Expo row) and from Money.
 *
 *   /till-sales?outlet=<code>&month=YYYY-MM
 *
 * `outlet` is a regular channel's code (avenues, time_gallery, online,
 * whatsapp) or absent for the four together; `month` defaults to this month.
 *
 * Before this page, Today's "Open →" went to Sales Reports, which adds up the
 * sales staff log by hand in the DSR — 1 sale and 0 KD for November while the
 * tills had 61k. That page is now named for what it is (Visits & lost sales).
 *
 * The figures are the same ones Today shows, from the same shared helper
 * (src/shared/tillSales.ts): only the four regular channels count against the
 * target, pace is in till days, and an event register (the Expo, channel_code
 * NULL) is its own grey row with no target, never inside the percentage.
 *
 * Two reads: pos_channel_sales from the first of the month before (for the
 * same-days comparison) to the end of the month shown, and the targets.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { outletName, sellingOutlets, type OutletCode } from '../shared/outlets';
import { kuwaitDate } from '../shared/attendanceStatus';
import { monthSales, eventDates, sameDaysBefore, prevMonthOf, daysInMonthOf, type MonthSales, type TillRow } from '../shared/tillSales';
import { Chip, PaceBar, TONE, type Tone } from '../components/TodayCard';
import { BackToToday, useCameFromToday } from '../components/FromToday';

const TIMEOUT_MS = 10_000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const bare = (name: string) => name.replace(/^time ?keeper\s*-?\s*/i, '') || name;
const short = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
const kd = (n: number) => `${short(n)} KD`;
const full = (n: number, dp = 0) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp });
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayOf = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;
const longMonth = (ym: string) => `${new Date(`${ym}-15T12:00:00+03:00`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'Asia/Kuwait' })} ${ym.slice(0, 4)}`;
const nextMonthOf = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

interface Targets {
  sales_target_month: number | null; sales_target_avenues: number | null; sales_target_timegallery: number | null;
  sales_target_online: number | null; sales_target_whatsapp: number | null;
}
interface Loaded { rows: TillRow[]; ms: MonthSales }

function within<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`did not answer within ${TIMEOUT_MS / 1000} seconds`)), TIMEOUT_MS);
    p.then((v) => { window.clearTimeout(t); resolve(v); }, (e) => { window.clearTimeout(t); reject(e); });
  });
}

async function load(month: string): Promise<Loaded> {
  const last = `${month}-${String(daysInMonthOf(month)).padStart(2, '0')}`;
  const [posQ, setQ] = await Promise.all([
    supabase.from('pos_channel_sales').select('channel_code, outlet, sale_date, revenue, sale_count')
      .gte('sale_date', `${prevMonthOf(month)}-01`).lte('sale_date', last),
    supabase.from('settings')
      .select('sales_target_month, sales_target_avenues, sales_target_timegallery, sales_target_online, sales_target_whatsapp')
      .maybeSingle(),
  ]);
  if (posQ.error) throw new Error(`Till sales: ${posQ.error.message}`);
  if (setQ.error) throw new Error(`Targets: ${setQ.error.message}`);
  const rows = (posQ.data ?? []) as TillRow[];
  const t = (setQ.data ?? {}) as Partial<Targets>;
  const num = (v: unknown) => (v == null ? null : Number(v));
  const ms = monthSales(rows, {
    month,
    monthTarget: num(t.sales_target_month),
    targets: {
      avenues: num(t.sales_target_avenues), time_gallery: num(t.sales_target_timegallery),
      online: num(t.sales_target_online), whatsapp: num(t.sales_target_whatsapp),
    },
  });
  return { rows, ms };
}

export default function TillSalesPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const cameFromToday = useCameFromToday();
  const thisMonth = kuwaitDate().slice(0, 7);
  const mp = params.get('month') ?? '';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(mp) && mp <= thisMonth ? mp : thisMonth;
  const regular = sellingOutlets();
  const op = params.get('outlet');
  const outlet = op ? regular.find((o) => o.code === op) ?? null : null;
  const unknownOutlet = !!op && !outlet;

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const gen = useRef(0);
  const run = useCallback(() => {
    const g = ++gen.current;
    setLoading(true);
    setError(null);
    within(load(month)).then(
      (d) => { if (g === gen.current) { setData(d); setLoading(false); } },
      (e: unknown) => { if (g === gen.current) { setData(null); setError(e instanceof Error ? e.message : String(e)); setLoading(false); } },
    );
  }, [month]);
  useEffect(() => { run(); }, [run]);

  /* Switching outlet or month replaces the entry, so Back still goes straight to
     where the page was opened from, and keeps the way back to Today. */
  const to = (o: string | null, m: string) => {
    const q = new URLSearchParams();
    if (o) q.set('outlet', o);
    if (m !== thisMonth) q.set('month', m);
    const s = q.toString();
    return `/till-sales${s ? `?${s}` : ''}`;
  };
  const linkProps = { replace: true, state: location.state } as const;

  const scopeName = outlet ? bare(outletName(outlet.code)) : 'Regular outlets';
  const ms = data?.ms ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3">
        {cameFromToday && <BackToToday />}
        <h1 className="text-xl font-bold text-slate-900">Till sales</h1>
        <p className="text-[14px] text-slate-600">
          {scopeName} · {longMonth(month)}
          {ms?.lastSaleDay ? ` · sales to end of ${dayOf(ms.lastSaleDay)}` : ''}
        </p>
      </div>

      {/* which outlet */}
      <nav aria-label="Outlet" className="mb-2 flex flex-wrap gap-1.5">
        {[{ code: null as OutletCode | null, name: 'All regular' }, ...regular.map((o) => ({ code: o.code as OutletCode | null, name: bare(outletName(o.code)) }))].map((o) => {
          const active = (outlet?.code ?? null) === o.code && !unknownOutlet;
          return (
            <Link key={o.code ?? 'all'} to={to(o.code, month)} {...linkProps} aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-[44px] items-center rounded-xl border px-3 text-[14px] font-semibold ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {o.name}
            </Link>
          );
        })}
      </nav>

      {/* which month */}
      <div className="mb-3 flex items-center gap-1">
        <Link to={to(outlet?.code ?? null, prevMonthOf(month))} {...linkProps} aria-label={`Previous month, ${longMonth(prevMonthOf(month))}`}
          className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
        <span className="min-w-[9rem] px-2 text-center text-[15px] font-semibold text-slate-900">{longMonth(month)}</span>
        {month < thisMonth ? (
          <Link to={to(outlet?.code ?? null, nextMonthOf(month))} {...linkProps} aria-label={`Next month, ${longMonth(nextMonthOf(month))}`}
            className="grid h-11 w-11 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Link>
        ) : <span className="grid h-11 w-11 place-items-center text-[12px] text-slate-600" aria-hidden />}
        {month !== thisMonth && (
          <Link to={to(outlet?.code ?? null, thisMonth)} {...linkProps}
            className="ml-auto inline-flex min-h-[44px] items-center rounded-lg px-2 text-[14px] font-semibold text-slate-700 hover:bg-slate-100">This month</Link>
        )}
      </div>

      {unknownOutlet ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[14px] text-slate-700">
          There is no regular outlet called “{op}”. <Link to={to(null, month)} {...linkProps} className="font-semibold text-blue-700 underline">Show all regular outlets</Link>
        </div>
      ) : !data ? (
        error ? (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[14px] text-rose-700">
            <p className="flex items-start gap-2 font-semibold"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              Could not load till sales: unknown, not zero.</p>
            <p className="mt-0.5 break-words text-[13px]">{error}</p>
            <button type="button" onClick={run} disabled={loading}
              className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60">
              <RotateCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden /> {loading ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4" aria-busy="true" aria-label="Loading till sales">
            <div className="h-8 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-36 w-full animate-pulse rounded bg-slate-100" />
            <p className="text-[13px] text-slate-600">Loading till sales…</p>
          </div>
        )
      ) : (
        <Body data={data} month={month} isCurrent={month === thisMonth} code={outlet?.code ?? null}
          rowLink={(c) => to(c, month)} linkProps={linkProps} />
      )}

      <p className="mt-4 text-[13px] leading-[18px] text-slate-600">
        From the tills (Lightspeed), synced each morning, so the month runs to the last day the tills sent.
        What the shop teams log by hand is on another page.
      </p>
      <Link to="/sales" className="mt-1 inline-flex min-h-[44px] items-center gap-1 rounded-lg text-[14px] font-semibold text-slate-800 hover:underline">
        Visits &amp; lost sales <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function KV({ k, v, t }: { k: string; v: string; t?: Tone }) {
  return (
    <div className="flex min-h-[40px] items-baseline justify-between gap-3 border-t border-slate-100 py-2 first:border-0">
      <span className="text-[14px] text-slate-600">{k}</span>
      <span className={`text-right text-[14px] font-semibold tabular-nums ${t ? TONE[t].text : 'text-slate-900'}`}>{v}</span>
    </div>
  );
}

function Body({ data, month, isCurrent, code, rowLink, linkProps }: {
  data: Loaded; month: string; isCurrent: boolean; code: OutletCode | null;
  rowLink: (code: OutletCode) => string;
  linkProps: { replace: true; state: unknown };
}) {
  const { rows, ms } = data;
  const regularCodes = new Set<string>(ms.channels.map((c) => c.code));
  const inScope = (r: TillRow) => (code ? r.channel_code === code : r.channel_code !== null && regularCodes.has(r.channel_code));
  const ch = code ? ms.channels.find((c) => c.code === code) ?? null : null;
  const sales = ch ? ch.sales : ms.regular.sales;
  const count = ch ? ch.count : ms.regular.count;
  const target = ch ? ch.target : ms.regular.target;
  const pct = ch ? ch.pct : ms.regular.pct;
  const dim = ms.daysInMonth;
  const tillDays = ms.tillDays;

  if (!tillDays) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-[14px] text-slate-700">
        No till sales recorded for {longMonth(month)}{isCurrent ? ' yet. The tills sync each morning; the first day appears the morning after.' : '.'}
      </div>
    );
  }

  /* Pace only means something while the month is running. */
  const pace = isCurrent && ms.paceFrac !== null ? ms.paceFrac * 100 : null;
  const toneOf = (p: number | null): Tone => {
    if (p === null) return 'grey';
    if (pace === null) return p >= 100 ? 'green' : 'red';
    if (tillDays >= 7 && p < pace - 15) return 'red';
    return p < pace ? 'amber' : 'green';
  };
  const tone = toneOf(pct);
  const daysLeft = isCurrent ? dim - tillDays : 0;
  const perDay = sales / tillDays;
  const needed = target && daysLeft > 0 ? Math.max(0, target - sales) / daysLeft : null;
  const projected = isCurrent ? perDay * dim : null;
  const shortBy = projected !== null && target ? target - projected : null;

  const sd = sameDaysBefore(rows, month, tillDays);
  const prevSales = sd.rows ? (code ? sd.byChannel[code] ?? 0 : sd.sales) : null;
  const vs = prevSales ? Math.round(((sales - prevSales) / prevSales) * 100) : null;
  const sdRange = `${Number(sd.from.slice(8))}–${Number(sd.to.slice(8))} ${MON[Number(sd.month.slice(5, 7)) - 1]}`;

  /* every day of the month, in scope */
  const byDay = new Map<string, { sales: number; count: number }>();
  for (const r of rows) {
    if (r.sale_date.slice(0, 7) !== month || !inScope(r)) continue;
    const d = r.sale_date.slice(0, 10);
    const e = byDay.get(d) ?? { sales: 0, count: 0 };
    e.sales += Number(r.revenue ?? 0) || 0;
    e.count += Number(r.sale_count ?? 0) || 0;
    byDay.set(d, e);
  }
  const days = Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const lastDay = ms.lastSaleDay!;
  const daysWithSales = days.filter((d) => (byDay.get(d)?.sales ?? 0) !== 0).length;
  const peak = days.reduce<{ d: string; v: number } | null>((m, d) => {
    const v = byDay.get(d)?.sales ?? 0;
    return !m || v > m.v ? { d, v } : m;
  }, null);
  const max = Math.max(1, needed ?? 0, ...days.map((d) => byDay.get(d)?.sales ?? 0)) * 1.08;
  const last = byDay.get(lastDay) ?? { sales: 0, count: 0 };

  return (
    <div className="space-y-3">
      {/* the month against its target */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="The month against target">
        <div className="flex items-center gap-3">
          <span className={`text-[40px] font-bold leading-[44px] tabular-nums ${TONE[tone].text}`}>{pct !== null ? `${Math.round(pct)}%` : kd(sales)}</span>
          <div className="min-w-0 text-[14px] leading-[18px]">
            <p className="font-semibold tabular-nums text-slate-900">{target ? `${full(sales, 1)} KD of ${full(target)}` : `${full(sales, 1)} KD · no monthly target set`}</p>
            <p className="text-slate-600">{pace !== null ? `${tillDays} of ${dim} till days · ${Math.round(pace)}% of month gone` : `whole month · ${plural(tillDays, 'till day')}`}</p>
          </div>
        </div>
        {target && pct !== null && (
          <div className="my-2.5">
            <PaceBar pct={pct} pace={pace} tone={tone} thick
              label={`${Math.round(pct)}% of target${pace !== null ? `, ${Math.round(pace)}% of the month gone` : ''}`} />
          </div>
        )}
        {projected !== null && (
          <p className={`text-[15px] font-semibold tabular-nums ${TONE[tone].text}`}>
            On pace for ~{kd(projected)}{target && shortBy !== null ? (shortBy > 0 ? ` · ~${short(shortBy)} short` : ` · ~${short(-shortBy)} over`) : ''}
          </p>
        )}
        {!isCurrent && target && pct !== null && (
          <p className={`text-[15px] font-semibold tabular-nums ${TONE[tone].text}`}>
            {pct >= 100 ? `Target met · ${short(sales - target)} over` : `Ended ${short(target - sales)} short`}
          </p>
        )}
        <div className="mt-3">
          <KV k="Month to date" v={`${full(sales, 1)} KD · ${plural(count, 'sale')}`} />
          <KV k="Doing per till day" v={`${full(perDay)} KD`} />
          {needed !== null && <KV k={`Needs per day (${plural(daysLeft, 'day')} left)`} v={needed === 0 ? 'Target met' : `${full(needed)} KD`} t={needed > perDay ? 'red' : undefined} />}
          <KV k={`vs same days last month (${sdRange})`} v={vs === null ? 'no figures' : `${signed(vs)} · was ${kd(prevSales!)}`} t={vs === null ? undefined : vs < 0 ? 'red' : 'green'} />
          <KV k={`Last till day (${dayOf(lastDay)})`} v={`${full(last.sales)} KD · ${plural(last.count, 'sale')}`} />
          {!isCurrent && <p className="pt-1 text-[13px] text-slate-600">Against the targets set now; a target changed since is not shown as it was then.</p>}
        </div>
      </section>

      {/* every day of the month */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="till-days-h">
        <h2 id="till-days-h" className="text-[16px] font-semibold text-slate-900">Every day in {longMonth(month).split(' ')[0]}</h2>
        <p className="text-[13px] leading-[18px] text-slate-600">
          Till sales per day{needed ? `. The dashed line is what is needed a day from now (${full(needed)} KD).` : '.'}
        </p>
        <div className="relative mt-3 h-36 border-b border-slate-300" role="img"
          aria-label={`Till sales per day, 1 to ${dayOf(lastDay)}: ${daysWithSales} of ${tillDays} days had sales${peak && peak.v > 0 ? `, highest ${full(peak.v)} KD on ${dayOf(peak.d)}` : ''}`}>
          {needed ? (
            <>
              <div className="absolute inset-x-0 border-t-2 border-dashed border-rose-500" style={{ bottom: `${(needed / max) * 100}%` }} aria-hidden />
              <span className={`absolute right-0 bg-white px-1 text-[12px] font-semibold ${TONE.red.text}`} style={{ bottom: `calc(${(needed / max) * 100}% + 2px)` }} aria-hidden>needs {short(needed)}/day</span>
            </>
          ) : null}
          <div className="absolute inset-0 flex items-end gap-[2px]" aria-hidden>
            {days.map((d) => {
              const v = byDay.get(d)?.sales ?? 0;
              const future = d > lastDay;
              return (
                <div key={d} title={`${dayOf(d)} · ${future ? 'not synced yet' : `${full(v)} KD`}`}
                  className={`flex-1 rounded-t-sm ${future ? 'h-1 bg-slate-200' : v > 0 ? 'bg-slate-700' : ''}`}
                  style={future ? undefined : { height: `${Math.max(0, (v / max) * 100)}%` }} />
              );
            })}
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[12px] tabular-nums text-slate-600">
          <span>1 {MON[Number(month.slice(5, 7)) - 1]}</span>
          <span>{daysWithSales} of {tillDays} days had sales</span>
          <span>{dayOf(days[days.length - 1])}</span>
        </div>
        <details className="mt-2">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-[14px] font-semibold text-slate-700">Every day as a list</summary>
          <ul className="text-[14px] tabular-nums">
            {days.filter((d) => d <= lastDay).reverse().map((d) => {
              const e = byDay.get(d);
              return (
                <li key={d} className="flex justify-between border-t border-slate-100 py-1.5">
                  <span className="text-slate-700">{dayOf(d)}</span>
                  <span className={e?.sales ? 'text-slate-900' : 'text-slate-600'}>{e?.sales ? `${full(e.sales)} KD · ${plural(e.count, 'sale')}` : 'no sales'}</span>
                </li>
              );
            })}
          </ul>
        </details>
      </section>

      {/* the outlets, and the events outside them */}
      {!code && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="till-outlets-h">
          <h2 id="till-outlets-h" className="text-[16px] font-semibold text-slate-900">By outlet</h2>
          <ul className="mt-1">
            {ms.channels.map((c) => {
              const t = toneOf(c.pct);
              const needC = c.target && daysLeft > 0 ? Math.max(0, c.target - c.sales) / daysLeft : null;
              return (
                <li key={c.code} className="border-t border-slate-100 first:border-0">
                  <Link to={rowLink(c.code)} {...linkProps} className="-mx-2 block rounded-lg px-2 py-2 hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="w-[100px] shrink-0 truncate text-[15px] font-semibold text-slate-900">{bare(outletName(c.code))}</span>
                      <div className="flex-1">{c.target ? <PaceBar pct={c.pct ?? 0} pace={pace} tone={t} /> : null}</div>
                      <span className={`w-11 text-right text-[15px] font-bold tabular-nums ${TONE[t].text}`}>{c.pct !== null ? `${Math.round(c.pct)}%` : ''}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    </div>
                    <p className="text-[13px] leading-[18px] tabular-nums text-slate-600">
                      {c.target ? `${short(c.sales)} of ${short(c.target)} KD` : `${kd(c.sales)} · no target set`} · {plural(c.count, 'sale')}
                      {needC !== null && t === 'red' && <> · <span className={TONE.red.text}>needs {full(needC)}/day</span></>}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          {target && (
            <p className="mt-1 border-t border-slate-200 pt-2 text-[14px] text-slate-900">
              <span className="font-semibold">Regular outlets</span> <span className="tabular-nums">{full(ms.regular.sales, 1)} KD of {full(target)} = {Math.round(ms.regular.pct ?? 0)}%</span>
            </p>
          )}
          {ms.events.map((e) => (
            <div key={e.name} className="mt-2 border-t border-slate-100 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-slate-900">{e.name} <span className="font-normal text-slate-600">(event)</span></span>
                <Chip tone="grey">no target</Chip>
                <span className="ml-auto text-[15px] font-bold tabular-nums text-slate-900">{kd(e.sales)}</span>
              </div>
              <p className="text-[13px] leading-[18px] tabular-nums text-slate-600">
                {eventDates(e.from, e.to)} · {plural(e.count, 'sale')} · {target ? `not in the ${Math.round(ms.regular.pct ?? 0)}%` : 'not in the regular total'}.
                Whether event sales count toward the target is the owner&apos;s decision.
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
