import { useEffect, useMemo, useState } from 'react';
import { X, Upload, Trash2 as TrashIcon } from 'lucide-react';
import { CrudModule, CrudConfig } from '../components/CrudModule';
import { StatusBadge, Badge } from '../components/ui';
import { formatKD } from '../lib/format';
import { expiryTier, tierClass, tierLabel } from '../lib/expiry';
import { supabase } from '../lib/supabase';

const salesRoles = (r: string | null) => ['admin', 'manager', 'staff', 'sales'].includes(r ?? '');
const purchasingRoles = (r: string | null) => ['admin', 'manager', 'operations'].includes(r ?? '');
const hrRoles = (r: string | null) => ['admin', 'hr'].includes(r ?? '');
const marketingRoles = (r: string | null) => ['admin', 'manager', 'marketing'].includes(r ?? '');

/* ---------------- Content Planner (Marketing) ---------------- */
const CONTENT_STATUSES = ['Idea', 'In progress', 'Waiting approval', 'Approved', 'Scheduled', 'Posted', 'Cancelled'];
const CONTENT_STATUS_COLOR: Record<string, string> = {
  Idea: 'bg-slate-100 text-slate-600',
  'In progress': 'bg-blue-100 text-blue-700',
  'Waiting approval': 'bg-amber-100 text-amber-700',
  Approved: 'bg-teal-100 text-teal-700',
  Scheduled: 'bg-violet-100 text-violet-700',
  Posted: 'bg-emerald-100 text-emerald-700',
  Cancelled: 'bg-rose-100 text-rose-600',
};
const contentTasks: CrudConfig = {
  table: 'content_tasks',
  title: 'Content Planner',
  description: 'Plan and track content from idea to posted — mainly for Instagram (@timekeeperkw).',
  canWrite: marketingRoles,
  statusField: 'status',
  statusOptions: CONTENT_STATUSES,
  searchKeys: ['title', 'caption', 'owner', 'channel'],
  orderBy: { column: 'planned_date', ascending: true },
  extraFilters: [
    { key: 'content_type', label: 'Type', options: ['Post', 'Reel', 'Story', 'WhatsApp', 'Email', 'Event'] },
    { key: 'channel', label: 'Channel' },
    { key: 'owner', label: 'Owner' },
  ],
  fields: [
    { key: 'title', label: 'Content title', type: 'text', required: true },
    { key: 'content_type', label: 'Content type', type: 'select', options: ['Post', 'Reel', 'Story', 'WhatsApp', 'Email', 'Event'], defaultValue: 'Post' },
    { key: 'channel', label: 'Channel', type: 'combobox', defaultValue: 'Instagram' },
    { key: 'owner', label: 'Owner', type: 'combobox' },
    { key: 'planned_date', label: 'Planned date', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: CONTENT_STATUSES, defaultValue: 'Idea', required: true },
    { key: 'caption', label: 'Caption', type: 'textarea' },
    { key: 'asset_url', label: 'Asset / file', type: 'image', bucket: 'project-photos' },
    { key: 'approval_status', label: 'Approval status', type: 'select', options: ['Pending', 'Approved', 'Rejected'], defaultValue: 'Pending' },
    { key: 'posted_date', label: 'Posted date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'asset_url', label: '', render: (r) => r.asset_url
      ? <img src={r.asset_url} alt="" className="h-9 w-9 object-cover rounded-md border border-slate-200" />
      : <span className="text-slate-300 text-xs">—</span> },
    { key: 'title', label: 'Title', sortable: true },
    { key: 'content_type', label: 'Type', sortable: true, hideBelow: 'sm' },
    { key: 'channel', label: 'Channel', hideBelow: 'md' },
    { key: 'owner', label: 'Owner', sortable: true, hideBelow: 'lg' },
    { key: 'planned_date', label: 'Planned', sortable: true, render: (r) => <ExpiryCell date={r.planned_date} /> },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'posted_date', label: 'Posted', sortable: true, hideBelow: 'lg' },
  ],
  rowClickToEdit: true,
};

export function ContentPlannerPage() {
  const [view, setView] = useState<'list' | 'calendar'>('calendar');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tasks, setTasks] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase.from('content_tasks').select('id, title, content_type, planned_date, status')
      .then(({ data }) => setTasks(data ?? []));
  }, [refreshKey, view]);

  const config = useMemo<CrudConfig>(() => ({ ...contentTasks, onChanged: () => setRefreshKey((k) => k + 1) }), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          {(['calendar', 'list'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 capitalize ${view === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{v}</button>
          ))}
        </div>
        {view === 'calendar' && (
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
        )}
      </div>

      {view === 'calendar' && <ContentCalendar month={month} tasks={tasks} />}
      <CrudModule key={refreshKey} config={config} />
    </div>
  );
}

function ContentCalendar({ month, tasks }: { month: string; tasks: any[] }) {
  const first = new Date(`${month}-01T00:00:00`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const leadBlanks = (first.getDay() + 1) % 7; // grid starts Saturday (Kuwait week)
  const byDay = new Map<string, any[]>();
  for (const t of tasks) {
    if (!t.planned_date || t.planned_date.slice(0, 7) !== month) continue;
    const d = t.planned_date.slice(8, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(t);
  }
  const WD = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const cells: (number | null)[] = [...Array(leadBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WD.map((d) => <div key={d} className="text-[10px] font-semibold text-slate-400 uppercase text-center py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />;
          const dd = String(day).padStart(2, '0');
          const dateStr = `${month}-${dd}`;
          const items = byDay.get(dd) ?? [];
          return (
            <div key={i} className={`min-h-[68px] rounded-lg border p-1 ${dateStr === todayStr ? 'border-amber-400 bg-amber-50/40' : 'border-slate-100'}`}>
              <div className="text-[10px] text-slate-400 mb-0.5">{day}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((t) => (
                  <div key={t.id} className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${CONTENT_STATUS_COLOR[t.status] ?? 'bg-slate-100 text-slate-600'}`} title={`${t.title} · ${t.status}`}>
                    {t.title}
                  </div>
                ))}
                {items.length > 3 && <div className="text-[9px] text-slate-400">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Paid Ads Tracker (Marketing) ---------------- */
const AD_STATUSES = ['Planned', 'Waiting content', 'Waiting approval', 'Active', 'Completed', 'Paused', 'Cancelled'];
const AD_PLATFORMS = ['Instagram', 'Meta', 'Google', 'TikTok', 'Snapchat', 'Other'];
const paidAds: CrudConfig = {
  rowClickToEdit: true,
  table: 'paid_ads',
  title: 'Paid Ads Tracker',
  description: 'Ads we run for Timekeeper and paid contracts we run for external companies.',
  canWrite: marketingRoles,
  statusField: 'status',
  statusOptions: AD_STATUSES,
  searchKeys: ['ad_name', 'client_name', 'contract_ref', 'platform', 'product_brand', 'owner'],
  orderBy: { column: 'start_date', ascending: false },
  groupBy: 'client_type',
  extraFilters: [
    { key: 'client_type', label: 'Client', options: ['Timekeeper', 'External company'] },
    { key: 'platform', label: 'Platform', options: AD_PLATFORMS },
    { key: 'payment_status', label: 'Payment', options: ['Unpaid', 'Partially paid', 'Paid', 'Not applicable'] },
    { key: 'owner', label: 'Owner' },
  ],
  fields: [
    { key: 'ad_name', label: 'Ad name', type: 'text', required: true },
    { key: 'client_type', label: 'Client type', type: 'select', options: ['Timekeeper', 'External company'], defaultValue: 'Timekeeper', required: true },
    { key: 'client_name', label: 'Client name (if external)', type: 'combobox' },
    { key: 'contract_ref', label: 'Contract reference', type: 'text' },
    { key: 'platform', label: 'Platform', type: 'select', options: AD_PLATFORMS, defaultValue: 'Instagram' },
    { key: 'owner', label: 'Campaign owner', type: 'combobox' },
    { key: 'start_date', label: 'Start date', type: 'date' },
    { key: 'end_date', label: 'End date', type: 'date' },
    { key: 'budget', label: 'Budget (KD)', type: 'number' },
    { key: 'amount_charged', label: 'Amount charged to client (KD)', type: 'number' },
    { key: 'target_audience', label: 'Target audience', type: 'text' },
    { key: 'product_brand', label: 'Product / brand promoted', type: 'combobox' },
    { key: 'status', label: 'Ad status', type: 'select', options: AD_STATUSES, defaultValue: 'Planned', required: true },
    { key: 'payment_status', label: 'Payment status', type: 'select', options: ['Unpaid', 'Partially paid', 'Paid', 'Not applicable'], defaultValue: 'Unpaid' },
    { key: 'leads_generated', label: 'Leads generated', type: 'number' },
    { key: 'sales_linked', label: 'Sales linked (reference)', type: 'text' },
    { key: 'report_sent', label: 'Report sent to client', type: 'checkbox' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'ad_name', label: 'Ad', sortable: true },
    { key: 'client_name', label: 'Client', sortable: true, render: (r) => r.client_type === 'External company'
      ? <span>{r.client_name || '—'}</span>
      : <Badge className="bg-slate-100 text-slate-600 border-slate-200">Timekeeper</Badge> },
    { key: 'platform', label: 'Platform', sortable: true, hideBelow: 'sm' },
    { key: 'start_date', label: 'Start', sortable: true, hideBelow: 'md' },
    { key: 'end_date', label: 'End', sortable: true, hideBelow: 'lg', render: (r) => <ExpiryCell date={r.end_date} /> },
    { key: 'budget', label: 'Budget', sortable: true, hideBelow: 'md', render: (r) => kd(r.budget) },
    { key: 'amount_charged', label: 'Charged', sortable: true, render: (r) => r.client_type === 'External company' ? kd(r.amount_charged) : <span className="text-slate-300 text-xs">—</span> },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'payment_status', label: 'Payment', sortable: true, hideBelow: 'lg', render: (r) => {
      const cls = r.payment_status === 'Paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
        : r.payment_status === 'Partially paid' ? 'bg-amber-100 text-amber-700 border-amber-200'
        : r.payment_status === 'Not applicable' ? 'bg-slate-100 text-slate-500 border-slate-200'
        : 'bg-rose-100 text-rose-600 border-rose-200';
      return <Badge className={cls}>{r.payment_status ?? 'Unpaid'}</Badge>;
    } },
    { key: 'leads_generated', label: 'Leads', sortable: true, hideBelow: 'xl' },
    { key: 'report_sent', label: 'Report', hideBelow: 'xl', render: (r) => r.report_sent ? '✓' : <span className="text-amber-600 text-xs">Pending</span> },
  ],
};
export const PaidAdsPage = () => <CrudModule config={paidAds} />;

/* ---------------- Repair Watches (Operations) ---------------- */
const REPAIR_STATUSES = [
  'Received', 'Under inspection', 'Waiting customer approval', 'Sent to supplier / brand',
  'Under repair', 'Ready for pickup', 'Returned to customer', 'Cancelled',
];
const repairWatches: CrudConfig = {
  table: 'repair_watches',
  title: 'Repair Watches',
  description: 'Watches received from customers for repair or service — from intake to return.',
  canWrite: purchasingRoles,
  statusField: 'status',
  statusOptions: REPAIR_STATUSES,
  searchKeys: ['repair_id', 'customer_name', 'customer_phone', 'brand', 'model', 'serial_number', 'issue'],
  orderBy: { column: 'date_received', ascending: false },
  extraFilters: [
    { key: 'brand', label: 'Brand' },
    { key: 'assigned_to', label: 'Assigned' },
    { key: 'repair_location', label: 'Location', options: ['In-store', 'Supplier', 'Brand', 'Workshop'] },
  ],
  beforeSave: (p) => {
    if (!p.repair_id) p.repair_id = `RW-${Date.now().toString().slice(-6)}`;
    return p;
  },
  fields: [
    { key: 'repair_id', label: 'Repair ID (blank = auto)', type: 'text' },
    { key: 'date_received', label: 'Date received', type: 'date', required: true },
    { key: 'customer_name', label: 'Customer name', type: 'text', required: true },
    { key: 'customer_phone', label: 'Customer phone', type: 'text' },
    { key: 'brand', label: 'Watch brand', type: 'combobox' },
    { key: 'model', label: 'Watch model', type: 'text' },
    { key: 'serial_number', label: 'Serial number', type: 'text' },
    { key: 'issue', label: 'Issue / customer complaint', type: 'textarea' },
    { key: 'received_by', label: 'Received by (staff)', type: 'combobox' },
    { key: 'status', label: 'Status', type: 'select', options: REPAIR_STATUSES, defaultValue: 'Received', required: true },
    { key: 'assigned_to', label: 'Assigned person', type: 'combobox' },
    { key: 'repair_location', label: 'Repair location', type: 'select', options: ['In-store', 'Supplier', 'Brand', 'Workshop'] },
    { key: 'estimated_completion', label: 'Estimated completion', type: 'date' },
    { key: 'cost_estimate', label: 'Cost estimate (KD)', type: 'number' },
    { key: 'customer_approval', label: 'Customer approval', type: 'select', options: ['Pending', 'Approved', 'Declined', 'Not needed'], defaultValue: 'Pending' },
    { key: 'final_cost', label: 'Final cost (KD)', type: 'number' },
    { key: 'date_returned', label: 'Date returned to customer', type: 'date' },
    { key: 'photo_url', label: 'Photo of watch condition', type: 'image', bucket: 'project-photos' },
    { key: 'notes', label: 'Notes / remarks', type: 'textarea' },
  ],
  columns: [
    { key: 'photo_url', label: 'Photo', render: (r) => r.photo_url
      ? <img src={r.photo_url} alt="" className="h-10 w-10 object-cover rounded-md border border-slate-200" />
      : <span className="text-slate-300 text-xs">—</span> },
    { key: 'repair_id', label: 'Repair ID', sortable: true },
    { key: 'customer_name', label: 'Customer', sortable: true },
    { key: 'brand', label: 'Brand', sortable: true, hideBelow: 'sm' },
    { key: 'model', label: 'Model', hideBelow: 'lg' },
    { key: 'date_received', label: 'Received', sortable: true, hideBelow: 'md' },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'assigned_to', label: 'Assigned', hideBelow: 'lg' },
    { key: 'estimated_completion', label: 'ETA', sortable: true, hideBelow: 'md', render: (r) => <ExpiryCell date={r.estimated_completion} /> },
    { key: 'final_cost', label: 'Cost', sortable: true, hideBelow: 'sm', render: (r) => r.final_cost != null ? kd(r.final_cost) : (r.cost_estimate != null ? <span className="text-slate-400">~{kd(r.cost_estimate)}</span> : '—') },
  ],
  rowClickToEdit: true,
};
export const RepairWatchesPage = () => <CrudModule config={repairWatches} />;

const kd = (v: number | null | undefined) => (v == null ? '—' : `${formatKD(Number(v))} KD`);

function ExpiryCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const tier = expiryTier(date);
  return (
    <span className="flex items-center gap-2">
      <span>{date}</span>
      {tier !== 'ok' && <Badge className={tierClass[tier]}>{tierLabel[tier]}</Badge>}
    </span>
  );
}

/* ---------------- Demand List (Waiting + Pre-Orders) ---------------- */
const DEMAND_STATUSES = ['Open', 'Contacted', 'Confirmed', 'Deposit paid', 'Ordered', 'Arrived', 'Delivered', 'Converted', 'Cancelled'];

const demandListBase: CrudConfig = {
  rowClickToEdit: true,
  table: 'waiting_list',
  title: 'Demand List',
  description: 'Waiting list and pre-orders in one place — track customer demand before stock arrives.',
  canWrite: salesRoles,
  statusField: 'status',
  statusOptions: DEMAND_STATUSES,
  searchKeys: ['customer_name', 'phone', 'brand', 'product', 'model', 'staff_responsible'],
  fields: [
    { key: 'list_type', label: 'Type', type: 'select', options: ['Waiting List', 'Pre-Order'], defaultValue: 'Waiting List', required: true },
    { key: 'customer_name', label: 'Customer name', type: 'text', required: true },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'brand', label: 'Brand', type: 'text' },
    { key: 'product', label: 'Product requested', type: 'text' },
    { key: 'model', label: 'Specific model', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: DEMAND_STATUSES, defaultValue: 'Open', required: true },
    { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'], defaultValue: 'Medium', required: true },
    { key: 'staff_responsible', label: 'Staff responsible', type: 'text' },
    { key: 'follow_up_date', label: 'Follow-up due (waiting list)', type: 'date' },
    { key: 'expected_availability', label: 'Expected availability', type: 'text', placeholder: 'e.g. Mid July / next shipment' },
    { key: 'deposit_paid', label: 'Deposit paid (KD)', type: 'number' },
    { key: 'total_price', label: 'Total expected price (KD)', type: 'number' },
    { key: 'expected_arrival', label: 'Expected arrival (pre-order)', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'list_type', label: 'Type', render: (r) => <Badge className={r.list_type === 'Pre-Order' ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-blue-100 text-blue-700 border-blue-200'}>{r.list_type ?? 'Waiting List'}</Badge> },
    { key: 'customer_name', label: 'Customer' },
    { key: 'phone', label: 'Phone' },
    { key: 'brand', label: 'Brand' },
    { key: 'product', label: 'Product' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'follow_up_date', label: 'Follow-up', render: (r) => r.follow_up_date ? <ExpiryCell date={r.follow_up_date} /> : <span className="text-slate-400">—</span> },
    { key: 'expected_arrival', label: 'Expected arrival', render: (r) => r.expected_arrival ? <ExpiryCell date={r.expected_arrival} /> : <span className="text-slate-400">—</span> },
    { key: 'deposit_paid', label: 'Deposit', render: (r) => r.deposit_paid != null ? kd(r.deposit_paid) : <span className="text-slate-400">—</span> },
    { key: 'staff_responsible', label: 'Staff' },
  ],
};

type ListTypeFilter = 'All' | 'Waiting List' | 'Pre-Order';

export function DemandListPage() {
  const [listType, setListType] = useState<ListTypeFilter>('All');

  const config = useMemo<CrudConfig>(() => ({
    ...demandListBase,
    filter: listType === 'All' ? undefined : (row) => (row.list_type ?? 'Waiting List') === listType,
    toolbarExtra: (
      <div className="flex gap-1 rounded-lg border border-slate-300 p-0.5 bg-white">
        {(['All', 'Waiting List', 'Pre-Order'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setListType(t)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${listType === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {t}
          </button>
        ))}
      </div>
    ),
  }), [listType]);

  return <CrudModule config={config} />;
}

/** Alias so /pre-orders route still resolves */
export const WaitingListPage = DemandListPage;
export const PreOrdersPage = DemandListPage;

/* ---------------- Purchase orders ---------------- */
const PO_STATUSES = ['Open', 'Sent', 'Dispatched', 'Partially received', 'Received', 'Cancelled', 'Returned'];
const purchaseOrders: CrudConfig = {
  table: 'purchase_orders',
  title: 'Supplier Payments & PO Tracking',
  description: 'Supplier payments, balances and inbound shipments. Stock receiving stays in Lightspeed — this page tracks the money side.',
  canWrite: purchasingRoles,
  statusField: 'status',
  statusOptions: PO_STATUSES,
  searchKeys: ['po_number', 'supplier', 'brand', 'notes'],
  extraFilters: [
    { key: 'supplier', label: 'Supplier' },
    { key: 'brand', label: 'Brand' },
    { key: 'po_type', label: 'Type', options: ['PO', 'Inbound'] },
    { key: 'linked_project', label: 'Project' },
  ],
  fields: [
    { key: 'po_number', label: 'PO number', type: 'text', required: true },
    { key: 'supplier', label: 'Supplier', type: 'combobox' },
    { key: 'brand', label: 'Brand', type: 'combobox' },
    { key: 'po_type', label: 'Type', type: 'select', options: ['PO', 'Inbound'], defaultValue: 'PO', required: true },
    { key: 'created_date', label: 'Created date', type: 'date' },
    { key: 'item_count', label: 'Item count', type: 'number', defaultValue: 0 },
    { key: 'total_cost', label: 'Total cost (KD)', type: 'number', defaultValue: 0 },
    { key: 'amount_paid', label: 'Amount paid (KD)', type: 'number', defaultValue: 0 },
    { key: 'status', label: 'Status', type: 'select', options: PO_STATUSES, defaultValue: 'Open', required: true },
    { key: 'shipment_status', label: 'Shipment status', type: 'text', placeholder: 'e.g. At customs / DHL in transit' },
    { key: 'expected_arrival', label: 'Expected arrival', type: 'date' },
    { key: 'invoice_received', label: 'Invoice received', type: 'checkbox' },
    { key: 'team_notified', label: 'Team notified', type: 'checkbox' },
    { key: 'linked_project', label: 'Limited project', type: 'select', options: [] }, // options filled at runtime
    { key: 'update_date', label: 'Last update date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'po_number', label: 'PO #', sortable: true },
    { key: 'supplier', label: 'Supplier', sortable: true },
    { key: 'brand', label: 'Brand', sortable: true },
    { key: 'po_type', label: 'Type', sortable: true },
    { key: 'item_count', label: 'Items', sortable: true },
    { key: 'total_cost', label: 'Total', sortable: true, render: (r) => kd(r.total_cost) },
    { key: 'balance', label: 'Balance', sortable: true, sortValue: (r) => Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0), render: (r) => kd(Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0)) },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'shipment_status', label: 'Shipment' },
    { key: 'expected_arrival', label: 'Expected', sortable: true, render: (r) => <ExpiryCell date={r.expected_arrival} /> },
    { key: 'invoice_received', label: 'Invoice', render: (r) => (r.invoice_received ? '✓' : <span className="text-amber-600">Pending</span>) },
    { key: 'linked_project', label: 'Project', sortable: true, render: (r) => r.linked_project
      ? <Badge className="bg-violet-100 text-violet-700 border-violet-200">{r.linked_project}</Badge>
      : <span className="text-slate-300 text-xs">—</span> },
  ],
  rowClickToEdit: true,
};

/** A PO is finished when it's been received (or closed) and nothing is still owed. */
const poIsCompleted = (r: Record<string, any>) => {
  const balance = Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0);
  return ['Received', 'Cancelled', 'Returned'].includes(r.status) && balance <= 0;
};

export function PurchaseOrdersPage() {
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  useEffect(() => {
    supabase.from('limited_projects').select('project_name').order('project_name')
      .then(({ data }) => setProjectNames((data ?? []).map((p: any) => p.project_name).filter(Boolean)));
  }, []);

  const withProjects = useMemo<CrudConfig>(() => ({
    ...purchaseOrders,
    fields: purchaseOrders.fields.map((f) =>
      f.key === 'linked_project' ? { ...f, options: projectNames } : f),
  }), [projectNames]);

  // Active POs — grouped by brand so the financial picture reads per brand
  const activeConfig = useMemo<CrudConfig>(() => ({
    ...withProjects,
    title: 'Supplier Payments & PO Tracking',
    description: 'Open POs and inbound shipments, grouped by brand. Stock receiving stays in Lightspeed — this page tracks the money side.',
    groupBy: 'brand',
    filter: (r) => !poIsCompleted(r),
  }), [withProjects]);

  // Completed POs — received and fully paid, kept out of the way
  const completedConfig = useMemo<CrudConfig>(() => ({
    ...withProjects,
    title: 'Completed POs',
    description: 'Received / closed and fully paid — kept here for reference.',
    groupBy: 'brand',
    filter: (r) => poIsCompleted(r),
  }), [withProjects]);

  return (
    <div className="space-y-6">
      <CrudModule config={activeConfig} />
      <div>
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium mb-2"
        >
          {showCompleted ? '▾' : '▸'} Completed POs (received & fully paid)
        </button>
        {showCompleted && <CrudModule config={completedConfig} />}
      </div>
    </div>
  );
}

/* ---------------- Consignments ---------------- */
const consignments: CrudConfig = {
  rowClickToEdit: true,
  table: 'consignments',
  title: 'Consignments Out',
  description: 'Items given to others for sale or display.',
  canWrite: purchasingRoles,
  statusField: 'status',
  statusOptions: ['With consignee', 'Sold', 'Returned', 'Pending payment'],
  searchKeys: ['consignee_name', 'brand_item', 'model_detail'],
  fields: [
    { key: 'consignee_name', label: 'Consignee name', type: 'text', required: true },
    { key: 'brand_item', label: 'Brand / item', type: 'text' },
    { key: 'model_detail', label: 'Model / detail', type: 'text' },
    { key: 'price', label: 'Price (KD)', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: ['With consignee', 'Sold', 'Returned', 'Pending payment'], defaultValue: 'With consignee', required: true },
    { key: 'date_given', label: 'Date given', type: 'date' },
    { key: 'date_closed', label: 'Date returned / sold', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'consignee_name', label: 'Consignee' },
    { key: 'brand_item', label: 'Brand / Item' },
    { key: 'model_detail', label: 'Model' },
    { key: 'price', label: 'Price', render: (r) => kd(r.price) },
    { key: 'status', label: 'Status' },
    { key: 'date_given', label: 'Given' },
    { key: 'date_closed', label: 'Returned / Sold' },
  ],
};
export const ConsignmentsPage = () => <CrudModule config={consignments} />;

/* ---------------- VIP customers ---------------- */
const csv = {
  parse: (v: any) => (v ? String(v).split(',').map((s: string) => s.trim()).filter(Boolean) : []),
  display: (v: any) => (Array.isArray(v) ? v.join(', ') : v ?? ''),
};
const occasionsField = {
  parse: (v: any) =>
    v
      ? String(v).split('\n').map((line: string) => {
          const m = line.trim().match(/^(\d{4}-\d{2}-\d{2}|\d{2}-\d{2})\s+(.*)$/);
          return m ? { date: m[1], label: m[2] } : { date: '', label: line.trim() };
        }).filter((o: any) => o.label)
      : [],
  display: (v: any) => (Array.isArray(v) ? v.map((o: any) => `${o.date} ${o.label}`.trim()).join('\n') : ''),
};
const vipCustomers: CrudConfig = {
  rowClickToEdit: true,
  table: 'customers',
  title: 'VIP Customers',
  description: 'Important customers, preferences, birthdays and occasions.',
  canWrite: salesRoles,
  searchKeys: ['display_name', 'contact', 'customer_type', 'staff_responsible'],
  orderBy: { column: 'display_name', ascending: true },
  fields: [
    { key: 'display_name', label: 'Customer name', type: 'text', required: true },
    { key: 'contact', label: 'Phone number', type: 'text', required: true },
    { key: 'customer_type', label: 'Customer type', type: 'select', options: ['VIP', 'Regular', 'Collector', 'Reseller', 'New'] },
    { key: 'is_vip', label: 'VIP', type: 'checkbox', defaultValue: true },
    { key: 'preferred_brands', label: 'Preferred brands (comma separated)', type: 'text', ...csv },
    { key: 'birthday', label: 'Birthday', type: 'date' },
    { key: 'occasions', label: 'Occasions (one per line: MM-DD Occasion)', type: 'textarea', ...occasionsField },
    { key: 'staff_responsible', label: 'Staff responsible', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'instagram', label: 'Instagram', type: 'text' },
    { key: 'personal_notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'display_name', label: 'Customer' },
    { key: 'contact', label: 'Phone' },
    { key: 'customer_type', label: 'Type', render: (r) => r.customer_type ? <StatusBadge value={r.customer_type} /> : '—' },
    { key: 'preferred_brands', label: 'Preferred brands', render: (r) => (r.preferred_brands ?? []).join(', ') || '—' },
    { key: 'birthday', label: 'Birthday' },
    { key: 'occasions', label: 'Occasions', render: (r) => (Array.isArray(r.occasions) ? r.occasions.map((o: any) => o.label).join(', ') : '—') || '—' },
    { key: 'staff_responsible', label: 'Staff' },
  ],
};
export const VipCustomersPage = () => <CrudModule config={vipCustomers} />;

/* ---------------- Employees (HR) ---------------- */
const employees: CrudConfig = {
  table: 'employees',
  title: 'HR — Employees',
  description: 'Employee records, residency and work permit expiry.',
  canWrite: hrRoles,
  statusField: 'status',
  statusOptions: ['Active', 'On leave', 'Resigned', 'Terminated'],
  searchKeys: ['full_name', 'civil_id', 'passport_number', 'job_title', 'phone'],
  orderBy: { column: 'full_name', ascending: true },
  stampCreatedBy: false,
  fields: [
    { key: 'full_name', label: 'Employee name', type: 'text', required: true },
    { key: 'civil_id', label: 'Civil ID', type: 'text' },
    { key: 'passport_number', label: 'Passport number', type: 'text' },
    { key: 'residency_expiry', label: 'Residency expiry', type: 'date' },
    { key: 'work_permit_expiry', label: 'Work permit expiry', type: 'date' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'job_title', label: 'Job title', type: 'text' },
    { key: 'joining_date', label: 'Joining date', type: 'date' },
    { key: 'location', label: 'Location', type: 'select', options: ['Timekeeper HQ', 'Avenues', 'Time Gallery'] },
    { key: 'status', label: 'Status', type: 'select', options: ['Active', 'On leave', 'Resigned', 'Terminated'], defaultValue: 'Active', required: true },
    { key: 'annual_leave_entitlement', label: 'Annual leave days', type: 'number', defaultValue: 30 },
    { key: 'user_id', label: 'Linked user account (for My Portal)', type: 'select', options: [] }, // filled at runtime
    { key: 'portal_enabled', label: 'Portal enabled', type: 'checkbox', defaultValue: true },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [],
};

/** HR Employees is the master list — accounts are linked manually here, never by name matching. */
export function EmployeesPage() {
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; role: string }[]>([]);
  useEffect(() => {
    supabase.from('profiles').select('id, full_name, role').order('full_name')
      .then(({ data }) => setProfiles((data as { id: string; full_name: string; role: string }[]) ?? []));
  }, []);
  const profById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const config = useMemo<CrudConfig>(() => ({
    ...employees,
    fields: employees.fields.map((f) =>
      f.key === 'user_id'
        ? { ...f, options: [{ value: '', label: '— not linked —' }, ...profiles.map((p) => ({ value: p.id, label: `${p.full_name} (${p.role})` }))] }
        : f),
    columns: [
      { key: 'full_name', label: 'Employee', sortable: true },
      { key: 'job_title', label: 'Job title', sortable: true, hideBelow: 'sm' },
      { key: 'location', label: 'Location', sortable: true, hideBelow: 'md' },
      {
        key: 'portal', label: 'Portal', sortable: true,
        sortValue: (r) => (r.user_id ? (r.portal_enabled ? 2 : 1) : 0),
        render: (r) => {
          if (!r.user_id) return <Badge className="bg-slate-100 text-slate-500 border-slate-200">Not linked</Badge>;
          const p = profById.get(r.user_id);
          return (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Badge className={r.portal_enabled ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>
                {r.portal_enabled ? 'Linked' : 'Linked · portal off'}
              </Badge>
              {p && <span className="text-xs text-slate-400 capitalize">{p.role}</span>}
            </span>
          );
        },
      },
      { key: 'residency_expiry', label: 'Residency', sortable: true, hideBelow: 'lg', render: (r) => <ExpiryCell date={r.residency_expiry} /> },
      { key: 'work_permit_expiry', label: 'Work permit', sortable: true, hideBelow: 'lg', render: (r) => <ExpiryCell date={r.work_permit_expiry} /> },
      { key: 'civil_id', label: 'Civil ID', hideBelow: 'xl' },
      { key: 'phone', label: 'Phone', hideBelow: 'xl' },
      { key: 'joining_date', label: 'Joined', sortable: true, hideBelow: 'xl' },
      { key: 'status', label: 'Status', sortable: true },
    ],
    rowClickToEdit: true,
  }), [profiles, profById]);

  return <CrudModule config={config} />;
}

/* ---------------- Company documents ---------------- */
const companyDocs: CrudConfig = {
  rowClickToEdit: true,
  table: 'company_documents',
  title: 'Company Documents',
  description: 'Licenses, lease, insurance and other papers with expiry tracking.',
  canWrite: hrRoles,
  statusField: 'renewal_status',
  statusOptions: ['Valid', 'Renewal in progress', 'Expired'],
  searchKeys: ['doc_name', 'doc_type', 'responsible_person'],
  orderBy: { column: 'expiry_date', ascending: true },
  stampCreatedBy: false,
  fields: [
    { key: 'doc_name', label: 'Document name', type: 'text', required: true },
    { key: 'doc_type', label: 'Document type', type: 'select', options: ['Commercial license', 'Fire license', 'Lease contract', 'Insurance', 'Authorized signatory', 'Municipality', 'Other'] },
    { key: 'issue_date', label: 'Issue date', type: 'date' },
    { key: 'expiry_date', label: 'Expiry date', type: 'date' },
    { key: 'responsible_person', label: 'Responsible person', type: 'text' },
    { key: 'renewal_status', label: 'Renewal status', type: 'select', options: ['Valid', 'Renewal in progress', 'Expired'], defaultValue: 'Valid', required: true },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'doc_name', label: 'Document' },
    { key: 'doc_type', label: 'Type' },
    { key: 'issue_date', label: 'Issued' },
    { key: 'expiry_date', label: 'Expiry', render: (r) => <ExpiryCell date={r.expiry_date} /> },
    { key: 'responsible_person', label: 'Responsible' },
    { key: 'renewal_status', label: 'Status' },
  ],
};
export const CompanyDocsPage = () => <CrudModule config={companyDocs} />;

/* ---------------- Limited Watch Projects ---------------- */
const LP_STATUSES = ['Upcoming', 'Confirmed', 'Received', 'Selling', 'Sold Out', 'Cancelled'];

interface PhotoModalRecord { id: string; photo_url: string; project_name: string }

function PhotoModal({ record, onClose, onPhotoChanged }: {
  record: PhotoModalRecord;
  onClose: () => void;
  onPhotoChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(record.photo_url);

  async function handleReplace(file: File) {
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `limited-projects/${record.id}-${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('project-photos').upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('project-photos').getPublicUrl(data.path);
      await supabase.from('limited_projects').update({ photo_url: urlData.publicUrl }).eq('id', record.id);
      setCurrentUrl(urlData.publicUrl);
      onPhotoChanged();
    }
    setUploading(false);
  }

  async function handleRemove() {
    await supabase.from('limited_projects').update({ photo_url: null }).eq('id', record.id);
    onPhotoChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <span className="font-semibold text-slate-800 text-sm truncate">{record.project_name}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 ml-3 shrink-0"><X size={18} /></button>
        </div>
        {/* Photo */}
        <div className="bg-slate-100 flex items-center justify-center min-h-56 max-h-[60vh] overflow-hidden">
          <img src={currentUrl} alt={record.project_name} className="max-h-[60vh] max-w-full object-contain" />
        </div>
        {/* Actions */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-100 bg-white">
          <label className={`flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium cursor-pointer hover:bg-slate-700 transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <Upload size={14} />
            {uploading ? 'Uploading…' : 'Change photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplace(f); }} />
          </label>
          <button onClick={handleRemove} disabled={uploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 transition-colors disabled:opacity-60">
            <TrashIcon size={14} /> Remove photo
          </button>
        </div>
      </div>
    </div>
  );
}

const lpBaseConfig: CrudConfig = {
  rowClickToEdit: true,
  table: 'limited_projects',
  title: 'Limited Watch Projects',
  description: 'Track all Timekeeper limited edition watch projects — allocation, pricing and status across the system.',
  canWrite: purchasingRoles,
  statusField: 'status',
  statusOptions: LP_STATUSES,
  searchKeys: ['project_name', 'brand', 'model_reference', 'outlet', 'notes'],
  orderBy: { column: 'launch_date', ascending: false },
  fields: [
    { key: 'photo_url', label: 'Project photo', type: 'image', bucket: 'project-photos' },
    { key: 'project_name', label: 'Project name', type: 'text', required: true },
    { key: 'brand', label: 'Brand', type: 'text' },
    { key: 'model_reference', label: 'Model / reference', type: 'text' },
    { key: 'edition_size', label: 'Total edition size', type: 'number' },
    { key: 'our_allocation', label: 'Our allocation (units)', type: 'number' },
    { key: 'price_kd', label: 'Price (KD)', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: LP_STATUSES, defaultValue: 'Upcoming', required: true },
    { key: 'launch_date', label: 'Launch date', type: 'date' },
    { key: 'expected_delivery', label: 'Expected delivery date', type: 'date' },
    { key: 'outlet', label: 'Outlet', type: 'text', placeholder: 'e.g. Avenues, all outlets' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [],
};

interface ProjectPO {
  po_number: string; supplier: string | null; status: string;
  total_cost: number; amount_paid: number; linked_project: string;
}
const PO_CLOSED = ['Received', 'Cancelled', 'Returned'];

export function LimitedProjectsPage() {
  const [photoModal, setPhotoModal] = useState<PhotoModalRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [projectPOs, setProjectPOs] = useState<Map<string, ProjectPO[]>>(new Map());
  const [poDetail, setPODetail] = useState<{ project: string; pos: ProjectPO[] } | null>(null);

  useEffect(() => {
    supabase.from('purchase_orders')
      .select('po_number, supplier, status, total_cost, amount_paid, linked_project')
      .not('linked_project', 'is', null)
      .then(({ data }) => {
        const map = new Map<string, ProjectPO[]>();
        for (const p of (data ?? []) as ProjectPO[]) {
          if (!map.has(p.linked_project)) map.set(p.linked_project, []);
          map.get(p.linked_project)!.push(p);
        }
        setProjectPOs(map);
      });
  }, [refreshKey]);

  const config = useMemo<CrudConfig>(() => ({
    ...lpBaseConfig,
    columns: [
      {
        key: 'photo_url', label: 'Photo',
        render: (r) => r.photo_url
          ? (
            <img
              src={r.photo_url}
              alt=""
              onClick={(e) => { e.stopPropagation(); setPhotoModal({ id: r.id, photo_url: r.photo_url, project_name: r.project_name ?? 'Project' }); }}
              className="h-10 w-14 object-cover rounded-md border border-slate-200 cursor-pointer hover:opacity-75 hover:ring-2 hover:ring-amber-400 transition-all"
              title="Click to preview"
            />
          )
          : <span className="text-slate-300 text-xs">—</span>,
      },
      { key: 'project_name', label: 'Project' },
      { key: 'brand', label: 'Brand' },
      { key: 'model_reference', label: 'Model / Ref' },
      { key: 'edition_size', label: 'Edition' },
      { key: 'our_allocation', label: 'Allocation' },
      { key: 'price_kd', label: 'Price', render: (r) => kd(r.price_kd) },
      { key: 'status', label: 'Status' },
      {
        key: 'po_summary', label: 'POs / Payments', sortable: true,
        sortValue: (r) => (projectPOs.get(r.project_name) ?? []).reduce((s, p) => s + Number(p.total_cost ?? 0) - Number(p.amount_paid ?? 0), 0),
        render: (r) => {
          const pos = projectPOs.get(r.project_name) ?? [];
          if (!pos.length) return <span className="text-slate-300 text-xs">—</span>;
          const open = pos.filter((p) => !PO_CLOSED.includes(p.status)).length;
          const total = pos.reduce((s, p) => s + Number(p.total_cost ?? 0), 0);
          const paid = pos.reduce((s, p) => s + Number(p.amount_paid ?? 0), 0);
          return (
            <button
              onClick={(e) => { e.stopPropagation(); setPODetail({ project: r.project_name, pos }); }}
              className="text-left hover:opacity-75"
              title="Click for PO details"
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <Badge className={open > 0 ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}>
                  {pos.length} PO{pos.length !== 1 ? 's' : ''}{open > 0 ? ` · ${open} open` : ''}
                </Badge>
              </div>
              <div className="text-xs whitespace-nowrap mt-0.5">
                <span className="text-emerald-600 font-medium">{kd(paid)}</span>
                <span className="text-slate-400"> / {kd(total)} KD</span>
                {total - paid > 0 && <span className="text-red-600 font-medium"> · {kd(total - paid)} due</span>}
              </div>
            </button>
          );
        },
      },
      { key: 'launch_date', label: 'Launch', sortable: true, render: (r) => <ExpiryCell date={r.launch_date} /> },
      {
        key: 'expected_delivery', label: 'Expected delivery', sortable: true,
        // overdue = delivery date passed while the project hasn't been received yet
        render: (r) => {
          const overdue = r.expected_delivery && r.expected_delivery < new Date().toISOString().slice(0, 10)
            && !['Received', 'Selling', 'Sold Out', 'Cancelled'].includes(r.status);
          if (!r.expected_delivery) return <span className="text-slate-300 text-xs">—</span>;
          return overdue
            ? <Badge className="bg-rose-100 text-rose-700 border-rose-200">{r.expected_delivery} · overdue</Badge>
            : <ExpiryCell date={r.expected_delivery} />;
        },
      },
      { key: 'outlet', label: 'Outlet' },
    ],
  }), [projectPOs]);

  return (
    <>
      <CrudModule key={refreshKey} config={config} />
      {photoModal && (
        <PhotoModal
          record={photoModal}
          onClose={() => setPhotoModal(null)}
          onPhotoChanged={() => { setRefreshKey((k) => k + 1); setPhotoModal(null); }}
        />
      )}
      {poDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPODetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{poDetail.project}</h3>
                <p className="text-xs text-slate-500">{poDetail.pos.length} linked purchase order{poDetail.pos.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setPODetail(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="overflow-auto divide-y divide-slate-100">
              {poDetail.pos.map((p, i) => {
                const bal = Number(p.total_cost ?? 0) - Number(p.amount_paid ?? 0);
                const isOpen = !PO_CLOSED.includes(p.status);
                return (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-slate-800 text-sm">{p.po_number}</span>
                      <StatusBadge value={p.status} />
                    </div>
                    {p.supplier && <p className="text-xs text-slate-500 mb-1">{p.supplier}</p>}
                    <div className="flex items-center gap-4 text-xs whitespace-nowrap">
                      <span className="text-slate-500">Total <b className="text-slate-800">{kd(p.total_cost)}</b></span>
                      <span className="text-slate-500">Paid <b className="text-emerald-600">{kd(p.amount_paid)}</b></span>
                      <span className="text-slate-500">Balance <b className={bal > 0 ? 'text-red-600' : 'text-slate-400'}>{kd(bal)}</b></span>
                      {isOpen && <Badge className="bg-blue-100 text-blue-700 border-blue-200">Open</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0 flex flex-wrap justify-between items-center gap-2 text-xs">
              <div className="text-slate-500 whitespace-nowrap">
                Total <b className="text-slate-800">{kd(poDetail.pos.reduce((s, p) => s + Number(p.total_cost ?? 0), 0))}</b>
                {' · '}Paid <b className="text-emerald-700">{kd(poDetail.pos.reduce((s, p) => s + Number(p.amount_paid ?? 0), 0))}</b>
                {' · '}Due <b className="text-red-600">{kd(poDetail.pos.reduce((s, p) => s + Number(p.total_cost ?? 0) - Number(p.amount_paid ?? 0), 0))}</b> KD
              </div>
              <a href="#/purchase-orders" onClick={() => setPODetail(null)} className="text-blue-600 hover:underline">Open Supplier Payments →</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
