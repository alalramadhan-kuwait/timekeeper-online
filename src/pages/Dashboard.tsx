import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink, ChevronDown, StickyNote, BellOff, UserRound, CheckCheck, ArrowRight, RotateCcw, Bell, ClipboardList,
} from 'lucide-react';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { supabase } from '../lib/supabase';
import { resolveOutlet, outletName, type OutletCode } from '../shared/outlets';
import { Badge, Spinner } from '../components/ui';
import { formatKDCompact } from '../lib/format';
import { buildAlerts, loadAlertActions, saveAlertAction, Alert, AlertAction } from '../lib/alerts';
import { tierClass, tierLabel } from '../lib/expiry';
import { useAuth } from '../context/AuthContext';
import { canAccessPath } from '../components/Layout';
import { ChartCard, LineChart, BarChart, Point, Bar } from '../components/Charts';

interface IgAccount { username: string; followers: number | null; change: number | null; lastPost: string | null; daysSince: number | null }
interface IgPostRow { date: string | null; type: string | null; likes: number; comments: number; url: string | null; caption: string | null }
interface Charts {
  salesTrend: Point[];       // cumulative sales day-by-day this month
  outletSales: Bar[];        // month sales per outlet, with target marker
  stockHistory: Point[];     // stock retail value over time
  supplierByBrand: Bar[];    // outstanding supplier balance per brand
  repairsByStatus: Bar[];    // open repair cases per status
  igSeries: { username: string; points: Point[] }[]; // followers trend per account
  igAccounts: IgAccount[];   // per-account followers / change / last post
  igTopPosts: IgPostRow[];   // best recent posts for the main account
}
const EMPTY_CHARTS: Charts = { salesTrend: [], outletSales: [], stockHistory: [], supplierByBrand: [], repairsByStatus: [], igSeries: [], igAccounts: [], igTopPosts: [] };
const IG_MAIN = 'timekeeperkw';
const IG_COLOR: Record<string, string> = { timekeeperkw: '#db2777', timegallerykw: '#0ea5e9', timekeeperkwshop: '#8b5cf6' };

/* Revenue already resolved to a channel by the pos_channel_sales view, which
   also splits the one till register that serves two: what Eman rings up there
   is the WhatsApp channel, the rest is the online shop. The dashboard never
   sees a register name. */
const posRevenue = (rows: Array<{ channel_code: string | null; revenue: unknown }>, code: OutletCode) =>
  rows.filter((r) => r.channel_code === code)
      .reduce((t, r) => t + Number(r.revenue ?? 0), 0);

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
interface KpiPart { label: string; value: string; pct?: number | null }
interface Kpi {
  label: string; value: string | number; sub?: string; accent?: string; link?: string;
  onClick?: () => void;
  /** Where the headline figure came from, shop by shop. */
  parts?: KpiPart[];
}

function KpiCard({ k }: { k: Kpi }) {
  /* A tile carrying a breakdown needs room to spell out a shop's name: in the
     two-column phone grid the labels truncated to "Ti…", which tells nobody
     anything. It takes the whole row there, and behaves like every other tile
     from the tablet up. */
  const span = k.parts && k.parts.length ? 'col-span-2 md:col-span-1' : '';
  const inner = (
    <div className="h-full bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 hover:border-slate-400 hover:shadow-md transition-all">
      <p className="text-xs text-slate-500 mb-0.5">{k.label}</p>
      <p className={`text-xl font-bold ${k.accent ?? 'text-slate-800'}`}>{k.value}</p>
      {k.sub && <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>}
      {/* The total is what the company is measured on; this is where it came
          from. Each shop carries its own target, so the percentage is against
          that one rather than a share of the total, which would say nothing
          about whether a shop is doing well. */}
      {k.parts && k.parts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {k.parts.map((b) => (
            <div key={b.label} className="flex items-baseline gap-2 text-xs">
              <span className="flex-1 truncate text-slate-500">{b.label}</span>
              <span className="font-semibold text-slate-700 tabular-nums">{b.value}</span>
              <span className="w-10 text-right tabular-nums text-slate-400">
                {b.pct == null ? '' : `${b.pct}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  if (k.onClick) return <button onClick={k.onClick} className={`text-left ${span}`}>{inner}</button>;
  if (k.link) return <Link to={k.link} className={span}>{inner}</Link>;
  return span ? <div className={span}>{inner}</div> : inner;
}

function Section({ title, detailLink, cards, charts }: { title: string; detailLink?: string; cards: Kpi[]; charts?: React.ReactNode }) {
  const [showCharts, setShowCharts] = useState(false);
  if (cards.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
        <div className="flex-1 h-px bg-slate-200" />
        {charts && (
          <button onClick={() => setShowCharts((v) => !v)} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-0.5">
            {showCharts ? '▾' : '▸'} Trends
          </button>
        )}
        {detailLink && <Link to={detailLink} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">View details <ArrowRight size={11} /></Link>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {cards.map((c) => <KpiCard key={c.label} k={c} />)}
      </div>
      {charts && showCharts && <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">{charts}</div>}
    </div>
  );
}

/** Compact per-account comparison — a risk/comparison widget, not a detail table. */
function IgComparison({ accounts }: { accounts: IgAccount[] }) {
  if (!accounts.length) return <div className="text-xs text-slate-400 py-4 text-center">No data yet</div>;
  const num = (n: number | null) => (n == null ? '—' : Number(n).toLocaleString());
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-400 text-left">
            <th className="py-1 font-medium">Account</th>
            <th className="py-1 font-medium text-right">Followers</th>
            <th className="py-1 font-medium text-right">Δ today</th>
            <th className="py-1 font-medium text-right">Last post</th>
            <th className="py-1 font-medium text-right">Idle</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.username} className="border-t border-slate-100">
              <td className="py-1.5 font-medium text-slate-700 whitespace-nowrap">@{a.username}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-700">{num(a.followers)}</td>
              <td className={`py-1.5 text-right tabular-nums ${a.change == null ? 'text-slate-300' : a.change > 0 ? 'text-emerald-600' : a.change < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {a.change == null ? '—' : `${a.change > 0 ? '+' : ''}${a.change.toLocaleString()}`}
              </td>
              <td className="py-1.5 text-right text-slate-500 whitespace-nowrap">{a.lastPost ?? '—'}</td>
              <td className={`py-1.5 text-right font-medium ${a.daysSince == null ? 'text-slate-300' : a.daysSince >= 7 ? 'text-rose-600' : a.daysSince >= 3 ? 'text-amber-600' : 'text-slate-500'}`}>
                {a.daysSince == null ? '—' : `${a.daysSince}d`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Best recent posts for the main IG account — compact, click through to the post. */
function IgTopPosts({ posts }: { posts: IgPostRow[] }) {
  if (!posts.length) return <div className="text-xs text-slate-400 py-4 text-center">No posts yet</div>;
  const typeLabel = (t: string | null) => (t === 'Sidecar' ? 'Carousel' : t === 'Video' ? 'Reel' : t ?? '—');
  return (
    <div className="space-y-1.5">
      {posts.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-4 shrink-0 text-slate-400 tabular-nums">{i + 1}</span>
          <a href={p.url ?? '#'} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 truncate text-slate-700 hover:text-blue-600" title={p.caption ?? ''}>
            {p.caption ? p.caption.replace(/\s+/g, ' ').trim() : '(no caption)'}
          </a>
          <span className="shrink-0 text-[11px] text-slate-400 hidden sm:inline">{typeLabel(p.type)}</span>
          <span className="shrink-0 tabular-nums text-slate-600">♥ {p.likes.toLocaleString()}</span>
          <span className="shrink-0 tabular-nums text-slate-400">💬 {p.comments.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Who's at work now — live list of clocked-in staff (managers/HR) ──
interface AtWork { id: string; employee_name: string | null; clock_in: string; is_late: boolean; justified: boolean; location: string | null }
function WhoAtWork() {
  const [recs, setRecs] = useState<AtWork[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
    supabase.from('attendance_records')
      .select('id, employee_name, clock_in, is_late, justified, location')
      .is('clock_out', null)
      .gte('clock_in', `${today}T00:00:00+03:00`).lte('clock_in', `${today}T23:59:59+03:00`)
      .order('clock_in')
      .then(({ data }) => { setRecs((data as AtWork[]) ?? []); setLoading(false); });
  }, []);
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-KW', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuwait' });

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-700">Who's at work now</h2>
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{recs.length}</Badge>
        <Link to="/attendance" className="ml-auto text-xs text-blue-600 hover:underline">Attendance →</Link>
      </div>
      {loading ? <Spinner /> : recs.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">No one is clocked in right now.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {recs.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm py-1">
              <span className="font-medium text-slate-700 truncate">{r.employee_name ?? 'Unknown'}</span>
              {r.is_late && !r.justified && <span className="text-[11px] text-amber-600">late</span>}
              <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">since {t(r.clock_in)}</span>
              {r.location && <span className="text-[11px] text-slate-400 hidden sm:inline">· {r.location}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Pending workflow tasks — measurability for the owner (managers/admin) ──
function WorkflowTasksCard() {
  const [n, setN] = useState<{ open: number; overdue: number } | null>(null);
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
    supabase.from('assigned_tasks').select('due_date').eq('status', 'Open')
      .then(({ data }) => {
        const rows = data ?? [];
        setN({ open: rows.length, overdue: rows.filter((r: any) => r.due_date && r.due_date < today).length });
      });
  }, []);
  return (
    <Link to="/tasks" className="block bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:border-slate-300 transition-colors mb-6">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList size={16} className="text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">Pending tasks</span>
        <span className="ml-auto text-xs text-blue-600">Manage →</span>
      </div>
      {n == null ? <div className="h-6" /> : (
        <div className="flex items-baseline gap-4">
          <span className="text-2xl font-bold text-slate-900">{n.open}<span className="text-sm font-medium text-slate-400 ml-1">open</span></span>
          <span className={`text-lg font-semibold ${n.overdue ? 'text-rose-600' : 'text-emerald-600'}`}>{n.overdue}<span className="text-sm font-medium text-slate-400 ml-1">overdue</span></span>
        </div>
      )}
    </Link>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { role, profile, pageAccess } = useAuth();
  const [d, setD] = useState<Record<string, number | null>>({});
  const [tillSyncedAt, setTillSyncedAt] = useState<string | null>(null);
  const [charts, setCharts] = useState<Charts>(EMPTY_CHARTS);
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
  const stockCostView = ['admin', 'manager'].includes(role ?? ''); // cost is manager-only
  const isManager = ['admin', 'manager'].includes(role ?? ''); // sees company-wide financials + alerts

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 6 }), 'yyyy-MM-dd');
    const thisMonth = format(new Date(), 'MM');
    const in60 = format(new Date(Date.now() + 60 * 86400000), 'yyyy-MM-dd');
    const canHR = ['admin', 'manager', 'hr'].includes(role ?? '');

    async function load() {
      const [
        posQ, lostQ, overdueFuQ, newCustQ, vipQ, wlQ, preQ, projQ,
        stockSumQ, lowQ, stockCntQ, poQ, attTodayQ, attLateQ, leaveQ, empQ,
        repairsQ, contentQ, igQ, setQ, alertList, actMap, stockHistQ, syncQ,
      ] = await Promise.all([
        /* Till revenue from Lightspeed, refreshed by the 05:00 UTC sync every
           morning. This used to read logged Sale cases — which is a pipeline,
           not money: measured on the same month they came to barely half of
           what actually rang through. The cases still drive lost sales and
           follow-ups below, where they belong. */
        supabase.from('pos_channel_sales').select('channel_code, sale_date, revenue').gte('sale_date', monthStart),
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
        supabase.from('purchase_orders').select('status, total_cost, amount_paid, brand').not('status', 'in', '("Cancelled")').is('merged_into', null),
        supabase.from('attendance_records').select('employee_name').gte('clock_in', `${today}T00:00:00+03:00`).lte('clock_in', `${today}T23:59:59+03:00`),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('is_late', true).eq('justified', false).gte('clock_in', `${monthStart}T00:00:00+03:00`),
        supabase.from('leave_records').select('leave_type').eq('approval_status', 'Pending'),
        canHR ? supabase.from('employees').select('residency_expiry, work_permit_expiry, status').in('status', ['Active', 'On leave']) : Promise.resolve({ data: [] as any[] }),
        supabase.from('repair_watches').select('status, estimated_completion, date_returned'),
        supabase.from('content_tasks').select('status, planned_date, posted_date'),
        supabase.from('instagram_daily').select('snapshot_date, followers, username, last_post_date').order('snapshot_date', { ascending: true }).limit(400),
        supabase.from('settings').select('sales_target_month, sales_target_avenues, sales_target_timegallery, sales_target_online, sales_target_whatsapp').single(),
        buildAlerts(role),
        loadAlertActions(),
        supabase.from('lightspeed_stock_value_history').select('snapshot_date, retail_value, cost_value').order('snapshot_date', { ascending: true }).limit(90),
        supabase.from('lightspeed_sync_log').select('finished_at').eq('status', 'ok').not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1),
      ]);

      // sales — what rang through the tills, per outlet, as of this morning's sync
      const posDays = (posQ.data ?? []) as any[];
      const sumRev = (rows: any[]) => rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
      const salesMonth = sumRev(posDays);
      const salesToday = sumRev(posDays.filter((r) => r.sale_date === today));
      const salesTarget = setQ.data?.sales_target_month != null ? Number(setQ.data.sales_target_month) : null;
      /* These figures are only as fresh as the last sync, so the dashboard says
         so. Logged cases arrived through the day; till revenue arrives once in
         the morning, and a "today" that quietly stopped counting at 8am would
         read as live when it is not. */
      setTillSyncedAt(((syncQ.data?.[0] as any)?.finished_at as string | undefined) ?? null);
      // per-outlet month sales vs their own targets
      const avenuesSales = posRevenue(posDays, 'avenues');
      const timeGallerySales = posRevenue(posDays, 'time_gallery');
      const whatsappSales = posRevenue(posDays, 'whatsapp');
      const onlineSales = posRevenue(posDays, 'online');
      const avenuesTarget = setQ.data?.sales_target_avenues != null ? Number(setQ.data.sales_target_avenues) : null;
      const timeGalleryTarget = setQ.data?.sales_target_timegallery != null ? Number(setQ.data.sales_target_timegallery) : null;
      /* The register's old single target moved to Online when it was split in
         two; WhatsApp has none until somebody sets one, and a channel with no
         target shows no target line rather than a percentage of a guess. */
      const onlineTarget = setQ.data?.sales_target_online != null ? Number(setQ.data.sales_target_online) : null;
      const whatsappTarget = setQ.data?.sales_target_whatsapp != null ? Number(setQ.data.sales_target_whatsapp) : null;
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
      const activeProjects = projects.filter((p) => !['Sold Out', 'Completed', 'Cancelled'].includes(p.status)).length;
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
      // instagram_daily now holds several accounts — split by username
      const igRows = (igQ.data ?? []) as any[];
      const igByAccount = new Map<string, any[]>();
      for (const r of igRows) {
        const u = (r.username ?? IG_MAIN) as string;
        (igByAccount.get(u) ?? igByAccount.set(u, []).get(u)!).push(r);
      }
      const mainSeries = igByAccount.get(IG_MAIN) ?? [];
      const igFollowers = mainSeries.length ? Number(mainSeries[mainSeries.length - 1].followers) : null;

      // ── chart series ──
      const dayNum = (iso: string) => iso.slice(8, 10);
      // cumulative sales per day this month → shows the shape of the month
      const byDay = new Map<string, number>();
      for (const r of posDays) byDay.set(r.sale_date, (byDay.get(r.sale_date) ?? 0) + Number(r.revenue ?? 0));
      const todayDay = Number(today.slice(8, 10));
      let running = 0;
      const salesTrend: Point[] = [];
      for (let day = 1; day <= todayDay; day++) {
        const iso = `${monthStart.slice(0, 8)}${String(day).padStart(2, '0')}`;
        running += byDay.get(iso) ?? 0;
        salesTrend.push({ label: String(day), value: running });
      }

      /* Four channels, not three. The till has three registers, but the one it
         calls "Time Keeper" carries both the online shop and Eman's WhatsApp
         orders; the view has already split them by who rang each sale up. */
      const outletBars: Bar[] = [
        { label: outletName('online'), value: onlineSales, target: onlineTarget, color: '#059669' },
        { label: outletName('whatsapp'), value: whatsappSales, target: whatsappTarget, color: '#14b8a6' },
        { label: outletName('avenues'), value: avenuesSales, target: avenuesTarget, color: '#0ea5e9' },
        { label: outletName('time_gallery'), value: timeGallerySales, target: timeGalleryTarget, color: '#8b5cf6' },
      ];

      // Show cost to managers/admin (cost is manager-only across the app); staff see retail.
      const canCost = ['admin', 'manager'].includes(role ?? '');
      const stockHistory: Point[] = ((stockHistQ.data ?? []) as any[])
        .map((r) => ({ label: dayNum(r.snapshot_date), value: Number(canCost ? r.cost_value : r.retail_value) }));

      // outstanding supplier balance grouped by brand (owed only)
      const balByBrand = new Map<string, number>();
      for (const p of poRows) {
        const bal = Number(p.total_cost ?? 0) - Number(p.amount_paid ?? 0);
        if (bal > 0) balByBrand.set(p.brand || 'Unassigned', (balByBrand.get(p.brand || 'Unassigned') ?? 0) + bal);
      }
      const supplierByBrand: Bar[] = [...balByBrand.entries()].map(([label, value]) => ({ label, value }));

      // open repair cases grouped by status
      const repByStatus = new Map<string, number>();
      for (const r of repairs) {
        if (['Returned to customer', 'Cancelled'].includes(r.status)) continue;
        repByStatus.set(r.status ?? 'Unknown', (repByStatus.get(r.status ?? 'Unknown') ?? 0) + 1);
      }
      const repairsByStatus: Bar[] = [...repByStatus.entries()].map(([label, value]) => ({ label, value }));

      // one followers-trend series per account, main first then by size
      const igSeries = [...igByAccount.entries()]
        .sort((a, b) =>
          (a[0] === IG_MAIN ? -1 : b[0] === IG_MAIN ? 1 : 0) ||
          Number(b[1][b[1].length - 1]?.followers ?? 0) - Number(a[1][a[1].length - 1]?.followers ?? 0))
        .map(([username, rows]) => ({
          username,
          points: rows.map((r) => ({ label: dayNum(r.snapshot_date), value: Number(r.followers) })),
        }));

      // per-account comparison: latest snapshot, day-over-day change, days since last post
      const daysBetween = (iso: string) =>
        Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000);
      const igAccounts: IgAccount[] = [...igByAccount.entries()]
        .map(([username, rows]) => {
          const latest = rows[rows.length - 1];
          const prev = rows.length > 1 ? rows[rows.length - 2] : null;
          const followers = latest?.followers != null ? Number(latest.followers) : null;
          const change = prev?.followers != null && followers != null ? followers - Number(prev.followers) : null;
          return {
            username, followers, change,
            lastPost: latest?.last_post_date ?? null,
            daysSince: latest?.last_post_date ? daysBetween(latest.last_post_date) : null,
          };
        })
        .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));

      // main-account post engagement (Phase 3): avg engagement + best recent posts
      const { data: postData } = await supabase.from('instagram_posts')
        .select('posted_at, type, likes, comments, url, caption')
        .eq('username', IG_MAIN)
        .order('posted_at', { ascending: false }).limit(30);
      const posts = (postData ?? []) as any[];
      const eng = (p: any) => Number(p.likes ?? 0) + Number(p.comments ?? 0);
      const igTopPosts: IgPostRow[] = posts
        .map((p) => ({ date: p.posted_at ? String(p.posted_at).slice(0, 10) : null, type: p.type, likes: Number(p.likes ?? 0), comments: Number(p.comments ?? 0), url: p.url, caption: p.caption }))
        .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
        .slice(0, 5);
      const igAvgEng = posts.length ? Math.round(posts.reduce((s, p) => s + eng(p), 0) / posts.length) : null;
      const igEngRate = igAvgEng != null && igFollowers ? (igAvgEng / igFollowers) * 100 : null;

      setCharts({ salesTrend, outletSales: outletBars, stockHistory, supplierByBrand, repairsByStatus, igSeries, igAccounts, igTopPosts });

      setD({
        salesToday, salesMonth, salesTarget,
        avenuesSales, timeGallerySales, onlineSales, whatsappSales,
        avenuesTarget, timeGalleryTarget, onlineTarget, whatsappTarget,
        lostMonth, overdueFu: overdueFuQ.count ?? 0,
        newCust: newCustQ.count ?? 0, vipOcc, openWaiting: wlQ.count ?? 0, openPre: preQ.count ?? 0,
        activeProjects, delayedProjects, stockValue, deadValue, lowStock, openPOs, shipments, supplierBalance,
        presentToday, lateMonth, pendingLeave, sickReq, wfhReq, empDocs,
        openRepairs, waitingApproval, sentSupplier, readyPickup, overdueRepairs,
        contentPending, scheduledMonth, postedMonth, igFollowers, igAvgEng, igEngRate,
      });
      setAlerts(alertList);
      setActionMap(actMap);
      setLoading(false);
    }
    load();
  }, [role]);

  if (loading) return <Spinner />;

  const kd = (v: number | null | undefined) => v == null ? '—' : `${formatKDCompact(v)} KD`;
  const kdC = (n: number) => `${formatKDCompact(n)} KD`; // chart axis/label formatter
  const activeAlerts = alerts.filter((a) => actionMap.get(a.key)?.action !== 'dismissed');
  const handledCount = [...actionMap.values()].filter((a) => a.action === 'dismissed').length;

  // ── Top row: business health ──
  const targetPct = d.salesTarget ? Math.round((Number(d.salesMonth) / Number(d.salesTarget)) * 100) : null;
  /* Till revenue lands once a morning, so say when — otherwise a figure that
     stopped counting hours ago looks like it is still going. */
  /* The month's takings, shop by shop, straight off the tills. Ordered as the
     bar chart below orders them so the two agree at a glance, and a shop with
     no target simply shows its figure. */
  const pctOf = (v: number | null | undefined, t: number | null | undefined) =>
    t == null || !t ? null : Math.round((Number(v ?? 0) / Number(t)) * 100);
  const outletParts: KpiPart[] = [
    { label: outletName('online'), value: kd(d.onlineSales), pct: pctOf(d.onlineSales, d.onlineTarget) },
    { label: outletName('whatsapp'), value: kd(d.whatsappSales), pct: pctOf(d.whatsappSales, d.whatsappTarget) },
    { label: outletName('avenues'), value: kd(d.avenuesSales), pct: pctOf(d.avenuesSales, d.avenuesTarget) },
    { label: outletName('time_gallery'), value: kd(d.timeGallerySales), pct: pctOf(d.timeGallerySales, d.timeGalleryTarget) },
  ];
  const tillAsOf = tillSyncedAt
    ? `from the tills, as of ${format(new Date(tillSyncedAt), 'HH:mm')}`
    : 'waiting for the first Lightspeed sync';
  // Headline strip — only the company-wide numbers this role is allowed to see. A
  // non-financial role (e.g. marketing) sees none of these and gets its own sections below.
  const topRow: Kpi[] = [
    ...(can('/sales') ? [{ label: 'Sales this month', value: kd(d.salesMonth),
      sub: d.salesTarget != null ? `${targetPct}% of ${kd(d.salesTarget)} target` : 'set a target in Settings',
      accent: 'text-emerald-600', link: '/sales', parts: outletParts } as Kpi] : []),
    ...(can('/purchase-orders') ? [{ label: 'Supplier balance', value: kd(d.supplierBalance), accent: Number(d.supplierBalance) > 0 ? 'text-rose-600' : 'text-emerald-600', link: '/purchase-orders' } as Kpi] : []),
    ...(can('/stock') && d.stockValue != null ? [{ label: 'Stock value', value: kd(d.stockValue), link: '/stock' } as Kpi] : []),
    ...(isManager ? [{ label: 'Action alerts', value: activeAlerts.length, accent: activeAlerts.length ? 'text-rose-600' : 'text-emerald-600', onClick: () => alertsRef.current?.scrollIntoView({ behavior: 'smooth' }) } as Kpi] : []),
  ];

  // Each section = its few must-follow KPIs; the fuller breakdown lives on the section's page.
  const salesCards: Kpi[] = [
    { label: 'Sales today', value: kd(d.salesToday), sub: tillAsOf, accent: 'text-emerald-600', link: '/sales' },
    { label: 'Lost sales (month)', value: kd(d.lostMonth), accent: Number(d.lostMonth) ? 'text-rose-600' : undefined, link: '/sales' },
    { label: 'Overdue follow-ups', value: d.overdueFu ?? 0, accent: Number(d.overdueFu) ? 'text-red-600' : undefined, link: '/follow-ups' },
  ];

  const demandCards: Kpi[] = [
    { label: 'Open pre-orders', value: d.openPre ?? 0, link: '/waiting-list' },
    { label: 'Active limited projects', value: d.activeProjects ?? 0, link: '/limited-projects' },
    { label: 'Delayed projects', value: d.delayedProjects ?? 0, accent: Number(d.delayedProjects) ? 'text-rose-600' : undefined, link: '/limited-projects' },
  ];

  const stockCards: Kpi[] = [
    ...(d.deadValue != null ? [{ label: 'Not-moving stock', value: kd(d.deadValue), accent: Number(d.deadValue) ? 'text-rose-600' : 'text-emerald-600', link: '/stock' } as Kpi] : []),
    ...(d.lowStock != null ? [{ label: 'Low stock items', value: d.lowStock, accent: Number(d.lowStock) ? 'text-amber-600' : undefined, link: '/stock' } as Kpi] : []),
    { label: 'Open POs', value: d.openPOs ?? 0, link: '/purchase-orders' },
  ];

  const hrCards: Kpi[] = [
    { label: 'Present today', value: d.presentToday ?? 0, accent: 'text-emerald-600', link: '/attendance' },
    { label: 'Pending leave', value: d.pendingLeave ?? 0, accent: Number(d.pendingLeave) ? 'text-amber-600' : undefined, link: '/leave' },
    { label: 'Expiring docs ≤60d', value: d.empDocs ?? 0, accent: Number(d.empDocs) ? 'text-red-600' : undefined, link: '/hr' },
  ];

  const repairCards: Kpi[] = [
    { label: 'Open repairs', value: d.openRepairs ?? 0, link: '/repairs' },
    { label: 'Ready for pickup', value: d.readyPickup ?? 0, accent: Number(d.readyPickup) ? 'text-emerald-600' : undefined, link: '/repairs' },
    { label: 'Overdue repairs', value: d.overdueRepairs ?? 0, accent: Number(d.overdueRepairs) ? 'text-rose-600' : undefined, link: '/repairs' },
  ];

  const marketingCards: Kpi[] = [
    ...(d.igFollowers != null ? [{ label: 'Instagram followers', value: formatKDCompact(d.igFollowers).replace(' KD', ''), sub: '@timekeeperkw', link: '/instagram' } as Kpi] : [{ label: 'Instagram', value: 'Connect', link: '/instagram' } as Kpi]),
    ...(d.igAvgEng != null ? [{ label: 'Avg engagement / post', value: formatKDCompact(d.igAvgEng).replace(' KD', ''), sub: d.igEngRate != null ? `${Number(d.igEngRate).toFixed(2)}% of followers` : '@timekeeperkw', accent: 'text-emerald-600', link: '/instagram' } as Kpi] : []),
    { label: 'Content pending', value: d.contentPending ?? 0, accent: Number(d.contentPending) ? 'text-amber-600' : undefined, link: '/content' },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back{profile ? `, ${profile.full_name}` : ''} — business health at a glance.</p>
        </div>
        {can('/sales') && (
          <a href="https://alalramadhan-kuwait.github.io/watch-store-crm/#/reports" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600">
            <ExternalLink size={15} /> Store Daily Report
          </a>
        )}
      </div>

      {/* Top KPI row — business health (only the numbers this role may see) */}
      {topRow.length > 0 && (
        <div className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {topRow.map((c) => <KpiCard key={c.label} k={c} />)}
          </div>
        </div>
      )}

      {isManager && <WorkflowTasksCard />}

      {can('/sales') && <Section title="Sales & Customers" detailLink="/sales" cards={salesCards} charts={
        <>
          <ChartCard title="Sales trend this month" hint="cumulative KD" link="/sales">
            <LineChart data={charts.salesTrend} color="#059669" fmt={kdC} />
          </ChartCard>
          <ChartCard title="Sales by outlet vs target" hint="this month" link="/sales">
            <BarChart data={charts.outletSales} fmt={kdC} />
          </ChartCard>
        </>
      } />}
      {(can('/waiting-list') || can('/limited-projects')) && <Section title="Demand & Projects" detailLink={can('/limited-projects') ? '/limited-projects' : '/waiting-list'} cards={demandCards} />}
      {(can('/stock') || can('/purchase-orders')) && <Section title="Stock & Purchasing" detailLink={can('/purchase-orders') ? '/purchase-orders' : '/stock'} cards={stockCards} charts={
        <>
          {can('/stock') && <ChartCard title={stockCostView ? 'Stock cost over time' : 'Stock value over time'} hint={stockCostView ? 'cost KD' : 'retail KD'} link="/stock">
            <LineChart data={charts.stockHistory} color="#1e293b" fmt={kdC} />
          </ChartCard>}
          {can('/purchase-orders') && <ChartCard title="Supplier balance by brand" hint="outstanding KD" link="/purchase-orders">
            <BarChart data={charts.supplierByBrand} fmt={kdC} barColor="#e11d48" />
          </ChartCard>}
        </>
      } />}
      {can('/attendance') && <WhoAtWork />}
      {(can('/hr') || can('/attendance')) && <Section title="HR & Attendance" detailLink={can('/attendance') ? '/attendance' : '/hr'} cards={hrCards} />}
      {can('/repairs') && <Section title="Repair Watches" detailLink="/repairs" cards={repairCards} charts={
        <ChartCard title="Repairs by status" hint="open cases" link="/repairs">
          <BarChart data={charts.repairsByStatus} barColor="#2563eb" />
        </ChartCard>
      } />}
      {(can('/instagram') || can('/content')) && <Section title="Marketing" detailLink={can('/instagram') ? '/instagram' : '/content'} cards={marketingCards} charts={
        can('/instagram') ? (
          <>
            <ChartCard title="Instagram accounts" hint="followers · Δ today · days idle" link="/instagram">
              <IgComparison accounts={charts.igAccounts} />
            </ChartCard>
            <ChartCard title="Top posts (30d)" hint="@timekeeperkw · by engagement" link="/instagram">
              <IgTopPosts posts={charts.igTopPosts} />
            </ChartCard>
            {charts.igSeries.map((s) => (
              <ChartCard key={s.username} title="Followers trend" hint={`@${s.username}`} link="/instagram">
                <LineChart data={s.points} color={IG_COLOR[s.username] ?? '#db2777'} />
              </ChartCard>
            ))}
          </>
        ) : undefined
      } />}

      {/* Alerts & Actions — cross-cutting operational risks, managers only */}
      {isManager && (<>
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
      </>)}
    </div>
  );
}
