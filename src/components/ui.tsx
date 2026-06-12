import { X } from 'lucide-react';

export function Card({ title, value, sub, accent }: { title: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</div>
      <div className={`text-2xl font-bold mt-1 ${accent ?? 'text-slate-900'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${className ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {children}
    </span>
  );
}

export const statusColors: Record<string, string> = {
  // shared
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  // waiting list
  Open: 'bg-blue-100 text-blue-700 border-blue-200',
  Contacted: 'bg-amber-100 text-amber-700 border-amber-200',
  Converted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  // pre-orders
  'Pending confirmation': 'bg-slate-100 text-slate-600 border-slate-200',
  Confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  'Deposit paid': 'bg-violet-100 text-violet-700 border-violet-200',
  Ordered: 'bg-amber-100 text-amber-700 border-amber-200',
  Arrived: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  // PO
  Sent: 'bg-blue-100 text-blue-700 border-blue-200',
  Dispatched: 'bg-violet-100 text-violet-700 border-violet-200',
  'Partially received': 'bg-amber-100 text-amber-700 border-amber-200',
  Received: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Returned: 'bg-rose-100 text-rose-700 border-rose-200',
  // consignment
  'With consignee': 'bg-blue-100 text-blue-700 border-blue-200',
  Sold: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Pending payment': 'bg-amber-100 text-amber-700 border-amber-200',
  // leave / employees
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'On leave': 'bg-amber-100 text-amber-700 border-amber-200',
  Resigned: 'bg-slate-100 text-slate-500 border-slate-200',
  Terminated: 'bg-rose-100 text-rose-700 border-rose-200',
  // documents
  Valid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Renewal in progress': 'bg-amber-100 text-amber-700 border-amber-200',
  Expired: 'bg-red-100 text-red-700 border-red-200',
  // priority
  High: 'bg-red-100 text-red-700 border-red-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Low: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function StatusBadge({ value }: { value: string }) {
  return <Badge className={statusColors[value]}>{value}</Badge>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mt-8 mb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="p-10 text-center text-slate-400">Loading…</div>;
}
