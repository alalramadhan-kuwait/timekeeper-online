import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, Clock, Loader2, Search, StickyNote, Undo2, Check, MoonStar } from 'lucide-react';
import { actOnMission, loadPo, missionHistory, searchPos } from './api';
import { KIND_LABEL, OWNERSHIP_LABEL, missionTitle } from './model';
import type { Mission, MissionEvent, PoDetail, PoSearch, Shelf, Snapshot, StockClass } from './types';
import type { Selection } from './game/WorldScene';
import { day, kd, kd0, num, plural, when } from './format';
import type { MallModel } from './mall/model';
import { MallPanelBody, isMallView } from './mall/panels';

/* What opens when something in the World is tapped. Every figure here comes
   straight from the snapshot or the PO functions; nothing is recalculated. */

export type View = Selection | { type: 'search' } | { type: 'mission'; key: string }
  | { type: 'brands' } | { type: 'mall-settings' } | { type: 'move'; brand: string };

export interface Ctx {
  s: Snapshot;
  mall: MallModel;
  open: (v: View) => void;
  refresh: () => Promise<void>;
  focusBrand: (brand: string) => void;
}

/* ── small parts ─────────────────────────────────────────────────────── */

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[#f6f1e7] px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#7b6a55]">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-[#22304d]">{value}</div>
      {sub && <div className="text-[11px] text-[#7b6a55]">{sub}</div>}
    </div>
  );
}

export function Note({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <p className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-600'}`}>
      {children}
    </p>
  );
}

export function Row({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`flex w-full items-center gap-3 border-b border-slate-100 py-2.5 text-left text-sm last:border-0 ${onClick ? 'hover:bg-slate-50' : ''}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {onClick && <ChevronRight size={16} className="shrink-0 text-slate-300" />}
    </Tag>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#7b6a55]">{title}</h3>
      {children}
    </section>
  );
}

const CLASS_COLOURS: Record<StockClass, string> = {
  fast: '#3f8f5a', healthy: '#7fb38f', new: '#5f7ea8', slow: '#d9a441', dead: '#9a958b',
};
const CLASS_LABEL: Record<StockClass, string> = { fast: 'Fast', healthy: 'Healthy', new: 'New', slow: 'Slow', dead: 'Dead' };

export function ClassBar({ shelf }: { shelf: Pick<Shelf, 'classes'> }) {
  const order: StockClass[] = ['fast', 'healthy', 'new', 'slow', 'dead'];
  const total = order.reduce((n, c) => n + (shelf.classes[c]?.cost_value ?? 0), 0) || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {order.map((c) => {
          const v = shelf.classes[c]?.cost_value ?? 0;
          return v > 0 ? <div key={c} style={{ width: `${(v / total) * 100}%`, background: CLASS_COLOURS[c] }} title={CLASS_LABEL[c]} /> : null;
        })}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {order.filter((c) => shelf.classes[c]).map((c) => (
          <div key={c} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_COLOURS[c] }} />
            <span className="text-slate-600">{CLASS_LABEL[c]}</span>
            <span className="ml-auto tabular-nums text-slate-800">{kd0(shelf.classes[c]!.cost_value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function stateBadge(m: Mission) {
  const map: Record<Mission['state'], [string, string]> = {
    open: ['Open', 'bg-amber-100 text-amber-900'],
    changed_since_review: ['Changed since review', 'bg-orange-100 text-orange-900'],
    reviewed: ['Reviewed', 'bg-emerald-100 text-emerald-900'],
    snoozed: ['Snoozed', 'bg-slate-200 text-slate-700'],
  };
  const [t, c] = map[m.state];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c}`}>{t}</span>;
}

export function MissionRows({ missions, ctx }: { missions: Mission[]; ctx: Ctx }) {
  if (!missions.length) return <p className="text-sm text-slate-500">Nothing here needs a look.</p>;
  return (
    <div>
      {missions.map((m) => (
        <Row key={m.key} onClick={() => ctx.open({ type: 'mission', key: m.key })}>
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-slate-800">{missionTitle(m)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            {stateBadge(m)}
            {m.weight_kd ? <span className="tabular-nums">{kd0(m.weight_kd)}</span> : null}
            {m.state_by && <span>· {m.state_by}</span>}
          </div>
        </Row>
      ))}
    </div>
  );
}

/* ── the panels ──────────────────────────────────────────────────────── */

function CasePanel({ id, ctx }: { id: string; ctx: Ctx }) {
  const shelf = ctx.s.floor.shelves.find((x) => `${x.brand}|${x.ownership}` === id);
  if (!shelf) return <p className="text-sm text-slate-500">This shelf is no longer in stock.</p>;
  const missions = ctx.s.missions.filter((m) => (m.kind === 'reorder' || m.kind === 'clear_dead') && m.params.brand === shelf.brand && shelf.ownership === 'owned');
  return (
    <div>
      <Head title={shelf.brand} sub={OWNERSHIP_LABEL[shelf.ownership]} tone={shelf.ownership} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="At cost" value={kd0(shelf.cost_value)} />
        <Stat label="At retail" value={kd0(shelf.retail_value)} />
        <Stat label="Units" value={num(shelf.units)} sub={plural(shelf.products, 'product')} />
        <Stat label="On order" value={num(shelf.on_order_units)} sub="units on open POs" />
      </div>
      <Section title="How it's selling (stock at cost)">
        <ClassBar shelf={shelf} />
      </Section>
      {shelf.tied_up_cost > 0 && (
        <Section title="Tied up">
          <Note>
            <b>{kd0(shelf.tied_up_cost)}</b> at cost is in stock classed slow or dead. That is capital tied up, not a loss:
            nothing has been written off.
          </Note>
        </Section>
      )}
      {shelf.median_shelf_days_est !== null && (
        <Section title="Time on the shelf">
          <p className="text-sm text-slate-700">
            About <b>{num(shelf.median_shelf_days_est)} days</b> for the typical product.
          </p>
          <p className="mt-1 text-xs text-slate-500">Estimated from purchase-order dates. Lightspeed keeps no verified receiving date.</p>
        </Section>
      )}
      {missions.length > 0 && <Section title="Missions"><MissionRows missions={missions} ctx={ctx} /></Section>}
    </div>
  );
}

function PoPanel({ id, ctx }: { id: string; ctx: Ctx }) {
  const [d, setD] = useState<PoDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // keyed by PO in PanelBody, so each PO starts empty
  useEffect(() => { loadPo(id).then(setD, (e) => setErr(e.message)); }, [id]);
  if (err) return <Note tone="warn">{err}</Note>;
  if (!d) return <Loading />;
  const po = d.po;
  const missions = ctx.s.missions.filter((m) => m.params.po_id === id);
  const ordered = po.ordered_qty ?? 0, received = po.received_qty ?? 0;
  return (
    <div>
      <Head title={po.po_number} sub={[po.supplier, po.brand].filter(Boolean).join(' · ')} />
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-[#22304d] px-2 py-0.5 font-medium text-white">{po.status}</span>
        {po.record_class !== 'active' && <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">{po.record_class === 'merged' ? 'Merged' : 'Cancelled'}: kept out of totals</span>}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{day(po.created_date)} · {po.age_days} days ago</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Cost" value={kd(po.total_cost)} />
        <Stat label="Amount paid" value={po.amount_paid_reliable ? kd(po.amount_paid) : 'Excluded'}
          sub={po.amount_paid_reliable ? po.payment_status ?? undefined : 'unreliable value, see below'} />
        <Stat label="Recorded unpaid" value={kd(po.recorded_unpaid)} sub="as entered, not a verified debt" />
        <Stat label="Received" value={`${num(received)} of ${num(ordered)}`} sub={plural(po.lines ?? d.lines.length, 'line')} />
      </div>
      {po.recorded_unpaid > 0 && (
        <Section title="Unpaid, split by goods">
          <p className="text-sm text-slate-700">
            {kd(po.received_part)} for goods received · {kd(po.goods_not_received)} for goods not yet received
          </p>
          <p className="mt-1 text-xs text-slate-500">{po.split_basis === 'estimate' ? 'Estimate: shared out by line value, because the PO is part received.' : 'Confirmed by the received quantities.'}</p>
        </Section>
      )}
      {d.issues.length > 0 && (
        <Section title="Data issues">
          {d.issues.map((i) => (
            <Note key={i.code} tone="warn"><b>{i.rule}</b> {i.exclusion}</Note>
          ))}
        </Section>
      )}
      {missions.length > 0 && <Section title="Missions"><MissionRows missions={missions} ctx={ctx} /></Section>}
      <Section title={`Lines (${d.lines.length})`}>
        <div className="max-h-64 overflow-y-auto">
          {d.lines.map((l, i) => (
            <div key={l.id} className="flex items-baseline gap-2 border-b border-slate-100 py-1.5 text-xs last:border-0">
              <span className="min-w-0 flex-1 truncate text-slate-700">{l.name ?? l.sku ?? `Line ${i + 1}`}</span>
              <span className="tabular-nums text-slate-500">{num(l.received_qty)}/{num(l.ordered_qty)}</span>
              <span className="whitespace-nowrap text-right tabular-nums text-slate-700">{kd(l.line_cost)}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Receiving log">
        {d.receipt_events.length ? d.receipt_events.map((e, i) => (
          <div key={i} className="border-b border-slate-100 py-1.5 text-xs last:border-0">
            <div className="text-slate-700">{receiptText(e)}</div>
            <div className="text-slate-500">{when(e.at)} · {e.timestamp_basis === 'source' ? "Lightspeed's receiving time" : 'first seen by the daily sync'}</div>
          </div>
        )) : <p className="text-xs text-slate-500">No receiving changes logged since the log started.</p>}
      </Section>
      {d.merged_records.length > 0 && (
        <Section title="Records merged into this PO">
          {d.merged_records.map((r) => (
            <Row key={r.id} onClick={() => ctx.open({ type: 'po', id: r.id })}>
              <span className="font-medium text-slate-800">{r.po_number}</span>
              <span className="ml-2 text-xs text-slate-500">{day(r.created_date)} · {kd(r.total_cost)}</span>
            </Row>
          ))}
        </Section>
      )}
      {d.merged_into && (
        <Section title="Merged into">
          <Row onClick={() => ctx.open({ type: 'po', id: d.merged_into!.id })}>{d.merged_into.po_number}</Row>
        </Section>
      )}
    </div>
  );
}

function receiptText(e: { event: string; old_status: string | null; new_status: string | null; old_received: number | null; new_received: number | null }) {
  switch (e.event) {
    case 'po_source_time_recorded': return "Lightspeed's receiving time recorded";
    case 'po_first_seen_received': return `First seen as ${e.new_status ?? 'received'}, ${num(e.new_received)} received`;
    case 'line_first_seen_received': return `New line, ${num(e.new_received)} received`;
    case 'line_received_changed': return `Line received ${num(e.old_received)} → ${num(e.new_received)}`;
    default:
      return e.old_status !== e.new_status && e.new_status
        ? `${e.old_status ?? '—'} → ${e.new_status}` : `Received ${num(e.old_received)} → ${num(e.new_received)}`;
  }
}

function SupplierPanel({ k, ctx }: { k: string; ctx: Ctx }) {
  const sup = ctx.s.payments.by_supplier.find((x) => x.supplier_key === k);
  if (!sup) return <p className="text-sm text-slate-500">No recorded unpaid balance for this supplier now.</p>;
  const pos = ctx.s.payments.list.filter((p) => p.supplier === sup.supplier);
  return (
    <div>
      <Head title={sup.supplier} sub="Supplier visitor" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Recorded unpaid" value={kd(sup.recorded_unpaid)} sub={plural(sup.pos, 'PO')} />
        <Stat label="Oldest" value={`${num(sup.oldest_days)} days`} sub="since the PO date" />
        <Stat label="Goods received" value={kd(sup.goods_received)} />
        <Stat label="Not yet received" value={kd(sup.goods_not_received)} />
      </div>
      <div className="mt-3 space-y-2">
        <Note>Recorded unpaid balances are cost minus amount paid as entered in Supplier Payments. They are not verified accounting debts.</Note>
        {sup.estimated_portion > 0 && <Note>{kd(sup.estimated_portion)} of the split is an estimate (part-received POs, shared out by line value).</Note>}
        {sup.review_count > 0 && <Note tone="warn">{plural(sup.review_count, 'PO')} older than 45 days: flagged for review, not confirmed overdue.</Note>}
      </div>
      <Section title="POs">
        {pos.map((p) => (
          <Row key={p.po_id} onClick={() => ctx.open({ type: 'po', id: p.po_id })}>
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-slate-800">{p.po_number}</span>
              {p.review && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-900">review</span>}
              <span className="ml-auto tabular-nums text-slate-800">{kd(p.recorded_unpaid)}</span>
            </div>
            <div className="text-xs text-slate-500">{p.status} · {day(p.created_date)} · {p.split_basis === 'estimate' ? 'split estimated' : 'split confirmed'}</div>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function PersonPanel({ name, ctx }: { name: string; ctx: Ctx }) {
  const p = ctx.mall.staff.find((x) => x.name === name);
  if (!p) return null;
  const d = p.duty;
  const duty = d.state === 'on' ? `On duty since ${clockOf(d.clock_in)}` : d.state === 'unclosed' ? `Clocked in ${clockOf(d.clock_in)}, no clock-out yet` : 'Not clocked in today';
  return (
    <div>
      <Head title={p.name} sub={p.name_ar ?? undefined} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Role" value={p.role ?? '—'} />
        <Stat label="Works at" value={p.location ?? '—'} />
      </div>
      <p className="mt-3 text-sm text-slate-700">{duty}</p>
      <p className="mt-3 text-xs text-slate-500">The World shows names, roles and whether the attendance records show someone on duty. Looks are set by an owner in Mall settings.</p>
    </div>
  );
}

const clockOf = (t: string | null) => (t ? new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');

function OwnerPanel({ ctx }: { ctx: Ctx }) {
  return (
    <div>
      <Head title="You" sub="Owner" />
      <p className="mt-3 text-sm text-slate-700">Tap anywhere on a floor to walk there. Tap a case, a box, a visitor or the board to see what is behind it.</p>
      <Section title="The World is open to">
        {ctx.s.people.owners.map((o) => <Row key={o.name}>{o.name}</Row>)}
      </Section>
    </div>
  );
}

function BoardPanel({ ctx }: { ctx: Ctx }) {
  const [kind, setKind] = useState<Mission['kind'] | 'all'>('all');
  const [state, setState] = useState<'todo' | 'snoozed' | 'reviewed'>('todo');
  const list = ctx.s.missions.filter((m) => (kind === 'all' || m.kind === kind) && (
    state === 'todo' ? m.state === 'open' || m.state === 'changed_since_review' : m.state === state));
  const kinds = Array.from(new Set(ctx.s.missions.map((m) => m.kind)));
  const count = (st: typeof state) => ctx.s.missions.filter((m) => (st === 'todo' ? m.state === 'open' || m.state === 'changed_since_review' : m.state === st)).length;
  return (
    <div>
      <Head title="Mission board" sub="Shared by the three owners: who reviewed what, and when" />
      <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-medium">
        {(['todo', 'snoozed', 'reviewed'] as const).map((st) => (
          <button key={st} onClick={() => setState(st)}
            className={`flex-1 rounded-lg px-2 py-1.5 ${state === st ? 'bg-white text-[#22304d] shadow-sm' : 'text-slate-500'}`}>
            {st === 'todo' ? 'To do' : st === 'snoozed' ? 'Snoozed' : 'Reviewed'} ({count(st)})
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {(['all', ...kinds] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${kind === k ? 'border-[#22304d] bg-[#22304d] text-white' : 'border-slate-200 text-slate-600'}`}>
            {k === 'all' ? 'All' : KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="mt-2"><MissionRows missions={list} ctx={ctx} /></div>
    </div>
  );
}

function MissionPanel({ k, ctx }: { k: string; ctx: Ctx }) {
  const m = ctx.s.missions.find((x) => x.key === k);
  const [hist, setHist] = useState<MissionEvent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { missionHistory(k).then(setHist, () => setHist([])); }, [k, m?.history_events]);
  if (!m) return <p className="text-sm text-slate-500">This mission has cleared itself: its condition is gone.</p>;
  const act = async (action: 'reviewed' | 'snoozed' | 'reopened' | 'note', extra: { snoozeUntil?: string; note?: string } = {}) => {
    setBusy(action); setErr(null);
    try {
      await actOnMission({ key: m.key, action, fingerprint: m.fingerprint, ...extra });
      setNote('');
      await ctx.refresh();
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  const inDays = (n: number) => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait' }));
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const p = m.params;
  const target = p.po_id ? { type: 'po' as const, id: String(p.po_id) }
    : m.kind === 'data_issue' && p.ref_type === 'po' ? { type: 'po' as const, id: String(p.ref_id) } : null;
  const shelfId = p.brand ? ctx.s.floor.shelves.find((x) => x.brand === p.brand && x.ownership === 'owned') : null;
  return (
    <div>
      <Head title={missionTitle(m)} sub={KIND_LABEL[m.kind]} />
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        {stateBadge(m)}
        {m.state_by && <span>{m.state === 'snoozed' ? `until ${day(m.snooze_until)} · ` : ''}{m.state_by}, {when(m.state_at)}</span>}
      </div>
      {m.state === 'changed_since_review' && <div className="mt-2"><Note tone="warn">The figures changed after it was reviewed, so it is back on the board.</Note></div>}
      <Section title="What it's about">
        {m.kind === 'reorder' && <p className="text-sm text-slate-700">{plural(p.products, 'product')}, {num(p.units)} units suggested by Ask Mohammed ({num(p.buy)} buy, {num(p.your_call)} your call).</p>}
        {m.kind === 'clear_dead' && <p className="text-sm text-slate-700">{plural(p.products, 'product')}, {num(p.units)} units, {kd0(p.cost_value)} at cost, classed dead. Shelf days are estimated from PO dates.</p>}
        {m.kind === 'supplier_talk' && <p className="text-sm text-slate-700">{num(p.ask_for_more)} to ask for more of, {num(p.ask_to_swap)} to ask to swap (consignment).</p>}
        {m.kind === 'chase_partial' && <p className="text-sm text-slate-700">{num(p.received_qty)} of {num(p.ordered_qty)} received, {num(p.age_days)} days since the PO date.</p>}
        {m.kind === 'approval_waiting' && <p className="text-sm text-slate-700">{kd(p.total_cost)}, waiting {num(p.age_days)} days.</p>}
        {m.kind === 'review_unpaid' && <p className="text-sm text-slate-700">{kd(p.recorded_unpaid)} recorded unpaid, {num(p.age_days)} days since the PO date. For review, not confirmed overdue.</p>}
        {m.kind === 'data_issue' && <p className="text-sm text-slate-700">{String(p.code).replace(/_/g, ' ')} on {p.ref_label}.</p>}
        {Array.isArray(p.top) && p.top.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {p.top.map((t: { product_id: string; name: string; qty?: number; cost_value?: number; action?: string }) => (
              <li key={t.product_id} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="tabular-nums">{t.qty ? `× ${t.qty}` : t.cost_value ? kd0(t.cost_value) : t.action === 'ask_supplier_to_swap' ? 'swap' : t.action === 'ask_supplier_for_more' ? 'more' : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {target && <div className="mt-2"><Row onClick={() => ctx.open(target)}>Open the PO</Row></div>}
        {shelfId && <div className="mt-2"><Row onClick={() => ctx.open({ type: 'case', id: `${shelfId.brand}|owned` })}>Open the {shelfId.brand} shelf</Row></div>}
      </Section>
      <Section title="Act">
        {err && <div className="mb-2"><Note tone="warn">{err}</Note></div>}
        <div className="grid grid-cols-2 gap-2">
          {m.state !== 'reviewed' && (
            <button disabled={!!busy} onClick={() => act('reviewed')} className="flex items-center justify-center gap-1.5 rounded-xl bg-[#22304d] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {busy === 'reviewed' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Mark reviewed
            </button>
          )}
          {(m.state === 'reviewed' || m.state === 'snoozed') && (
            <button disabled={!!busy} onClick={() => act('reopened')} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">
              <Undo2 size={15} /> Reopen
            </button>
          )}
          <button disabled={!!busy} onClick={() => act('snoozed', { snoozeUntil: inDays(7) })} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">
            <MoonStar size={15} /> Snooze 7 days
          </button>
          <button disabled={!!busy} onClick={() => act('snoozed', { snoozeUntil: inDays(30) })} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">
            <Clock size={15} /> Snooze 30 days
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <input id="world-mission-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Add a note for the other owners"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={!!busy || !note.trim()} onClick={() => act('note', { note })} className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-40">
            <StickyNote size={15} /> Add
          </button>
        </div>
      </Section>
      <Section title="History">
        {hist === null ? <Loading /> : hist.length === 0 ? <p className="text-xs text-slate-500">No one has acted on this yet.</p> : hist.map((h, i) => (
          <div key={i} className="border-b border-slate-100 py-1.5 text-xs last:border-0">
            <div className="text-slate-700"><b>{h.by}</b> {h.action === 'note' ? 'noted' : h.action}{h.snooze_until ? ` until ${day(h.snooze_until)}` : ''}</div>
            {h.note && <div className="text-slate-600">“{h.note}”</div>}
            <div className="text-slate-400">{when(h.at)}</div>
          </div>
        ))}
      </Section>
    </div>
  );
}

function IssuesPanel({ ctx }: { ctx: Ctx }) {
  const tone: Record<string, string> = { unreliable: 'bg-red-100 text-red-800', check: 'bg-amber-100 text-amber-900', info: 'bg-slate-100 text-slate-600' };
  return (
    <div>
      <Head title="Data issues" sub="Records left exactly as they are; only unreliable values are kept out of totals" />
      {ctx.s.data_issues.map((d) => (
        <Section key={d.code} title={`${d.code.replace(/_/g, ' ')} · ${plural(d.records, 'record')}`}>
          <div className="mb-1.5 flex items-start gap-2">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone[d.severity]}`}>{d.severity}</span>
            <p className="text-xs text-slate-600"><b>{d.rule}</b> {d.exclusion}</p>
          </div>
          {d.items.slice(0, 12).map((i) => (
            <Row key={i.ref_id} onClick={i.ref_type === 'po' ? () => ctx.open({ type: 'po', id: i.ref_id }) : undefined}>
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-slate-800">{i.ref_label}</span>
                {i.excluded_value && <span className="text-[11px] text-red-700">{i.excluded_value.replace(/_/g, ' ')} excluded</span>}
              </div>
              <div className="truncate text-xs text-slate-500">
                {Object.entries(i.detail).filter(([, v]) => v !== null && v !== '').slice(0, 3).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'number' ? num(v) : String(v)}`).join(' · ')}
              </div>
            </Row>
          ))}
          {d.items.length > 12 && <p className="pt-1 text-xs text-slate-500">and {d.items.length - 12} more</p>}
        </Section>
      ))}
    </div>
  );
}

function DeliveryPanel({ ctx }: { ctx: Ctx }) {
  const r = ctx.s.receipts;
  return (
    <div>
      <Head title="Deliveries" sub={`Receiving log since ${day(ctx.s.meta.receipt_log_started_at)}`} />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Awaiting" value={num(r.awaiting)} sub="POs" />
        <Stat label="Part received" value={num(r.partial.length)} sub="POs" />
        <Stat label="Closed short" value={num(r.closed_short)} sub="POs" />
      </div>
      <Section title="Latest receiving">
        {r.log.recent.length ? r.log.recent.map((e, i) => (
          <Row key={i} onClick={() => ctx.open({ type: 'po', id: e.po_id })}>
            <div className="font-medium text-slate-800">{e.po_number} <span className="font-normal text-slate-500">· {receiptText(e)}</span></div>
            <div className="text-xs text-slate-500">{when(e.at)} · {e.timestamp_basis === 'source' ? "Lightspeed's receiving time" : 'first seen by the daily sync'}</div>
          </Row>
        )) : <p className="text-xs text-slate-500">Nothing received since the log started. The van stays parked until a delivery is logged.</p>}
      </Section>
      <Section title="Part received">
        {r.partial.map((p) => (
          <Row key={p.po_id} onClick={() => ctx.open({ type: 'po', id: p.po_id })}>
            <div className="flex items-baseline gap-2"><span className="font-medium text-slate-800">{p.po_number}</span><span className="text-xs text-slate-500">{p.supplier}</span></div>
            <div className="text-xs tabular-nums text-slate-500">{num(p.received_qty)} of {num(p.ordered_qty)} · {p.age_days} days</div>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function MohammedPanel({ ctx }: { ctx: Ctx }) {
  const todo = ctx.s.missions.filter((m) => m.state === 'open' || m.state === 'changed_since_review').slice(0, 6);
  return (
    <div>
      <Head title="Mohammed" sub="Today's missions, biggest first" />
      <div className="mt-2"><MissionRows missions={todo} ctx={ctx} /></div>
      <button onClick={() => ctx.open({ type: 'board' })} className="mt-3 w-full rounded-xl border border-slate-300 py-2 text-sm font-medium text-slate-700">See the whole board</button>
    </div>
  );
}

function SearchPanel({ ctx }: { ctx: Ctx }) {
  const [q, setQ] = useState('');
  const [cls, setCls] = useState<'active' | 'merged' | 'cancelled' | null>(null);
  const [res, setRes] = useState<PoSearch | null>(null);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      searchPos({ query: q, recordClass: cls, limit: 30, offset }).then((r) => { setRes(r); setErr(null); }, (e) => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, cls, offset]);
  return (
    <div>
      <Head title="Find a PO" sub={`All ${num(ctx.s.meta.po.records)} records, merged and cancelled ones included`} />
      <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
        <Search size={16} className="text-slate-400" />
        <input id="world-po-search" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }}
          placeholder="PO number, supplier, brand, SKU…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <div className="mt-2 flex gap-1">
        {([null, 'active', 'merged', 'cancelled'] as const).map((c) => (
          <button key={c ?? 'all'} onClick={() => { setCls(c); setOffset(0); }}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${cls === c ? 'border-[#22304d] bg-[#22304d] text-white' : 'border-slate-200 text-slate-600'}`}>
            {c === null ? 'All' : c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
      {err && <div className="mt-2"><Note tone="warn">{err}</Note></div>}
      {!res ? <Loading /> : (
        <div className="mt-2">
          <p className="mb-1 text-xs text-slate-500">{plural(res.total, 'record')}</p>
          {res.rows.map((r) => (
            <Row key={r.id} onClick={() => ctx.open({ type: 'po', id: r.id })}>
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-slate-800">{r.po_number}</span>
                {r.record_class !== 'active' && <span className="rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-700">{r.record_class}</span>}
                {r.issues.length > 0 && <AlertTriangle size={12} className="text-amber-600" />}
                <span className="ml-auto text-xs tabular-nums text-slate-600">{kd(r.total_cost)}</span>
              </div>
              <div className="truncate text-xs text-slate-500">{[r.supplier, r.brand, r.status, day(r.created_date)].filter(Boolean).join(' · ')}</div>
            </Row>
          ))}
          <div className="mt-2 flex justify-between text-xs">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))} className="rounded-lg px-2 py-1 text-slate-600 disabled:opacity-30">Newer</button>
            <button disabled={offset + 30 >= res.total} onClick={() => setOffset(offset + 30)} className="rounded-lg px-2 py-1 text-slate-600 disabled:opacity-30">Older</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Head({ title, sub, tone }: { title: string; sub?: string; tone?: string }) {
  const chip: Record<string, string> = { owned: '#9b6a43', consignment: '#7a5a96', pre_owned: '#3f8f8a', unknown: '#9aa0a6' };
  return (
    <div className="pr-8">
      <h2 className="text-lg font-semibold leading-tight text-[#22304d]" style={{ textWrap: 'balance' } as React.CSSProperties}>{title}</h2>
      {sub && (
        <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
          {tone && <span className="h-2.5 w-2.5 rounded-full" style={{ background: chip[tone] }} />}
          {sub}
        </div>
      )}
    </div>
  );
}

export function Loading() {
  return <div className="flex items-center gap-2 py-4 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>;
}

export function PanelBody({ view, ctx }: { view: View; ctx: Ctx }) {
  if (isMallView(view)) return <MallPanelBody view={view} ctx={ctx} />;
  switch (view.type) {
    case 'case': return <CasePanel id={view.id} ctx={ctx} />;
    case 'po': return <PoPanel key={view.id} id={view.id} ctx={ctx} />;
    case 'supplier': return <SupplierPanel k={view.key} ctx={ctx} />;
    case 'person': return <PersonPanel name={view.name} ctx={ctx} />;
    case 'board': return <BoardPanel ctx={ctx} />;
    case 'mission': return <MissionPanel k={view.key} ctx={ctx} />;
    case 'issues': return <IssuesPanel ctx={ctx} />;
    case 'delivery': return <DeliveryPanel ctx={ctx} />;
    case 'mohammed': return <MohammedPanel ctx={ctx} />;
    case 'owner': return <OwnerPanel ctx={ctx} />;
    case 'search': return <SearchPanel ctx={ctx} />;
  }
}
