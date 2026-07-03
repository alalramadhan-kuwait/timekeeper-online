import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Phone, AlertTriangle, CalendarClock, CalendarDays, HelpCircle, Pencil, X } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Badge, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';

interface FollowUpCase {
  id: string;
  case_id: string | null;
  date_logged: string;
  staff: string;
  customer_name: string | null;
  contact: string | null;
  case_type: string;
  product: string | null;
  brand: string | null;
  status: string;
  promised_callback: string | null;
  outlet: string | null;
  notes: string | null;
}

const CASE_STATUSES = ['Open', 'Won', 'Lost', 'No Response', 'Closed'];

type Bucket = 'overdue' | 'today' | 'upcoming' | 'nodate';

const BUCKETS: { key: Bucket; label: string; icon: typeof AlertTriangle; accent: string; chip: string }[] = [
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, accent: 'text-red-600', chip: 'bg-red-100 text-red-700 border-red-200' },
  { key: 'today', label: 'Due today', icon: CalendarClock, accent: 'text-amber-600', chip: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'upcoming', label: 'Upcoming', icon: CalendarDays, accent: 'text-blue-600', chip: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'nodate', label: 'No callback date', icon: HelpCircle, accent: 'text-slate-500', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
];

export default function FollowUpsPage() {
  const { role } = useAuth();
  const canEdit = ['admin', 'manager', 'staff'].includes(role ?? '');
  const [cases, setCases] = useState<FollowUpCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState('All');
  const [outletFilter, setOutletFilter] = useState('All');
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<FollowUpCase | null>(null);
  const [groupBy, setGroupBy] = useState<'urgency' | 'brand'>('urgency');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('cases')
      .select('id, case_id, date_logged, staff, customer_name, contact, case_type, product, brand, status, promised_callback, outlet, notes')
      .eq('case_type', 'Follow-up')
      .eq('status', 'Open')
      .eq('deleted', false)
      .order('promised_callback', { ascending: true, nullsFirst: false });
    if (error) setError(error.message);
    else setCases((data ?? []) as FollowUpCase[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: string) {
    setSaving(id);
    const { error } = await supabase.from('cases').update({ status }).eq('id', id);
    if (error) setError(error.message);
    else setCases((cs) => cs.filter((c) => c.id !== id));
    setSaving(null);
  }

  async function saveEdit(patch: Partial<FollowUpCase>) {
    if (!editing) return;
    setSaving(editing.id);
    const { error } = await supabase.from('cases').update(patch).eq('id', editing.id);
    if (error) setError(error.message);
    else setCases((cs) => cs.map((c) => (c.id === editing.id ? { ...c, ...patch } : c)));
    setSaving(null);
    setEditing(null);
  }

  const staffOptions = useMemo(() => [...new Set(cases.map((c) => c.staff).filter(Boolean))].sort(), [cases]);
  const outletOptions = useMemo(() => [...new Set(cases.map((c) => c.outlet ?? '').filter(Boolean))].sort(), [cases]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const buckets = useMemo(() => {
    let list = cases;
    if (staffFilter !== 'All') list = list.filter((c) => c.staff === staffFilter);
    if (outletFilter !== 'All') list = list.filter((c) => c.outlet === outletFilter);
    const b: Record<Bucket, FollowUpCase[]> = { overdue: [], today: [], upcoming: [], nodate: [] };
    for (const c of list) {
      if (!c.promised_callback) b.nodate.push(c);
      else if (c.promised_callback < todayStr) b.overdue.push(c);
      else if (c.promised_callback === todayStr) b.today.push(c);
      else b.upcoming.push(c);
    }
    // Group related items together: same brand, then same product, then by callback date
    const rel = (a: FollowUpCase, z: FollowUpCase) =>
      (a.brand ?? '').localeCompare(z.brand ?? '') ||
      (a.product ?? '').localeCompare(z.product ?? '') ||
      (a.promised_callback ?? '').localeCompare(z.promised_callback ?? '');
    for (const k of Object.keys(b) as Bucket[]) b[k].sort(rel);
    return b;
  }, [cases, staffFilter, outletFilter, todayStr]);

  // Brand view: sections per brand (alphabetical), items sorted by callback date
  const brandGroups = useMemo(() => {
    let list = cases;
    if (staffFilter !== 'All') list = list.filter((c) => c.staff === staffFilter);
    if (outletFilter !== 'All') list = list.filter((c) => c.outlet === outletFilter);
    const map = new Map<string, FollowUpCase[]>();
    for (const c of list) {
      const b = c.brand?.trim() || 'No brand';
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(c);
    }
    for (const arr of map.values()) {
      arr.sort((a, z) => (a.promised_callback ?? '9999').localeCompare(z.promised_callback ?? '9999'));
    }
    return [...map.entries()].sort((a, z) =>
      a[0] === 'No brand' ? 1 : z[0] === 'No brand' ? -1 : a[0].localeCompare(z[0]));
  }, [cases, staffFilter, outletFilter]);

  if (loading) return <Spinner />;

  const total = BUCKETS.reduce((s, bk) => s + buckets[bk.key].length, 0);

  const renderRow = (c: FollowUpCase) => (
    <div key={c.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-52">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 text-sm truncate">
            {c.customer_name?.trim() || c.contact || 'Unknown customer'}
          </span>
          {c.contact && (
            <a href={`tel:${c.contact}`} className="text-blue-500 hover:text-blue-700 shrink-0" title={`Call ${c.contact}`}>
              <Phone size={13} />
            </a>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">
          {[c.brand, c.product].filter(Boolean).join(' — ') || 'No product noted'}
        </p>
        {c.notes && <p className="text-xs text-slate-400 italic truncate">{c.notes}</p>}
      </div>
      <div className="text-xs text-slate-500 shrink-0">
        <div>{c.outlet ?? '—'} · {c.staff}</div>
        <div className={c.promised_callback && c.promised_callback < todayStr ? 'text-red-600 font-medium' : ''}>
          {c.promised_callback ? `Callback ${c.promised_callback}` : `Logged ${c.date_logged}`}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-2 shrink-0">
          <select
            value="Open"
            disabled={saving === c.id}
            onChange={(e) => { if (e.target.value !== 'Open') updateStatus(c.id, e.target.value); }}
            className="px-2 py-1 rounded-lg border border-slate-300 text-xs bg-white"
          >
            {CASE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button onClick={() => setEditing(c)} className="text-slate-400 hover:text-blue-600" aria-label="Edit">
            <Pencil size={14} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Follow-up Board</h1>
        <p className="text-sm text-slate-500">
          Every open follow-up from the Daily Sales Report, sorted by urgency. Close them as Won, Lost or No Response.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option>All</option>
          {staffOptions.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option>All</option>
          {outletOptions.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          {(['urgency', 'brand'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 capitalize ${groupBy === g ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              By {g}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-slate-500 self-center">{total} open follow-up{total !== 1 ? 's' : ''}</div>
      </div>

      {error && <div className="mb-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {total === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
          No open follow-ups — everyone has been contacted 🎉
        </div>
      ) : groupBy === 'urgency' ? (
        <div className="space-y-6">
          {BUCKETS.map((bk) => {
            const list = buckets[bk.key];
            if (list.length === 0) return null;
            const Icon = bk.icon;
            return (
              <div key={bk.key}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={16} className={bk.accent} />
                  <h2 className={`font-bold text-sm uppercase tracking-wide ${bk.accent}`}>{bk.label}</h2>
                  <Badge className={bk.chip}>{list.length}</Badge>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  {list.map((c) => renderRow(c))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {brandGroups.map(([brand, list]) => (
            <div key={brand}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="font-bold text-sm uppercase tracking-wide text-slate-700">{brand}</h2>
                <Badge className="bg-slate-100 text-slate-600 border-slate-200">{list.length}</Badge>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                {list.map((c) => renderRow(c))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          record={editing}
          saving={saving === editing.id}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

function EditModal({ record, saving, onClose, onSave }: {
  record: FollowUpCase;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: Partial<FollowUpCase>) => void;
}) {
  const [form, setForm] = useState({
    customer_name: record.customer_name ?? '',
    contact: record.contact ?? '',
    brand: record.brand ?? '',
    product: record.product ?? '',
    promised_callback: record.promised_callback ?? '',
    notes: record.notes ?? '',
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-bold text-slate-900 text-sm">Edit follow-up</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block text-xs">
            <span className="block text-slate-500 mb-1 font-medium">Customer name</span>
            <input value={form.customer_name} onChange={set('customer_name')} className={inputCls} />
          </label>
          <label className="block text-xs">
            <span className="block text-slate-500 mb-1 font-medium">Contact / phone</span>
            <input value={form.contact} onChange={set('contact')} className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="block text-slate-500 mb-1 font-medium">Brand</span>
              <input value={form.brand} onChange={set('brand')} className={inputCls} />
            </label>
            <label className="block text-xs">
              <span className="block text-slate-500 mb-1 font-medium">Product / model</span>
              <input value={form.product} onChange={set('product')} className={inputCls} />
            </label>
          </div>
          <label className="block text-xs">
            <span className="block text-slate-500 mb-1 font-medium">Callback date</span>
            <input type="date" value={form.promised_callback} onChange={set('promised_callback')} className={inputCls} />
          </label>
          <label className="block text-xs">
            <span className="block text-slate-500 mb-1 font-medium">Notes / comment</span>
            <textarea value={form.notes} onChange={set('notes')} rows={3} className={`${inputCls} resize-none`} />
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          <button
            disabled={saving}
            onClick={() => onSave({
              customer_name: form.customer_name.trim() || null,
              contact: form.contact.trim() || null,
              brand: form.brand.trim() || null,
              product: form.product.trim() || null,
              promised_callback: form.promised_callback || null,
              notes: form.notes.trim() || null,
            })}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
