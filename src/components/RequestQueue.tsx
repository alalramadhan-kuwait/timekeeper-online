/**
 * The owner's request queue: three tabs over every request in the business.
 *
 * It replaced three separate lists — leave approvals, "with a manager", and
 * employee requests — that each had their own idea of what a request was. There
 * is one list now, and which tab a row lands in comes from
 * `v_requests.stage_owner`, decided in the database. This file renders; it does
 * not judge.
 *
 * The shop floor has its own screen with the same three tabs, reading the same
 * rules from src/shared/requests. The two look different because a phone in a
 * shop and a laptop in an office are different places. They cannot disagree.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, X, AlertTriangle, ShieldAlert, Clock, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from './ui';
import {
  loadRequests, decide, tabOf, counts, stageOf, standingLine, waitedFor, fieldChanges,
  type RequestRow, type Tab, type MyStage,
} from '../shared/requests';
import { applyCorrection, isApplicable, type CorrectionRequest } from '../lib/attendanceCorrection';

const TABS: { key: Tab; label: string }[] = [
  { key: 'action', label: 'Action required' },
  { key: 'waiting', label: 'Waiting on manager' },
  { key: 'done', label: 'Completed' },
];

const kuwaitDay = (d: string | null) => (!d ? '' : new Date(`${d}T12:00:00+03:00`)
  .toLocaleDateString('en-GB', { timeZone: 'Asia/Kuwait', day: '2-digit', month: 'short' }));

/** A v_requests row in the shape applyCorrection expects. */
const asCorrection = (r: RequestRow, requester: string): CorrectionRequest => ({
  id: r.id,
  request_type: r.kind,
  details: r.details ?? '',
  requester,
  attendance_date: r.attendance_date,
  proposed_clock_in: r.proposed_clock_in,
  proposed_clock_out: r.proposed_clock_out,
  attendance_record_id: r.attendance_record_id,
  employee_id: r.employee_id,
  user_id: r.employee_user_id,
  employee_name: r.employee_name,
  employee_location: r.outlet,
});

export default function RequestQueue({ role, userId, focusId, initialTab }: {
  role: string | null; userId: string | null; focusId?: string | null; initialTab?: Tab;
}) {
  const mine: MyStage = stageOf(role);
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'action');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  /* The request the owner is about to decide over the manager's head. Holding
     it here rather than deciding straight away is what forces the reason. */
  const [overriding, setOverriding] = useState<RequestRow | null>(null);
  const [overrideWhy, setOverrideWhy] = useState('');

  async function reload() { setRows(await loadRequests()); }
  useEffect(() => { reload(); }, []);

  const tally = useMemo(() => (rows ? counts(rows, mine) : null), [rows, mine]);
  const shown = useMemo(
    () => (rows ?? []).filter((r) => tabOf(r, mine) === tab), [rows, mine, tab]);

  /* Jump to whatever a notification pointed at, and open the tab it is in
     rather than leaving the reader on an empty list wondering. */
  useEffect(() => {
    if (!focusId || !rows) return;
    const hit = rows.find((r) => r.id === focusId);
    if (hit) setTab(tabOf(hit, mine));
  }, [focusId, rows, mine]);

  async function act(r: RequestRow, verdict: 'Approved' | 'Rejected', overrideReason?: string) {
    setBusy(r.id); setErr(null);

    /* A correction is only really approved when the attendance record moves.
       Writing the status first would leave "Approved" sitting beside an
       unchanged day, which is the state this whole thing exists to prevent. */
    let applied = false;
    const finalStage = mine === 'owner';
    if (verdict === 'Approved' && finalStage && r.kind === 'Attendance correction') {
      const asRow = asCorrection(r, r.employee_name ?? 'Someone');
      if (isApplicable(asRow)) {
        const problem = await applyCorrection(asRow, remarks[r.id]);
        if (problem) { setErr(problem); setBusy(null); return; }
        applied = true;
      }
    }

    const message = await decide(r, verdict, { stage: mine, remarks: remarks[r.id], overrideReason });
    if (message) { setErr(message); setBusy(null); return; }

    if (applied) {
      await supabase.from('employee_requests')
        .update({ applied_at: new Date().toISOString(), applied_by: userId })
        .eq('id', r.id);
    }
    setOverriding(null); setOverrideWhy('');
    await reload(); setBusy(null);
  }

  if (!rows) return <Spinner />;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-1 px-2 pt-2 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => {
          const n = t.key === 'action' ? tally?.action : t.key === 'waiting' ? tally?.waiting : tally?.done;
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap border-b-2 -mb-px transition-colors
                ${on ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t.label}
              {!!n && <span className={`ml-1.5 text-xs tabular-nums ${on ? 'text-slate-500' : 'text-slate-400'}`}>{n}</span>}
            </button>
          );
        })}
        {!!tally?.overdue && (
          <span className="ml-auto mr-2 mb-1 self-center">
            <Badge className="bg-rose-100 text-rose-700 border-rose-200">{tally.overdue} overdue</Badge>
          </span>
        )}
      </div>

      {err && (
        <p className="m-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</p>
      )}

      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          {tab === 'action' ? 'Nothing needs you right now.'
            : tab === 'waiting' ? 'Nothing is sitting with a manager.'
            : 'Nothing settled yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((r) => (
            <li key={r.id} id={`nid-${r.id}`}
              className={`px-4 py-3.5 ${r.id === focusId ? 'bg-amber-50' : ''}`}>
              <RequestCard
                r={r} mine={mine} busy={busy === r.id}
                remark={remarks[r.id] ?? ''}
                onRemark={(v) => setRemarks((s) => ({ ...s, [r.id]: v }))}
                onDecide={(v) => act(r, v)}
                onOverride={() => { setOverriding(r); setOverrideWhy(''); }}
              />
            </li>
          ))}
        </ul>
      )}

      {overriding && (
        <OverrideDialog
          r={overriding} why={overrideWhy} onWhy={setOverrideWhy}
          busy={busy === overriding.id}
          onCancel={() => { setOverriding(null); setOverrideWhy(''); }}
          onConfirm={(verdict) => act(overriding, verdict, overrideWhy)}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ one row */

function RequestCard({ r, mine, busy, remark, onRemark, onDecide, onOverride }: {
  r: RequestRow; mine: MyStage; busy: boolean; remark: string;
  onRemark: (v: string) => void;
  onDecide: (v: 'Approved' | 'Rejected') => void;
  onOverride: () => void;
}) {
  const changes = fieldChanges(r);
  const canDecideNow = r.stage_owner === mine;
  /* The owner looking at something still with the manager. Deciding it is
     allowed and sometimes necessary — a manager on leave should not freeze the
     shop — but it goes through the reason dialog, not this button. */
  const canOverride = mine === 'owner' && r.stage_owner === 'manager';

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-medium text-slate-800">
            {r.employee_name ?? 'Someone'}
            {r.outlet && <span className="text-slate-400 font-normal"> · {r.outlet}</span>}
          </p>
          <p className="text-sm text-slate-500">
            {r.kind}
            {r.attendance_date && <> — {kuwaitDay(r.attendance_date)}</>}
            {r.kind === 'Leave' && r.proposed_from && <> — {kuwaitDay(r.proposed_from)}</>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-medium ${canDecideNow ? 'text-amber-700' : 'text-slate-500'}`}>
            {standingLine(r, mine)}
          </p>
          {r.stage_owner !== 'nobody' && (
            <p className={`text-xs tabular-nums ${r.is_overdue ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>
              <Clock className="w-3 h-3 inline -mt-0.5 mr-0.5" />
              pending {waitedFor(r.hours_pending)}{r.is_overdue && ' · overdue'}
            </p>
          )}
        </div>
      </div>

      {r.on_behalf_name && (
        <p className="mt-1.5 text-xs text-slate-500">
          Filed by {r.on_behalf_name} on their behalf — still goes through the store manager.
        </p>
      )}

      {changes.length > 0 && (
        <div className="mt-2.5 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                <th className="text-left font-medium pr-6 pb-1">Field</th>
                <th className="text-left font-medium pr-6 pb-1">Current</th>
                <th className="text-left font-medium pb-1">Requested</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.field}>
                  <td className="pr-6 py-0.5 text-slate-500">{c.field}</td>
                  <td className="pr-6 py-0.5 tabular-nums text-slate-600">{c.current}</td>
                  <td className={`py-0.5 tabular-nums ${c.same ? 'text-slate-400' : 'font-medium text-slate-900'}`}>
                    {c.requested}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.current_shifts > 1 && (
        <p className="mt-1.5 text-xs text-slate-500">
          {r.current_shifts} shifts that day — the times above are the first in and the last out.
        </p>
      )}

      <p className="mt-2 text-sm text-slate-600">
        <span className="text-slate-400">Reason: </span>
        {r.reason?.trim() ? r.reason : <span className="italic text-slate-400">none given</span>}
      </p>

      {r.changes_nothing && (
        <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>This asks for the times already on the record, so approving it changes nothing.
            Reject it and ask what they meant to correct.</span>
        </p>
      )}

      {r.override_reason && (
        <p className="mt-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <ShieldAlert className="w-4 h-4 inline -mt-0.5 mr-1 text-slate-400" />
          {r.override_stage} stage overridden by {r.override_name ?? 'an owner'} — {r.override_reason}
        </p>
      )}

      {r.manager_remarks && (
        <p className="mt-2 text-sm text-slate-600">
          <span className="text-slate-400">Remarks: </span>{r.manager_remarks}
        </p>
      )}

      {(canDecideNow || canOverride) && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {canDecideNow ? (
            <>
              <input
                id={`remark-${r.id}`} value={remark} onChange={(e) => onRemark(e.target.value)}
                placeholder="Remarks (optional)"
                className="flex-1 min-w-[10rem] text-sm border border-slate-200 rounded-lg px-2.5 py-1.5
                           focus:outline-none focus:ring-2 focus:ring-slate-300" />
              <button type="button" disabled={busy} onClick={() => onDecide('Approved')}
                className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg
                           bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <Check className="w-4 h-4" /> Approve
              </button>
              <button type="button" disabled={busy} onClick={() => onDecide('Rejected')}
                className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg
                           border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                <X className="w-4 h-4" /> Reject
              </button>
            </>
          ) : (
            <button type="button" onClick={onOverride}
              className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg
                         border border-slate-200 text-slate-500 hover:bg-slate-50">
              <ShieldAlert className="w-4 h-4" /> Decide without the manager
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------- the deliberate bypass */

function OverrideDialog({ r, why, onWhy, busy, onCancel, onConfirm }: {
  r: RequestRow; why: string; onWhy: (v: string) => void; busy: boolean;
  onCancel: () => void; onConfirm: (v: 'Approved' | 'Rejected') => void;
}) {
  const ready = why.trim().length > 2;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="ovr-title">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
        <h3 id="ovr-title" className="font-semibold text-slate-800">Decide without the manager</h3>
        <p className="mt-1.5 text-sm text-slate-600">
          This is still waiting for {r.first_approver_name ?? 'the store manager'}. You can settle it
          yourself — but the skipped stage is recorded against your name, with this reason.
        </p>
        <label htmlFor="ovr-why" className="block mt-3 text-sm font-medium text-slate-700">
          Why are you skipping it?
        </label>
        <input id="ovr-why" value={why} onChange={(e) => onWhy(e.target.value)}
          placeholder="e.g. Hussein is on leave until Sunday"
          className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2
                     focus:outline-none focus:ring-2 focus:ring-slate-300" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="text-sm px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={!ready || busy} onClick={() => onConfirm('Rejected')}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600
                       hover:bg-slate-50 disabled:opacity-40">Reject</button>
          <button type="button" disabled={!ready || busy} onClick={() => onConfirm('Approved')}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white
                       hover:bg-emerald-700 disabled:opacity-40">Approve anyway</button>
        </div>
      </div>
    </div>
  );
}
