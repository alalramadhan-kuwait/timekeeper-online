import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Plus, Trash2, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, Spinner } from '../components/ui';
import { formatKD } from '../lib/format';

/* Payroll, for the three owners only. Every figure comes from the database's pay functions,
   which refuse anyone else: salaries (a history, an increment is a new entry), bonuses and
   deductions, and commission worked out from the shops' Lightspeed sales. An approved month is
   a frozen copy. Nothing is calculated here beyond what is shown. */

interface Shop { code: string; name: string; sales: number; target: number; rate: number; reached: boolean; commission: number; uncredited_sales: number; uncredited_commission: number }
interface Line {
  employee_id: string; name: string; full_name: string; location: string | null; job_title: string | null;
  has_salary: boolean; basic: number; allowances: number; salary: number;
  commission: number; commission_detail: { shop: string; sales: number; commission: number }[];
  bonuses: number; deductions: number; net: number;
}
interface Adjustment { id: number; employee_id: string; kind: 'bonus' | 'deduction'; label: string; amount: number; note: string | null; by: string; at: string; voided_at: string | null; voided_by: string | null }
interface Totals { salary: number; commission: number; bonuses: number; deductions: number; net: number; people: number }
interface PayMonth {
  month: string; status: 'open' | 'approved' | 'paid'; approved_at: string | null; approved_by: string | null; paid_at: string | null; paid_by: string | null;
  shops: Shop[]; lines: Line[]; adjustments: Adjustment[]; totals: Totals;
}
interface HistoryMonth { month: string; totals: Totals; approved: boolean }
interface SalaryEntry { id: number; effective_from: string; basic: number; housing: number; transport: number; other: number; total: number; reason: string; note: string | null; by: string; at: string }

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const kwNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' }));
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const shiftMonth = (key: string, by: number) => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + by, 1)); };
const monthName = (key: string, short = false) => new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }) });
const day = (iso: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' }) : '—');
const kd = (n: number) => `${formatKD(Math.round(n * 1000) / 1000)} KD`;
const kd0 = (n: number) => `${Math.round(n).toLocaleString('en-US')} KD`;
const shopShort = (s: string) => s.replace(/^Time Keeper\s*-\s*/i, '');

export default function PayrollPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [month, setMonth] = useState(() => monthKey(kwNow()));
  const [data, setData] = useState<PayMonth | null>(null);
  const [history, setHistory] = useState<HistoryMonth[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = monthKey(kwNow());

  useEffect(() => {
    supabase.rpc('stock_ai_allowed').then(({ data: ok }) => setAllowed(!!ok), () => setAllowed(false));
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [m, h] = await Promise.all([rpc<PayMonth>('pay_month', { p_month: month }), rpc<HistoryMonth[]>('pay_history', { p_months: 6 })]);
      setData(m); setHistory(h);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load payroll.'); }
  }, [month]);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  async function act(fn: string, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try { await rpc(fn, { p_month: month }); await load(); }
    catch (e) { window.alert(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  }

  if (allowed === null) return <Spinner />;
  if (!allowed) return <div className="p-10 text-center text-slate-500"><Lock className="mx-auto mb-2" size={20} />Payroll is for the owners only.</div>;

  const t = data?.totals;
  const person = data?.lines.find((l) => l.employee_id === sel) ?? null;
  const missing = data?.lines.filter((l) => !l.has_salary).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Payroll</h1>
          <p className="flex items-center gap-1 text-xs text-slate-500"><Lock size={12} /> Owners only</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Previous month"><ChevronLeft size={18} /></button>
          <span className="min-w-[132px] text-center text-sm font-semibold text-slate-800">{monthName(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= current} className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
      </div>

      {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}
      {!data ? <Spinner /> : (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="To pay" value={kd0(t!.net)} strong sub={statusText(data)} />
          <Tile label="Salaries" value={kd0(t!.salary)} sub={`${t!.people} people`} />
          <Tile label="Commission" value={kd0(t!.commission)} sub={data.shops.some((s) => s.reached) ? 'Target reached' : 'No shop at target yet'} />
          <Tile label="Bonuses − deductions" value={kd0(t!.bonuses - t!.deductions)} sub={`+${kd0(t!.bonuses)} · −${kd0(t!.deductions)}`} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="Commission targets" hint="2.5% once the shop reaches its month's target">
            {data.shops.length === 0 && <p className="text-sm text-slate-400">No commission rule for this month.</p>}
            <div className="space-y-4">{data.shops.map((s) => <ShopTarget key={s.code} s={s} />)}</div>
          </Card>
          <Card title="Last 6 months" hint="What was or will be paid">
            <MonthBars data={history} current={month} onPick={setMonth} />
          </Card>
        </div>

        <Card title="People" hint={missing ? `${missing} without a salary yet. Tap to set it.` : 'Tap a name to see or change their pay'}>
          <div className="-mx-1 divide-y divide-slate-100">
            {data.lines.map((l) => (
              <button key={l.employee_id} onClick={() => setSel(l.employee_id)} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{l.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {[l.location, l.job_title].filter(Boolean).join(' · ')}
                    {!l.has_salary && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-px font-medium text-amber-700">Set salary</span>}
                  </div>
                  <MiniBar l={l} />
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums text-slate-900">{kd(l.net)}</div>
                  {l.commission > 0 && <div className="text-xs tabular-nums text-emerald-700">+{kd(l.commission)} commission</div>}
                </div>
              </button>
            ))}
          </div>
          <Legend />
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3 pb-6">
          {data.status === 'open' && (
            <button disabled={busy || month > current} onClick={() => act('pay_month_approve', `Approve ${monthName(month)}? The figures are then locked: ${kd(t!.net)} to pay.`)}
              className="min-h-[44px] rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-40">Approve {monthName(month, true)}</button>
          )}
          {data.status === 'approved' && (
            <button disabled={busy} onClick={() => act('pay_month_paid', `Mark ${monthName(month)} as paid?`)}
              className="min-h-[44px] rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white disabled:opacity-40">Mark as paid</button>
          )}
        </div>
      </>)}

      {person && data && (
        <PersonSheet line={person} month={data} onClose={() => setSel(null)} onChanged={load} />
      )}
    </div>
  );
}

function statusText(d: PayMonth) {
  if (d.status === 'paid') return `Paid ${day(d.paid_at)}`;
  if (d.status === 'approved') return `Approved by ${d.approved_by}`;
  return 'Not approved yet';
}

function Tile({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${strong ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'}`}>
      <div className={`text-xs ${strong ? 'text-slate-300' : 'text-slate-500'}`}>{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${strong ? '' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className={`mt-0.5 truncate text-xs ${strong ? 'text-slate-300' : 'text-slate-400'}`}>{sub}</div>}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/* A shop's month against its target: the bar fills to the target and turns green past it. */
function ShopTarget({ s }: { s: Shop }) {
  const pct = s.target > 0 ? Math.min(1, s.sales / s.target) : 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-slate-800">{shopShort(s.name)}</span>
        <span className={`text-sm font-semibold tabular-nums ${s.reached ? 'text-emerald-700' : 'text-slate-500'}`}>
          {s.reached ? `${kd0(s.commission)} commission` : `${kd0(Math.max(0, s.target - s.sales))} to go`}
        </span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${s.reached ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-slate-500">
        <span>{kd0(s.sales)} sold</span><span>Target {kd0(s.target)} · {(s.rate * 100).toLocaleString('en-US')}%</span>
      </div>
      {s.uncredited_commission > 0 && (
        <div className="mt-1 text-xs text-amber-700">{kd(s.uncredited_commission)} on sales credited to nobody (not paid to anyone).</div>
      )}
    </div>
  );
}

/* Six months of pay as columns: salaries, commission and bonuses stacked. */
function MonthBars({ data, current, onPick }: { data: HistoryMonth[]; current: string; onPick: (m: string) => void }) {
  const max = Math.max(1, ...data.map((h) => h.totals.salary + h.totals.commission + h.totals.bonuses));
  return (
    <div>
      <div className="flex h-36 items-end gap-2">
        {data.map((h) => {
          const parts = [[h.totals.salary, 'bg-slate-700'], [h.totals.commission, 'bg-emerald-500'], [h.totals.bonuses, 'bg-amber-400']] as const;
          return (
            <button key={h.month} onClick={() => onPick(h.month)} className={`flex h-full flex-1 flex-col items-center justify-end rounded-md ${h.month === current ? 'bg-slate-100' : ''}`}
              title={`${monthName(h.month)}: ${kd(h.totals.net)}`}>
              <span className="mb-1 text-[10px] tabular-nums text-slate-500">{h.totals.net ? Math.round(h.totals.net).toLocaleString('en-US') : ''}</span>
              <div className="flex w-full max-w-[34px] flex-col-reverse overflow-hidden rounded-t">
                {parts.map(([v, c], i) => <div key={i} className={c} style={{ height: `${(v / max) * 104}px` }} />)}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">{data.map((h) => <span key={h.month} className={`flex-1 text-center text-[11px] ${h.month === current ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{monthName(h.month, true)}</span>)}</div>
    </div>
  );
}

/* One person's month in a thin bar: salary, commission, bonuses (and deductions as a gap). */
function MiniBar({ l }: { l: Line }) {
  const total = l.salary + l.commission + l.bonuses;
  if (!total) return null;
  return (
    <div className="mt-1.5 flex h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-100">
      <div className="bg-slate-700" style={{ width: `${(l.salary / total) * 100}%` }} />
      <div className="bg-emerald-500" style={{ width: `${(l.commission / total) * 100}%` }} />
      <div className="bg-amber-400" style={{ width: `${(l.bonuses / total) * 100}%` }} />
    </div>
  );
}

const Legend = () => (
  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-slate-700" />Salary</span>
    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Commission</span>
    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" />Bonus</span>
  </div>
);

const REASONS = ['Starting salary', 'Increment', 'Promotion', 'Correction'] as const;
const input = 'min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] tabular-nums';

function PersonSheet({ line, month, onClose, onChanged }: { line: Line; month: PayMonth; onClose: () => void; onChanged: () => Promise<void> }) {
  const [hist, setHist] = useState<SalaryEntry[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const locked = month.status !== 'open';
  const adj = month.adjustments.filter((a) => a.employee_id === line.employee_id);

  const loadHist = useCallback(() => rpc<{ salaries: SalaryEntry[] }>('pay_employee', { p_employee: line.employee_id }).then((r) => setHist(r.salaries), (e) => setErr(String(e.message ?? e))), [line.employee_id]);
  useEffect(() => { void loadHist(); }, [loadHist]);
  const latest = hist?.[0] ?? null;

  const save = async (fn: string, args: Record<string, unknown>, after: () => void) => {
    setErr(null);
    try { await rpc(fn, args); after(); await Promise.all([onChanged(), loadHist()]); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
  };

  return (
    <Modal title={line.name} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <div className="text-xs text-slate-500">{monthName(month.month)} · {locked ? 'locked' : 'not approved yet'}</div>
          <div className="text-3xl font-bold tabular-nums text-slate-900">{kd(line.net)}</div>
        </div>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          <Row k="Basic salary" v={kd(line.basic)} />
          <Row k="Allowances" v={kd(line.allowances)} />
          <Row k="Commission" v={kd(line.commission)} sub={line.commission_detail.map((d) => `${shopShort(d.shop)}: ${kd0(d.sales)} sold`).join(' · ') || undefined} />
          <Row k="Bonuses" v={kd(line.bonuses)} />
          <Row k="Deductions" v={line.deductions ? `−${kd(line.deductions)}` : kd(0)} />
          <Row k="To pay" v={kd(line.net)} strong />
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Salary</h3>
            {!editing && <button onClick={() => setEditing(true)} className="min-h-[40px] rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-800">{latest ? 'Change salary' : 'Set salary'}</button>}
          </div>
          {editing && <SalaryForm latest={latest} onCancel={() => setEditing(false)}
            onSave={(v) => save('pay_salary_add', { p_employee: line.employee_id, ...v }, () => setEditing(false))} />}
          {hist === null ? <Spinner /> : hist.length === 0 ? <p className="text-sm text-slate-400">No salary recorded yet.</p> : (
            <ol className="space-y-2">
              {hist.map((h, i) => {
                const prev = hist[i + 1];
                const diff = prev ? h.total - prev.total : 0;
                return (
                  <li key={h.id} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                    <TrendingUp size={16} className={`mt-0.5 shrink-0 ${diff > 0 ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold tabular-nums text-slate-900">{kd(h.total)}</span>
                        {prev && diff !== 0 && <span className={`text-sm font-semibold tabular-nums ${diff > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{diff > 0 ? '+' : ''}{kd(diff)}</span>}
                      </div>
                      <div className="text-xs text-slate-500">{h.reason} from {day(h.effective_from)} · basic {kd(h.basic)}{h.housing + h.transport + h.other ? ` + allowances ${kd(h.housing + h.transport + h.other)}` : ''}</div>
                      {h.note && <div className="text-xs italic text-slate-500">“{h.note}”</div>}
                      <div className="text-[11px] text-slate-400">Set by {h.by}, {day(h.at)}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Bonuses and deductions · {monthName(month.month, true)}</h3>
            {!locked && !adding && <button onClick={() => setAdding(true)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-800"><Plus size={15} />Add</button>}
          </div>
          {adding && <AdjustForm onCancel={() => setAdding(false)}
            onSave={(v) => save('pay_adjust_add', { p_employee: line.employee_id, p_month: month.month, ...v }, () => setAdding(false))} />}
          {adj.length === 0 ? <p className="text-sm text-slate-400">None this month.</p> : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {adj.map((a) => (
                <li key={a.id} className={`flex items-center gap-3 px-3 py-2.5 ${a.voided_at ? 'opacity-50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium text-slate-800 ${a.voided_at ? 'line-through' : ''}`}>{a.label}</div>
                    <div className="text-[11px] text-slate-400">{a.voided_at ? `Removed by ${a.voided_by}` : `Added by ${a.by}`}{a.note ? ` · ${a.note}` : ''}</div>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums ${a.kind === 'bonus' ? 'text-emerald-700' : 'text-rose-600'}`}>{a.kind === 'bonus' ? '+' : '−'}{kd(a.amount)}</span>
                  {!locked && !a.voided_at && (
                    <button onClick={() => save('pay_adjust_void', { p_id: a.id }, () => undefined)} className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove"><Trash2 size={16} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {err && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}
      </div>
    </Modal>
  );
}

function Row({ k, v, sub, strong }: { k: string; v: string; sub?: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div><div className={`text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{k}</div>{sub && <div className="text-xs text-slate-400">{sub}</div>}</div>
      <div className={`tabular-nums ${strong ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>{v}</div>
    </div>
  );
}

function SalaryForm({ latest, onCancel, onSave }: { latest: SalaryEntry | null; onCancel: () => void; onSave: (v: Record<string, unknown>) => void }) {
  const [from, setFrom] = useState(() => (latest ? monthKey(new Date(kwNow().getFullYear(), kwNow().getMonth() + 1, 1)) : monthKey(kwNow())));
  const [basic, setBasic] = useState(String(latest?.basic ?? ''));
  const [housing, setHousing] = useState(String(latest?.housing ?? 0));
  const [transport, setTransport] = useState(String(latest?.transport ?? 0));
  const [other, setOther] = useState(String(latest?.other ?? 0));
  const [reason, setReason] = useState<string>(latest ? 'Increment' : 'Starting salary');
  const [note, setNote] = useState('');
  const total = useMemo(() => [basic, housing, transport, other].reduce((s, x) => s + (Number(x) || 0), 0), [basic, housing, transport, other]);
  return (
    <form className="mb-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => { e.preventDefault(); onSave({ p_effective_from: from, p_basic: Number(basic) || 0, p_housing: Number(housing) || 0, p_transport: Number(transport) || 0, p_other: Number(other) || 0, p_reason: reason, p_note: note || null }); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts on"><input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></Field>
        <Field label="Reason"><select value={reason} onChange={(e) => setReason(e.target.value)} className={input}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Basic (KD)"><input inputMode="decimal" required value={basic} onChange={(e) => setBasic(e.target.value)} className={input} /></Field>
        <Field label="Housing (KD)"><input inputMode="decimal" value={housing} onChange={(e) => setHousing(e.target.value)} className={input} /></Field>
        <Field label="Transport (KD)"><input inputMode="decimal" value={transport} onChange={(e) => setTransport(e.target.value)} className={input} /></Field>
        <Field label="Other (KD)"><input inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} className={input} /></Field>
      </div>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={input} /></Field>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-600">Total <b className="tabular-nums text-slate-900">{kd(total)}</b>{latest && total !== latest.total ? <span className={`ml-1.5 font-semibold ${total > latest.total ? 'text-emerald-700' : 'text-rose-600'}`}>{total > latest.total ? '+' : ''}{kd(total - latest.total)}</span> : null}</span>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg bg-white px-4 text-sm font-semibold text-slate-700">Cancel</button>
          <button type="submit" className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">Save</button>
        </div>
      </div>
    </form>
  );
}

function AdjustForm({ onCancel, onSave }: { onCancel: () => void; onSave: (v: Record<string, unknown>) => void }) {
  const [kind, setKind] = useState<'bonus' | 'deduction'>('bonus');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  return (
    <form className="mb-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => { e.preventDefault(); onSave({ p_kind: kind, p_label: label, p_amount: Number(amount), p_note: note || null }); }}>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1">
        {(['bonus', 'deduction'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`min-h-[40px] rounded-md text-sm font-semibold ${kind === k ? (k === 'bonus' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'text-slate-600'}`}>
            {k === 'bonus' ? 'Bonus' : 'Deduction'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="For"><input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'bonus' ? 'e.g. Eid bonus' : 'e.g. Advance'} className={input} /></Field>
        <Field label="Amount (KD)"><input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className={input} /></Field>
      </div>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={input} /></Field>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg bg-white px-4 text-sm font-semibold text-slate-700">Cancel</button>
        <button type="submit" disabled={!(Number(amount) > 0)} className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40">Add</button>
      </div>
    </form>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-xs font-medium text-slate-500"><span className="mb-1 block">{label}</span>{children}</label>
);
