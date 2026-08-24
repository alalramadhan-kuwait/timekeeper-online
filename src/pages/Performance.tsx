import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserRound, Clock, Activity as ActivityIcon, Pencil, CalendarDays, MapPin, Briefcase } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';

// One place to see a person from every angle: attendance, app activity, and the edits
// they've made. Everything is keyed by user_id (the login), so names never duplicate.

interface Person { id: string; name: string; role: string; job_title: string | null; location: string | null; status: string | null; joining_date: string | null; employee_id: string | null; linked: boolean }

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

const TABLE_LABEL: Record<string, string> = {
  purchase_orders: 'Supplier Payments', cases: 'Sales', sale_items: 'Sale items', customers: 'Customers',
  limited_projects: 'Limited Projects', repair_watches: 'Repairs', employees: 'Employees', leave_records: 'Leave',
  attendance_records: 'Attendance', waiting_list: 'Demand List', content_tasks: 'Content', paid_ads: 'Paid Ads',
  influencers: 'Influencers', influencer_collaborations: 'Collaborations', consignments: 'Consignments',
  company_documents: 'Documents', settings: 'Settings', employee_requests: 'Requests',
};
const PAGE_LABEL: Record<string, string> = {
  '/': 'Dashboard', '/me': 'My Portal', '/sales': 'Sales', '/crm': 'CRM', '/follow-ups': 'Follow-ups', '/vip': 'VIP',
  '/waiting-list': 'Demand', '/stock': 'Stock', '/purchase-orders': 'Supplier Payments', '/consignments': 'Consignments',
  '/limited-projects': 'Limited Projects', '/repairs': 'Repairs', '/attendance': 'Attendance', '/hr': 'Employees',
  '/leave': 'Leave', '/instagram': 'Instagram', '/content': 'Content', '/paid-ads': 'Paid Ads', '/influencers': 'Influencers',
  '/history': 'History', '/settings': 'Settings', '/activity': 'User Activity', '/performance': 'Performance',
};

const kdate = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const hm = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(11, 16);
const hoursBetween = (a: string, b: string | null) => (b ? (new Date(b).getTime() - new Date(a).getTime()) / 3600_000 : 0);
const rel = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">{icon} {label}</div>
      <p className={`text-xl font-bold ${accent ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 mt-6">{children}</h2>;
}

export default function PerformancePage() {
  const { role } = useAuth();
  const canView = ['admin', 'manager'].includes(role ?? '');
  const [people, setPeople] = useState<Person[]>([]);
  const [sel, setSel] = useState<string>('');
  const [range, setRange] = useState('30');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: emps }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role'),
        supabase.from('employees').select('id, user_id, full_name, job_title, location, status, joining_date'),
      ]);
      const empByUser = new Map((emps ?? []).filter((e: any) => e.user_id).map((e: any) => [e.user_id, e]));
      const list: Person[] = (profs ?? []).map((p: any) => {
        const e = empByUser.get(p.id);
        return {
          id: p.id, name: (e?.full_name ?? p.full_name ?? '').trim(), role: p.role,
          job_title: e?.job_title ?? null, location: e?.location ?? null, status: e?.status ?? null,
          joining_date: e?.joining_date ?? null, employee_id: e?.id ?? null, linked: !!e,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      setPeople(list);
      setSel(list[0]?.id ?? '');
      setLoading(false);
    })();
  }, []);

  const person = useMemo(() => people.find((p) => p.id === sel) ?? null, [people, sel]);

  const loadPerson = useCallback(async () => {
    if (!person) return;
    setBusy(true);
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const sinceIso = days ? new Date(Date.now() - days * 86400_000).toISOString() : '1970-01-01T00:00:00Z';

    const [att, act, edits, lv] = await Promise.all([
      supabase.from('attendance_records').select('clock_in, clock_out, is_late, justified, location').eq('user_id', person.id).gte('clock_in', sinceIso).order('clock_in', { ascending: false }),
      supabase.from('user_activity').select('path, occurred_at').eq('user_id', person.id).gte('occurred_at', sinceIso),
      supabase.from('audit_log').select('table_name, action, changed_at').eq('changed_by', person.id).gte('changed_at', sinceIso).order('changed_at', { ascending: false }).limit(1000),
      person.employee_id
        ? supabase.from('leave_records').select('leave_type, leave_start, leave_end, approval_status').eq('employee_id', person.employee_id)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // attendance
    const arows = (att.data ?? []) as any[];
    const dayset = new Set(arows.map((r) => kdate(r.clock_in)));
    const lateCount = arows.filter((r) => r.is_late && !r.justified).length;
    const daysPresent = dayset.size;
    const onTimePct = daysPresent ? Math.round(((daysPresent - lateCount) / daysPresent) * 100) : null;
    const totalHours = arows.reduce((s, r) => s + hoursBetween(r.clock_in, r.clock_out), 0);
    const missedOut = arows.filter((r) => !r.clock_out && kdate(r.clock_in) < new Date().toISOString().slice(0, 10)).length;
    const arrivalMins = arows.map((r) => { const t = hm(r.clock_in); return parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3)); });
    const avgArr = arrivalMins.length ? Math.round(arrivalMins.reduce((s, m) => s + m, 0) / arrivalMins.length) : null;
    const avgArrStr = avgArr != null ? `${String(Math.floor(avgArr / 60)).padStart(2, '0')}:${String(avgArr % 60).padStart(2, '0')}` : '—';
    const lastClock = arows[0]?.clock_in ?? null;

    // activity
    const acts = (act.data ?? []) as any[];
    const actDays = new Set(acts.map((r) => kdate(r.occurred_at)));
    const lastActive = acts.reduce<string | null>((mx, r) => (!mx || r.occurred_at > mx ? r.occurred_at : mx), null);
    const pageCount = new Map<string, number>();
    for (const r of acts) pageCount.set(r.path, (pageCount.get(r.path) ?? 0) + 1);
    const topPages = [...pageCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // edits (audit_log)
    const erows = (edits.data ?? []) as any[];
    const byAction = { INSERT: 0, UPDATE: 0, DELETE: 0 } as Record<string, number>;
    const byTable = new Map<string, number>();
    for (const r of erows) {
      byAction[r.action] = (byAction[r.action] ?? 0) + 1;
      byTable.set(r.table_name, (byTable.get(r.table_name) ?? 0) + 1);
    }
    const topTables = [...byTable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const recentEdits = erows.slice(0, 10);

    // leave (overlapping the range, approved)
    const lrows = (lv.data ?? []) as any[];
    const approvedLeave = lrows.filter((r) => r.approval_status === 'Approved');
    const pendingReq = lrows.filter((r) => r.approval_status === 'Pending').length;
    const leaveDays = approvedLeave.reduce((s, r) => {
      const start = new Date(r.leave_start), end = new Date(r.leave_end);
      return s + Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400_000) + 1);
    }, 0);

    setData({
      daysPresent, lateCount, onTimePct, avgHours: daysPresent ? totalHours / daysPresent : 0, avgArrStr, lastClock, missedOut,
      views: acts.length, activeDays: actDays.size, lastActive, topPages,
      editTotal: erows.length, byAction, topTables, recentEdits,
      leaveDays, pendingReq,
    });
    setBusy(false);
  }, [person, range]);

  useEffect(() => { loadPerson(); }, [loadPerson]);

  if (!canView) return <div className="text-slate-500 py-16 text-center">Only an admin or manager can view performance.</div>;
  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><UserRound size={20} /> Employee Performance</h1>
          <p className="text-sm text-slate-500">Attendance, app activity and edits for one person — all from their login.</p>
        </div>
        <div className="flex gap-2">
          <select value={sel} onChange={(e) => setSel(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
          </select>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* Identity */}
      {person && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-xl font-bold text-slate-400">{person.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{person.name}</h2><Badge className="bg-slate-100 text-slate-600 border-slate-200 capitalize">{person.role}</Badge>{person.status && <Badge className={person.status === 'Active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>{person.status}</Badge>}</div>
            <div className="text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {person.job_title && <span className="flex items-center gap-1"><Briefcase size={13} /> {person.job_title}</span>}
              {person.location && <span className="flex items-center gap-1"><MapPin size={13} /> {person.location}</span>}
              {person.joining_date && <span className="flex items-center gap-1"><CalendarDays size={13} /> joined {person.joining_date}</span>}
              {!person.linked && <span className="text-amber-600">no HR record linked</span>}
            </div>
          </div>
        </div>
      )}

      {busy || !data ? <div className="py-10"><Spinner /></div> : (
        <>
          {/* Attendance */}
          <SectionTitle>Attendance</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={<Clock size={13} />} label="Days present" value={String(data.daysPresent)} />
            <Kpi icon={<Clock size={13} />} label="On-time rate" value={data.onTimePct != null ? `${data.onTimePct}%` : '—'} accent={data.onTimePct == null ? undefined : data.onTimePct >= 90 ? 'text-emerald-600' : data.onTimePct >= 70 ? 'text-amber-600' : 'text-rose-600'} sub={`${data.lateCount} late`} />
            <Kpi icon={<Clock size={13} />} label="Avg hours / day" value={data.avgHours ? data.avgHours.toFixed(1) : '—'} />
            <Kpi icon={<Clock size={13} />} label="Avg arrival" value={data.avgArrStr} />
            <Kpi icon={<Clock size={13} />} label="Missed clock-outs" value={String(data.missedOut)} accent={data.missedOut ? 'text-amber-600' : undefined} />
            <Kpi icon={<Clock size={13} />} label="Last clock-in" value={data.lastClock ? kdate(data.lastClock) : '—'} sub={data.lastClock ? hm(data.lastClock) : undefined} />
          </div>

          {/* Activity */}
          <SectionTitle>App activity</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={<ActivityIcon size={13} />} label="Active days" value={String(data.activeDays)} />
            <Kpi icon={<ActivityIcon size={13} />} label="Page views" value={String(data.views)} />
            <Kpi icon={<ActivityIcon size={13} />} label="Last active" value={rel(data.lastActive)} />
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 col-span-2 xl:col-span-3">
              <div className="text-xs text-slate-500 mb-1">Most-used pages</div>
              <div className="flex flex-wrap gap-1.5">
                {data.topPages.length ? data.topPages.map(([p, n]: [string, number]) => (
                  <Badge key={p} className="bg-slate-100 text-slate-600 border-slate-200">{PAGE_LABEL[p] ?? p} · {n}</Badge>
                )) : <span className="text-xs text-slate-400">no activity in range</span>}
              </div>
            </div>
          </div>

          {/* Edits / contributions */}
          <SectionTitle>Edits &amp; input changes</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={<Pencil size={13} />} label="Total changes" value={String(data.editTotal)} accent="text-slate-800" />
            <Kpi icon={<Pencil size={13} />} label="Created" value={String(data.byAction.INSERT ?? 0)} accent="text-emerald-600" />
            <Kpi icon={<Pencil size={13} />} label="Updated" value={String(data.byAction.UPDATE ?? 0)} accent="text-blue-600" />
            <Kpi icon={<Pencil size={13} />} label="Deleted" value={String(data.byAction.DELETE ?? 0)} accent={data.byAction.DELETE ? 'text-rose-600' : undefined} />
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 col-span-2">
              <div className="text-xs text-slate-500 mb-1">Where they work</div>
              <div className="flex flex-wrap gap-1.5">
                {data.topTables.length ? data.topTables.map(([t, n]: [string, number]) => (
                  <Badge key={t} className="bg-slate-100 text-slate-600 border-slate-200">{TABLE_LABEL[t] ?? t} · {n}</Badge>
                )) : <span className="text-xs text-slate-400">no edits in range</span>}
              </div>
            </div>
          </div>
          {data.recentEdits.length > 0 && (
            <div className="mt-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase"><tr>
                  <th className="text-left px-4 py-2">When</th><th className="text-left px-4 py-2">Action</th><th className="text-left px-4 py-2">Module</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentEdits.map((e: any, i: number) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{new Date(e.changed_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuwait' })}</td>
                      <td className="px-4 py-2"><Badge className={e.action === 'INSERT' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : e.action === 'DELETE' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-blue-100 text-blue-700 border-blue-200'}>{e.action === 'INSERT' ? 'Created' : e.action === 'DELETE' ? 'Deleted' : 'Updated'}</Badge></td>
                      <td className="px-4 py-2 text-slate-700">{TABLE_LABEL[e.table_name] ?? e.table_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Leave */}
          {person?.linked && (
            <>
              <SectionTitle>Leave</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Kpi icon={<CalendarDays size={13} />} label="Approved leave days" value={String(data.leaveDays)} />
                <Kpi icon={<CalendarDays size={13} />} label="Pending requests" value={String(data.pendingReq)} accent={data.pendingReq ? 'text-amber-600' : undefined} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
