import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink, ChevronDown, StickyNote, BellOff, UserRound, CheckCheck, ArrowRight, RotateCcw, Bell,
} from 'lucide-react';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Badge, Spinner } from '../components/ui';
import { formatKDCompact } from '../lib/format';
import { buildAlerts, loadAlertActions, saveAlertAction, Alert, AlertAction } from '../lib/alerts';
import { tierClass, tierLabel } from '../lib/expiry';
import { useAuth } from '../context/AuthContext';
import { canAccessPath } from '../components/Layout';

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="block text-slate-500 mb-1 font-medium">Note / remark</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note about this alert…"
            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-sm resize-none" />
        </label>
        <div className="flex flex-col gap-2">
          <label className="text-xs">
            <span className="block text-slate-500 mb-1 font-medium">Assign to (owner)</span>
            <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Staff name…"
              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1 font-medium">Due date</span>
            <input type="date" value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-sm" />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => act({ action: 'active', note: note || null, assigned_to: assignedTo || null, snooze_until: snoozeDate || null })} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium"><StickyNote size={12} /> Save</button>
        <button onClick={() => act({ action: 'snoozed', snooze_until: snoozeDate || snooze7, note: note || null, assigned_to: assignedTo || null })} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"><BellOff size={12} /> {snoozeDate ? 'Snooze to date' : 'Snooze 7 days'}</button>
        {assignedTo && (
          <button onClick={() => act({ action: 'active', assigned_to: assignedTo, note: note || null })} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-xs"><UserRound size={12} /> Assign to {assignedTo}</button>
        )}
        <button onClick={() => act({ action: 'dismissed', note: note || null, assigned_to: assignedTo || null })} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium"><CheckCheck size={12} /> Mark done</button>
        <Link to={alert.link} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs ml-auto">Go to {alert.module} <ArrowRight size={12} /></Link>
        {onReopen && <button onClick={onReopen} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-xs"><RotateCcw size={11} /> Reopen</button>}
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5">Cancel</button>
      </div>
      {existing?.assigned_to && <p className="text-xs text-slate-400">Owner: <b>{existing.assigned_to}</b>{existing.snooze_until ? ` · due ${existing.snooze_until}` : ''}</p>}
    </div>
  );
}

// ── Alert Row ─────────────────────────────────────────────────────────────────
function AlertRow({ alert, action, expanded, onToggle, onSave }: {
  alert: Alert; action?: AlertAction; expanded: boolean; onToggle: () => void;
  onSave: (key: string, patch: Partial<AlertAction>) => Promise<void>;
}) {
  const isDismissed = action?.action === 'dismissed';
  return (
    <div className={isDismissed ? 'opacity-60' : ''}>
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${expanded ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
        <Badge className={tierClass[alert.severity]}>{tierLabel[alert.severity]}</Badge>
        <span className="text-sm text-slate-700 flex-1 min-w-0">{alert.message}</span>
        {action?.note && <span title={action.note}><StickyNote size={13} className="text-blue-400 shrink-0" /></span>}
        {action?.assigned_to && <span className="text-xs text-violet-500 shrink-0">{action.assigned_to}</span>}
        {action?.snooze_until && <span className="text-xs text-slate-400 shrink-0">due {action.snooze_until}</span>}
        {isDismissed && <Badge className="bg-emerald-100 text-emerald-600 border-emerald-200">Done</Badge>}
        <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">{alert.module}</span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <AlertActionPanel alert={alert} existing={action} onSave={onSave} onClose={onToggle}
          onReopen={isDismissed ? () => onSave(alert.key, { action: 'active' }) : undefined} />
      )}
    </div>
  );
}

// ── KPI primitives ────────────────────────────────────────────────────────────
interface Kpi { label: string; value: string | number; sub?: string; accent?: string; link?: string; onClick?: () => void }

function KpiCard({ k }: { k: Kpi }) {
  const inner = (
    <div className="h-full bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 hover:border-slate-400 hover:shadow-md transition-all">
      <p className="text-xs text-slate-500 mb-0.5">{k.label}</p>
      <p className={`text-xl font-bold ${k.accent ?? 'text-slate-800'}`}>{k.value}</p>
      {k.sub && <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>}
    </div>
  );
  if (k.onClick) return <button onClick={k.onClick} className="text-left">{inner}</button>;
  if (k.link) return <Link to={k.link}>{inner}</Link>;
  return inner;
}

function Section({ title, detailLink, cards }: { title: string; detailLink?: string; cards: Kpi[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
        <div className="flex-1 h-px bg-slate-200" />
        {detailLink && <Link to={detailLink} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">View details <ArrowRight size={11} /></Link>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {cards.map((c) => <KpiCard key={c.label} k={c} />)}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { role, profile, pageAccess } = useAuth();
  const [d, setD] = useState<Record<string, number | null>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [actionMap, setActionMap] = useState<Map<string, AlertAction>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHandled, setShowHandled] = useState(false);
  const alertsRef = useRef<HTMLDivElement>(null);

  async function handleSave(key: string, patch: Partial<AlertAction>) {
    await saveAlertAction(key, patch);
    setActionMap(await loadAlertActions());
    setExpanded(null);
  }

  const can = (p: string) => canAccessPath(p, role, pageAccess);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 6 }), 'yyyy-MM-dd');
    const thisMonth = format(new Date(), 'MM');
    const in60 = format(new Date(Date.now() + 60 * 86400000), 'yyyy-MM-dd');
    const canHR = ['admin', 'manager', 'hr'].includes(role ?? '');

    async function load() {
      const [
        salesQ, lostQ, overdueFuQ, newCustQ, vipQ, wlQ, preQ, projQ,
        stockSumQ, lowQ, stockCntQ, poQ, attTodayQ, attLateQ, leaveQ, empQ,
        repairsQ, contentQ, igQ, setQ, alertList, actMap,
      ] = await Promise.all([
        supabase.from('cases').select('amount_kd, date_logged, sale_items(amount_kd)').eq('case_type', 'Sale').eq('deleted', false).gte('date_logged', monthStart),
        supabase.from('cases').select('amount_kd').eq('case_type', 'Lost Sale').eq('deleted', false).gte('date_logged', monthStart),
        supabase.from('cases').select('id', { count: 'exact', head: true }).eq('case_type', 'Follow-up').eq('status', 'Open').eq('deleted', false).lt('promised_callback', today),
        supabase.from('customers').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
        supabase.from('customers').select('birthday, occasions'),
        supabase.from('waiting_list').select('id', { count: 'exact', head: true }).eq('list_type', 'Waiting List').in('status', ['Open', 'Contacted']),
        supabase.from('waiting_list').select('id', { count: 'exact', head: true }).eq('list_type', 'Pre-Order').not('status', 'in', '("Delivered","Cancelled","Converted")'),
        supabase.from('limited_projects').select('status, launch_date'),
        supabase.from('lightspeed_stock_summary').select('*').single(),
        supabase.from('lightspeed_low_stock').select('product_id', { count: 'exact', head: true }),
        supabase.from('lightspeed_stock').select('product_id', { count: 'exact', head: true }),
        supabase.from('purchase_orders').select('status, total_cost, amount_paid').not('status', 'in', '("Cancelled")').is('merged_into', null),
        supabase.from('attendance_records').select('employee_name').gte('clock_in', `${today}T00:00:00+03:00`).lte('clock_in', `${today}T23:59:59+03:00`),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('is_late', true).eq('justified', false).gte('clock_in', `${monthStart}T00:00:00+03:00`),
        supabase.from('leave_records').select('leave_type').eq('approval_status', 'Pending'),
        canHR ? supabase.from('employees').select('residency_expiry, work_permit_expiry, status').in('status', ['Active', 'On leave']) : Promise.resolve({ data: [] as any[] }),
        supabase.from('repair_watches').select('status, estimated_completion, date_returned'),
        supabase.from('content_tasks').select('status, planned_date, posted_date'),
        supabase.from('instagram_daily').select('followers').order('snapshot_date', { ascending: false }).limit(1),
        supabase.from('settings').select('sales_target_month').single(),
        buildAlerts(role),
        loadAlertActions(),
      ]);

      // sales
      const monthCases = (salesQ.data ?? []) as any[];
      const salesMonth = monthCases.reduce((s, c) => s + caseTotal(c), 0);
      const salesToday = monthCases.filter((c) => c.date_logged === today).reduce((s, c) => s + caseTotal(c), 0);
      const salesTarget = setQ.data?.sales_target_month != null ? Number(setQ.data.sales_target_month) : null;
      const lostMonth = ((lostQ.data ?? []) as any[]).reduce((s, c) => s + Number(c.amount_kd ?? 0), 0);

      // vip occasions this month
      let vipOcc = 0;
      for (const c of (vipQ.data ?? []) as any[]) {
        if (c.birthday && c.birthday.slice(5, 7) === thisMonth) vipOcc++;
        for (const o of (Array.isArray(c.occasions) ? c.occasions : [])) {
          const m = String(o?.date ?? '').match(/(\d{2})-\d{2}$/);
          if (m && m[1] === thisMonth) vipOcc++;
        }
      }

      // projects
      const projects = (projQ.data ?? []) as any[];
      const activeProjects = projects.filter((p) => !['Sold Out', 'Cancelled'].includes(p.status)).length;
      const delayedProjects = projects.filter((p) => ['Upcoming', 'Confirmed'].includes(p.status) && p.launch_date && p.launch_date < today).length;

      // stock + purchasing
      const stockValue = stockSumQ.data ? Number(stockSumQ.data.retail_value) : null;
      const deadValue = stockSumQ.data ? Number(stockSumQ.data.dead_value) : null;
      const lowStock = (stockCntQ.count ?? 0) > 0 ? (lowQ.count ?? 0) : null;
      const poRows = (poQ.data ?? []) as any[];
      const openPOs = poRows.filter((p) => !['Fully Received'].includes(p.status)).length;
      const shipments = poRows.filter((p) => ['Ordered', 'Partially Received'].includes(p.status)).length;
      const supplierBalance = poRows.reduce((s, p) => s + Number(p.total_cost ?? 0) - Number(p.amount_paid ?? 0), 0);

      // HR
      const presentToday = new Set(((attTodayQ.data ?? []) as any[]).map((r) => r.employee_name)).size;
      const lateMonth = attLateQ.count ?? 0;
      const leaveRows = (leaveQ.data ?? []) as any[];
      const pendingLeave = leaveRows.filter((l) => (l.leave_type ?? 'Annual') === 'Annual').length;
      const sickReq = leaveRows.filter((l) => l.leave_type === 'Sick').length;
      const wfhReq = leaveRows.filter((l) => l.leave_type === 'WFH').length;
      const empDocs = ((empQ as any).data ?? []).filter((e: any) => (e.residency_expiry && e.residency_expiry <= in60) || (e.work_permit_expiry && e.work_permit_expiry <= in60)).length;

      // repairs
      const repairs = (repairsQ.data ?? []) as any[];
      const openRepairs = repairs.filter((r) => !['Returned to customer', 'Cancelled'].includes(r.status)).length;
      const waitingApproval = repairs.filter((r) => r.status === 'Waiting customer approval').length;
      const sentSupplier = repairs.filter((r) => r.status === 'Sent to supplier / brand').length;
      const readyPickup = repairs.filter((r) => r.status === 'Ready for pickup').length;
      const overdueRepairs = repairs.filter((r) => r.estimated_completion && r.estimated_completion < today && !['Returned to customer', 'Cancelled'].includes(r.status)).length;

      // marketing (content + IG starter)
      const content = (contentQ.data ?? []) as any[];
      const contentPending = content.filter((c) => !['Posted', 'Cancelled'].includes(c.status)).length;
      const scheduledMonth = content.filter((c) => ['Scheduled', 'Approved'].includes(c.status) && c.planned_date && c.planned_date.slice(0, 7) === monthStart.slice(0, 7)).length;
      const postedMonth = content.filter((c) => c.posted_date && c.posted_date.slice(0, 7) === monthStart.slice(0, 7)).length;
      const igFollowers = igQ.data?.[0]?.followers != null ? Number(igQ.data[0].followers) : null;

      setD({
        salesToday, salesMonth, salesTarget, lostMonth, overdueFu: overdueFuQ.count ?? 0,
        newCust: newCustQ.count ?? 0, vipOcc, openWaiting: wlQ.count ?? 0, openPre: preQ.count ?? 0,
        activeProjects, delayedProjects, stockValue, deadValue, lowStock, openPOs, shipments, supplierBalance,
        presentToday, lateMonth, pendingLeave, sickReq, wfhReq, empDocs,
        openRepairs, waitingApproval, sentSupplier, readyPickup, overdueRepairs,
        contentPending, scheduledMonth, postedMonth, igFollowers,
      });
      setAlerts(alertList);
      setActionMap(actMap);
      setLoading(false);
    }
    load();
  }, [role]);

  if (loading) return <Spinner />;

  const kd = (v: number | null | undefined) => v == null ? '—' : `${formatKDCompact(v)} KD`;
  const activeAlerts = alerts.filter((a) => actionMap.get(a.key)?.action !== 'dismissed');
  const handledCount = [...actionMap.values()].filter((a) => a.action === 'dismissed').length;

  // ── Top row: business health ──
  const targetPct = d.salesTarget ? Math.round((Number(d.salesMonth) / Number(d.salesTarget)) * 100) : null;
  const topRow: Kpi[] = [
    { label: 'Sales today', value: kd(d.salesToday), accent: 'text-emerald-600', link: can('/sales') ? '/sales' : undefined },
    { label: 'Sales this month', value: kd(d.salesMonth), accent: 'text-emerald-600', link: can('/sales') ? '/sales' : undefined },
    d.salesTarget != null
      ? { label: 'Sales vs target', value: `${targetPct}%`, sub: `of ${kd(d.salesTarget)}`, accent: (targetPct ?? 0) >= 100 ? 'text-emerald-600' : (targetPct ?? 0) >= 70 ? 'text-amber-600' : 'text-rose-600', link: can('/sales') ? '/sales' : undefined }
      : { label: 'Sales vs target', value: 'Set target', sub: 'in Settings', link: '/settings' },
    ...(d.stockValue != null ? [{ label: 'Stock value', value: kd(d.stockValue), link: can('/stock') ? '/stock' : undefined } as Kpi] : []),
    { label: 'Supplier balance', value: kd(d.supplierBalance), accent: Number(d.supplierBalance) > 0 ? 'text-rose-600' : 'text-emerald-600', link: can('/purchase-orders') ? '/purchase-orders' : undefined },
    { label: 'Action alerts', value: activeAlerts.length, accent: activeAlerts.length ? 'text-rose-600' : 'text-emerald-600', onClick: () => alertsRef.current?.scrollIntoView({ behavior: 'smooth' }) },
  ];

  const salesCards: Kpi[] = [
    { label: 'Month sales', value: kd(d.salesMonth), accent: 'text-emerald-600', link: '/sales' },
    { label: 'Lost sales (month)', value: kd(d.lostMonth), accent: Number(d.lostMonth) ? 'text-rose-600' : undefined, link: '/sales' },
    { label: 'Overdue follow-ups', value: d.overdueFu ?? 0, accent: Number(d.overdueFu) ? 'text-red-600' : undefined, link: '/follow-ups' },
    { label: 'New customers (month)', value: d.newCust ?? 0, link: '/crm' },
    { label: 'VIP occasions (month)', value: d.vipOcc ?? 0, accent: Number(d.vipOcc) ? 'text-amber-600' : undefined, link: '/vip' },
  ];

  const demandCards: Kpi[] = [
    { label: 'Open waiting list', value: d.openWaiting ?? 0, link: '/waiting-list' },
    { label: 'Open pre-orders', value: d.openPre ?? 0, link: '/waiting-list' },
    { label: 'Active limited projects', value: d.activeProjects ?? 0, link: '/limited-projects' },
    { label: 'Delayed projects', value: d.delayedProjects ?? 0, accent: Number(d.delayedProjects) ? 'text-rose-600' : undefined, link: '/limited-projects' },
  ];

  const stockCards: Kpi[] = [
    ...(d.stockValue != null ? [{ label: 'Stock value', value: kd(d.stockValue), link: '/stock' } as Kpi] : []),
    ...(d.deadValue != null ? [{ label: 'Not-moving stock', value: kd(d.deadValue), accent: Number(d.deadValue) ? 'text-rose-600' : 'text-emerald-600', link: '/stock' } as Kpi] : []),
    ...(d.lowStock != null ? [{ label: 'Low stock items', value: d.lowStock, accent: Number(d.lowStock) ? 'text-amber-600' : undefined, link: '/stock' } as Kpi] : []),
    { label: 'Open POs', value: d.openPOs ?? 0, link: '/purchase-orders' },
    { label: 'Pending shipments', value: d.shipments ?? 0, accent: Number(d.shipments) ? 'text-amber-600' : undefined, link: '/purchase-orders' },
    { label: 'Supplier balance', value: kd(d.supplierBalance), accent: Number(d.supplierBalance) > 0 ? 'text-rose-600' : undefined, link: '/purchase-orders' },
  ];

  const hrCards: Kpi[] = [
    { label: 'Present today', value: d.presentToday ?? 0, accent: 'text-emerald-600', link: '/attendance' },
    { label: 'Late (month, unjustified)', value: d.lateMonth ?? 0, accent: Number(d.lateMonth) ? 'text-amber-600' : undefined, link: '/attendance' },
    { label: 'Pending leave', value: d.pendingLeave ?? 0, accent: Number(d.pendingLeave) ? 'text-amber-600' : undefined, link: '/leave' },
    { label: 'Sick requests', value: d.sickReq ?? 0, accent: Number(d.sickReq) ? 'text-rose-600' : undefined, link: '/leave' },
    { label: 'WFH requests', value: d.wfhReq ?? 0, link: '/leave' },
    { label: 'Expiring docs ≤60d', value: d.empDocs ?? 0, accent: Number(d.empDocs) ? 'text-red-600' : undefined, link: '/hr' },
  ];

  const repairCards: Kpi[] = [
    { label: 'Open repairs', value: d.openRepairs ?? 0, link: '/repairs' },
    { label: 'Waiting approval', value: d.waitingApproval ?? 0, accent: Number(d.waitingApproval) ? 'text-amber-600' : undefined, link: '/repairs' },
    { label: 'Sent to supplier', value: d.sentSupplier ?? 0, link: '/repairs' },
    { label: 'Ready for pickup', value: d.readyPickup ?? 0, accent: Number(d.readyPickup) ? 'text-emerald-600' : undefined, link: '/repairs' },
    { label: 'Overdue repairs', value: d.overdueRepairs ?? 0, accent: Number(d.overdueRepairs) ? 'text-rose-600' : undefined, link: '/repairs' },
  ];

  const marketingCards: Kpi[] = [
    { label: 'Content pending', value: d.contentPending ?? 0, accent: Number(d.contentPending) ? 'text-amber-600' : undefined, link: '/content' },
    { label: 'Scheduled (month)', value: d.scheduledMonth ?? 0, link: '/content' },
    { label: 'Posted (month)', value: d.postedMonth ?? 0, accent: 'text-emerald-600', link: '/content' },
    ...(d.igFollowers != null ? [{ label: 'Instagram followers', value: formatKDCompact(d.igFollowers).replace(' KD', ''), sub: '@timekeeperkw', link: '/instagram' } as Kpi] : [{ label: 'Instagram', value: 'Connect', link: '/instagram' } as Kpi]),
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back{profile ? `, ${profile.full_name}` : ''} — business health at a glance.</p>
        </div>
        <a href="https://alalramadhan-kuwait.github.io/watch-store-crm/#/reports" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600">
          <ExternalLink size={15} /> Store Daily Report
        </a>
      </div>

      {/* Top KPI row — business health */}
      <div className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {topRow.map((c) => <KpiCard key={c.label} k={c} />)}
        </div>
      </div>

      {can('/sales') && <Section title="Sales & Customers" cards={salesCards} />}
      {(can('/waiting-list') || can('/limited-projects')) && <Section title="Demand & Projects" cards={demandCards} />}
      {(can('/stock') || can('/purchase-orders')) && <Section title="Stock & Purchasing" detailLink={can('/purchase-orders') ? '/purchase-orders' : '/stock'} cards={stockCards} />}
      {(can('/hr') || can('/attendance')) && <Section title="HR & Attendance" cards={hrCards} />}
      {can('/repairs') && <Section title="Repair Watches" detailLink="/repairs" cards={repairCards} />}
      {(can('/instagram') || can('/content')) && <Section title="Marketing" cards={marketingCards} />}

      {/* Alerts & Actions */}
      <div ref={alertsRef} className="mb-3 flex items-center gap-3 scroll-mt-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Bell size={17} /> Alerts & Actions</h2>
        <Badge className="bg-slate-900 text-white border-slate-900">{activeAlerts.length}</Badge>
        {handledCount > 0 && (
          <button onClick={() => setShowHandled((s) => !s)} className="text-xs text-slate-400 hover:text-slate-600 ml-auto">
            {showHandled ? 'Hide' : `Show ${handledCount} done`}
          </button>
        )}
        <p className="text-xs text-slate-400 ml-auto hidden sm:block">Only items that need action. Click to assign, set a due date, or mark done.</p>
      </div>

      {activeAlerts.length === 0 && !showHandled ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-slate-400 text-sm">
          Nothing needs action right now 🎉
          {handledCount > 0 && <button onClick={() => setShowHandled(true)} className="ml-3 text-slate-500 hover:text-slate-700 underline text-xs">Show {handledCount} done</button>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {alerts.map((a) => (
            <AlertRow key={a.key} alert={a} action={actionMap.get(a.key)} expanded={expanded === a.key}
              onToggle={() => setExpanded((e) => (e === a.key ? null : a.key))} onSave={handleSave} />
          ))}
          {showHandled && (() => {
            const dismissedKeys = [...actionMap.entries()].filter(([, v]) => v.action === 'dismissed').map(([k]) => k);
            return dismissedKeys.length > 0 ? (
              <div className="px-4 py-3 bg-slate-50">
                <p className="text-xs text-slate-500 font-medium mb-2">Done ({dismissedKeys.length})</p>
                <div className="space-y-1">
                  {dismissedKeys.map((k) => {
                    const a = actionMap.get(k)!;
                    return (
                      <div key={k} className="flex items-center gap-2 text-xs text-slate-400">
                        <CheckCheck size={12} className="text-emerald-500 shrink-0" />
                        <span className="flex-1">{k.replace(/_/g, ' ')}</span>
                        {a.note && <span className="italic truncate max-w-[200px]">{a.note}</span>}
                        {a.assigned_to && <span className="text-violet-400">{a.assigned_to}</span>}
                        <button onClick={() => handleSave(k, { action: 'active' })} className="flex items-center gap-0.5 text-slate-400 hover:text-slate-600"><RotateCcw size={11} /> Reopen</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
