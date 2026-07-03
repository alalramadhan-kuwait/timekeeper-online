import { useMemo, useState } from 'react';
import { X, Upload, Trash2 as TrashIcon } from 'lucide-react';
import { CrudModule, CrudConfig } from '../components/CrudModule';
import { StatusBadge, Badge } from '../components/ui';
import { formatKD } from '../lib/format';
import { expiryTier, tierClass, tierLabel } from '../lib/expiry';
import { supabase } from '../lib/supabase';

const salesRoles = (r: string | null) => ['admin', 'manager', 'staff'].includes(r ?? '');
const purchasingRoles = (r: string | null) => ['admin', 'manager'].includes(r ?? '');
const hrRoles = (r: string | null) => ['admin', 'hr'].includes(r ?? '');

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
  title: 'Supplier Payments & Inbound',
  description: 'Supplier payments, balances and inbound shipments. Stock receiving stays in Lightspeed — this page tracks the money side.',
  canWrite: purchasingRoles,
  statusField: 'status',
  statusOptions: PO_STATUSES,
  searchKeys: ['po_number', 'supplier', 'brand', 'notes'],
  extraFilters: [
    { key: 'supplier', label: 'Supplier' },
    { key: 'brand', label: 'Brand' },
    { key: 'po_type', label: 'Type', options: ['PO', 'Inbound'] },
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
  ],
  rowClickToEdit: true,
};
export const PurchaseOrdersPage = () => <CrudModule config={purchaseOrders} />;

/* ---------------- Consignments ---------------- */
const consignments: CrudConfig = {
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
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'full_name', label: 'Employee' },
    { key: 'job_title', label: 'Job title' },
    { key: 'location', label: 'Location' },
    { key: 'civil_id', label: 'Civil ID' },
    { key: 'residency_expiry', label: 'Residency expiry', render: (r) => <ExpiryCell date={r.residency_expiry} /> },
    { key: 'work_permit_expiry', label: 'Work permit expiry', render: (r) => <ExpiryCell date={r.work_permit_expiry} /> },
    { key: 'phone', label: 'Phone' },
    { key: 'joining_date', label: 'Joined' },
    { key: 'status', label: 'Status' },
  ],
};
export const EmployeesPage = () => <CrudModule config={employees} />;

/* ---------------- Company documents ---------------- */
const companyDocs: CrudConfig = {
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
    { key: 'outlet', label: 'Outlet', type: 'text', placeholder: 'e.g. Avenues, all outlets' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [],
};

export function LimitedProjectsPage() {
  const [photoModal, setPhotoModal] = useState<PhotoModalRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
      { key: 'launch_date', label: 'Launch', render: (r) => <ExpiryCell date={r.launch_date} /> },
      { key: 'outlet', label: 'Outlet' },
    ],
  }), []);

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
    </>
  );
}
