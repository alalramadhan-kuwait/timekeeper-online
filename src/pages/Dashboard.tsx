import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ChevronDown, StickyNote, BellOff, UserRound, CheckCheck, ArrowRight, RotateCcw, Wallet, X } from 'lucide-react';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Card, Badge, Spinner } from '../components/ui';
import { formatKDCompact, formatKD } from '../lib/format';
import { buildAlerts, loadAlertActions, saveAlertAction, Alert, AlertAction } from '../lib/alerts';
import { tierClass, tierLabel } from '../lib/expiry';
import { useAuth } from '../context/AuthContext';

interface Stats {
  salesToday: number;
  salesWeek: number;
  openWaiting: number;
  openPreOrders: number;
  openPOs: number;
  shipmentsPending: number;
  onConsignment: number;
  vipOccasionsMonth: number;
  empDocsExpiring: number;
  companyDocsExpiring: number;
  pendingLeave: number;
  lowStock: number | null; // null = Lightspeed not connected yet
  stockValue: number | null;
  deadStockValue: number | null;
  overdueFollowUps: number;
  lostSalesMonth: number; // KD value this month
}

interface POFinancials {
  totalCost: number;
  totalPaid: number;
  balance: number;
  pendingInvoices: number;
  byStatus: { status: string; count: number; total: number; paid: number }[];
  byBrand: { brand: string; count: number; total: number; paid: number; balance: number }[];
}

function caseTotal(c: any): number {
  // sale_items.amount_kd is already the line total (quantity included) — do not multiply
  if (c.sale_items?.length) return c.sale_items.reduce((s: number, i: any) => s + Number(i.amount_kd), 0);
  return Number(c.amount_kd ?? 0);
}

// ── Alert Action Panel ────────────────────────────────────────────────────────
function AlertActionPanel({ alert, existing, onSave, onClose, onReopen }: {
  alert: Alert;
  existing?: AlertAction;
  onSave: (key: string, patch: Partial<AlertAction>) => Promise<void>;
  onClose: () => void;
  onReopen?: () => void;
}) {
  const [note, setNote] = useState(existing?.note ?? '');
  const [assignedTo, setAssignedTo] = useState(existing?.assigned_to ?? '');
  const [snoozeDate, setSnoozeDate] = useState(existing?.snooze_until ?? '');
  const [saving, setSaving] = useState(false);

  async function act(patch: Partial<AlertAction>) {
    setSaving(true);
    await onSave(alert.key, patch);
    setSaving(false);
    onClose();
  }

  const snooze7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="px-4 pb-4 pt-2 bg-slate-50 border-t border-slate-100 space-y-3">
      {/* Note + assign row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="block text-slate-500 mb-1 font-medium">Note / remark</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Add a note about this alert…"
            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-sm resize-none"
          />
        </label>
        <div className="flex flex-col gap-2">
          <label className="text-xs">
            <span className="block text-slate-500 mb-1 font-medium">Assign to</span>
            <input
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Staff name…"
              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1 font-medium">Snooze until</span>
            <input
              type="date"
              value={snoozeDate}
              onChange={(e) => setSnoozeDate(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
            />
          </label>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => act({ action: 'active', note: note || null, assigned_to: assignedTo || null, snooze_until: null })}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium"
        >
          <StickyNote size={12} /> Save note
        </button>

        <button
          onClick={() => act({ action: 'snoozed', snooze_until: snoozeDate || snooze7, note: note || null, assigned_to: assignedTo || null })}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
        >
          <BellOff size={12} /> {snoozeDate ? 'Snooze until date' : 'Snooze 7 days'}
        </button>

        {assignedTo && (
          <button
            onClick={() => act({ action: 'active', assigned_to: assignedTo, note: note || null })}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-xs"
          >
            <UserRound size={12} /> Assign to {assignedTo}
          </button>
        )}

        <button
          onClick={() => act({ action: 'dismissed', note: note || null, assigned_to: assignedTo || null })}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium"
        >
          <CheckCheck size={12} /> Mark handled
        </button>

        <Link
          to={alert.link}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs ml-auto"
        >
          Go to {alert.module} <ArrowRight size={12} />
        </Link>

        {onReopen && (
          <button onClick={onReopen} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-xs">
            <RotateCcw size={11} /> Reopen
          </button>
        )}

        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5">Cancel</button>
      </div>

      {existing?.assigned_to && (
        <p className="text-xs text-slate-400">Currently assigned to: <b>{existing.assigned_to}</b></p>
      )}
    </div>
  );
}

// ── Alert Row ─────────────────────────────────────────────────────────────────
function AlertRow({ alert, action, expanded, onToggle, onSave }: {
  alert: Alert;
  action?: AlertAction;
  expanded: boolean;
  onToggle: () => void;
  onSave: (key: string, patch: Partial<AlertAction>) => Promise<void>;
}) {
  const isDismissed = action?.action === 'dismissed';

  return (
    <div className={isDismissed ? 'opacity-60' : ''}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${expanded ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
      >
        <Badge className={tierClass[alert.severity]}>{tierLabel[alert.severity]}</Badge>
        <span className="text-sm text-slate-700 flex-1 min-w-0">{alert.message}</span>
        {action?.note && <span title={action.note}><StickyNote size={13} className="text-blue-400 shrink-0" /></span>}
        {action?.assigned_to && <span className="text-xs text-violet-500 shrink-0">{action.assigned_to}</span>}
        {isDismissed && <Badge className="bg-emerald-100 text-emerald-600 border-emerald-200">Handled</Badge>}
        <span className="text-xs text-slate-400 shrink-0">{alert.module}</span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <AlertActionPanel
          alert={alert}
          existing={action}
          onSave={onSave}
          onClose={onToggle}
          onReopen={isDismissed ? () => onSave(alert.key, { action: 'active' }) : undefined}
        />
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { role, profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [poFinancials, setPOFinancials] = useState<POFinancials | null>(null);
  const [poRows, setPORows] = useState<any[]>([]);
  const [poDetail, setPODetail] = useState<{ label: string; rows: any[] } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [actionMap, setActionMap] = useState<Map<string, AlertAction>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHandled, setShowHandled] = useState(false);
  const actionMapRef = useRef(actionMap);
  actionMapRef.current = actionMap;

  async function reloadActions() {
    const map = await loadAlertActions();
    setActionMap(map);
  }

  async function handleSave(key: string, patch: Partial<AlertAction>) {
    await saveAlertAction(key, patch);
    await reloadActions();
    setExpanded(null);
  }

  useEffect(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 6 }), 'yyyy-MM-dd');
    const in60 = format(new Date(Date.now() + 60 * 86400000), 'yyyy-MM-dd');
    const canHR = ['admin', 'manager', 'hr'].includes(role ?? '');

    async function load() {
      const [salesWeekQ, wl, demandPO, pur, ship, con, vip, emp, docs, leave, alertList, actMap, poData] = await Promise.all([
        supabase.from('cases').select('amount_kd, date_logged, sale_items(amount_kd, quantity)').eq('case_type', 'Sale').eq('deleted', false).gte('date_logged', weekStart),
        supabase.from('waiting_list').select('id', { count: 'exact', head: true }).eq('list_type', 'Waiting List').in('status', ['Open', 'Contacted']),
        supabase.from('waiting_list').select('id', { count: 'exact', head: true }).eq('list_type', 'Pre-Order').not('status', 'in', '("Delivered","Cancelled","Converted")'),
        supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).not('status', 'in', '("Received","Cancelled","Returned")'),
        supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).in('status', ['Sent', 'Dispatched', 'Partially received']),
        supabase.from('consignments').select('id', { count: 'exact', head: true }).in('status', ['With consignee', 'Pending payment']),
        supabase.from('customers').select('birthday, occasions'),
        canHR ? supabase.from('employees').select('residency_expiry, work_permit_expiry, status').in('status', ['Active', 'On leave']) : Promise.resolve({ data: [] as any[] }),
        supabase.from('company_documents').select('expiry_date'),
        canHR ? supabase.from('leave_records').select('id', { count: 'exact', head: true }).eq('approval_status', 'Pending') : Promise.resolve({ count: 0 }),
        buildAlerts(role),
        loadAlertActions(),
        supabase.from('purchase_orders').select('po_number, supplier, brand, status, total_cost, amount_paid, invoice_received').not('status', 'in', '("Cancelled","Returned")'),
      ]);
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const [lowStockQ, stockCountQ, stockSummaryQ, overdueFuQ, lostMonthQ] = await Promise.all([
        supabase.from('lightspeed_low_stock').select('product_id', { count: 'exact', head: true }),
        supabase.from('lightspeed_stock').select('product_id', { count: 'exact', head: true }),
        supabase.from('lightspeed_stock_summary').select('*').single(),
        supabase.from('cases').select('id', { count: 'exact', head: true })
          .eq('case_type', 'Follow-up').eq('status', 'Open').eq('deleted', false)
          .lt('promised_callback', todayStr),
        supabase.from('cases').select('amount_kd')
          .eq('case_type', 'Lost Sale').eq('deleted', false).gte('date_logged', monthStart),
      ]);

      const weekCases = (salesWeekQ.data ?? []) as any[];
      const salesWeek = weekCases.reduce((s, c) => s + caseTotal(c), 0);
      const salesToday = weekCases.filter((c) => c.date_logged === todayStr).reduce((s, c) => s + caseTotal(c), 0);

      const thisMonth = format(new Date(), 'MM');
      let vipOccasions = 0;
      for (const c of (vip.data ?? []) as any[]) {
        if (c.birthday && c.birthday.slice(5, 7) === thisMonth) vipOccasions++;
        for (const o of (Array.isArray(c.occasions) ? c.occasions : [])) {
          const m = String(o?.date ?? '').match(/(\d{2})-\d{2}$/);
          if (m && m[1] === thisMonth) vipOccasions++;
        }
      }

      const empDocs = ((emp as any).data ?? []).filter((e: any) =>
        (e.residency_expiry && e.residency_expiry <= in60) || (e.work_permit_expiry && e.work_permit_expiry <= in60)).length;
      const compDocs = ((docs.data ?? []) as any[]).filter((d) => d.expiry_date && d.expiry_date <= in60).length;

      setStats({
        salesToday, salesWeek,
        openWaiting: wl.count ?? 0,
        openPreOrders: demandPO.count ?? 0,
        openPOs: pur.count ?? 0,
        shipmentsPending: ship.count ?? 0,
        onConsignment: con.count ?? 0,
        vipOccasionsMonth: vipOccasions,
        empDocsExpiring: empDocs,
        companyDocsExpiring: compDocs,
        pendingLeave: (leave as any).count ?? 0,
        lowStock: (stockCountQ.count ?? 0) > 0 ? (lowStockQ.count ?? 0) : null,
        stockValue: stockSummaryQ.data ? Number(stockSummaryQ.data.retail_value) : null,
        deadStockValue: stockSummaryQ.data ? Number(stockSummaryQ.data.dead_value) : null,
        overdueFollowUps: overdueFuQ.count ?? 0,
        lostSalesMonth: ((lostMonthQ.data ?? []) as any[]).reduce((s, c) => s + Number(c.amount_kd ?? 0), 0),
      });
      // PO payment summary
      const poRows = (poData.data ?? []) as any[];
      setPORows(poRows);
      const byStatusMap: Record<string, { count: number; total: number; paid: number }> = {};
      let totalCost = 0, totalPaid = 0, pendingInvoices = 0;
      for (const p of poRows) {
        const cost = Number(p.total_cost ?? 0);
        const paid = Number(p.amount_paid ?? 0);
        totalCost += cost;
        totalPaid += paid;
        if (!p.invoice_received) pendingInvoices++;
        const s = p.status ?? 'Unknown';
        if (!byStatusMap[s]) byStatusMap[s] = { count: 0, total: 0, paid: 0 };
        byStatusMap[s].count++;
        byStatusMap[s].total += cost;
        byStatusMap[s].paid += paid;
      }
      const statusOrder = ['Open', 'Sent', 'Dispatched', 'Partially received', 'Received'];
      const byStatus = statusOrder
        .filter((s) => byStatusMap[s])
        .map((s) => ({ status: s, ...byStatusMap[s] }));

      // Outstanding balance grouped by brand
      const byBrandMap: Record<string, { count: number; total: number; paid: number }> = {};
      for (const p of poRows) {
        const b = (p.brand ?? '').trim() || 'No brand';
        if (!byBrandMap[b]) byBrandMap[b] = { count: 0, total: 0, paid: 0 };
        byBrandMap[b].count++;
        byBrandMap[b].total += Number(p.total_cost ?? 0);
        byBrandMap[b].paid += Number(p.amount_paid ?? 0);
      }
      const byBrand = Object.entries(byBrandMap)
        .map(([brand, v]) => ({ brand, ...v, balance: v.total - v.paid }))
        .filter((b) => b.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      setPOFinancials({ totalCost, totalPaid, balance: totalCost - totalPaid, pendingInvoices, byStatus, byBrand });

      setAlerts(alertList);
      setActionMap(actMap);
      setLoading(false);
    }
    load();
  }, [role]);

  if (loading || !stats) return <Spinner />;

  const cards: { title: string; value: string | number; link: string; accent?: string }[] = [
    { title: 'Sales today', value: `${formatKDCompact(stats.salesToday)} KD`, link: '/sales', accent: 'text-emerald-600' },
    { title: 'Sales this week', value: `${formatKDCompact(stats.salesWeek)} KD`, link: '/sales', accent: 'text-emerald-600' },
    { title: 'Overdue follow-ups', value: stats.overdueFollowUps, link: '/follow-ups', accent: stats.overdueFollowUps ? 'text-red-600' : undefined },
    { title: 'Lost sales this month', value: `${formatKDCompact(stats.lostSalesMonth)} KD`, link: '/sales', accent: stats.lostSalesMonth ? 'text-rose-600' : undefined },
    { title: 'Open waiting list', value: stats.openWaiting, link: '/waiting-list' },
    { title: 'Open pre-orders', value: stats.openPreOrders, link: '/waiting-list' },
    { title: 'Open purchase orders', value: stats.openPOs, link: '/purchase-orders' },
    ...(stats.stockValue != null
      ? [{ title: 'Stock value (Lightspeed)', value: `${formatKDCompact(stats.stockValue)} KD`, link: '/stock' }]
      : []),
    ...(stats.deadStockValue != null
      ? [{ title: 'Not-moving stock', value: `${formatKDCompact(stats.deadStockValue)} KD`, link: '/stock', accent: stats.deadStockValue ? 'text-rose-600' : 'text-emerald-600' }]
      : []),
    ...(stats.lowStock != null
      ? [{ title: 'Low stock items', value: stats.lowStock, link: '/stock', accent: stats.lowStock ? 'text-red-600' : undefined }]
      : []),
    { title: 'Shipments pending', value: stats.shipmentsPending, link: '/purchase-orders' },
    { title: 'Out on consignment', value: stats.onConsignment, link: '/consignments' },
    { title: 'VIP occasions this month', value: stats.vipOccasionsMonth, link: '/vip' },
    { title: 'Employee docs ≤ 60d', value: stats.empDocsExpiring, link: '/hr', accent: stats.empDocsExpiring ? 'text-red-600' : undefined },
    { title: 'Company docs ≤ 60d', value: stats.companyDocsExpiring, link: '/company-documents', accent: stats.companyDocsExpiring ? 'text-red-600' : undefined },
    { title: 'Pending leave requests', value: stats.pendingLeave, link: '/leave', accent: stats.pendingLeave ? 'text-amber-600' : undefined },
  ];

  // Separate active from handled (dismissed/snoozed that haven't expired yet)
  const handledAlerts: Alert[] = [];
  // Load all alert keys that have non-active actions for the "handled" section
  // We'll show dismissed ones in the handled section when showHandled is true
  const handledCount = [...actionMap.values()].filter((a) => a.action === 'dismissed').length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back{profile ? `, ${profile.full_name}` : ''} — live operations summary.</p>
        </div>
        <a
          href="https://alalramadhan-kuwait.github.io/watch-store-crm/#/reports"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600"
        >
          <ExternalLink size={15} /> Store Daily Report
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-8">
        {cards.map((c) => (
          <Link key={c.title} to={c.link} className="hover:opacity-80">
            <Card title={c.title} value={c.value} accent={c.accent} />
          </Link>
        ))}
      </div>

      {/* ── PO Payment Summary ──────────────────────────────────────────────── */}
      {poFinancials && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Wallet size={16} className="text-slate-500" />
            <h2 className="text-lg font-bold text-slate-900">PO Payment Summary</h2>
            <Link to="/purchase-orders" className="ml-auto text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all POs <ArrowRight size={12} />
            </Link>
          </div>
          {/* Top totals — each card is clickable */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {[
              {
                label: 'Total PO value', value: `${formatKDCompact(poFinancials.totalCost)} KD`,
                accent: 'text-slate-800', filter: () => poRows,
              },
              {
                label: 'Total paid', value: `${formatKDCompact(poFinancials.totalPaid)} KD`,
                accent: 'text-emerald-600', filter: () => poRows.filter((r) => Number(r.amount_paid ?? 0) > 0),
              },
              {
                label: 'Outstanding balance', value: `${formatKDCompact(poFinancials.balance)} KD`,
                accent: poFinancials.balance > 0 ? 'text-red-600' : 'text-emerald-600',
                filter: () => poRows.filter((r) => Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0) > 0),
              },
              {
                label: 'Invoices pending', value: poFinancials.pendingInvoices,
                accent: poFinancials.pendingInvoices > 0 ? 'text-amber-600' : 'text-slate-400',
                filter: () => poRows.filter((r) => !r.invoice_received),
              },
            ].map((c) => (
              <button
                key={c.label}
                onClick={() => setPODetail({ label: c.label, rows: c.filter() })}
                className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 text-left hover:border-slate-400 hover:shadow-md transition-all"
              >
                <p className="text-xs text-slate-500 mb-0.5">{c.label}</p>
                <p className={`text-xl font-bold ${c.accent}`}>{c.value}</p>
                <p className="text-xs text-slate-400 mt-1">Click to view details</p>
              </button>
            ))}
          </div>
          {/* By status breakdown — rows also clickable */}
          {poFinancials.byStatus.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right hidden sm:table-cell">POs</th>
                    <th className="px-4 py-2.5 text-right">Total value</th>
                    <th className="px-4 py-2.5 text-right hidden sm:table-cell">Paid</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {poFinancials.byStatus.map((row) => (
                    <tr
                      key={row.status}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setPODetail({ label: `Status: ${row.status}`, rows: poRows.filter((r) => r.status === row.status) })}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-700">{row.status}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 hidden sm:table-cell">{row.count}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatKDCompact(row.total)} KD</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 hidden sm:table-cell whitespace-nowrap">{formatKDCompact(row.paid)} KD</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${row.total - row.paid > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {formatKDCompact(row.total - row.paid)} KD
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Outstanding balance by brand — rows clickable */}
          {poFinancials.byBrand.length > 0 && (
            <div className="mt-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Outstanding balance by brand</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                    <th className="px-4 py-2.5">Brand</th>
                    <th className="px-4 py-2.5 text-right hidden sm:table-cell">POs</th>
                    <th className="px-4 py-2.5 text-right">Total value</th>
                    <th className="px-4 py-2.5 text-right hidden sm:table-cell">Paid</th>
                    <th className="px-4 py-2.5 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {poFinancials.byBrand.map((row) => (
                    <tr
                      key={row.brand}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setPODetail({
                        label: `Brand: ${row.brand} — outstanding`,
                        rows: poRows.filter((r) => (((r.brand ?? '').trim() || 'No brand') === row.brand) && Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0) > 0),
                      })}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-700">{row.brand}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 hidden sm:table-cell">{row.count}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatKDCompact(row.total)} KD</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 hidden sm:table-cell whitespace-nowrap">{formatKDCompact(row.paid)} KD</td>
                      <td className="px-4 py-2.5 text-right font-bold text-red-600 whitespace-nowrap">{formatKDCompact(row.balance)} KD</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-800">Total</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 font-medium hidden sm:table-cell">{poFinancials.byBrand.reduce((s, b) => s + b.count, 0)}</td>
                    <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap">{formatKDCompact(poFinancials.byBrand.reduce((s, b) => s + b.total, 0))} KD</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600 font-medium hidden sm:table-cell whitespace-nowrap">{formatKDCompact(poFinancials.byBrand.reduce((s, b) => s + b.paid, 0))} KD</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600 whitespace-nowrap">{formatKDCompact(poFinancials.byBrand.reduce((s, b) => s + b.balance, 0))} KD</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-bold text-slate-900">Alerts & Reminders</h2>
        <Badge className="bg-slate-900 text-white border-slate-900">{alerts.length}</Badge>
        {handledCount > 0 && (
          <button
            onClick={() => setShowHandled((s) => !s)}
            className="text-xs text-slate-400 hover:text-slate-600 ml-auto"
          >
            {showHandled ? 'Hide' : `Show ${handledCount} handled`}
          </button>
        )}
        <p className="text-xs text-slate-400 ml-auto hidden sm:block">Click an alert to take action</p>
      </div>

      {alerts.length === 0 && !showHandled ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-slate-400 text-sm">
          Nothing needs attention right now 🎉
          {handledCount > 0 && (
            <button onClick={() => setShowHandled(true)} className="ml-3 text-slate-500 hover:text-slate-700 underline text-xs">
              Show {handledCount} handled
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {alerts.map((a) => (
            <AlertRow
              key={a.key}
              alert={a}
              action={actionMap.get(a.key)}
              expanded={expanded === a.key}
              onToggle={() => setExpanded((e) => (e === a.key ? null : a.key))}
              onSave={handleSave}
            />
          ))}

          {showHandled && (() => {
            const dismissedKeys = [...actionMap.entries()].filter(([, v]) => v.action === 'dismissed').map(([k]) => k);
            // Find alerts that are dismissed — we need to rebuild them from the action map
            // Since buildAlerts already filtered them, we show a summary instead
            return dismissedKeys.length > 0 ? (
              <div className="px-4 py-3 bg-slate-50">
                <p className="text-xs text-slate-500 font-medium mb-2">Handled alerts ({dismissedKeys.length})</p>
                <div className="space-y-1">
                  {dismissedKeys.map((k) => {
                    const a = actionMap.get(k)!;
                    return (
                      <div key={k} className="flex items-center gap-2 text-xs text-slate-400">
                        <CheckCheck size={12} className="text-emerald-500 shrink-0" />
                        <span className="flex-1">{k.replace(/_/g, ' ')}</span>
                        {a.note && <span className="italic truncate max-w-[200px]">{a.note}</span>}
                        {a.assigned_to && <span className="text-violet-400">{a.assigned_to}</span>}
                        <button
                          onClick={() => handleSave(k, { action: 'active' })}
                          className="flex items-center gap-0.5 text-slate-400 hover:text-slate-600"
                        >
                          <RotateCcw size={11} /> Reopen
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* ── PO Detail Modal ──────────────────────────────────────────────────── */}
      {poDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPODetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">{poDetail.label}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{poDetail.rows.length} purchase order{poDetail.rows.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setPODetail(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="overflow-auto">
              {poDetail.rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-slate-400 text-sm">No purchase orders in this group.</p>
              ) : (<>
                {/* Mobile: stacked cards */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {poDetail.rows.map((r, i) => {
                    const bal = Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0);
                    return (
                      <div key={i} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-slate-800 text-sm truncate">{r.po_number ?? '—'}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 shrink-0">{r.status}</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-2 truncate">{[r.supplier, r.brand].filter(Boolean).join(' · ') || '—'}</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Total <b className="text-slate-800">{formatKD(Number(r.total_cost ?? 0))}</b></span>
                          <span className="text-slate-500">Paid <b className="text-emerald-600">{formatKD(Number(r.amount_paid ?? 0))}</b></span>
                          <span className="text-slate-500">Bal <b className={bal > 0 ? 'text-red-600' : 'text-slate-400'}>{formatKD(bal)}</b></span>
                          {r.invoice_received ? <span className="text-emerald-600">Inv ✓</span> : <span className="text-amber-600">Inv pending</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Desktop: table */}
                <table className="w-full text-sm hidden sm:table">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                      <th className="px-4 py-3">PO #</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">Brand</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poDetail.rows.map((r, i) => {
                      const bal = Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0);
                      return (
                        <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{r.po_number ?? '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600">{r.supplier ?? '—'}</td>
                          <td className="px-4 py-2.5 text-slate-600">{r.brand ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{r.status}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatKD(Number(r.total_cost ?? 0))}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-600 whitespace-nowrap">{formatKD(Number(r.amount_paid ?? 0))}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${bal > 0 ? 'text-red-600' : 'text-slate-400'}`}>{formatKD(bal)}</td>
                          <td className="px-4 py-2.5">{r.invoice_received ? <span className="text-emerald-600">✓</span> : <span className="text-amber-600">Pending</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>)}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0 flex flex-wrap justify-between items-center gap-2">
              <div className="text-xs text-slate-500">
                Total: <span className="font-semibold text-slate-800">{formatKD(poDetail.rows.reduce((s, r) => s + Number(r.total_cost ?? 0), 0))}</span>
                {' · '}Paid: <span className="font-semibold text-emerald-700">{formatKD(poDetail.rows.reduce((s, r) => s + Number(r.amount_paid ?? 0), 0))}</span>
                {' · '}Balance: <span className="font-semibold text-red-600">{formatKD(poDetail.rows.reduce((s, r) => s + Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0), 0))}</span>
              </div>
              <Link to="/purchase-orders" onClick={() => setPODetail(null)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                Open PO page <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
