import { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from '../components/ui';

interface TeamRow { id: string; full_name: string; role: string; email?: string; last_sign_in_at?: string | null }
interface ActivityRow { user_id: string; last_active: string | null; views_7d: number; views_30d: number; recent_pages: string[] | null }

const PAGE_LABEL: Record<string, string> = {
  '/': 'Dashboard', '/me': 'My Portal', '/sales': 'Sales Reports', '/crm': 'CRM', '/follow-ups': 'Follow-ups',
  '/vip': 'VIP', '/waiting-list': 'Demand List', '/stock': 'Stock', '/purchase-orders': 'Supplier Payments',
  '/consignments': 'Consignments', '/limited-projects': 'Limited Projects', '/repairs': 'Repairs',
  '/attendance': 'Attendance', '/hr': 'Employees', '/leave': 'Leave', '/instagram': 'Instagram',
  '/content': 'Content Planner', '/paid-ads': 'Paid Ads', '/history': 'History Log', '/settings': 'Settings',
  '/activity': 'User Activity', '/company-documents': 'Company Documents',
};

const rel = (iso: string | null | undefined) => {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

export default function UserActivityPage() {
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [acts, setActs] = useState<Map<string, ActivityRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    const [{ data: fnData, error: fnErr }, { data: actData }] = await Promise.all([
      supabase.functions.invoke('admin-users', { body: { action: 'list' } }),
      supabase.from('user_activity_summary').select('*'),
    ]);
    if (fnErr) setErr(fnErr.message);
    setTeam(((fnData?.team ?? []) as TeamRow[]).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setActs(new Map(((actData ?? []) as ActivityRow[]).map((a) => [a.user_id, a])));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => team.map((t) => {
    const a = acts.get(t.id);
    const views30 = a?.views_30d ?? 0;
    const level = views30 >= 40 ? 'High' : views30 >= 10 ? 'Medium' : views30 > 0 ? 'Low' : 'None';
    return { ...t, last_active: a?.last_active ?? null, views_7d: a?.views_7d ?? 0, views_30d: views30, recent: a?.recent_pages ?? [], level };
  }).sort((a, b) => (b.last_active ?? '').localeCompare(a.last_active ?? '')), [team, acts]);

  const inactive = rows.filter((r) => !r.last_active || (Date.now() - new Date(r.last_active).getTime()) > 14 * 86400000);

  if (loading) return <Spinner />;

  const levelCls = (l: string) => l === 'High' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : l === 'Medium' ? 'bg-blue-100 text-blue-700 border-blue-200'
    : l === 'Low' ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-slate-100 text-slate-500 border-slate-200';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Activity size={20} /> User Activity</h1>
          <p className="text-sm text-slate-500">Who is using the system and how often. Data changes are tracked separately in the History Log.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 bg-white border border-slate-300 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {err && <div className="mb-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500 mb-0.5">Accounts</p><p className="text-xl font-bold text-slate-800">{rows.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500 mb-0.5">Active last 7 days</p>
          <p className="text-xl font-bold text-emerald-600">{rows.filter((r) => r.views_7d > 0).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500 mb-0.5">Inactive 14+ days</p>
          <p className={`text-xl font-bold ${inactive.length ? 'text-rose-600' : 'text-emerald-600'}`}>{inactive.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <p className="text-xs text-slate-500 mb-0.5">Page views (30d)</p>
          <p className="text-xl font-bold text-slate-800">{rows.reduce((s, r) => s + r.views_30d, 0)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 hidden md:table-cell">Last login</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Views 7d</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Views 30d</th>
              <th className="px-4 py-3">Activity</th>
              <th className="px-4 py-3 hidden lg:table-cell">Recent pages</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No accounts</td></tr>}
            {rows.map((r) => {
              const stale = !r.last_active || (Date.now() - new Date(r.last_active).getTime()) > 14 * 86400000;
              return (
                <tr key={r.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${stale ? 'bg-rose-50/30' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">{r.full_name}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-500">{r.role}</td>
                  <td className="px-4 py-2.5 text-slate-500 hidden md:table-cell whitespace-nowrap">{rel(r.last_sign_in_at)}</td>
                  <td className={`px-4 py-2.5 whitespace-nowrap ${stale ? 'text-rose-600 font-medium' : 'text-slate-600'}`}>{rel(r.last_active)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums hidden sm:table-cell">{r.views_7d || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums hidden sm:table-cell">{r.views_30d || '—'}</td>
                  <td className="px-4 py-2.5"><Badge className={levelCls(r.level)}>{r.level}</Badge></td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 hidden lg:table-cell">
                    {r.recent.length ? [...new Set(r.recent)].slice(0, 3).map((p) => PAGE_LABEL[p] ?? p).join(', ') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        “Last login” comes from the sign-in record; “last active” and page views are recorded as people use the system (throttled to once per page per 5 minutes).
      </p>
    </div>
  );
}
