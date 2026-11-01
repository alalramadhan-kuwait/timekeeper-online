// Owner-only Business Valuation: values the company several ways from the accountant reports
// (fin_lines), live Lightspeed stock/sales (val_operational_snapshot RPC) and the owners'
// answers + assumptions (val_inputs). Owners only: is_owner() via RLS and the RPC.
import { useEffect, useMemo, useState } from 'react';
import { Lock, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { ChartCard, BarChart } from '../components/Charts';
import { formatKDCompact } from '../lib/format';

interface Line { period: string; report_period: string; statement: string; outlet: string; account: string; kind: string; amount: number }
interface Input {
  key: string; kind: 'question' | 'assumption'; section: string; sort: number; question: string; why: string | null;
  answer: string | null; value: number | null; unit: string | null; status: 'open' | 'answered' | 'skipped';
  found: string | null; updated_at: string; updated_by: string | null;
}
interface Snapshot {
  as_of: string; sales_12m: number;
  aging: { bucket: string; cost: number; retail: number; units: number }[];
  idle?: { band: 'low' | 'mid' | 'high'; months_idle: number; sold_before: boolean; cost: number; units: number; models: number }[];
  zero_cost_units?: number;
  ownership: { own: string; cost: number; retail: number }[];
  stock_brands: { brand: string; cost: number }[];
  sales_brands: { brand: string; rev: number }[];
  sales_outlets: { outlet: string; rev: number }[];
  customers: { buyers: number; repeat: number };
  monthly_sales: { m: string; rev: number }[];
}
interface Submission { id: number; token: string; respondent: string | null; answers: Record<string, string | string[]>; submitted_at: string }

const TABS = ['Summary', 'Questions', 'Assumptions', 'Data'] as const;
type Tab = typeof TABS[number];
const kd = (n: number | undefined | null) => (n == null || !isFinite(n) ? '—' : n < 0 ? `(${formatKDCompact(-n)})` : formatKDCompact(n));
const monthLabel = (p: string) => new Date(p + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

function dedupe(lines: Line[]): Line[] {
  const best = new Map<string, Line>();
  for (const l of lines) {
    const k = `${l.period}|${l.statement}|${l.outlet}|${l.account}|${l.kind}`;
    const cur = best.get(k);
    if (!cur || l.report_period > cur.report_period) best.set(k, l);
  }
  return [...best.values()];
}

export default function ValuationPage() {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [inputs, setInputs] = useState<Input[]>([]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [formTokens, setFormTokens] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('Summary');

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
          .select('period, report_period, statement, outlet, account, kind, amount')
          .eq('outlet', 'Total').eq('kind', 'actual').in('statement', ['pnl', 'balance_sheet'])
          .order('id').range(from, from + 999);
        all.push(...((data ?? []) as Line[]));
        if (!data || data.length < 1000) break;
      }
      const [{ data: inp }, { data: s }, { data: sb }, { data: ft }] = await Promise.all([
        supabase.from('val_inputs').select('*').order('sort'),
        supabase.rpc('val_operational_snapshot'),
        supabase.from('val_submissions').select('*').order('submitted_at', { ascending: false }),
        supabase.from('val_form').select('token').eq('active', true),
      ]);
      setSubs((sb ?? []) as Submission[]);
      setFormTokens((ft ?? []).map((x: { token: string }) => x.token));
      setLines(dedupe(all));
      setInputs((inp ?? []) as Input[]);
      setSnap((s ?? null) as Snapshot | null);
      setLoading(false);
    })();
  }, [isOwner]);

  async function save(key: string, patch: Partial<Input>) {
    const { data: u } = await supabase.auth.getUser();
    const row = { ...patch, updated_at: new Date().toISOString(), updated_by: u.user?.email ?? null };
    setInputs((xs) => xs.map((x) => (x.key === key ? { ...x, ...row } : x)));
    await supabase.from('val_inputs').update(row).eq('key', key);
  }

  const model = useMemo(() => buildModel(lines, inputs, snap), [lines, inputs, snap]);

  if (isOwner === null || loading) return <Spinner />;
  if (!isOwner) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-slate-500">
        <Lock className="w-8 h-8 mx-auto mb-3 text-slate-400" />
        <p className="font-semibold text-slate-700">Owners only</p>
        <p className="text-sm mt-1">The business valuation is visible to the business owners only.</p>
      </div>
    );
  }

  const qs = inputs.filter((i) => i.kind === 'question');
  const done = qs.filter((q) => q.status !== 'open').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Business Valuation</h1>
        <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Owners only</span>
      </div>
      <Panel className="p-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="font-medium text-slate-700">Information gathered</span>
          <span className="text-slate-500">{done} of {qs.length} questions answered</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${qs.length ? (done / qs.length) * 100 : 0}%` }} />
        </div>
      </Panel>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-slate-800 text-slate-800 font-semibold' : 'border-transparent text-slate-500'}`}>
            {t}{t === 'Questions' ? ` (${qs.length - done})` : ''}
          </button>
        ))}
      </div>
      {tab === 'Summary' && <Summary m={model} onGo={() => setTab('Questions')} openCount={qs.length - done} />}
      {tab === 'Questions' && (
        <div className="space-y-4">
          <SharedForm tokens={formTokens} subs={subs} />
          <Questions items={qs} save={save} />
        </div>
      )}
      {tab === 'Assumptions' && <Assumptions items={inputs.filter((i) => i.kind === 'assumption')} save={save} />}
      {tab === 'Data' && <DataView m={model} snap={snap} />}
    </div>
  );
}

// ---------- the valuation model ----------
type Model = ReturnType<typeof buildModel>;

function buildModel(lines: Line[], inputs: Input[], snap: Snapshot | null) {
  const a = (k: string, d: number) => inputs.find((i) => i.key === k)?.value ?? d;
  const v = (p: string, acc: string, st = 'pnl') =>
    lines.find((l) => l.period === p && l.statement === st && l.account.toLowerCase() === acc.toLowerCase())?.amount;

  const months = [...new Set(lines.filter((l) => l.statement === 'pnl' && l.account === 'Total Income').map((l) => l.period))].sort();
  const last = months[months.length - 1];
  const rows = months.map((p) => {
    const np = v(p, 'Net Profit') ?? 0;
    const dep = (v(p, 'Depreciation') ?? 0) + (v(p, 'Amortization Expenses') ?? 0);
    const int = v(p, 'Interest Expense') ?? 0;
    return { period: p, month: monthLabel(p), income: v(p, 'Total Income') ?? 0, gross: v(p, 'Gross Profit') ?? 0, np, dep, int, ebitda: np + dep + int };
  });
  // last 12 calendar months ending at the newest report. A month with no report is filled with the
  // same month a year earlier (seasonality), else the window is scaled up to 12 months.
  const addM = (p: string, n: number) => { const [y, mo] = p.split('-').map(Number); const t = y * 12 + mo - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`; };
  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const span = last ? Array.from({ length: 12 }, (_, i) => addM(last, i - 11)) : [];
  const filled: string[] = [];
  const ttmRows = span.flatMap((p) => {
    const r = byPeriod.get(p) ?? byPeriod.get(addM(p, -12));
    if (r && !byPeriod.has(p)) filled.push(`${monthLabel(p)} ← ${r.month}`);
    return r ? [r] : [];
  });
  const k = ttmRows.length ? 12 / ttmRows.length : 0;
  const sum = (f: (r: typeof rows[number]) => number, rs = ttmRows) => rs.reduce((s, r) => s + f(r), 0);
  const ttm = { months: ttmRows.length - filled.length, filled, income: sum((r) => r.income) * k, np: sum((r) => r.np) * k, dep: sum((r) => r.dep) * k, ebitda: sum((r) => r.ebitda) * k };
  const recent = rows.slice(-4);
  const runRateEbitda = recent.length ? (sum((r) => r.ebitda, recent) / recent.length) * 12 : 0;

  const mgr = a('mgr_salary', 2000) * 12;
  const w = a('runrate_weight', 30) / 100;
  const ebitdaBase = ttm.ebitda * (1 - w) + runRateEbitda * w; // before the owner adjustment
  const adjEbitda = ebitdaBase - mgr;

  const bsMonths = [...new Set(lines.filter((l) => l.statement === 'balance_sheet' && l.account === 'Net Assets').map((l) => l.period))].sort();
  const bs = bsMonths[bsMonths.length - 1];
  const netAssets = v(bs, 'Net Assets', 'balance_sheet') ?? 0;
  const cash = v(bs, 'Total Bank', 'balance_sheet') ?? 0;
  const ncl = v(bs, 'Total Non-current Liabilities', 'balance_sheet') ?? 0;
  const loanIn = inputs.find((i) => i.key === 'loan');
  const debt = loanIn?.status === 'answered' && loanIn.value != null ? loanIn.value : ncl;
  const debtIsEstimate = !(loanIn?.status === 'answered' && loanIn.value != null);

  // Slow stock: each price band has its own "slow after" limit (months since the last sale, or since
  // the model was added if it never sold). Stock past the limit keeps recovery_slow of its cost; stock
  // a further 12 months past it keeps recovery_very_slow. Every stock row sits in one band and one idle
  // month, so nothing is written down twice. If the accountant already provides for slow stock, the
  // balance sheet carries the write-down and it is not deducted again here.
  const keepSlow = a('recovery_slow', 75) / 100, keepVerySlow = a('recovery_very_slow', 50) / 100;
  const stockBands = STOCK_BANDS.map((b) => {
    const limit = a(b.limitKey, b.limitDefault);
    const rs = (snap?.idle ?? []).filter((x) => x.band === b.band);
    const total = rs.reduce((s, x) => s + x.cost, 0);
    const slow = rs.filter((x) => x.months_idle >= limit && x.months_idle < limit + 12).reduce((s, x) => s + x.cost, 0);
    const verySlow = rs.filter((x) => x.months_idle >= limit + 12).reduce((s, x) => s + x.cost, 0);
    return { ...b, limit, total, slow, verySlow, writeDown: slow * (1 - keepSlow) + verySlow * (1 - keepVerySlow) };
  });
  const provision = inputs.find((i) => i.key === 'stock_provision');
  const provisionInBooks = provision?.status === 'answered' && /^\s*(yes|نعم|اي)/i.test(provision.answer ?? '');
  const writeDown = provisionInBooks ? 0 : stockBands.reduce((s, b) => s + b.writeDown, 0);

  const excessCash = Math.max(0, cash - a('operating_cash', 50000));
  const toEquity = (ev: number) => ev + excessCash - debt;
  const r = a('discount_rate', 20) / 100, g = a('growth_rate', 5) / 100, tg = a('terminal_growth', 2) / 100;
  const fcf0 = adjEbitda - ttm.dep; // D&A as a stand-in for yearly shop-fit spending
  let pv = 0, f = fcf0;
  for (let y = 1; y <= 5; y++) { f *= 1 + g; pv += f / (1 + r) ** y; }
  const tv = r > tg ? (f * (1 + tg)) / (r - tg) / (1 + r) ** 5 : 0;
  const dcf = toEquity(pv + tv);

  const methods = [
    { key: 'ebitda', name: 'Earnings multiple (EBITDA)', fit: 'Best fit',
      basis: `Adjusted EBITDA ${kd(adjEbitda)} × ${a('ebitda_mult_low', 3)}–${a('ebitda_mult_high', 5)}, plus spare cash, less debt`,
      low: toEquity(adjEbitda * a('ebitda_mult_low', 3)), high: toEquity(adjEbitda * a('ebitda_mult_high', 5)),
      note: 'How buyers price a profitable, established retailer. The owner-manager salary is deducted first.' },
    { key: 'assets', name: 'Adjusted net assets', fit: 'Floor',
      basis: provisionInBooks ? `Net assets ${kd(netAssets)} (the accountant already writes down slow stock)` : `Net assets ${kd(netAssets)} less slow-stock write-down ${kd(writeDown)}`,
      low: netAssets - writeDown, high: netAssets,
      note: 'What the business is worth if it stopped trading tomorrow. The price should not go below this.' },
    { key: 'sde', name: "Owner's earnings (SDE)", fit: 'Owner-operator buyer',
      basis: `Earnings before owner pay ${kd(ebitdaBase)} × ${a('sde_mult_low', 2)}–${a('sde_mult_high', 3)}, plus spare cash, less debt`,
      low: toEquity(ebitdaBase * a('sde_mult_low', 2)), high: toEquity(ebitdaBase * a('sde_mult_high', 3)),
      note: 'For a buyer who will run the shops personally and keep the owners’ share.' },
    { key: 'dcf', name: 'Discounted cash flow', fit: 'Check',
      basis: `Cash flow ${kd(fcf0)} growing ${a('growth_rate', 5)}%, discounted at ${a('discount_rate', 20)}%`,
      low: dcf * 0.85, high: dcf * 1.15,
      note: 'Very sensitive to growth and discount rate — use it to sanity-check the others.' },
    { key: 'revenue', name: 'Sales multiple', fit: 'Rough check',
      basis: `Last-12-month sales ${kd(ttm.income)} × 0.3–0.6`,
      low: ttm.income * 0.3, high: ttm.income * 0.6,
      note: 'Ignores profit; only a rough market cross-check.' },
  ];
  const e = methods[0], floor = methods[1].low;
  const recLow = Math.max(e.low, floor), recHigh = Math.max(e.high, floor);
  const formula = {
    multLow: a('ebitda_mult_low', 3), multHigh: a('ebitda_mult_high', 5), operatingCash: a('operating_cash', 50000),
    evLow: adjEbitda * a('ebitda_mult_low', 3), evHigh: adjEbitda * a('ebitda_mult_high', 5),
    earningsLow: e.low, earningsHigh: e.high, floor, lowFromFloor: floor > e.low, highFromFloor: floor > e.high,
  };

  return { rows, ttm, excessCash, last, runRateEbitda, ebitdaBase, adjEbitda, mgr, bs, netAssets, cash, debt, debtIsEstimate, ncl, writeDown, stockBands, provisionInBooks, keepSlow, keepVerySlow, formula, methods, recLow, recHigh, w };
}

const STOCK_BANDS = [
  { band: 'low', label: 'Under 500 KD', limitKey: 'slow_months_low', limitDefault: 12 },
  { band: 'mid', label: '500–999 KD', limitKey: 'slow_months_mid', limitDefault: 18 },
  { band: 'high', label: '1,000 KD and over', limitKey: 'slow_months_high', limitDefault: 24 },
] as const;

// ---------- views ----------
function Panel({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>{children}</div>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel className="p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-800 tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </Panel>
  );
}

function Summary({ m, onGo, openCount }: { m: Model; onGo: () => void; openCount: number }) {
  const max = Math.max(...m.methods.map((x) => x.high), m.recHigh, 1);
  return (
    <div className="space-y-4">
      <div className="p-5 rounded-xl bg-slate-800 text-white">
        <div className="text-sm text-slate-300">Recommended value range (earnings multiple, not below net assets)</div>
        <div className="text-3xl font-bold tabular-nums mt-1">{kd(m.recLow)} – {kd(m.recHigh)}</div>
        <div className="text-xs text-slate-400 mt-2">
          Provisional{openCount ? ` — ${openCount} questions still open; answers can move this range.` : '.'} Reports to {m.last ? monthLabel(m.last) : '—'}, balance sheet {m.bs ? monthLabel(m.bs) : '—'}.
          {openCount > 0 && <button onClick={onGo} className="ml-2 underline text-white">Answer questions →</button>}
        </div>
      </div>
      <Formula m={m} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Sales, last 12 months" value={kd(m.ttm.income)} sub={m.ttm.filled.length ? `no report for ${m.ttm.filled.join(', ')} (used a year earlier)` : m.ttm.months < 12 ? `${m.ttm.months} reported months, scaled to 12` : undefined} />
        <Stat label="Adjusted EBITDA" value={kd(m.adjEbitda)} sub={`after ${kd(m.mgr)} manager pay · ${Math.round(m.w * 100)}% weight on recent pace`} />
        <Stat label="Net assets" value={kd(m.netAssets)} sub={`cash ${kd(m.cash)} · spare ${kd(m.excessCash)}`} />
        <Stat label="Debt" value={kd(m.debt)} sub={m.debtIsEstimate ? 'estimate: long-term liabilities' : 'loan balance you gave'} />
      </div>
      <div className="space-y-2">
        {m.methods.map((x) => (
          <Panel key={x.key} className="p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-800">{x.name}</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${x.key === 'ebitda' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{x.fit}</span>
              </div>
              <div className="font-bold tabular-nums text-slate-800">{kd(x.low)} – {kd(x.high)}</div>
            </div>
            <div className="relative h-2 bg-slate-100 rounded-full mt-2">
              <div className={`absolute h-2 rounded-full ${x.key === 'ebitda' ? 'bg-emerald-500' : 'bg-slate-400'}`}
                style={{ left: `${Math.max(0, x.low / max) * 100}%`, width: `${Math.max(1, ((x.high - x.low) / max) * 100)}%` }} />
            </div>
            <div className="text-xs text-slate-500 mt-2">{x.basis}</div>
            <div className="text-xs text-slate-400">{x.note}</div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

// The recommended range, step by step, so it is clear what feeds it and what does not.
function Row({ n, label, low, high, note, strong }: { n?: string; label: string; low: string; high?: string; note?: string; strong?: boolean }) {
  return (
    <div className={`grid grid-cols-[1.5rem_1fr_auto] gap-x-2 py-1.5 border-t border-slate-100 ${strong ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
      <span className="text-slate-400 text-xs pt-0.5">{n}</span>
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {note && <div className="text-xs text-slate-400 font-normal">{note}</div>}
      </div>
      <div className="text-sm tabular-nums text-right whitespace-nowrap">{high === undefined ? low : `${low} – ${high}`}</div>
    </div>
  );
}

function Formula({ m }: { m: Model }) {
  const f = m.formula;
  const floorBinds = f.lowFromFloor || f.highFromFloor;
  return (
    <Panel className="p-4">
      <div className="font-semibold text-slate-800">How the range is built</div>
      <div className="text-xs text-slate-500 mb-2">Each end of the range is the higher of the earnings value and the floor.</div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-2">Earnings value</div>
      <Row n="1" label={`Adjusted EBITDA × ${f.multLow}–${f.multHigh}`} low={kd(f.evLow)} high={kd(f.evHigh)}
        note={`${kd(m.adjEbitda)} a year, after ${kd(m.mgr)} manager pay`} />
      <Row n="2" label="+ spare cash" low={kd(m.excessCash)} note={`bank ${kd(m.cash)} less ${kd(f.operatingCash)} kept for running the shops`} />
      <Row n="3" label="− debt" low={kd(m.debt)} note={m.debtIsEstimate ? 'long-term liabilities on the balance sheet' : 'loan balance you gave'} />
      <Row label="= earnings value" low={kd(f.earningsLow)} high={kd(f.earningsHigh)} strong />
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-3">Floor</div>
      <Row n="4" label="Net assets (accountant's balance sheet)" low={kd(m.netAssets)} note="stock is inside this, at the accountant's value" />
      <Row n="5" label="− slow-stock write-down" low={kd(m.writeDown)}
        note={m.provisionInBooks ? 'none: the accountant already provides for slow stock' : 'per price band, see Data → Stock'} />
      <Row label="= floor" low={kd(f.floor)} strong />
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-3">Result</div>
      <Row label="Recommended range" low={kd(m.recLow)} high={kd(m.recHigh)} strong
        note={`low end from the ${f.lowFromFloor ? 'floor' : 'earnings value'}, high end from the ${f.highFromFloor ? 'floor' : 'earnings value'}`} />
      <div className="text-xs text-slate-600 bg-amber-50 rounded-lg p-2 mt-3">
        Stock is not added on top of the earnings value: the stock is what produces those earnings, so adding it again would count it twice.
        It counts through the floor only. {floorBinds
          ? 'Right now the floor sets part of the range, so the stock write-down moves the final number.'
          : 'Right now the earnings value is higher at both ends, so the stock write-down does not change the final number.'}
      </div>
    </Panel>
  );
}

function SharedForm({ tokens, subs }: { tokens: string[]; subs: Submission[] }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  if (!tokens.length && !subs.length) return null;
  const link = tokens[0] ? `${location.origin}${import.meta.env.BASE_URL}answer.html?t=${tokens[0]}` : '';
  // subs are newest first, so the first row per person is their latest answer
  const seen = new Set<string>();
  const people = subs.filter((x) => { const k = (x.respondent ?? 'Unnamed').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return (
    <Panel className="p-4 space-y-3">
      <div>
        <div className="font-semibold text-slate-800">Answers from the shared link</div>
        <div className="text-xs text-slate-500">Anyone with this link can answer the questions without an account. They cannot see any figures or other answers.</div>
      </div>
      {link && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input readOnly value={link} className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg p-2 bg-slate-50" onFocus={(e) => e.target.select()} />
          <button onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => {})}
            className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-white whitespace-nowrap">{copied ? 'Copied ✓' : 'Copy link'}</button>
        </div>
      )}
      {people.length === 0 ? <p className="text-sm text-slate-400">No answers yet.</p> : people.map((x) => (
        <div key={x.id} className="border-t border-slate-100 pt-2">
          <button onClick={() => setOpen(open === x.id ? null : x.id)} className="w-full flex justify-between text-sm text-left">
            <span className="font-medium text-slate-700">{x.respondent || 'Unnamed'}</span>
            <span className="text-slate-400 text-xs">{Object.keys(x.answers).length} answers · {new Date(x.submitted_at).toLocaleString('en-GB')} {open === x.id ? '▲' : '▼'}</span>
          </button>
          {open === x.id && (
            <dl className="mt-2 text-xs grid grid-cols-1 sm:grid-cols-[minmax(0,14rem)_1fr] gap-x-3 gap-y-1">
              {Object.entries(x.answers).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-slate-400 break-words">{k.replace(/_/g, ' ').replace(/\./g, ' · ')}</dt><dd className="text-slate-700 break-words">{[].concat(v as never).join(', ')}</dd></div>
              ))}
            </dl>
          )}
        </div>
      ))}
    </Panel>
  );
}

function Questions({ items, save }: { items: Input[]; save: (k: string, p: Partial<Input>) => Promise<void> }) {
  const [show, setShow] = useState<'open' | 'all'>('open');
  const list = items.filter((q) => show === 'all' || q.status === 'open');
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-sm">
        {(['open', 'all'] as const).map((s) => (
          <button key={s} onClick={() => setShow(s)} className={`px-3 py-1 rounded-full ${show === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {s === 'open' ? 'Still open' : 'All'}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="text-sm text-slate-500">Everything is answered.</p>}
      {list.map((q, i) => <QuestionCard key={q.key} q={q} n={items.indexOf(q) + 1} save={save} first={i === 0 && show === 'open'} />)}
    </div>
  );
}

function QuestionCard({ q, n, save, first }: { q: Input; n: number; save: (k: string, p: Partial<Input>) => Promise<void>; first: boolean }) {
  const [text, setText] = useState(q.answer ?? '');
  const [num, setNum] = useState(q.value?.toString() ?? '');
  const numeric = q.key === 'loan' || q.key === 'indemnity';
  return (
    <Panel className={`p-4 ${first ? 'ring-2 ring-emerald-400' : ''}`}>
      <div className="flex gap-2">
        {q.status === 'open' ? <Circle className="w-4 h-4 mt-0.5 text-slate-300 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-400">{n}. {q.section}{first ? ' · next up' : ''}</div>
          <div className="font-medium text-slate-800">{q.question}</div>
          {q.why && <div className="text-xs text-slate-500 mt-1">Why it matters: {q.why}</div>}
          {q.found && <div className="text-xs text-sky-700 bg-sky-50 rounded px-2 py-1 mt-2">What the data already shows: {q.found}</div>}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Your answer…"
            className="w-full mt-2 text-sm border border-slate-200 rounded-lg p-2" />
          {numeric && (
            <input value={num} onChange={(e) => setNum(e.target.value)} inputMode="decimal" placeholder="Amount in KD"
              className="w-full sm:w-48 mt-2 text-sm border border-slate-200 rounded-lg p-2" />
          )}
          <div className="flex flex-wrap gap-2 mt-2 items-center">
            <button onClick={() => save(q.key, { answer: text || null, value: num ? Number(num) : null, status: 'answered' })}
              className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-white">Save answer</button>
            {q.status === 'open'
              ? <button onClick={() => save(q.key, { status: 'skipped' })} className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-600">Skip</button>
              : <button onClick={() => save(q.key, { status: 'open' })} className="px-3 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-600">Reopen</button>}
            {q.updated_by && q.status !== 'open' && <span className="text-xs text-slate-400">{q.status} by {q.updated_by.split('@')[0]}</span>}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Assumptions({ items, save }: { items: Input[]; save: (k: string, p: Partial<Input>) => Promise<void> }) {
  const sections = [...new Set(items.map((i) => i.section))];
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">These numbers drive the methods on the Summary tab. Change one and the values update straight away.</p>
      {sections.map((s) => (
        <Panel key={s} className="p-4">
          <div className="font-semibold text-slate-700 mb-2">{s}</div>
          <div className="space-y-3">
            {items.filter((i) => i.section === s).map((i) => (
              <div key={i.key} className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1">
                  <div className="text-sm text-slate-700">{i.question}</div>
                  {i.why && <div className="text-xs text-slate-400">{i.why}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" defaultValue={i.value ?? ''} step="any"
                    onBlur={(e) => e.target.value.trim() !== '' && e.target.value !== String(i.value ?? '') && save(i.key, { value: Number(e.target.value) })}
                    className="w-28 text-right text-sm border border-slate-200 rounded-lg p-1.5 tabular-nums" />
                  <span className="text-xs text-slate-500 w-20">{i.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function StockTable({ m, zeroCost }: { m: Model; zeroCost: number }) {
  const [sort, setSort] = useState<{ k: string; d: number }>({ k: 'limit', d: 1 });
  const cols = [['label', 'Shelf price'], ['limit', 'Slow after'], ['total', 'Owned stock (cost)'], ['slow', 'Past the limit'],
    ['verySlow', '12+ months past'], ['writeDown', 'Write-down']] as const;
  const rows = [...m.stockBands].sort((a, b) => {
    const x = a[sort.k as keyof typeof a], y = b[sort.k as keyof typeof b];
    return (typeof x === 'number' ? (x as number) - (y as number) : String(x).localeCompare(String(y))) * sort.d;
  });
  const cell = (r: typeof rows[number], k: typeof cols[number][0]) =>
    k === 'label' ? r.label : k === 'limit' ? `${r.limit} months` : kd(r[k]);
  return (
    <div>
      <h2 className="font-semibold text-slate-700 mb-1">Stock: how the write-down is worked out</h2>
      <p className="text-xs text-slate-500 mb-2">
        Months idle = since the last sale, or since the model was added if it never sold, so new arrivals are not counted as slow.
        Past the limit keeps {Math.round(m.keepSlow * 100)}% of cost; a further 12 months past keeps {Math.round(m.keepVerySlow * 100)}%.
        Change the limits and percentages on the Assumptions tab.
        {m.provisionInBooks && ' The accountant already provides for slow stock, so none of this is deducted.'}
      </p>
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="text-sm min-w-full">
          <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
            {cols.map(([k, l]) => (
              <th key={k} onClick={() => setSort(sort.k === k ? { k, d: -sort.d } : { k, d: -1 })}
                className={`px-3 py-2 cursor-pointer select-none whitespace-nowrap ${k === 'label' ? 'text-left' : 'text-right'}`}>
                {l}{sort.k === k ? (sort.d < 0 ? ' ↓' : ' ↑') : ''}
              </th>))}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.band} className="border-t border-slate-100">
                {cols.map(([k]) => <td key={k} className={`px-3 py-1.5 whitespace-nowrap ${k === 'label' ? '' : 'text-right tabular-nums'}`}>{cell(r, k)}</td>)}
              </tr>))}
            <tr className="border-t border-slate-200 font-semibold">
              <td className="px-3 py-1.5">Total</td><td />
              {(['total', 'slow', 'verySlow', 'writeDown'] as const).map((k) => (
                <td key={k} className="px-3 py-1.5 text-right tabular-nums">{kd(m.stockBands.reduce((s, b) => s + b[k], 0))}</td>))}
            </tr>
          </tbody>
        </table>
      </div>
      {zeroCost > 0 && <p className="text-xs text-amber-700 mt-1">{zeroCost} units have no cost in Lightspeed, so they count as zero here.</p>}
    </div>
  );
}

function DataView({ m, snap }: { m: Model; snap: Snapshot | null }) {
  const [sort, setSort] = useState<{ k: string; d: number }>({ k: 'period', d: -1 });
  const cols = [['month', 'Month'], ['income', 'Sales'], ['gross', 'Gross profit'], ['np', 'Net profit'], ['dep', 'Depr. + amort.'], ['int', 'Interest'], ['ebitda', 'EBITDA']] as const;
  const rows = [...m.rows].sort((a, b) => {
    const k = sort.k === 'month' ? 'period' : sort.k;
    const x = a[k as keyof typeof a], y = b[k as keyof typeof b];
    return (typeof x === 'number' ? (x as number) - (y as number) : String(x).localeCompare(String(y))) * sort.d;
  });
  const pctRepeat = snap?.customers?.buyers ? Math.round((snap.customers.repeat / snap.customers.buyers) * 100) : 0;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-slate-700 mb-2">Monthly earnings (accountant reports)</h2>
        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
          <table className="text-sm min-w-full">
            <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
              {cols.map(([k, l]) => (
                <th key={k} onClick={() => setSort(sort.k === k ? { k, d: -sort.d } : { k, d: -1 })}
                  className={`px-3 py-2 cursor-pointer select-none whitespace-nowrap ${k === 'month' ? 'text-left' : 'text-right'}`}>
                  {l}{sort.k === k ? (sort.d < 0 ? ' ↓' : ' ↑') : ''}
                </th>))}
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.period} className="border-t border-slate-100">
                {cols.map(([k]) => <td key={k} className={`px-3 py-1.5 whitespace-nowrap ${k === 'month' ? '' : 'text-right tabular-nums'}`}>
                  {k === 'month' ? r.month : kd(r[k])}</td>)}
              </tr>))}</tbody>
          </table>
        </div>
      </div>
      {snap && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Till sales, last 12 months" value={kd(snap.sales_12m)} sub="Lightspeed" />
            <Stat label="Buyers, last 12 months" value={snap.customers.buyers.toLocaleString()} sub={`${pctRepeat}% bought more than once`} />
            <Stat label="Owned stock at cost" value={kd(snap.aging.reduce((s, x) => s + x.cost, 0))} sub={`as of ${snap.as_of}`} />
            <Stat label="Slow-stock write-down" value={kd(m.writeDown)} sub={m.provisionInBooks ? 'none: the accountant already provides for it' : 'per price band, see below'} />
          </div>
          <StockTable m={m} zeroCost={snap.zero_cost_units ?? 0} />
          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard title="Owned stock by last sale (cost)">
              <BarChart data={snap.aging.map((x) => ({ label: x.bucket, value: x.cost }))} />
            </ChartCard>
            <ChartCard title="Sales by brand, last 12 months">
              <BarChart data={(snap.sales_brands ?? []).map((x) => ({ label: x.brand, value: x.rev }))} />
            </ChartCard>
            <ChartCard title="Sales by outlet, last 12 months">
              <BarChart data={(snap.sales_outlets ?? []).map((x) => ({ label: x.outlet, value: x.rev }))} />
            </ChartCard>
            <ChartCard title="Stock ownership (cost)">
              <BarChart data={(snap.ownership ?? []).map((x) => ({ label: x.own, value: x.cost }))} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
