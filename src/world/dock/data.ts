import { supabase } from '../../lib/supabase';
import { loadExpected, loadPo, loadStatusLog, type OwnerExpected, type StatusChange } from '../api';
import type { PoDetail, ReceiptEvent, Snapshot } from '../types';

/* The Loading Dock's records: every open purchase order and every one with a recorded unpaid
   balance, each with its lines, receipts and payment. Read through the same owner-only
   function the rest of the World uses (world_po_detail), plus two tables the back office's
   Purchase Orders page already reads: the line names (purchase_order_items_view) and the
   payment method (purchase_orders), and the receiving-status changes the PO sync logged
   (world_po_status_log, owners only). Nothing here is written, and nothing is recalculated
   beyond counting and adding up what the records say.

   Lightspeed's status is shown as Lightspeed has it. Payment, receiving and shipment are
   three separate things, each from its own field. A record is never called late: with no
   expected date or shipment on record, an old order is only a prompt to check. */

/* Review prompts, not judgements. Days since the order was created. */
export const REVIEW = { paidPendingDays: 30, partialDays: 60 } as const;

export interface DockLine { sku: string | null; name: string | null; brand: string | null; ordered: number; received: number; cost: number | null }
/* A review point: a short title, one line on what to check, and the full reasoning behind a tap. */
export interface DockFlag { level: 'review' | 'note'; title: string; action: string; detail: string }
/* A receipt on record: Lightspeed's own time ('ls'), or when our sync first saw it ('det'). */
export interface DockReceipt { at: string; basis: 'ls' | 'det'; part: boolean; po: string; poId: string | null; supplier: string | null }
export type PayState = 'paid' | 'part' | 'unpaid';

export interface DockPo {
  id: string; po: string; supplier: string; supplierKey: string; status: string; open: boolean;
  created: string; age: number;
  ordered: number; received: number; outstandingUnits: number; outstanding: number;
  cost: number; paid: number; unpaid: number; pay: PayState; paidOn: string | null; method: string | null; invoice: boolean | null;
  paidUnreliable: boolean; expected: string | null; shipment: string | null;
  /* The owners' own expected date, when one is set; it is the one a delay is judged by. */
  ownerExpected: OwnerExpected | null;
  lines: DockLine[]; history: DockReceipt[]; flags: DockFlag[];
}
export interface DockSupplier { key: string; name: string; pos: DockPo[]; value: number }
/* A rack bay, 2 x 2 cells. One supplier, or two of the smallest sharing it half each. */
export interface DockBay { no: number; x: number; y: number; suppliers: DockSupplier[]; mark: 'review' | 'part' | 'wait' }

export interface DockData {
  asOf: string; logStarted: string | null;
  pos: DockPo[]; open: DockPo[]; suppliers: DockSupplier[]; bays: DockBay[]; rest: DockSupplier[];
  partial: DockPo[]; owed: DockPo[]; ahead: DockPo[]; due: DockPo[]; history: DockReceipt[];
}

export interface DockRaw {
  details: PoDetail[];
  lines: { po_id: string; sku: string | null; name: string | null; brand: string | null; ordered_qty: number | null; received_qty: number | null; cost: number | null }[] | null;
  methods: Record<string, string | null>;
  statusLog: StatusChange[];
  expected: Record<string, OwnerExpected>;
}

/* ── the plan: four rows of four bays ─────────────────────────────────── */

export const DOCK_ROWS = 4;
const COLS = [0, 3, 6, 9];
export const DOCK_PLAN = (() => {
  const W = 11, MAIN = DOCK_ROWS * 4 - 2, SOUTH = MAIN + 2, DEPTH = SOUTH + 5;
  return { W, MAIN, SOUTH, DEPTH, bay: (i: number) => ({ x: COLS[i % 4], y: (DOCK_ROWS - 1 - Math.floor(i / 4)) * 4 }) };
})();

/* ── loading ──────────────────────────────────────────────────────────── */

export async function loadDock(s: Snapshot): Promise<DockRaw> {
  const ids = [...new Set([...s.commitments.list.map((p) => p.po_id), ...s.payments.list.map((p) => p.po_id)])];
  const expected = loadExpected().catch(() => ({} as Record<string, OwnerExpected>));
  if (!ids.length) return { details: [], lines: [], methods: {}, statusLog: await loadStatusLog().catch(() => []), expected: await expected };
  const [details, lines, methods, statusLog, owners] = await Promise.all([
    Promise.all(ids.map((id) => loadPo(id))),
    // the names come from the same view the Purchase Orders page uses; without it the lines still show
    supabase.from('purchase_order_items_view').select('po_id, sku, name, brand, ordered_qty, received_qty, cost').in('po_id', ids)
      .then(({ data, error }) => (error ? null : (data as DockRaw['lines']))),
    supabase.from('purchase_orders').select('id, payment_method').in('id', ids)
      .then(({ data, error }) => Object.fromEntries(error ? [] : ((data ?? []) as { id: string; payment_method: string | null }[]).map((r) => [r.id, r.payment_method]))),
    // without the log the history keeps Lightspeed's times and the receiving log's
    loadStatusLog().catch(() => [] as StatusChange[]),
    // without the owners' dates the order keeps Lightspeed's due date
    expected,
  ]);
  return { details, lines, methods, statusLog, expected: owners };
}

/* ── words ───────────────────────────────────────────────────────────── */

const n = (v: unknown) => Number(v ?? 0) || 0;
export const kdW = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} KD`;
export const shortName = (s: string | null | undefined) => String(s ?? '').replace(/[\s,]+$/, '');
export const kwDate = (iso: string | null | undefined, withTime = true, now = new Date()) => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00+03:00` : iso);
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Kuwait', day: 'numeric', month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    ...(withTime && iso.length > 10 ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  });
};
/* The date a delay is judged by: the owners' own when they set one, otherwise Lightspeed's due
   date. `by` is empty for Lightspeed's. */
export const expectedOf = (p: Pick<DockPo, 'expected' | 'ownerExpected'>): { on: string; by: string } | null =>
  p.ownerExpected ? { on: p.ownerExpected.on, by: p.ownerExpected.by } : p.expected ? { on: p.expected, by: '' } : null;

const humanCode = (code: string) => code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function flagsOf(p: DockPo, issues: PoDetail['issues'], today: Date): DockFlag[] {
  const f: DockFlag[] = [];
  const since = (d: string) => Math.floor((today.getTime() - new Date(`${d}T00:00:00+03:00`).getTime()) / 864e5);
  if (p.open && p.status === 'Pending Approval' && p.paid > 0) {
    if (p.age > REVIEW.paidPendingDays) f.push({ level: 'review', title: 'Paid, still Pending Approval', action: `Paid, ${p.age} days old. Check it was sent.`, detail: `Created ${p.age} days ago and paid (${kdW(p.paid)}), but Lightspeed still shows it as Pending Approval. Worth checking it was sent.` });
    else f.push({ level: 'note', title: 'Paid before it was sent', action: 'Status kept as Lightspeed has it.', detail: 'The status is kept as Lightspeed has it; the payment is shown separately.' });
  }
  const due = expectedOf(p);
  if (due && p.received < p.ordered && since(due.on) > 0) {
    const whose = due.by ? ` (set by ${due.by})` : ' (Lightspeed’s due date)';
    f.push({ level: 'review', title: 'Expected date passed', action: `Due ${kwDate(due.on, false, today)} · ${(p.ordered - p.received).toLocaleString('en-US')} pcs not in. Ask the supplier.`, detail: `Expected ${kwDate(due.on, false, today)}${whose}, ${since(due.on)} days ago; ${(p.ordered - p.received).toLocaleString('en-US')} pcs not yet received.` });
  }
  if (p.open && p.received > 0 && p.received < p.ordered && p.age > REVIEW.partialDays) {
    const left = `${(p.ordered - p.received).toLocaleString('en-US')} of ${p.ordered.toLocaleString('en-US')} pcs not received, ${p.age} days after the order.`;
    f.push({ level: 'review', title: 'Part still open', action: `${(p.ordered - p.received).toLocaleString('en-US')} pcs open after ${p.age} days. Chase the rest.`, detail: due ? left : `${left} No arrival date is recorded, so this is a prompt to check, not a delay.` });
  }
  if (p.lines.some((l) => !l.sku && !l.name)) f.push({ level: 'review', title: 'Line without product', action: 'Add its SKU in Lightspeed.', detail: 'One line has a quantity and cost but no SKU or name.' });
  if (/^others?$/i.test(shortName(p.supplier))) f.push({ level: 'note', title: 'Supplier “Others”', action: 'Name the supplier in Lightspeed.', detail: 'The real supplier is not named on this order.' });
  if (p.paidUnreliable) f.push({ level: 'review', title: 'Amount paid looks wrong', action: 'Check the payment entry.', detail: 'Excluded from totals (paid far above cost).' });
  for (const i of issues) f.push({ level: i.severity === 'info' ? 'note' : 'review', title: humanCode(i.code), action: i.severity === 'info' ? 'For information.' : 'Check the record.', detail: i.rule });
  return f;
}

/* ── the model ───────────────────────────────────────────────────────── */

export function buildDock(s: Snapshot, raw: DockRaw): DockData {
  const asOf = s.meta.generated_at, today = new Date(asOf);
  const viewLines = new Map<string, DockLine[]>();
  for (const l of raw.lines ?? []) {
    const arr = viewLines.get(l.po_id) ?? [];
    arr.push({ sku: l.sku, name: l.name, brand: l.brand, ordered: n(l.ordered_qty), received: n(l.received_qty), cost: l.cost });
    viewLines.set(l.po_id, arr);
  }
  const pos: DockPo[] = raw.details.map((d) => {
    const r = d.po;
    const lines = viewLines.get(r.id) ?? d.lines.map((l) => ({ sku: l.sku, name: l.name, brand: l.brand, ordered: n(l.ordered_qty), received: n(l.received_qty), cost: l.cost }));
    lines.sort((a, b) => (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
    const ps = String(r.payment_status ?? '');
    const p: DockPo = {
      id: r.id, po: r.po_number, supplier: r.supplier ?? '—', supplierKey: r.supplier_key ?? r.supplier ?? r.id, status: r.status,
      open: !!r.open_commitment, created: r.created_date, age: n(r.age_days),
      ordered: n(r.ordered_qty), received: n(r.received_qty), outstandingUnits: n(r.outstanding_units), outstanding: n(r.outstanding_value),
      cost: n(r.total_cost), paid: n(r.amount_paid), unpaid: n(r.recorded_unpaid),
      pay: ps === 'Paid' ? 'paid' : ps === 'Partial' ? 'part' : 'unpaid',
      paidOn: r.payment_date ?? null, method: raw.methods[r.id] ?? null, invoice: r.invoice_received ?? null,
      paidUnreliable: !!r.paid_unreliable, expected: r.expected_arrival ?? null, shipment: r.shipment_status ?? null,
      ownerExpected: raw.expected?.[r.id] ?? null,
      lines, history: [], flags: [],
    };
    // receipts on record: Lightspeed's receiving time, and what the receiving log first saw
    const seen = new Set<string>();
    const add = (h: DockReceipt) => { const k = `${h.basis}|${h.at}`; if (!seen.has(k)) { seen.add(k); p.history.push(h); } };
    if (r.ls_received_at) add({ at: r.ls_received_at, basis: 'ls', part: p.received < p.ordered, po: p.po, poId: p.id, supplier: p.supplier });
    for (const c of raw.statusLog) {
      if (c.po_id !== r.id) continue;
      add({ at: c.at, basis: 'det', part: c.status === 'Partially Received', po: p.po, poId: p.id, supplier: p.supplier });
    }
    for (const e of d.receipt_events) {
      if (e.line_id || e.event === 'po_source_time_recorded') continue;
      add({ at: e.at, basis: e.timestamp_basis === 'source' ? 'ls' : 'det', part: e.new_status === 'Partially Received', po: p.po, poId: p.id, supplier: p.supplier });
    }
    p.history.sort((a, b) => b.at.localeCompare(a.at));
    p.flags = flagsOf(p, d.issues, today);
    return p;
  });

  const open = pos.filter((p) => p.open);
  const bySup = new Map<string, DockSupplier>();
  for (const p of open) {
    const sp = bySup.get(p.supplierKey) ?? { key: p.supplierKey, name: p.supplier, pos: [], value: 0 };
    sp.pos.push(p); sp.value += p.outstanding;
    bySup.set(p.supplierKey, sp);
  }
  const suppliers = [...bySup.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  suppliers.forEach((sp) => sp.pos.sort((a, b) => b.outstanding - a.outstanding));

  // sixteen bays; past that the smallest suppliers pair up, two to a bay, each keeping its own half
  const cap = DOCK_ROWS * 4, over = Math.max(0, suppliers.length - cap), pairs = Math.min(over, cap);
  const single = suppliers.slice(0, suppliers.length - 2 * pairs), shared = suppliers.slice(suppliers.length - 2 * pairs);
  const units = [...single.map((sp) => [sp]), ...Array.from({ length: pairs }, (_, k) => shared.slice(2 * k, 2 * k + 2))].slice(0, cap);
  const bays: DockBay[] = units.map((u, i) => ({ no: i + 1, ...DOCK_PLAN.bay(i), suppliers: u, mark: markOf(u.flatMap((sp) => sp.pos)) }));
  const rest = suppliers.slice(units.flat().length);

  const history = pos.flatMap((p) => p.history);
  const known = new Set(history.map((h) => `${h.po}|${h.at}`));
  // status changes the sync logged on orders that are neither open nor unpaid any more
  for (const c of raw.statusLog) {
    if (known.has(`${c.po_number}|${c.at}`)) continue;
    known.add(`${c.po_number}|${c.at}`);
    history.push({ at: c.at, basis: 'det', part: c.status === 'Partially Received', po: c.po_number, poId: c.po_id, supplier: c.supplier });
  }
  // receipts the log saw on orders that are neither open nor unpaid any more
  for (const e of s.receipts.log.recent as ReceiptEvent[]) {
    if (!e.po_number || e.event === 'po_source_time_recorded' || e.event.startsWith('line_') || known.has(`${e.po_number}|${e.at}`)) continue;
    known.add(`${e.po_number}|${e.at}`);
    history.push({ at: e.at, basis: e.timestamp_basis === 'source' ? 'ls' : 'det', part: e.new_status === 'Partially Received', po: e.po_number, poId: e.po_id, supplier: null });
  }
  history.sort((a, b) => b.at.localeCompare(a.at));

  return {
    asOf, logStarted: s.meta.receipt_log_started_at,
    pos, open, suppliers, bays, rest,
    partial: open.filter((p) => p.received > 0 && p.received < p.ordered).sort((a, b) => b.outstanding - a.outstanding),
    owed: pos.filter((p) => p.unpaid > 0 && p.received > 0).sort((a, b) => b.unpaid - a.unpaid),
    ahead: open.filter((p) => p.paid > 0 && p.received === 0).sort((a, b) => b.paid - a.paid),
    due: pos.filter((p) => p.unpaid > 0 && p.received === 0).sort((a, b) => b.unpaid - a.unpaid),
    history,
  };
}

export const hasReview = (p: DockPo) => p.flags.some((f) => f.level === 'review');
export function markOf(pos: DockPo[]): DockBay['mark'] {
  if (pos.some(hasReview)) return 'review';
  if (pos.some((p) => p.received > 0 && p.received < p.ordered)) return 'part';
  return 'wait';
}
export const sumOf = (arr: DockPo[], k: 'outstanding' | 'unpaid' | 'paid') => arr.reduce((t, p) => t + p[k], 0);
export const bayOf = (d: DockData, supplierKey: string) => d.bays.find((b) => b.suppliers.some((sp) => sp.key === supplierKey)) ?? null;
