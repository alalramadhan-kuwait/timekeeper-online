import { useEffect, useMemo, useState } from 'react';
import { Search, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, Spinner, StatusBadge, Badge } from '../components/ui';
import { formatKD } from '../lib/format';

interface CaseRow {
  id: string;
  case_id: string;
  date_logged: string;
  staff: string;
  customer_name: string | null;
  contact: string | null;
  case_type: string;
  product: string;
  brand: string | null;
  amount_kd: number | null;
  status: string;
  promised_callback: string | null;
  outlet: string | null;
  notes: string | null;
}

interface CustomerProfile {
  key: string;
  displayName: string;
  contact?: string;
  cases: CaseRow[];
  totalRevenue: number;
  visitCount: number;
  lastActivity: string;
  openFollowUps: number;
  brands: string[];
}

const caseTypeColors: Record<string, string> = {
  Sale: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Follow-up': 'bg-blue-100 text-blue-700 border-blue-200',
  'Lost Sale': 'bg-rose-100 text-rose-700 border-rose-200',
  'No Interaction': 'bg-slate-100 text-slate-500 border-slate-200',
};

function buildProfiles(cases: CaseRow[]): CustomerProfile[] {
  const map = new Map<string, CustomerProfile>();
  for (const c of cases) {
    const key = c.contact?.trim() || c.customer_name?.trim() || '';
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        key,
        displayName: c.customer_name?.trim() || c.contact?.trim() || key,
        contact: c.contact?.trim() || undefined,
        cases: [], totalRevenue: 0, visitCount: 0,
        lastActivity: c.date_logged, openFollowUps: 0, brands: [],
      });
    }
    const p = map.get(key)!;
    p.cases.push(c);
    p.visitCount++;
    if (c.customer_name?.trim()) p.displayName = p.displayName.startsWith('+') ? c.customer_name.trim() : p.displayName;
    if (c.contact?.trim()) p.contact = c.contact.trim();
    if (c.date_logged > p.lastActivity) p.lastActivity = c.date_logged;
    if (c.case_type === 'Sale') p.totalRevenue += Number(c.amount_kd ?? 0);
    if (c.case_type === 'Follow-up' && c.status === 'Open') p.openFollowUps++;
    if (c.brand && !p.brands.includes(c.brand)) p.brands.push(c.brand);
  }
  return [...map.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export default function CrmPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerProfile | null>(null);
  const [onlyFollowUps, setOnlyFollowUps] = useState(false);

  useEffect(() => {
    supabase
      .from('cases')
      .select('id, case_id, date_logged, staff, customer_name, contact, case_type, product, brand, amount_kd, status, promised_callback, outlet, notes')
      .eq('deleted', false)
      .order('date_logged', { ascending: false })
      .then(({ data }) => {
        setCases((data as CaseRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  const profiles = useMemo(() => buildProfiles(cases), [cases]);

  const filtered = useMemo(() => {
    let p = profiles;
    if (onlyFollowUps) p = p.filter((x) => x.openFollowUps > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      p = p.filter((x) =>
        x.displayName.toLowerCase().includes(q) ||
        (x.contact ?? '').toLowerCase().includes(q) ||
        x.brands.some((b) => b.toLowerCase().includes(q)));
    }
    return p;
  }, [profiles, search, onlyFollowUps]);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">CRM — Customer List</h1>
        <p className="text-sm text-slate-500">
          Built live from store CRM cases — revenue, visits and open follow-ups per customer. Entry stays in the store CRM.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, brand…"
            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white w-64"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 px-3 py-1.5 rounded-lg border border-slate-300 bg-white cursor-pointer">
          <input type="checkbox" checked={onlyFollowUps} onChange={(e) => setOnlyFollowUps(e.target.checked)} />
          Open follow-ups only
        </label>
        <div className="ml-auto text-sm text-slate-500 self-center">{filtered.length} customers</div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Visits</th>
              <th className="px-4 py-3">Total spent</th>
              <th className="px-4 py-3">Open follow-ups</th>
              <th className="px-4 py-3">Brands</th>
              <th className="px-4 py-3">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No customers found</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(p)}>
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">{p.displayName}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {p.contact ? <span className="flex items-center gap-1.5"><Phone size={12} className="text-slate-400" />{p.contact}</span> : '—'}
                </td>
                <td className="px-4 py-2.5">{p.visitCount}</td>
                <td className="px-4 py-2.5 font-medium">{p.totalRevenue ? `${formatKD(p.totalRevenue)} KD` : '—'}</td>
                <td className="px-4 py-2.5">
                  {p.openFollowUps > 0
                    ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">{p.openFollowUps} open</Badge>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-2.5 max-w-[220px] truncate">{p.brands.join(', ') || '—'}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{p.lastActivity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <Modal title={`${selected.displayName} — history (${selected.cases.length})`} onClose={() => setSelected(null)}>
          <div className="flex flex-wrap gap-4 mb-4 text-sm">
            <div><span className="text-slate-500">Total spent:</span> <b>{formatKD(selected.totalRevenue)} KD</b></div>
            <div><span className="text-slate-500">Visits:</span> <b>{selected.visitCount}</b></div>
            <div><span className="text-slate-500">Phone:</span> <b>{selected.contact ?? '—'}</b></div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {selected.cases.map((c) => (
              <div key={c.id} className="py-2.5 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={caseTypeColors[c.case_type]}>{c.case_type}</Badge>
                  <StatusBadge value={c.status} />
                  <span className="text-slate-500">{c.date_logged}</span>
                  <span className="text-slate-400 text-xs">{c.outlet} · {c.staff}</span>
                </div>
                <div className="mt-1 text-slate-700">
                  {c.brand ? `${c.brand} — ` : ''}{c.product}
                  {c.amount_kd ? <span className="font-medium"> · {formatKD(Number(c.amount_kd))} KD</span> : ''}
                </div>
                {c.promised_callback && <div className="text-xs text-amber-600 mt-0.5">Callback promised: {c.promised_callback}</div>}
                {c.notes && <div className="text-xs text-slate-500 mt-0.5">{c.notes}</div>}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
