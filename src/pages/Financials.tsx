// Owner-only Financial Reports: the monthly accountant reports (P&L by outlet, balance
// sheet, cash, targets, top products/customers/suppliers) imported into fin_reports +
// fin_lines. Owners only: the stock_ai_access list, checked here and by RLS (is_owner()).
import { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Card, Spinner } from '../components/ui';
import { ChartCard, LineChart, BarChart } from '../components/Charts';
import { formatKDCompact } from '../lib/format';

interface Line {
  period: string; report_period: string; statement: string; outlet: string;
  section: string | null; account: string; kind: string; amount: number; sort: number | null;
}
interface Report {
  period: string; file_name: string | null; commentary: string[]; issues: string[];
  top_products: { rank: number; brand: string; product: string; qty: number; sales: number; cost: number; profit: number; period?: string }[];
  top_customers: { rank: number; name: string; revenue: number; items: number; period?: string }[];
  top_suppliers: { rank: number; name: string; revenue: number; items: number; period?: string }[];
}

const TABS = ['Overview', 'Profit & Loss', 'Outlets', 'Balance & Cash', 'Targets', 'Products & Customers', 'Sources'] as const;
type Tab = typeof TABS[number];
const OUTLETS = ['Total', 'Avenues', 'Timekeeper', 'TimeGallery', 'Online'];

const kd = (n: number | undefined | null) =>
  n == null ? '—' : n < 0 ? `(${formatKDCompact(-n)})` : formatKDCompact(n);
const monthLabel = (p: string) =>
  new Date(p + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/** A number can appear in several reports (own month + next month's comparison column).
 *  The accountant restates earlier months in later reports, so the newest report wins. */
function dedupe(lines: Line[]): Line[] {
  const best = new Map<string, Line>();
  for (const l of lines) {
    const k = `${l.period}|${l.statement}|${l.outlet}|${l.account}|${l.kind}`;
    const cur = best.get(k);
    if (!cur || l.report_period > cur.report_period) best.set(k, l);
  }
  return [...best.values()];
}

export default function FinancialsPage() {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('Overview');

  useEffect(() => {
    supabase.rpc('stock_ai_allowed').then(({ data: ok }) => setIsOwner(!!ok), () => setIsOwner(false));
  }, []);

  useEffect(() => {
    if (!isOwner) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const all: Line[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from('fin_lines')
          .select('period, report_period, statement, outlet, section, account, kind, amount, sort')
          .order('id').range(from, from + 999);
        all.push(...((data ?? []) as Line[]));
        if (!data || data.length < 1000) break;
      }
      const { data: reps } = await supabase.from('fin_reports').select('*').order('period');
      setLines(dedupe(all));
      setReports((reps ?? []) as Report[]);
      setLoading(false);
    })();
  }, [isOwner]);

  if (isOwner === null || loading) return <Spinner />;
  if (!isOwner) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-slate-500">
        <Lock className="w-8 h-8 mx-auto mb-3 text-slate-400" />
        <p className="font-semibold text-slate-700">Owners only</p>
        <p className="text-sm mt-1">Financial reports are visible to the business owners only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Financial Reports</h1>
        <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Owners only · from the monthly accountant reports</span>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-slate-800 text-slate-800 font-semibold' : 'border-transparent text-slate-500'}`}>
            {t}
          </button>
        ))}
      </div>
      {lines.length === 0 ? <p className="text-slate-500 text-sm">No reports imported yet.</p> : (
        <>
          {tab === 'Overview' && <Overview lines={lines} />}
          {tab === 'Profit & Loss' && <StatementMatrix lines={lines} statement="pnl" outlet="Total" />}
          {tab === 'Outlets' && <OutletView lines={lines} />}
          {tab === 'Balance & Cash' && (
            <div className="space-y-6">
              <StatementMatrix lines={lines} statement="balance_sheet" outlet="Total" title="Balance sheet (month-end)" />
              <StatementMatrix lines={lines} statement="cash" outlet="Total" title="Cash" />
            </div>
          )}
          {tab === 'Targets' && <TargetsView lines={lines} />}
          {tab === 'Products & Customers' && <TopLists reports={reports} />}
          {tab === 'Sources' && <Sources reports={reports} lines={lines} />}
        </>
      )}
    </div>
  );
}

// ---------- helpers over the line set ----------
function val(lines: Line[], period: string, account: string, statement = 'pnl', outlet = 'Total') {
  return lines.find((l) => l.period === period && l.statement === statement && l.outlet === outlet && l.kind === 'actual'
    && l.account.toLowerCase() === account.toLowerCase())?.amount;
}
function periodsOf(lines: Line[], statement: string) {
  return [...new Set(lines.filter((l) => l.statement === statement && l.kind === 'actual').map((l) => l.period))].sort();
}

function Overview({ lines }: { lines: Line[] }) {
  const months = periodsOf(lines, 'pnl').filter((p) => val(lines, p, 'Total Income') != null);
  const last = months[months.length - 1];
  const last12 = months.filter((p) => p > shiftMonths(last, -12));
  const sum = (acc: string) => last12.reduce((s, p) => s + (val(lines, p, acc) ?? 0), 0);
  const inc = sum('Total Income'), gp = sum('Gross Profit'), np = sum('Net Profit');
  const ebitda = last12.reduce((s, p) => s + (val(lines, p, 'Operating Profit') ?? 0) + (val(lines, p, 'Interest Expense') ?? 0), 0);
  const cashMonths = periodsOf(lines, 'balance_sheet');
  const cashP = cashMonths[cashMonths.length - 1];
  const cash = cashP ? val(lines, cashP, 'Total Bank', 'balance_sheet') : undefined;
  const equity = cashP ? val(lines, cashP, 'Total Equity', 'balance_sheet') : undefined;
  const series = (acc: string) => months.map((p) => ({ label: monthLabel(p), value: val(lines, p, acc) ?? 0 }));

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Last 12 reported months = {last12.length} month{last12.length === 1 ? '' : 's'} with reports ({monthLabel(last12[0])} – {monthLabel(last)}).
        Months without a report are not counted, so these are not full-year totals unless all 12 are present.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card title={`Income · ${monthLabel(last)}`} value={kd(val(lines, last, 'Total Income'))} sub={`Net profit ${kd(val(lines, last, 'Net Profit'))}`} />
        <Card title="Income · reported months, last 12" value={kd(inc)} sub={`Gross margin ${pct(gp, inc)}`} />
        <Card title="Net profit · reported months, last 12" value={kd(np)} sub={`Net margin ${pct(np, inc)}`} />
        <Card title="EBITDA (approx.) · last 12" value={kd(ebitda)} sub="Operating profit before non-cash + interest" />
        {cashP && <Card title={`Bank · ${monthLabel(cashP)}`} value={kd(cash)} />}
        {cashP && <Card title={`Net assets (equity) · ${monthLabel(cashP)}`} value={kd(equity)} />}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <ChartCard title="Total income by month"><LineChart data={series('Total Income')} fmt={kd} /></ChartCard>
        <ChartCard title="Net profit by month"><LineChart data={series('Net Profit')} fmt={kd} color="#059669" /></ChartCard>
        <ChartCard title="Gross profit by month"><LineChart data={series('Gross Profit')} fmt={kd} color="#334155" /></ChartCard>
        <ChartCard title={`Expenses · ${monthLabel(last)}`} hint="largest lines">
          <BarChart fmt={kd} data={lines
            .filter((l) => l.period === last && l.statement === 'pnl' && l.outlet === 'Total' && l.kind === 'actual'
              && ['fixed_opex', 'variable_opex', 'non_cash', 'other', 'opex_total'].includes(l.section ?? '') && !/^total|profit|income|cost of sales/i.test(l.account))
            .sort((a, b) => b.amount - a.amount).map((l) => ({ label: l.account, value: l.amount }))} />
        </ChartCard>
      </div>
    </div>
  );
}

function shiftMonths(p: string, n: number) {
  const d = new Date(p + 'T00:00:00'); d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Accounts × months, P&L order; click a month header to sort by it. */
function StatementMatrix({ lines, statement, outlet, title }: { lines: Line[]; statement: string; outlet: string; title?: string }) {
  const rows = lines.filter((l) => l.statement === statement && l.outlet === outlet && l.kind === 'actual');
  const months = [...new Set(rows.map((l) => l.period))].sort();
  const accounts = useMemo(() => {
    const order = new Map<string, number>();
    for (const l of rows) { const o = l.sort ?? 9999; if (!order.has(l.account) || o < order.get(l.account)!) order.set(l.account, o); }
    return [...order.entries()].sort((a, b) => a[1] - b[1]).map(([a]) => a);
  }, [rows]);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [desc, setDesc] = useState(true);
  const cell = (a: string, p: string) => rows.find((l) => l.account === a && l.period === p)?.amount;
  const sorted = sortBy ? [...accounts].sort((a, b) => ((cell(a, sortBy) ?? -Infinity) - (cell(b, sortBy) ?? -Infinity)) * (desc ? -1 : 1)) : accounts;
  const isTotal = (a: string) => /^(total|gross profit|net profit|operating profit|net assets|operating expenses excluding)/i.test(a);
  if (!rows.length) return <p className="text-sm text-slate-500">No {title ?? statement} data in the reports.</p>;

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-slate-700 mb-2">{title}</h3>}
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="text-sm min-w-full">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-left px-3 py-2 sticky left-0 bg-slate-50 cursor-pointer" onClick={() => setSortBy(null)}>Account</th>
              {months.map((p) => (
                <th key={p} className="text-right px-3 py-2 whitespace-nowrap cursor-pointer select-none"
                  onClick={() => { if (sortBy === p) setDesc(!desc); else { setSortBy(p); setDesc(true); } }}>
                  {monthLabel(p)}{sortBy === p ? (desc ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a} className={`border-t border-slate-100 ${isTotal(a) ? 'font-semibold bg-slate-50/60' : ''}`}>
                <td className="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap">{a}</td>
                {months.map((p) => {
                  const v = cell(a, p);
                  return <td key={p} className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${v != null && v < 0 ? 'text-rose-600' : ''}`}>{kd(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutletView({ lines }: { lines: Line[] }) {
  const months = [...new Set(lines.filter((l) => l.statement === 'pnl' && l.outlet !== 'Total').map((l) => l.period))].sort();
  const [p, setP] = useState(months[months.length - 1] ?? '');
  if (!months.length) return <p className="text-sm text-slate-500">The reports have no per-outlet breakdown.</p>;
  const rows = lines.filter((l) => l.statement === 'pnl' && l.period === p && l.kind === 'actual');
  const outlets = OUTLETS.filter((o) => rows.some((l) => l.outlet === o));
  const order = new Map<string, number>();
  for (const l of rows) { const o = l.sort ?? 9999; if (!order.has(l.account) || o < order.get(l.account)!) order.set(l.account, o); }
  const accounts = [...order.entries()].sort((a, b) => a[1] - b[1]).map(([a]) => a);
  const income = (o: string) => val(lines, p, 'Total Income', 'pnl', o);
  const net = (o: string) => val(lines, p, 'Net Profit', 'pnl', o);

  return (
    <div className="space-y-4">
      <select value={p} onChange={(e) => setP(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {outlets.filter((o) => o !== 'Total').map((o) => (
          <Card key={o} title={o === 'TimeGallery' ? 'Time Gallery' : o} value={kd(income(o))} sub={`Net profit ${kd(net(o))} · ${pct(net(o) ?? 0, income(o) ?? 0)}`} />
        ))}
      </div>
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="text-sm min-w-full">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr><th className="text-left px-3 py-2 sticky left-0 bg-slate-50">Account</th>
              {outlets.map((o) => <th key={o} className="text-right px-3 py-2 whitespace-nowrap">{o === 'TimeGallery' ? 'Time Gallery' : o}</th>)}</tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a} className="border-t border-slate-100">
                <td className="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap">{a}</td>
                {outlets.map((o) => {
                  const v = rows.find((l) => l.account === a && l.outlet === o)?.amount;
                  return <td key={o} className={`px-3 py-1.5 text-right whitespace-nowrap tabular-nums ${v != null && v < 0 ? 'text-rose-600' : ''}`}>{kd(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TargetsView({ lines }: { lines: Line[] }) {
  const rows = lines.filter((l) => l.statement === 'target');
  const months = [...new Set(rows.map((l) => l.period))].sort();
  const accounts = [...new Set(rows.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((l) => `${l.outlet}|${l.account}`))];
  if (!rows.length) return <p className="text-sm text-slate-500">No targets in the reports.</p>;
  const get = (k: string, p: string, kind: string) => {
    const [o, a] = k.split('|');
    return rows.find((l) => l.outlet === o && l.account === a && l.period === p && l.kind === kind)?.amount;
  };
  return (
    <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
      <table className="text-sm min-w-full">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr><th className="text-left px-3 py-2 sticky left-0 bg-slate-50">Line</th>
            {months.map((p) => <th key={p} className="text-right px-3 py-2 whitespace-nowrap">{monthLabel(p)}<div className="font-normal">actual / target</div></th>)}</tr>
        </thead>
        <tbody>
          {accounts.map((k) => (
            <tr key={k} className="border-t border-slate-100">
              <td className="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap">{k.split('|')[1]}{k.split('|')[0] !== 'Total' ? ` · ${k.split('|')[0]}` : ''}</td>
              {months.map((p) => {
                const a = get(k, p, 'actual'), t = get(k, p, 'target');
                return <td key={p} className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">{kd(a)} <span className="text-slate-400">/ {kd(t)}</span></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortTable<T extends Record<string, unknown>>({ rows, cols }: { rows: T[]; cols: { key: keyof T & string; label: string; num?: boolean }[] }) {
  const [sort, setSort] = useState<{ k: string; d: number } | null>(null);
  const data = sort ? [...rows].sort((a, b) => {
    const x = a[sort.k], y = b[sort.k];
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.d;
  }) : rows;
  return (
    <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
      <table className="text-sm min-w-full">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>{cols.map((c) => (
            <th key={c.key} className={`px-3 py-2 whitespace-nowrap cursor-pointer select-none ${c.num ? 'text-right' : 'text-left'}`}
              onClick={() => setSort(sort?.k === c.key ? { k: c.key, d: -sort.d } : { k: c.key, d: c.num ? -1 : 1 })}>
              {c.label}{sort?.k === c.key ? (sort.d < 0 ? ' ↓' : ' ↑') : ''}
            </th>))}</tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {cols.map((c) => <td key={c.key} className={`px-3 py-1.5 ${c.num ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>
                {c.num && typeof r[c.key] === 'number' ? kd(r[c.key] as number) : String(r[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopLists({ reports }: { reports: Report[] }) {
  const withData = reports.filter((r) => r.top_products.length || r.top_customers.length || r.top_suppliers.length);
  const [p, setP] = useState(withData[withData.length - 1]?.period ?? '');
  const r = withData.find((x) => x.period === p);
  if (!r) return <p className="text-sm text-slate-500">No product/customer lists in the reports.</p>;
  // a report also lists the previous month — show only its own month
  const own = <T extends { period?: string }>(xs: T[]) => xs.filter((x) => !x.period || x.period.slice(0, 7) === p.slice(0, 7));
  return (
    <div className="space-y-5">
      <select value={p} onChange={(e) => setP(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
        {withData.map((m) => <option key={m.period} value={m.period}>{monthLabel(m.period)}</option>)}
      </select>
      <div><h3 className="text-sm font-semibold text-slate-700 mb-2">Top products by profit</h3>
        <SortTable rows={own(r.top_products)} cols={[{ key: 'rank', label: '#', num: true }, { key: 'brand', label: 'Brand' }, { key: 'product', label: 'Product' },
          { key: 'qty', label: 'Qty', num: true }, { key: 'sales', label: 'Sales', num: true }, { key: 'cost', label: 'Cost', num: true }, { key: 'profit', label: 'Profit', num: true }]} /></div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div><h3 className="text-sm font-semibold text-slate-700 mb-2">Top customers</h3>
          <SortTable rows={own(r.top_customers)} cols={[{ key: 'rank', label: '#', num: true }, { key: 'name', label: 'Customer' }, { key: 'revenue', label: 'Revenue', num: true }, { key: 'items', label: 'Items', num: true }]} /></div>
        <div><h3 className="text-sm font-semibold text-slate-700 mb-2">Top suppliers (by sales)</h3>
          <SortTable rows={own(r.top_suppliers)} cols={[{ key: 'rank', label: '#', num: true }, { key: 'name', label: 'Supplier' }, { key: 'revenue', label: 'Sales', num: true }, { key: 'items', label: 'Items', num: true }]} /></div>
      </div>
    </div>
  );
}

function Sources({ reports, lines }: { reports: Report[]; lines: Line[] }) {
  const months = periodsOf(lines, 'pnl');
  const first = months[0], last = months[months.length - 1];
  const missing: string[] = [];
  for (let p = first; p && p <= last; p = shiftMonths(p, 1)) if (!months.includes(p)) missing.push(p);
  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <b>Months with no P&L figures:</b> {missing.map(monthLabel).join(', ')} — upload those reports to complete the history.
        </div>
      )}
      {[...reports].reverse().map((r) => (
        <div key={r.period} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-semibold text-slate-800">{monthLabel(r.period)} report</span>
            <span className="text-xs text-slate-400 break-all">{r.file_name}</span>
          </div>
          {r.commentary.length > 0 && <ul className="list-disc ml-5 mt-2 text-sm text-slate-600 space-y-0.5">{r.commentary.map((c, i) => <li key={i}>{c}</li>)}</ul>}
          {r.issues.length > 0 && <ul className="list-disc ml-5 mt-2 text-xs text-amber-700 space-y-0.5">{r.issues.map((c, i) => <li key={i}>{c}</li>)}</ul>}
        </div>
      ))}
    </div>
  );
}
