import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox as InboxIcon, CheckCircle, Clock, CalendarRange, FileText, Check, X, ChevronRight, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from '../components/ui';
import { loadInbox, InboxData } from '../lib/inbox';

const todayKuwait = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });

const MODULE_BADGE: Record<string, string> = {
  'Content Planner': 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  'Paid Ads': 'bg-orange-100 text-orange-700 border-orange-200',
  Repairs: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Influencers: 'bg-violet-100 text-violet-700 border-violet-200',
  'Follow-ups': 'bg-blue-100 text-blue-700 border-blue-200',
  'Demand list': 'bg-teal-100 text-teal-700 border-teal-200',
  'Pre-order': 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

export default function InboxPage() {
  const { user, profile, role } = useAuth();
  const [data, setData] = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  async function reload() {
    if (!user) { setLoading(false); return; }
    setData(await loadInbox(user, profile, role));
    setLoading(false);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id, role]);

  async function decideLeave(id: string, status: 'Approved' | 'Rejected') {
    setBusy(`lv-${id}`);
    await supabase.from('leave_records').update({ approval_status: status }).eq('id', id);
    await reload(); setBusy(null);
  }
  async function decideRequest(id: string, status: 'Approved' | 'Rejected') {
    setBusy(`rq-${id}`);
    await supabase.from('employee_requests').update({ status, manager_remarks: remarks[id]?.trim() || null }).eq('id', id);
    await reload(); setBusy(null);
  }
  async function markTaskDone(id: string) {
    setBusy(`tk-${id}`);
    await supabase.from('assigned_tasks').update({ status: 'Done' }).eq('id', id);
    await reload(); setBusy(null);
  }

  if (loading) return <Spinner />;
  if (!data) return null;

  const today = todayKuwait();
  const PRIORITY: Record<string, string> = {
    High: 'bg-rose-100 text-rose-700 border-rose-200',
    Medium: 'bg-amber-100 text-amber-700 border-amber-200',
    Low: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const total = data.myTasks.length + data.tasks.length + data.leaveApprovals.length + data.requestApprovals.length;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><InboxIcon size={20} /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-tight">Inbox</h1>
          <p className="text-sm text-slate-500">Pending items assigned to you{data.isApprover ? ' and awaiting your approval' : ''}.</p>
        </div>
        {total > 0 && <Badge className="ml-auto bg-slate-900 text-white border-slate-900">{total} open</Badge>}
      </div>

      {total === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <CheckCircle size={40} className="mx-auto text-emerald-500 mb-3" />
          <div className="font-semibold text-slate-700">You're all caught up</div>
          <div className="text-sm text-slate-400 mt-1">Nothing is assigned to you right now.</div>
        </div>
      )}

      {/* ── Tasks assigned to me by a manager ── */}
      {data.myTasks.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <ClipboardList size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">My tasks</h2>
            <Badge className="bg-slate-100 text-slate-600 border-slate-200">{data.myTasks.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.myTasks.map((t) => {
              const overdue = !!t.due_date && t.due_date < today;
              return (
                <li key={t.id} className="px-5 py-3 flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{t.title}</span>
                      <Badge className={PRIORITY[t.priority] ?? PRIORITY.Medium}>{t.priority}</Badge>
                    </div>
                    {t.details && <p className="text-sm text-slate-500 mt-0.5">{t.details}</p>}
                    <div className="text-xs text-slate-400 mt-0.5">
                      {t.assigned_by ? `From ${t.assigned_by}` : 'Assigned'}
                      {t.due_date && <> · <span className={overdue ? 'text-rose-600 font-medium' : ''}>{overdue ? 'Overdue ' : 'Due '}{t.due_date}</span></>}
                    </div>
                  </div>
                  <button disabled={busy === `tk-${t.id}`} onClick={() => markTaskDone(t.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1"><Check size={13} /> Mark done</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Assigned to me (from modules) ── */}
      {data.tasks.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <Clock size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Assigned to me</h2>
            <Badge className="bg-slate-100 text-slate-600 border-slate-200">{data.tasks.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.tasks.map((t) => {
              const overdue = !!t.due && t.due < today;
              return (
                <li key={t.key}>
                  <button onClick={() => navigate(t.link)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 transition-colors">
                    <Badge className={MODULE_BADGE[t.module] ?? 'bg-slate-100 text-slate-600 border-slate-200'}>{t.module}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{t.title}</div>
                      <div className="text-xs text-slate-400">{t.status}</div>
                    </div>
                    {t.due && (
                      <span className={`text-xs font-medium shrink-0 ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                        {overdue ? 'Overdue · ' : 'Due '}{t.due}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Leave approvals ── */}
      {data.isApprover && data.leaveApprovals.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <CalendarRange size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Leave requests awaiting approval</h2>
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">{data.leaveApprovals.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.leaveApprovals.map((l) => (
              <li key={l.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">{l.employee_name} · <span className="text-slate-500">{l.leave_type}</span></div>
                  <div className="text-xs text-slate-400">{l.leave_start} → {l.leave_end} ({l.days}d){l.notes ? ` · ${l.notes}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button disabled={busy === `lv-${l.id}`} onClick={() => decideLeave(l.id, 'Approved')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"><Check size={13} /> Approve</button>
                  <button disabled={busy === `lv-${l.id}`} onClick={() => decideLeave(l.id, 'Rejected')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 text-xs font-medium hover:bg-rose-50 disabled:opacity-50"><X size={13} /> Reject</button>
                  <button onClick={() => navigate('/leave')} className="text-xs text-blue-600 hover:underline">Open</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Employee requests (HR update / attendance correction) ── */}
      {data.isApprover && data.requestApprovals.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <FileText size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Employee requests</h2>
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">{data.requestApprovals.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.requestApprovals.map((r) => (
              <li key={r.id} className="px-5 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{r.requester}</span>
                  <Badge className="bg-slate-100 text-slate-600 border-slate-200">{r.request_type}</Badge>
                  <span className="text-xs text-slate-400 ml-auto">{(r.created_at ?? '').slice(0, 10)}</span>
                </div>
                <p className="text-sm text-slate-600">{r.details}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={remarks[r.id] ?? ''} onChange={(e) => setRemarks((m) => ({ ...m, [r.id]: e.target.value }))}
                    placeholder="Remarks (optional)" className="flex-1 min-w-[10rem] px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
                  <button disabled={busy === `rq-${r.id}`} onClick={() => decideRequest(r.id, 'Approved')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"><Check size={13} /> Approve</button>
                  <button disabled={busy === `rq-${r.id}`} onClick={() => decideRequest(r.id, 'Rejected')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 text-xs font-medium hover:bg-rose-50 disabled:opacity-50"><X size={13} /> Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
