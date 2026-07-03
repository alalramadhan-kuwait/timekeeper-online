import { useEffect, useMemo, useState } from 'react';
import { Phone, AlertTriangle, CalendarClock, CalendarDays, HelpCircle } from 'lucide-react';
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
    return b;
  }, [cases, staffFilter, outletFilter, todayStr]);

  if (loading) return <Spinner />;

  const total = BUCKETS.reduce((s, bk) => s + buckets[bk.key].length, 0);

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
        <div className="ml-auto text-sm text-slate-500 self-center">{total} open follow-up{total !== 1 ? 's' : ''}</div>
      </div>

      {error && <div className="mb-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {total === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
          No open follow-ups — everyone has been contacted 🎉
        </div>
      ) : (
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
                  {list.map((c) => (
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
                        <select
                          value="Open"
                          disabled={saving === c.id}
                          onChange={(e) => { if (e.target.value !== 'Open') updateStatus(c.id, e.target.value); }}
                          className="px-2 py-1 rounded-lg border border-slate-300 text-xs bg-white shrink-0"
                        >
                          {CASE_STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
