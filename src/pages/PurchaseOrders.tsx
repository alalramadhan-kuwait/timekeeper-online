import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Link2, X } from 'lucide-react';
import { CrudModule, CrudConfig } from '../components/CrudModule';
import { Badge, Spinner } from '../components/ui';
import { formatKD } from '../lib/format';
import { expiryTier, tierClass, tierLabel } from '../lib/expiry';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const purchasingRoles = (r: string | null) => ['admin', 'manager', 'operations'].includes(r ?? '');

/**
 * Lightspeed is the source of truth for purchase orders — they are created there and
 * mirrored here by the `lightspeed-po-sync` edge function. This page owns only the
 * money and coordination side: payments, invoices, project links and notes.
 */
const PO_STATUSES = ['Pending Approval', 'Ordered', 'Partially Received', 'Fully Received', 'Cancelled'];
const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'];
const PAYMENT_METHODS = ['Bank transfer', 'Cheque', 'Cash', 'Credit card', 'LC / Letter of credit'];

const kd = (v: number | null | undefined) => (v == null ? '—' : `${formatKD(Number(v))} KD`);
const balanceOf = (r: Record<string, any>) => Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0);

function ExpiryCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const tier = expiryTier(date);
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span>{date}</span>
      {tier !== 'ok' && <Badge className={tierClass[tier]}>{tierLabel[tier]}</Badge>}
    </span>
  );
}

/** A PO is finished when it's settled in Lightspeed and nothing is still owed. */
const poIsCompleted = (r: Record<string, any>) =>
  ['Fully Received', 'Cancelled'].includes(r.status) && balanceOf(r) <= 0;

const isSynced = (r: Record<string, any>) => r.source === 'lightspeed';

/* ---------------- Line items (read-only, from Lightspeed) ---------------- */

interface LineItem {
  id: string; name: string | null; sku: string | null; brand: string | null;
  ordered_qty: number | null; received_qty: number | null; cost: number | null;
}

function LineItems({ poId }: { poId: string }) {
  const [rows, setRows] = useState<LineItem[] | null>(null);

  useEffect(() => {
    supabase.from('purchase_order_items_view')
      .select('id, name, sku, brand, ordered_qty, received_qty, cost')
      .eq('po_id', poId)
      .then(({ data }) => setRows((data as LineItem[]) ?? []));
  }, [poId]);

  if (rows === null) return <div className="py-4"><Spinner /></div>;
  if (!rows.length) {
    return (
      <p className="text-sm text-slate-400 border-t border-slate-200 pt-3">
        No line items synced yet — historical POs are backfilled from Lightspeed a batch at a time.
      </p>
    );
  }

  return (
    <div className="border-t border-slate-200 pt-3">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Line items ({rows.length})</h3>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Product</th>
              <th className="text-left px-3 py-2">Brand</th>
              <th className="text-right px-3 py-2">Ordered</th>
              <th className="text-right px-3 py-2">Received</th>
              <th className="text-right px-3 py-2">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((i) => {
              const short = Number(i.received_qty ?? 0) < Number(i.ordered_qty ?? 0);
              return (
                <tr key={i.id}>
                  <td className="px-3 py-2">
                    {i.name ?? <span className="text-slate-400">Unknown product</span>}
                    {i.sku && <span className="block text-xs text-slate-400">{i.sku}</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{i.brand ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{i.ordered_qty ?? '—'}</td>
                  <td className={`px-3 py-2 text-right ${short ? 'text-amber-600 font-medium' : ''}`}>{i.received_qty ?? '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{kd(i.cost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Legacy match review ---------------- */

interface LegacyMatch {
  id: string; po_number: string; supplier: string | null; total_cost: number | null;
  created_date: string; amount_paid: number | null; payment_status: string | null;
  payment_date: string | null; payment_method: string | null;
  invoice_received: boolean | null; team_notified: boolean | null;
  notes: string | null; linked_project: string | null;
  candidate: {
    id: string; po_number: string; supplier: string | null;
    total_cost: number | null; created_date: string; status: string;
  } | null;
}

/**
 * Rows hand-entered before the Lightspeed sync existed. The sync auto-merges only on an
 * exact PO-number match; everything else lands here for a person to confirm, because a
 * wrong merge would move payment history onto the wrong order.
 */
function LegacyMatches({ onLinked }: { onLinked: () => void }) {
  const [rows, setRows] = useState<LegacyMatch[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('purchase_orders')
      .select('id, po_number, supplier, total_cost, created_date, amount_paid, payment_status, payment_date, payment_method, invoice_received, team_notified, notes, linked_project, candidate:match_candidate_id (id, po_number, supplier, total_cost, created_date, status)')
      .eq('source', 'manual').is('merged_into', null).not('match_candidate_id', 'is', null);
    setRows((data as unknown as LegacyMatch[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function link(r: LegacyMatch) {
    if (!r.candidate) return;
    setBusy(r.id);
    // carry the payment history onto the synced PO, then fold the legacy row away —
    // nothing is deleted, so clearing merged_into undoes it
    await supabase.from('purchase_orders').update({
      amount_paid: r.amount_paid, payment_status: r.payment_status, payment_date: r.payment_date,
      payment_method: r.payment_method, invoice_received: r.invoice_received,
      team_notified: r.team_notified, notes: r.notes, linked_project: r.linked_project,
    }).eq('id', r.candidate.id);
    await supabase.from('purchase_orders').update({ merged_into: r.candidate.id }).eq('id', r.id);
    setBusy(null);
    await load();
    onLinked();
  }

  async function reject(r: LegacyMatch) {
    setBusy(r.id);
    await supabase.from('purchase_orders').update({ match_candidate_id: null }).eq('id', r.id);
    setBusy(null);
    await load();
  }

  if (!rows?.length) return null;

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
      <h2 className="font-semibold text-slate-900">Review legacy matches ({rows.length})</h2>
      <p className="text-sm text-slate-600 mb-3">
        These POs were entered by hand before the Lightspeed sync. Each looks like it might be the
        same order as a synced PO — confirm and the payment history moves across.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-4">
            <div className="text-sm min-w-[14rem]">
              <span className="text-xs text-slate-400 block">Entered by hand</span>
              <strong>{r.po_number}</strong> · {r.supplier ?? '—'} · {kd(r.total_cost)}
              <span className="block text-xs text-slate-500">{r.created_date} · paid {kd(r.amount_paid)}</span>
            </div>
            <span className="text-slate-300">→</span>
            <div className="text-sm min-w-[14rem]">
              <span className="text-xs text-slate-400 block">Synced from Lightspeed</span>
              <strong>{r.candidate?.po_number}</strong> · {r.candidate?.supplier ?? '—'} · {kd(r.candidate?.total_cost)}
              <span className="block text-xs text-slate-500">{r.candidate?.created_date} · {r.candidate?.status}</span>
            </div>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => link(r)} disabled={busy === r.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-60"
              >
                <Link2 size={14} /> Same order
              </button>
              <button
                onClick={() => reject(r)} disabled={busy === r.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm disabled:opacity-60"
              >
                <X size={14} /> Not a match
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */

const baseConfig: CrudConfig = {
  table: 'purchase_orders',
  title: 'Supplier Payments & PO Tracking',
  description: 'Purchase orders synced from Lightspeed. Create and receive POs in Lightspeed — this page tracks payments, balances and project links.',
  canWrite: purchasingRoles,
  statusField: 'status',
  statusOptions: PO_STATUSES,
  searchKeys: ['po_number', 'supplier_invoice_no', 'supplier', 'brand', 'notes'],
  allowCreate: false,
  allowDelete: (r) => !isSynced(r),
  rowClickToEdit: true,
  extraFilters: [
    { key: 'supplier', label: 'Supplier' },
    { key: 'brand', label: 'Brand' },
    { key: 'outlet', label: 'Outlet' },
    { key: 'payment_status', label: 'Payment', options: PAYMENT_STATUSES },
    { key: 'po_type', label: 'Type', options: ['PO', 'Inbound'] },
    { key: 'linked_project', label: 'Project' },
  ],
  fields: [
    // ── owned by Lightspeed ──
    { key: 'po_number', label: 'Order number', type: 'text', readOnly: true, hint: 'The Lightspeed order reference' },
    { key: 'supplier_invoice_no', label: 'Supplier invoice #', type: 'text', readOnly: true },
    { key: 'supplier', label: 'Supplier', type: 'text', readOnly: true },
    { key: 'outlet', label: 'Outlet', type: 'text', readOnly: true },
    { key: 'created_date', label: 'Created date', type: 'date', readOnly: true },
    { key: 'expected_arrival', label: 'Expected arrival', type: 'date', readOnly: true },
    { key: 'status', label: 'Status', type: 'text', readOnly: true, hint: 'Follows the Lightspeed consignment' },
    { key: 'item_count', label: 'Line items', type: 'number', readOnly: true },
    { key: 'ordered_qty', label: 'Qty ordered', type: 'number', readOnly: true },
    { key: 'received_qty', label: 'Qty received', type: 'number', readOnly: true },
    { key: 'total_cost', label: 'Total cost (KD)', type: 'number', readOnly: true },
    // ── owned by Timekeeper ──
    { key: 'payment_status', label: 'Payment status', type: 'select', options: PAYMENT_STATUSES, defaultValue: 'Unpaid' },
    { key: 'amount_paid', label: 'Amount paid (KD)', type: 'number', defaultValue: 0 },
    { key: 'payment_date', label: 'Payment date', type: 'date' },
    { key: 'payment_method', label: 'Payment method', type: 'select', options: PAYMENT_METHODS },
    { key: 'brand', label: 'Brand', type: 'combobox', hint: 'Used to group this page and the dashboard' },
    { key: 'shipment_status', label: 'Shipment status', type: 'text', placeholder: 'e.g. At customs / DHL in transit' },
    { key: 'invoice_received', label: 'Invoice received', type: 'checkbox' },
    { key: 'team_notified', label: 'Team notified', type: 'checkbox' },
    { key: 'linked_project', label: 'Limited project', type: 'select', options: [] }, // filled at runtime
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'po_number', label: 'Order #', sortable: true, render: (r) => (
      <span className="flex items-center gap-2 whitespace-nowrap">
        {r.po_number}
        {!isSynced(r) && <Badge className="bg-slate-100 text-slate-500 border-slate-200">legacy</Badge>}
      </span>
    ) },
    { key: 'supplier_invoice_no', label: 'Invoice #', sortable: true, hideBelow: 'xl' },
    { key: 'supplier', label: 'Supplier', sortable: true },
    { key: 'brand', label: 'Brand', sortable: true, hideBelow: 'md' },
    { key: 'outlet', label: 'Outlet', sortable: true, hideBelow: 'lg' },
    { key: 'received_qty', label: 'Received', sortable: true, hideBelow: 'lg',
      sortValue: (r) => Number(r.received_qty ?? 0),
      render: (r) => r.ordered_qty == null
        ? <span className="text-slate-300">—</span>
        : <span className={Number(r.received_qty ?? 0) < Number(r.ordered_qty) ? 'text-amber-600' : ''}>
            {Number(r.received_qty ?? 0)} / {r.ordered_qty}
          </span> },
    { key: 'total_cost', label: 'Total', sortable: true, render: (r) => <span className="whitespace-nowrap">{kd(r.total_cost)}</span> },
    { key: 'amount_paid', label: 'Paid', sortable: true, hideBelow: 'md', render: (r) => <span className="whitespace-nowrap">{kd(r.amount_paid)}</span> },
    { key: 'balance', label: 'Balance', sortable: true,
      sortValue: balanceOf,
      render: (r) => {
        const b = balanceOf(r);
        return <span className={`whitespace-nowrap ${b > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>{kd(b)}</span>;
      } },
    { key: 'payment_status', label: 'Payment', sortable: true, render: (r) => {
      const s = r.payment_status ?? 'Unpaid';
      const cls = s === 'Paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : s === 'Partial' ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-rose-100 text-rose-700 border-rose-200';
      return <Badge className={cls}>{s}</Badge>;
    } },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'expected_arrival', label: 'Expected', sortable: true, hideBelow: 'lg', render: (r) => <ExpiryCell date={r.expected_arrival} /> },
    { key: 'linked_project', label: 'Project', sortable: true, hideBelow: 'xl', render: (r) => r.linked_project
      ? <Badge className="bg-violet-100 text-violet-700 border-violet-200">{r.linked_project}</Badge>
      : <span className="text-slate-300 text-xs">—</span> },
  ],
};

export function PurchaseOrdersPage() {
  const { role } = useAuth();
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadSyncTime = useCallback(() => {
    supabase.from('purchase_orders').select('ls_synced_at')
      .not('ls_synced_at', 'is', null)
      .order('ls_synced_at', { ascending: false }).limit(1)
      .then(({ data }) => setLastSync(data?.[0]?.ls_synced_at ?? null));
  }, []);

  useEffect(() => {
    supabase.from('limited_projects').select('project_name').order('project_name')
      .then(({ data }) => setProjectNames((data ?? []).map((p: any) => p.project_name).filter(Boolean)));
    loadSyncTime();
  }, [loadSyncTime]);

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    const { data, error } = await supabase.functions.invoke('lightspeed-po-sync', { body: {} });
    if (error) {
      // invoke() reports a generic wrapper message — the real reason is in the response body
      let detail = error.message;
      try { detail = (await (error as any).context?.clone().json())?.error ?? detail; } catch { /* keep wrapper message */ }
      setSyncMsg(`Sync failed: ${detail}`);
    } else {
      const remaining = Number(data?.backfill_remaining ?? 0);
      setSyncMsg(
        `Synced ${data?.purchase_orders ?? 0} POs` +
        (remaining ? ` · ${remaining} older POs still backfilling` : ''),
      );
      setReloadKey((k) => k + 1);
      loadSyncTime();
    }
    setSyncing(false);
  }

  const withRuntime = useMemo<CrudConfig>(() => ({
    ...baseConfig,
    fields: baseConfig.fields.map((f) =>
      f.key === 'linked_project' ? { ...f, options: projectNames } : f),
    formExtra: (row) => (row?.id && isSynced(row) ? <LineItems poId={row.id} /> : null),
  }), [projectNames]);

  const activeConfig = useMemo<CrudConfig>(() => ({
    ...withRuntime,
    groupBy: 'brand',
    filter: (r) => !r.merged_into && !poIsCompleted(r),
  }), [withRuntime]);

  const completedConfig = useMemo<CrudConfig>(() => ({
    ...withRuntime,
    title: 'Completed POs',
    description: 'Fully received or cancelled and nothing owed — kept here for reference.',
    groupBy: 'brand',
    filter: (r) => !r.merged_into && poIsCompleted(r),
  }), [withRuntime]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-sm">
          <strong className="text-slate-800">Lightspeed is the source of truth for POs.</strong>
          <span className="text-slate-600"> Create, send and receive them there — this page mirrors them and tracks the money side.</span>
          <span className="block text-xs text-slate-500 mt-0.5">
            Last sync: {lastSync ? new Date(lastSync).toLocaleString('en-GB', { timeZone: 'Asia/Kuwait' }) : 'never'}
          </span>
        </div>
        {purchasingRoles(role) && (
          <div className="flex items-center gap-3">
            {syncMsg && <span className="text-xs text-slate-500 max-w-xs">{syncMsg}</span>}
            <button
              onClick={syncNow} disabled={syncing}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-60"
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync POs now'}
            </button>
          </div>
        )}
      </div>

      {purchasingRoles(role) && <LegacyMatches onLinked={() => setReloadKey((k) => k + 1)} />}

      <CrudModule key={`active-${reloadKey}`} config={activeConfig} />

      <div>
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium mb-2"
        >
          {showCompleted ? '▾' : '▸'} Completed POs (received & fully paid)
        </button>
        {showCompleted && <CrudModule key={`done-${reloadKey}`} config={completedConfig} />}
      </div>
    </div>
  );
}
