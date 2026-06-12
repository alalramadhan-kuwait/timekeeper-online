import { CrudModule, CrudConfig } from '../components/CrudModule';
import { StatusBadge, Badge } from '../components/ui';
import { formatKD } from '../lib/format';
import { expiryTier, tierClass, tierLabel } from '../lib/expiry';

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

/* ---------------- Waiting list ---------------- */
const waitingList: CrudConfig = {
  table: 'waiting_list',
  title: 'Waiting List',
  description: 'Customers waiting for products — real demand before ordering stock.',
  canWrite: salesRoles,
  statusField: 'status',
  statusOptions: ['Open', 'Contacted', 'Converted', 'Cancelled'],
  searchKeys: ['customer_name', 'phone', 'brand', 'product', 'model', 'staff_responsible'],
  fields: [
    { key: 'customer_name', label: 'Customer name', type: 'text', required: true },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'brand', label: 'Brand', type: 'text' },
    { key: 'product', label: 'Product requested', type: 'text' },
    { key: 'model', label: 'Specific model', type: 'text' },
    { key: 'expected_availability', label: 'Expected availability', type: 'text', placeholder: 'e.g. Mid July / next shipment' },
    { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'], defaultValue: 'Medium', required: true },
    { key: 'staff_responsible', label: 'Staff responsible', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Contacted', 'Converted', 'Cancelled'], defaultValue: 'Open', required: true },
    { key: 'follow_up_date', label: 'Follow-up due', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'customer_name', label: 'Customer' },
    { key: 'phone', label: 'Phone' },
    { key: 'brand', label: 'Brand' },
    { key: 'product', label: 'Product' },
    { key: 'model', label: 'Model' },
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
    { key: 'follow_up_date', label: 'Follow-up', render: (r) => <ExpiryCell date={r.follow_up_date} /> },
    { key: 'staff_responsible', label: 'Staff' },
  ],
};
export const WaitingListPage = () => <CrudModule config={waitingList} />;

/* ---------------- Pre-orders ---------------- */
const PRE_STATUSES = ['Pending confirmation', 'Confirmed', 'Deposit paid', 'Ordered', 'Arrived', 'Delivered', 'Cancelled'];
const preOrders: CrudConfig = {
  table: 'pre_orders',
  title: 'Pre-Orders',
  description: 'Customer commitments for products before arrival.',
  canWrite: salesRoles,
  statusField: 'status',
  statusOptions: PRE_STATUSES,
  searchKeys: ['customer_name', 'phone', 'brand', 'product', 'staff_responsible'],
  fields: [
    { key: 'customer_name', label: 'Customer name', type: 'text', required: true },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'brand', label: 'Brand', type: 'text' },
    { key: 'product', label: 'Product / model', type: 'text' },
    { key: 'deposit_paid', label: 'Deposit paid (KD)', type: 'number', defaultValue: 0 },
    { key: 'total_price', label: 'Total expected price (KD)', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: PRE_STATUSES, defaultValue: 'Pending confirmation', required: true },
    { key: 'expected_arrival', label: 'Expected arrival', type: 'date' },
    { key: 'staff_responsible', label: 'Staff responsible', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'customer_name', label: 'Customer' },
    { key: 'phone', label: 'Phone' },
    { key: 'brand', label: 'Brand' },
    { key: 'product', label: 'Product' },
    { key: 'deposit_paid', label: 'Deposit', render: (r) => kd(r.deposit_paid) },
    { key: 'total_price', label: 'Total', render: (r) => kd(r.total_price) },
    { key: 'status', label: 'Status' },
    { key: 'expected_arrival', label: 'Expected', render: (r) => <ExpiryCell date={r.expected_arrival} /> },
    { key: 'staff_responsible', label: 'Staff' },
  ],
};
export const PreOrdersPage = () => <CrudModule config={preOrders} />;

/* ---------------- Purchase orders ---------------- */
const PO_STATUSES = ['Open', 'Sent', 'Dispatched', 'Partially received', 'Received', 'Cancelled', 'Returned'];
const purchaseOrders: CrudConfig = {
  table: 'purchase_orders',
  title: 'Purchase Orders & Inbound',
  description: 'POs and inbound shipments — replaces the Excel tracker.',
  canWrite: purchasingRoles,
  statusField: 'status',
  statusOptions: PO_STATUSES,
  searchKeys: ['po_number', 'supplier', 'brand'],
  fields: [
    { key: 'po_number', label: 'PO number', type: 'text', required: true },
    { key: 'supplier', label: 'Supplier', type: 'text' },
    { key: 'brand', label: 'Brand', type: 'text' },
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
    { key: 'po_number', label: 'PO #' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'brand', label: 'Brand' },
    { key: 'po_type', label: 'Type' },
    { key: 'item_count', label: 'Items' },
    { key: 'total_cost', label: 'Total', render: (r) => kd(r.total_cost) },
    { key: 'balance', label: 'Balance', render: (r) => kd(Number(r.total_cost ?? 0) - Number(r.amount_paid ?? 0)) },
    { key: 'status', label: 'Status' },
    { key: 'shipment_status', label: 'Shipment' },
    { key: 'expected_arrival', label: 'Expected', render: (r) => <ExpiryCell date={r.expected_arrival} /> },
    { key: 'invoice_received', label: 'Invoice', render: (r) => (r.invoice_received ? '✓' : <span className="text-amber-600">Pending</span>) },
  ],
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
  // stored as jsonb [{label, date}] — edited as "MM-DD Label" lines
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
    { key: 'status', label: 'Status', type: 'select', options: ['Active', 'On leave', 'Resigned', 'Terminated'], defaultValue: 'Active', required: true },
    { key: 'annual_leave_entitlement', label: 'Annual leave days', type: 'number', defaultValue: 30 },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  columns: [
    { key: 'full_name', label: 'Employee' },
    { key: 'job_title', label: 'Job title' },
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
