import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox as InboxIcon, CheckCircle, Clock, CalendarRange, FileText, Check, X, ChevronRight, ClipboardList, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from '../components/ui';
import { loadInbox, InboxData, type RequestApproval } from '../lib/inbox';
import { MONTHS } from '../lib/dateRange';
import { applyCorrection, isApplicable } from '../lib/attendanceCorrection';

const todayKuwait = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const kuwaitHM = (iso: string | null) => (!iso ? null : new Intl.DateTimeFormat('en-GB',
  { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)));
const kuwaitDay = (d: string) => new Date(`${d}T12:00:00+03:00`)
  .toLocaleDateString('en-GB', { timeZone: 'Asia/Kuwait', weekday: 'short', day: '2-digit', month: 'short' });

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
  const [sp] = useSearchParams();
  // A refused approval must say so: the database, not this page, decides who
  // may sign off which half of a leave request.
  const [err, setErr] = useState<string | null>(null);
  const focusId = sp.get('focus');
  // scroll to and highlight the record a notification pointed at
  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`nid-${focusId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, loading, data]);
  const hl = (id: string) => (id === focusId ? 'ring-2 ring-amber-400 rounded-lg' : '');

  async function reload() {
    if (!user) { setLoading(false); return; }
    setData(await loadInbox(user, profile, role));
    setLoading(false);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id, role]);

  /**
   * The store manager writes the first approval, the owners the final one.
   * Writing the wrong column is refused by the database, so the error is
   * shown rather than swallowed.
   */
  async function decideLeave(id: string, status: 'Approved' | 'Rejected', stage: 'manager' | 'final') {
    setBusy(`lv-${id}`);
    const patch = stage === 'manager' ? { manager_status: status } : { approval_status: status };
    const { error } = await supabase.from('leave_records').update(patch).eq('id', id);
    setErr(error ? error.message : null);
    await reload(); setBusy(null);
  }
  async function decideRequest(r: RequestApproval, status: 'Approved' | 'Rejected') {
    setBusy(`rq-${r.id}`);
    setErr(null);
    let applied = false;
    if (status === 'Approved') {
      const problem = await applyCorrection(r, remarks[r.id]);
      if (problem) { setErr(problem); setBusy(null); return; }
      applied = isApplicable(r);
    }
    const { error } = await supabase.from('employee_requests').update({
      status,
      manager_remarks: remarks[r.id]?.trim() || null,
      ...(applied ? { applied_at: new Date().toISOString(), applied_by: user?.id ?? null } : {}),
    }).eq('id', r.id);
    if (error) setErr(error.message);
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

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
          <span className="flex-1">{err}</span>
          <button onClick={() => setErr(null)} className="text-rose-500 hover:text-rose-700 shrink-0">Dismiss</button>
        </div>
      )}

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
                <li key={t.id} id={`nid-${t.id}`} className={`px-5 py-3 flex flex-wrap items-start gap-3 ${hl(t.id)}`}>
                  <div className={`min-w-0 flex-1 ${t.url ? 'cursor-pointer' : ''}`} onClick={() => t.url && navigate(t.url.replace(/^#/, ''))}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{t.title}</span>
                      <Badge className={PRIORITY[t.priority] ?? PRIORITY.Medium}>{t.priority}</Badge>
                      {t.url && <span className="text-xs text-blue-600">Open →</span>}
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
            <h2 className="text-sm font-semibold text-slate-700">
              {data.isStoreManager ? 'Leave requests — your approval (1st of 2)' : 'Leave requests awaiting approval'}
            </h2>
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">{data.leaveApprovals.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.leaveApprovals.map((l) => (
              <li key={l.id} id={`nid-${l.id}`} className={`px-5 py-3 flex flex-wrap items-center gap-3 ${hl(l.id)}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">{l.employee_name} · <span className="text-slate-500">{l.leave_type}</span></div>
                  <div className="text-xs text-slate-400">{l.leave_start} → {l.leave_end} ({l.days}d){l.notes ? ` · ${l.notes}` : ''}</div>
                  {/* An owner needs to know whether the manager has seen it yet. */}
                  {l.stage === 'final' && l.managerStatus !== 'Not required' && (
                    <div className="text-[11px] mt-0.5">
                      {l.managerStatus === 'Approved'
                        ? <span className="text-emerald-600">✓ {l.withManager ?? 'Manager'} approved</span>
                        : l.managerStatus === 'Skipped'
                        ? <span className="text-slate-500">Decided without the manager's step</span>
                        : <span className="text-amber-600">Waiting on {l.withManager ?? 'the manager'}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button disabled={busy === `lv-${l.id}`} onClick={() => decideLeave(l.id, 'Approved', l.stage)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"><Check size={13} /> {l.stage === 'manager' ? 'Approve (1st)' : 'Approve'}</button>
                  <button disabled={busy === `lv-${l.id}`} onClick={() => decideLeave(l.id, 'Rejected', l.stage)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 text-xs font-medium hover:bg-rose-50 disabled:opacity-50"><X size={13} /> Reject</button>
                  <button onClick={() => navigate('/leave')} className="text-xs text-blue-600 hover:underline">Open</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── With a manager: for the owners' information, not their action ── */}
      {data.awaitingManager.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <Info size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-600">With the manager — for your information</h2>
            <Badge className="bg-slate-100 text-slate-500 border-slate-200">{data.awaitingManager.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.awaitingManager.map((l) => (
              <li key={l.id} id={`nid-${l.id}`} className={`px-5 py-3 flex flex-wrap items-center gap-3 ${hl(l.id)}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-700">{l.employee_name} · <span className="text-slate-500">{l.leave_type}</span></div>
                  <div className="text-xs text-slate-400">{l.leave_start} → {l.leave_end} ({l.days}d){l.notes ? ` · ${l.notes}` : ''}</div>
                  <div className="text-[11px] mt-0.5 text-amber-600">Waiting on {l.withManager ?? 'the manager'} for the first approval</div>
                </div>
                {/* No buttons here on purpose: it is not the owners' turn. They
                    keep the power to decide outright — that lives on Leave
                    Tracking, where the manager's step is recorded as Skipped. */}
                <button onClick={() => navigate('/leave')} className="text-xs text-blue-600 hover:underline">Open</button>
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
              <li key={r.id} id={`nid-${r.id}`} className={`px-5 py-3 space-y-2 ${hl(r.id)}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{r.requester}</span>
                  <Badge className="bg-slate-100 text-slate-600 border-slate-200">{r.request_type}</Badge>
                  <span className="text-xs text-slate-400 ml-auto">{(r.created_at ?? '').slice(0, 10)}</span>
                </div>
                <CorrectionAsk r={r} />
                {r.request_type === 'Attendance correction' && r.attendance_date ? (
                  <p className="text-sm text-slate-600">
                    <span className="text-slate-400">Reason: </span>{reasonOnly(r)}
                  </p>
                ) : (
                  <p className="text-sm text-slate-600">{r.details}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input value={remarks[r.id] ?? ''} onChange={(e) => setRemarks((m) => ({ ...m, [r.id]: e.target.value }))}
                    placeholder="Remarks (optional)" className="flex-1 min-w-[10rem] px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
                  <button disabled={busy === `rq-${r.id}`} onClick={() => decideRequest(r, 'Approved')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"><Check size={13} /> Approve</button>
                  <button disabled={busy === `rq-${r.id}`} onClick={() => decideRequest(r, 'Rejected')}
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

/**
 * What a correction would change, as a before and an after.
 *
 * This used to say "Arrived 14:12 · Left unchanged", which is the request
 * without the thing it is a request about. An approver could not tell a missing
 * clock-in from one being moved by two hours, and "unchanged" read as a gap in
 * the form rather than as "leave that one alone" — so the decision was being
 * made on half the facts.
 *
 * Now each half of the day gets a row: what the record says, what is being
 * asked for, and whether that is actually a change.
 */
function CorrectionAsk({ r }: { r: RequestApproval }) {
  if (r.request_type !== 'Attendance correction' || !r.attendance_date) return null;
  const askIn = kuwaitHM(r.proposed_clock_in);
  const askOut = kuwaitHM(r.proposed_clock_out);
  if (!askIn && !askOut) return null;

  const nowIn = kuwaitHM(r.current_clock_in);
  const nowOut = kuwaitHM(r.current_clock_out);
  const nothingRecorded = r.current_shifts === 0;

  /* Still on the floor: the day has a clock-in and no clock-out yet, which is
     not the same as a missing one and must not read like it. */
  const stillIn = r.current_shifts > 0 && !nowOut;
  const rows: Array<{ label: string; now: string | null; nowWord?: string; ask: string | null }> = [
    { label: 'Check-in', now: nowIn, ask: askIn },
    { label: 'Check-out', now: nowOut, nowWord: stillIn ? 'Still clocked in' : undefined, ask: askOut },
  ];

  /* A request that asks for the times already on the record. Worth saying
     outright: it looks like a correction, and approving it does nothing. */
  const changesNothing = rows.every((row) => row.ask === null || row.ask === row.now);

  // "Sep", not en-GB's "Sept" — the same three letters the rest of the app uses.
  const day = new Date(`${r.attendance_date}T12:00:00+03:00`);
  const dayLabel = `${day.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Kuwait' })} `
    + `${Number(r.attendance_date.slice(8))} ${MONTHS[Number(r.attendance_date.slice(5, 7)) - 1]} `
    + r.attendance_date.slice(0, 4);

  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold text-slate-700">{dayLabel}</span>
        {nothingRecorded && (
          <span className="text-amber-700">nothing recorded that day — approving creates the record</span>
        )}
        {r.current_shifts > 1 && (
          <span className="text-amber-700">
            {r.current_shifts} shifts that day — the times below are its first in and last out
          </span>
        )}
      </div>

      <div className="grid grid-cols-[auto_auto_auto_1fr] items-center gap-x-3 gap-y-1">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Field</span>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Now</span>
        <span aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Requested</span>

        {rows.map((row) => {
          const changes = row.ask !== null && row.ask !== row.now;
          return (
            <Fragment key={row.label}>
              <span className="text-slate-500 whitespace-nowrap">{row.label}</span>
              <span className={`tabular-nums ${row.now ? 'text-slate-700' : 'text-slate-400 italic'}`}>
                {row.now ?? row.nowWord ?? 'Not recorded'}
              </span>
              <span className={changes ? 'text-slate-400' : 'text-transparent'} aria-hidden="true">→</span>
              <span className={
                row.ask === null ? 'text-slate-400'
                  : changes ? 'tabular-nums font-semibold text-slate-900'
                  : 'tabular-nums text-slate-400'
              }>
                {row.ask === null ? 'No change' : changes ? row.ask : `${row.ask} (same)`}
              </span>
            </Fragment>
          );
        })}
      </div>

      {changesNothing ? (
        <p className="text-amber-700">
          This asks for the times already on the record — approving it would change nothing.
        </p>
      ) : (
        <p className="text-slate-400">Approving writes the requested times onto the record.</p>
      )}
    </div>
  );
}

/**
 * The reason somebody gave, without the times repeated back.
 *
 * `details` is built for the places that have no structured fields, so it
 * carries the date and the asked-for times as prose. Printed under a table that
 * already says both, it reads as the same sentence twice.
 */
function reasonOnly(r: RequestApproval): string {
  if (r.request_type !== 'Attendance correction' || !r.attendance_date) return r.details;
  const at = r.details.indexOf(': ');
  const reason = at === -1 ? r.details : r.details.slice(at + 2).trim();
  return reason && reason.toLowerCase() !== 'no comment' ? reason : 'No reason given';
}
