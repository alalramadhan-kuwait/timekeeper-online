import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Send, Trash2, Check, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Spinner, Badge } from '../components/ui';
import { notify } from '../lib/push';

interface Emp { id: string; full_name: string; job_title: string | null; user_id: string | null; status: string | null }
interface Task {
  id: string; title: string; details: string | null; assignee_employee_id: string | null;
  assignee_name: string | null; assigned_by: string | null; priority: string; due_date: string | null;
  status: string; created_at: string;
}

const PRIORITIES = ['Low', 'Medium', 'High'];
const PRIORITY_BADGE: Record<string, string> = {
  High: 'bg-rose-100 text-rose-700 border-rose-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Low: 'bg-slate-100 text-slate-600 border-slate-200',
};
const STATUS_BADGE: Record<string, string> = {
  Open: 'bg-blue-100 text-blue-700 border-blue-200',
  Done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};
const input = 'px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';

export default function AssignTasksPage() {
  const { profile } = useAuth();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'Open' | 'Done' | 'Cancelled' | 'All'>('Open');

  // form
  const [assignee, setAssignee] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [due, setDue] = useState('');

  async function load() {
    const [e, t] = await Promise.all([
      supabase.from('employees').select('id, full_name, job_title, user_id, status').order('full_name'),
      supabase.from('assigned_tasks').select('*').order('created_at', { ascending: false }),
    ]);
    setEmps((e.data as Emp[]) ?? []);
    setTasks((t.data as Task[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const empById = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);

  async function create() {
    if (!assignee) { setMsg('Pick an employee to assign the task to'); return; }
    if (!title.trim()) { setMsg('Give the task a title'); return; }
    setBusy(true); setMsg(null);
    const emp = empById.get(assignee);
    const { data: created, error } = await supabase.from('assigned_tasks').insert({
      title: title.trim(), details: details.trim() || null,
      assignee_employee_id: assignee, assignee_name: emp?.full_name ?? null,
      assigned_by: profile?.full_name ?? null, priority, due_date: due || null, status: 'Open',
    }).select('id').single();
    setBusy(false);
    if (error) { setMsg(`Could not create task: ${error.message}`); return; }
    if (created?.id) notify('task_assigned', { id: created.id });
    setMsg(`Task assigned to ${emp?.full_name ?? 'employee'}`);
    setTitle(''); setDetails(''); setDue(''); setPriority('Medium');
    load();
  }

  async function setStatus(id: string, status: string) {
    await supabase.from('assigned_tasks').update({ status }).eq('id', id);
    load();
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this task permanently?')) return;
    await supabase.from('assigned_tasks').delete().eq('id', id);
    load();
  }

  const shown = useMemo(() => filter === 'All' ? tasks : tasks.filter((t) => t.status === filter), [tasks, filter]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });

  if (loading) return <Spinner />;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><ClipboardList size={20} /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-tight">Assign Tasks</h1>
          <p className="text-sm text-slate-500">Give any employee a task — it appears in their Inbox and they mark it done there.</p>
        </div>
      </div>

      {msg && <div role="status" className={`px-4 py-2.5 rounded-lg text-sm border ${msg.startsWith('Could') || msg.startsWith('Pick') || msg.startsWith('Give') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>{msg}</div>}

      {/* create */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2"><Plus size={16} className="text-slate-500" /> New task</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs sm:col-span-2"><span className="block text-slate-500 mb-1">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Prepare the October window display" className={input} /></label>
          <label className="text-xs sm:col-span-2"><span className="block text-slate-500 mb-1">Details (optional)</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder="Anything the employee needs to know" className={`${input} resize-none`} /></label>
          <label className="text-xs"><span className="block text-slate-500 mb-1">Assign to</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={input}>
              <option value="">Select employee…</option>
              {emps.filter((e) => e.status !== 'Inactive').map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}{e.job_title ? ` · ${e.job_title}` : ''}{e.user_id ? '' : ' (no account)'}</option>
              ))}
            </select>
          </label>
          <label className="text-xs"><span className="block text-slate-500 mb-1">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={input}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs"><span className="block text-slate-500 mb-1">Due date (optional)</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={input} /></label>
          <div className="flex items-end">
            <button onClick={create} disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-60 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1">
              <Send size={14} /> {busy ? 'Assigning…' : 'Assign task'}
            </button>
          </div>
        </div>
        {assignee && !empById.get(assignee)?.user_id && (
          <p className="mt-2 text-xs text-amber-600">This employee has no login account yet, so the task won't appear in an Inbox until an account is created and linked in Settings → HR.</p>
        )}
      </section>

      {/* list */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 flex-wrap">
          <h2 className="text-base font-semibold text-slate-800">Tasks</h2>
          <div className="ml-auto flex rounded-lg border border-slate-300 overflow-hidden text-xs">
            {(['Open', 'Done', 'Cancelled', 'All'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{f}</button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No {filter === 'All' ? '' : filter.toLowerCase()} tasks.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((t) => {
              const overdue = t.status === 'Open' && !!t.due_date && t.due_date < today;
              return (
                <li key={t.id} className="px-5 py-3 flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{t.title}</span>
                      <Badge className={PRIORITY_BADGE[t.priority] ?? PRIORITY_BADGE.Medium}>{t.priority}</Badge>
                      <Badge className={STATUS_BADGE[t.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}>{t.status}</Badge>
                    </div>
                    {t.details && <p className="text-sm text-slate-500 mt-0.5">{t.details}</p>}
                    <div className="text-xs text-slate-400 mt-0.5">
                      {t.assignee_name ?? 'Unassigned'}{t.assigned_by ? ` · by ${t.assigned_by}` : ''}
                      {t.due_date && <> · <span className={overdue ? 'text-rose-600 font-medium' : ''}>{overdue ? 'Overdue ' : 'Due '}{t.due_date}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {t.status !== 'Done' && <button onClick={() => setStatus(t.id, 'Done')} title="Mark done" className="p-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50"><Check size={14} /></button>}
                    {t.status === 'Open' && <button onClick={() => setStatus(t.id, 'Cancelled')} title="Cancel" className="px-2 py-1 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-50">Cancel</button>}
                    {t.status !== 'Open' && <button onClick={() => setStatus(t.id, 'Open')} title="Reopen" className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><RotateCcw size={14} /></button>}
                    <button onClick={() => remove(t.id)} title="Delete" className="p-1.5 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50"><Trash2 size={14} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
