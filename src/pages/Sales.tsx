import { useEffect, useMemo, useState } from 'react';
import { format, startOfWeek, startOfMonth, subDays, subMonths, parseISO, getDay } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Card, Spinner } from '../components/ui';
import { formatKD } from '../lib/format';

interface SaleItem { brand: string | null; product_type: string | null; product: string | null; quantity: number; amount_kd: number }
interface TrafficRow { date_logged: string; time_logged: string | null; visitor_count: number; outlet: string | null }

type TrafficView = 'day' | 'hour' | 'weekday' | 'month';
const trafficViews: Record<TrafficView, string> = {
  day: 'By day', hour: 'By hour of day', weekday: 'By weekday', month: 'By month',
};
// Kuwait retail week runs Saturday → Friday
const WEEKDAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const jsDayToIndex = (jsDay: number) => (jsDay + 1) % 7; // JS: 0=Sun … 6=Sat → 0=Sat … 6=Fri
interface SaleCase {
  id: string; date_logged: string; staff: string; brand: string | null; product_type: string | null;
  product: string; amount_kd: number | null; outlet: string | null; channel: string | null;
  sale_items: SaleItem[];
}

interface LostCase {
  id: string; date_logged: string; staff: string; customer_name: string | null; brand: string | null;
  product: string | null; amount_kd: number | null; outlet: string | null; notes: string | null;
  lost_reason: string | null;
}

type Period = 'today' | 'week' | 'month' | '30d' | 'custom';

const periodLabels: Record<Period, string> = {
  today: 'Today', week: 'This week', month: 'This month', '30d': 'Last 30 days', custom: 'Custom',
};

function periodStart(p: Period): string {
  const now = new Date();
  if (p === 'today') return format(now, 'yyyy-MM-dd');
  if (p === 'week') return format(startOfWeek(now, { weekStartsOn: 6 }), 'yyyy-MM-dd'); // Kuwait week starts Saturday
  if (p === 'month') return format(startOfMonth(now), 'yyyy-MM-dd');
  return format(subDays(now, 30), 'yyyy-MM-dd');
}

/** Total for one sale: line items when present, otherwise the case amount. */
function caseTotal(c: SaleCase): number {
  if (c.sale_items?.length) return c.sale_items.reduce((s, i) => s + Number(i.amount_kd) * (Number(i.quantity) || 1), 0);
  return Number(c.amount_kd ?? 0);
}

export default function SalesPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState(periodStart('month'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [allSales, setAllSales] = useState<SaleCase[]>([]);
  const [allLost, setAllLost] = useState<LostCase[]>([]);
  const [allTraffic, setAllTraffic] = useState<TrafficRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [outlet, setOutlet] = useState('All');
  const [outletOptions, setOutletOptions] = useState<string[]>([]);

  useEffect(() => {
    supabase.from('settings').select('outlets').single().then(({ data }) => {
      if (data?.outlets) setOutletOptions(data.outlets as string[]);
    });
  }, []);

  useEffect(() => {
    if (period !== 'custom') {
      setFrom(periodStart(period));
      setTo(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('cases')
      .select('id, date_logged, staff, brand, product_type, product, amount_kd, outlet, channel, sale_items(brand, product_type, product, quantity, amount_kd)')
      .eq('case_type', 'Sale')
      .eq('deleted', false)
      .gte('date_logged', from)
      .lte('date_logged', to)
      .order('date_logged', { ascending: false })
      .then(({ data }) => {
        setAllSales((data as unknown as SaleCase[]) ?? []);
        setLoading(false);
      });
    supabase
      .from('cases')
      .select('id, date_logged, staff, customer_name, brand, product, amount_kd, outlet, notes, lost_reason')
      .eq('case_type', 'Lost Sale')
      .eq('deleted', false)
      .gte('date_logged', from)
      .lte('date_logged', to)
      .order('date_logged', { ascending: false })
      .then(({ data }) => setAllLost((data as LostCase[]) ?? []));
  }, [from, to]);

  // every case carries a visitor_count, so all case types together = store traffic.
  // fetched for the last 12 months once so the "By month" view always has a full year.
  useEffect(() => {
    supabase
      .from('cases')
      .select('date_logged, time_logged, visitor_count, outlet')
      .eq('deleted', false)
      .gte('date_logged', format(subMonths(new Date(), 12), 'yyyy-MM-dd'))
      .then(({ data }) => setAllTraffic((data as TrafficRow[]) ?? []));
  }, []);

  const sales = useMemo(
    () => (outlet === 'All' ? allSales : allSales.filter((c) => (c.outlet || 'Unknown') === outlet)),
    [allSales, outlet],
  );

  const total = useMemo(() => sales.reduce((s, c) => s + caseTotal(c), 0), [sales]);

  const lost = useMemo(
    () => (outlet === 'All' ? allLost : allLost.filter((c) => (c.outlet || 'Unknown') === outlet)),
    [allLost, outlet],
  );
  const lostValue = useMemo(() => lost.reduce((s, c) => s + Number(c.amount_kd ?? 0), 0), [lost]);
  const lostByKey = (level: 'brand' | 'outlet' | 'lost_reason') => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const c of lost) {
      const k = (c[level] || (level === 'lost_reason' ? 'No reason' : 'Unknown')) as string;
      const e = map.get(k) ?? { amount: 0, count: 0 };
      e.amount += Number(c.amount_kd ?? 0); e.count += 1;
      map.set(k, e);
    }
    return [...map.entries()].sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count);
  };

  // breakdowns — brand/product type are attributed at item level when items exist
  const byKey = (level: 'staff' | 'outlet' | 'brand' | 'product_type') => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const c of sales) {
      if (level === 'staff' || level === 'outlet') {
        const k = (c[level] || 'Unknown') as string;
        const e = map.get(k) ?? { amount: 0, count: 0 };
        e.amount += caseTotal(c); e.count += 1;
        map.set(k, e);
      } else if (c.sale_items?.length) {
        for (const i of c.sale_items) {
          const k = i[level] || c[level] || 'Unknown';
          const e = map.get(k) ?? { amount: 0, count: 0 };
          e.amount += Number(i.amount_kd) * (Number(i.quantity) || 1); e.count += 1;
          map.set(k, e);
        }
      } else {
        const k = c[level] || 'Unknown';
        const e = map.get(k) ?? { amount: 0, count: 0 };
        e.amount += caseTotal(c); e.count += 1;
        map.set(k, e);
      }
    }
    return [...map.entries()].sort((a, b) => b[1].amount - a[1].amount);
  };

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of sales) map.set(c.date_logged, (map.get(c.date_logged) ?? 0) + caseTotal(c));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [sales]);
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v));

  const [trafficView, setTrafficView] = useState<TrafficView>('day');

  const trafficBuckets = useMemo(() => {
    let rows = outlet === 'All' ? allTraffic : allTraffic.filter((t) => (t.outlet || 'Unknown') === outlet);
    // month view always spans the fetched 12 months; the others follow the selected period
    if (trafficView !== 'month') rows = rows.filter((t) => t.date_logged >= from && t.date_logged <= to);

    const map = new Map<string, number>();
    const add = (k: string, v: number) => map.set(k, (map.get(k) ?? 0) + v);

    for (const t of rows) {
      const v = Number(t.visitor_count) || 0;
      if (trafficView === 'day') add(t.date_logged, v);
      else if (trafficView === 'hour') {
        const h = t.time_logged?.match(/^(\d{1,2})/);
        if (h) add(`${h[1].padStart(2, '0')}:00`, v);
      } else if (trafficView === 'weekday') add(WEEKDAYS[jsDayToIndex(getDay(parseISO(t.date_logged)))], v);
      else add(t.date_logged.slice(0, 7), v);
    }

    if (trafficView === 'weekday') {
      return WEEKDAYS.filter((d) => map.has(d)).map((d) => [d, map.get(d)!] as [string, number]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allTraffic, outlet, trafficView, from, to]);

  const trafficLabel = (k: string) =>
    trafficView === 'day' ? k.slice(5) : trafficView === 'weekday' ? k.slice(0, 3) : k;
  const totalVisitors = trafficBuckets.reduce((s, [, v]) => s + v, 0);
  const avgTraffic = trafficBuckets.length ? totalVisitors / trafficBuckets.length : 0;
  const maxTraffic = Math.max(1, ...trafficBuckets.map(([, v]) => v));
  const avgUnit = { day: 'day', hour: 'hour', weekday: 'weekday', month: 'month' }[trafficView];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Sales Reports</h1>
          <p className="text-sm text-slate-500">Store traffic, demand, lost sales and follow-ups per outlet — live from the Daily Sales Report app. Sales of record stay in Lightspeed.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={outlet}
            onChange={(e) => setOutlet(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
            title="Filter by store outlet"
          >
            <option>All</option>
            {[...new Set([...outletOptions, ...allSales.map((c) => c.outlet || 'Unknown')])].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          {(Object.keys(periodLabels) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${period === p ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              {periodLabels[p]}
            </button>
          ))}
          {period === 'custom' && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
              <span className="text-slate-400">→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
            </>
          )}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card title="Total sales" value={`${formatKD(total)} KD`} />
            <Card title="Transactions" value={sales.length} />
            <Card title="Average sale" value={sales.length ? `${formatKD(total / sales.length)} KD` : '—'} />
            <Card title="Period" value={`${from} → ${to}`} />
          </div>

          <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Sales by day</h2>
            {byDay.length === 0 ? <div className="text-slate-400 text-sm">No sales in this period</div> : (
              <div className="flex items-end gap-1 h-32 overflow-x-auto">
                {byDay.map(([d, v]) => (
                  <div key={d} className="flex flex-col items-center gap-1 min-w-[34px]" title={`${d}: ${formatKD(v)} KD`}>
                    <div className="text-[10px] text-slate-500">{formatKD(v)}</div>
                    <div className="w-6 bg-blue-500 rounded-t" style={{ height: `${Math.max(4, (v / maxDay) * 80)}px` }} />
                    <div className="text-[10px] text-slate-400">{d.slice(5)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-700">Store traffic</h2>
                <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                  {(Object.keys(trafficViews) as TrafficView[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setTrafficView(v)}
                      className={`px-2.5 py-1 text-xs ${trafficView === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {trafficViews[v]}
                    </button>
                  ))}
                </div>
                {trafficView === 'month' && <span className="text-xs text-slate-400">last 12 months</span>}
              </div>
              <div className="text-sm text-slate-500">
                Total <b className="text-slate-800">{totalVisitors}</b> · Average{' '}
                <b className="text-amber-600">{avgTraffic.toFixed(1)} / {avgUnit}</b>
                {trafficView === 'day' && totalVisitors > 0 && sales.length > 0 && (
                  <> · Conversion <b className="text-emerald-600">{((sales.length / totalVisitors) * 100).toFixed(0)}%</b></>
                )}
              </div>
            </div>
            {trafficBuckets.length === 0 ? <div className="text-slate-400 text-sm">No traffic data in this period</div> : (
              <div className="relative">
                {/* dashed average line over the bars */}
                <div
                  className="absolute left-0 right-0 border-t-2 border-dashed border-amber-400 z-10 pointer-events-none"
                  style={{ bottom: `${18 + (avgTraffic / maxTraffic) * 80}px` }}
                  title={`Average ${avgTraffic.toFixed(1)} visitors/day`}
                />
                <div className="flex items-end gap-1 h-32 overflow-x-auto">
                  {trafficBuckets.map(([d, v]) => (
                    <div key={d} className="flex flex-col items-center gap-1 min-w-[34px] flex-1" title={`${d}: ${v} visitors`}>
                      <div className="text-[10px] text-slate-500">{v}</div>
                      <div
                        className={`w-6 rounded-t ${v >= avgTraffic ? 'bg-amber-400' : 'bg-slate-300'}`}
                        style={{ height: `${Math.max(4, (v / maxTraffic) * 80)}px` }}
                      />
                      <div className="text-[10px] text-slate-400 whitespace-nowrap">{trafficLabel(d)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Lost sales analysis ── */}
          <div className="mb-6 bg-white rounded-xl border border-rose-200 shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-rose-700">Lost sales — this period</h2>
              <div className="text-sm text-slate-500">
                <b className="text-rose-600">{lost.length}</b> lost · value{' '}
                <b className="text-rose-600">{formatKD(lostValue)} KD</b>
                {total + lostValue > 0 && (
                  <> · <b className="text-slate-700">{((lostValue / (total + lostValue)) * 100).toFixed(0)}%</b> of potential revenue</>
                )}
              </div>
            </div>
            {lost.length === 0 ? (
              <div className="text-slate-400 text-sm">No lost sales recorded in this period 🎉</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {([['Lost by reason', 'lost_reason'], ['Lost by brand', 'brand'], ['Lost by outlet', 'outlet']] as const).map(([title, key]) => (
                    <div key={key}>
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{title}</h3>
                      <table className="w-full text-sm">
                        <tbody>
                          {lostByKey(key).slice(0, 8).map(([k, v]) => (
                            <tr key={k} className="border-b border-slate-100 last:border-0">
                              <td className="py-1.5">{k}</td>
                              <td className="py-1.5 text-right text-slate-500">{v.count}×</td>
                              <td className="py-1.5 text-right font-medium text-rose-600">{formatKD(v.amount)} KD</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Recent lost sales & reasons</h3>
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {lost.slice(0, 25).map((c) => (
                    <div key={c.id} className="py-2 flex flex-wrap items-start gap-x-4 gap-y-1 text-sm">
                      <div className="min-w-0 flex-1 basis-48">
                        <span className="font-medium text-slate-700">{[c.brand, c.product].filter(Boolean).join(' — ') || 'Unspecified item'}</span>
                        {c.customer_name && <span className="text-slate-400"> · {c.customer_name}</span>}
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                            {c.lost_reason || 'No reason'}
                          </span>
                          {c.notes && <span className="text-xs text-slate-500 italic truncate">{c.notes}</span>}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 shrink-0 text-right">
                        <div>{Number(c.amount_kd ?? 0) > 0 ? <span className="text-rose-600 font-medium">{formatKD(Number(c.amount_kd))} KD</span> : '—'}</div>
                        <div>{c.date_logged} · {c.outlet ?? '—'} · {c.staff}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {([['Sales by staff', 'staff'], ['Sales by brand', 'brand'], ['Sales by product type', 'product_type'], ['Sales by outlet', 'outlet']] as const).map(([title, key]) => (
              <div key={key} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-slate-700 mb-2">{title}</h2>
                <table className="w-full text-sm">
                  <tbody>
                    {byKey(key).map(([k, v]) => (
                      <tr key={k} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5">{k}</td>
                        <td className="py-1.5 text-right text-slate-500">{v.count}×</td>
                        <td className="py-1.5 text-right font-medium">{formatKD(v.amount)} KD</td>
                      </tr>
                    ))}
                    {byKey(key).length === 0 && <tr><td className="py-2 text-slate-400">No data</td></tr>}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
