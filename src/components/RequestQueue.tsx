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
import { Check, X, AlertTriangle, ShieldAlert, BellRing } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner } from './ui';
import {
  loadRequests, decide, remind, applyScheduleChange, tabOf, counts, stageOf, standingLine,
  waitedFor, fieldChanges, reminderState, whenShort, requesterWords,
  type RequestRow, type Tab, type MyStage,
} from '../shared/requests';
import { applyCorrection, isApplicable, type CorrectionRequest } from '../lib/attendanceCorrection';
import { leaveBalance, leaveTypeOf, type LeaveBalance } from '../shared/portalRules';

const TABS: { key: Tab; label: string }[] = [
  { key: 'action', label: 'Needs you' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'done', label: 'Done' },
];

const kuwaitDay = (d: string | null) => (!d ? '' : new Date(`${d}T12:00:00+03:00`)
  .toLocaleDateString('en-GB', { timeZone: 'Asia/Kuwait', weekday: 'short', day: 'numeric', month: 'short' }));

const initials = (name: string | null) => (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

const ordinal = (n: number) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/** What the Inbox header says, worked out from the same rows as the tabs. */
export interface QueueSummary { action: number; waiting: number; overdue: number; waitingOn: string | null }

/** Who a waiting request is sitting with, so the Waiting tab can group by them. */
const holderOf = (r: RequestRow) => (r.stage_owner === 'manager'
  ? (r.first_approver_name ?? 'the store manager')
  : 'the owners');

interface LeaveContext { balance: LeaveBalance; hasNote: boolean; days: number; type: string }

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

export default function RequestQueue({ role, userId, focusId, initialTab, onSummary }: {
  role: string | null; userId: string | null; focusId?: string | null; initialTab?: Tab;
  onSummary?: (s: QueueSummary) => void;
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
  /* For a leave request: where that person's leave already stands this year —
     the same numbers as the Leave page — so the decision has its context. */
  const [leaveCtx, setLeaveCtx] = useState<Record<string, LeaveContext>>({});

  async function reload() {
    const all = await loadRequests();
    setRows(all);
    const open = all.filter((r) => r.kind === 'Leave' && r.stage_owner !== 'nobody' && r.employee_id);
    if (open.length === 0) { setLeaveCtx({}); return; }
    const ids = [...new Set(open.map((r) => r.employee_id!))];
    const [lv, em] = await Promise.all([
      supabase.from('leave_records').select('id, employee_id, leave_type, leave_start, leave_end, days, approval_status, document_url').in('employee_id', ids),
      supabase.from('employees').select('id, annual_leave_entitlement').in('id', ids),
    ]);
    const leaves = (lv.data ?? []) as Array<{ id: string; employee_id: string; leave_type: string | null; leave_start: string; leave_end: string; days: number | null; approval_status: string; document_url: string | null }>;
    const ent = new Map(((em.data ?? []) as Array<{ id: string; annual_leave_entitlement: number | null }>).map((e) => [e.id, e.annual_leave_entitlement]));
    const ctx: Record<string, LeaveContext> = {};
    for (const r of open) {
      const own = leaves.filter((l) => l.employee_id === r.employee_id);
      const self = own.find((l) => l.id === r.id);
      ctx[r.id] = {
        balance: leaveBalance(own, ent.get(r.employee_id!) ?? null),
        hasNote: !!self?.document_url,
        days: Number(self?.days ?? 0),
        type: leaveTypeOf(self ?? { leave_type: null }),
      };
    }
    setLeaveCtx(ctx);
  }
  useEffect(() => { reload(); }, []);

  const tally = useMemo(() => (rows ? counts(rows, mine) : null), [rows, mine]);
  const shown = useMemo(
    () => (rows ?? []).filter((r) => tabOf(r, mine) === tab), [rows, mine, tab]);

  /* Waiting, grouped by whoever is holding it, oldest group first. */
  const groups = useMemo(() => {
    if (tab !== 'waiting') return [];
    const m = new Map<string, RequestRow[]>();
    for (const r of shown) m.set(holderOf(r), [...(m.get(holderOf(r)) ?? []), r]);
    return [...m.entries()]
      .map(([who, rs]) => ({ who, rows: [...rs].sort((a, b) => b.hours_pending - a.hours_pending) }))
      .sort((a, b) => b.rows[0]!.hours_pending - a.rows[0]!.hours_pending);
  }, [shown, tab]);

  useEffect(() => {
    if (!rows || !onSummary) return;
    const waitingRows = rows.filter((r) => tabOf(r, mine) === 'waiting');
    const holders = [...new Set(waitingRows.map(holderOf))];
    onSummary({
      action: tally?.action ?? 0,
      waiting: waitingRows.length,
      overdue: rows.filter((r) => r.is_overdue && r.stage_owner !== 'nobody').length,
      waitingOn: holders.length === 1 ? holders[0]! : null,
    });
  }, [rows, tally, mine, onSummary]);

  /* Jump to whatever a notification pointed at, and open the tab it is in
     rather than leaving the reader on an empty list wondering. */
  useEffect(() => {
    if (!focusId || !rows) return;
    const hit = rows.find((r) => r.id === focusId);
    if (hit) setTab(tabOf(hit, mine));
  }, [focusId, rows, mine]);

  /* Chasing whoever is holding it up. The cooldown and the recipient are the
     database's business — the same function the nightly job calls — so a refusal
     comes back as a sentence rather than being second-guessed here. */
  async function nudge(r: RequestRow) {
    setBusy(r.id); setErr(null);
    const refused = await remind(r);
    if (refused) setErr(refused);
    await reload(); setBusy(null);
  }

  /** One reminder per request in a group that can take one now. */
  async function nudgeAll(rs: RequestRow[]) {
    const due = rs.filter((r) => reminderState(r, mine).can);
    if (due.length === 0) return;
    setBusy(`group-${holderOf(rs[0]!)}`); setErr(null);
    const refusals = (await Promise.all(due.map((r) => remind(r)))).filter(Boolean);
    if (refusals.length) setErr(refusals[0]!);
    await reload(); setBusy(null);
  }

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

    /* Same rule as a correction: approving a schedule change that never reaches
       the schedule is two words for one state. */
    if (verdict === 'Approved' && finalStage && r.kind === 'Schedule change') {
      const problem = await applyScheduleChange(r);
      if (problem) { setErr(problem); setBusy(null); return; }
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

  const card = (r: RequestRow) => (
    <li key={r.id} id={`nid-${r.id}`}>
      <RequestCard
        r={r} mine={mine} busy={busy === r.id} focused={r.id === focusId}
        leave={leaveCtx[r.id]}
        remark={remarks[r.id] ?? ''}
        onRemark={(v) => setRemarks((s) => ({ ...s, [r.id]: v }))}
        onDecide={(v) => act(r, v)}
        onRemind={() => nudge(r)}
        onOverride={() => { setOverriding(r); setOverrideWhy(''); }}
      />
    </li>
  );

  return (
    <section className="space-y-3">
      <div role="tablist" aria-label="Requests" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
        {TABS.map((t) => {
          const n = t.key === 'action' ? tally?.action : t.key === 'waiting' ? tally?.waiting : undefined;
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
              className={`min-h-[40px] rounded-lg px-1 text-sm whitespace-nowrap transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
                ${on ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
              {t.label}
              {!!n && (
                <span className={`ml-1.5 rounded-full px-1.5 py-px text-xs tabular-nums
                  ${t.key === 'action' ? 'bg-slate-900 text-white' : on ? 'bg-amber-400 text-amber-950' : 'text-slate-500'}`}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {err && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
          {tab === 'action' ? 'Nothing needs you right now.'
            : tab === 'waiting' ? 'Nothing is waiting on anyone.'
            : 'Nothing settled yet.'}
        </p>
      ) : tab === 'waiting' ? (
        <div className="space-y-5">
          {groups.map((g) => {
            const first = g.who.split(' ')[0];
            const canAny = g.rows.some((r) => reminderState(r, mine).can);
            const oldest = g.rows[0]!;
            const groupBusy = busy === `group-${g.who}`;
            return (
              <div key={g.who} className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden className="h-9 w-9 shrink-0 rounded-full bg-amber-200 text-amber-900 text-sm font-bold flex items-center justify-center">
                    {g.who.startsWith('the ') ? '·' : initials(g.who)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-slate-900">With {g.who} · {g.rows.length}</p>
                    <p className={`text-xs ${oldest.is_overdue ? 'text-rose-700' : 'text-slate-500'}`}>
                      Oldest {waitedFor(oldest.hours_pending)}{g.rows.some((r) => r.is_overdue) && ` · ${g.rows.filter((r) => r.is_overdue).length} overdue`}
                    </p>
                  </div>
                </div>
                {mine === 'owner' && oldest.stage_owner === 'manager' && (
                  <button type="button" disabled={!canAny || groupBusy} onClick={() => nudgeAll(g.rows)}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50
                               text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">
                    <BellRing className="w-4 h-4" />
                    {canAny
                      ? `Remind ${first} about ${g.rows.length === 1 ? 'it' : g.rows.length === 2 ? 'both' : `all ${g.rows.length}`}`
                      : `${first} was reminded recently`}
                  </button>
                )}
                <ul className="space-y-2.5">{g.rows.map(card)}</ul>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="space-y-2.5">{shown.map(card)}</ul>
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

/* ------------------------------------------------------------------ one card */

const KIND_CHIP: Record<string, string> = {
  'Attendance correction': 'bg-blue-100 text-blue-800',
  'Schedule change': 'bg-violet-100 text-violet-800',
  'HR update': 'bg-slate-200 text-slate-700',
};
const LEAVE_CHIP: Record<string, string> = {
  Sick: 'bg-rose-100 text-rose-800',
  Annual: 'bg-sky-100 text-sky-800',
  WFH: 'bg-violet-100 text-violet-800',
};

function RequestCard({ r, mine, busy, focused, leave, remark, onRemark, onDecide, onRemind, onOverride }: {
  r: RequestRow; mine: MyStage; busy: boolean; focused: boolean; leave?: LeaveContext; remark: string;
  onRemark: (v: string) => void;
  onDecide: (v: 'Approved' | 'Rejected') => void;
  onRemind: () => void;
  onOverride: () => void;
}) {
  const changes = fieldChanges(r).filter((c) => !c.same);
  const nudge = reminderState(r, mine);
  const canDecideNow = r.stage_owner === mine;
  /* The owner looking at something still with the manager. Deciding it is
     allowed and sometimes necessary — a manager on leave should not freeze the
     shop — but it goes through the reason dialog, not this button. */
  const canOverride = mine === 'owner' && r.stage_owner === 'manager';
  const words = requesterWords(r);
  const settled = r.stage_owner === 'nobody';

  const leaveType = r.kind === 'Leave' ? (leave?.type ?? (r.reason ?? '').split(' - ')[0] ?? 'Leave') : null;
  const chip = leaveType
    ? { text: leaveType === 'WFH' ? 'Work from home' : `${leaveType} leave`, cls: LEAVE_CHIP[leaveType] ?? 'bg-slate-200 text-slate-700' }
    : { text: r.kind === 'Attendance correction' ? 'Correction' : r.kind, cls: KIND_CHIP[r.kind] ?? 'bg-slate-200 text-slate-700' };
  const day = r.kind === 'Leave'
    ? (r.proposed_from && r.proposed_until && r.proposed_until !== r.proposed_from
        ? `${kuwaitDay(r.proposed_from)} – ${kuwaitDay(r.proposed_until)}`
        : kuwaitDay(r.proposed_from))
    : kuwaitDay(r.attendance_date ?? r.proposed_from);
  const days = leave?.days ? ` · ${leave.days} ${leave.days === 1 ? 'day' : 'days'}` : '';

  /* For a sick request: which sick day of the year this would be, and whether a note came with it. */
  const leaveLine = leave && leaveType === 'Sick'
    ? `${leave.days === 1 ? `${ordinal(leave.balance.sick + 1)} sick day this year` : `${leave.balance.sick} sick ${leave.balance.sick === 1 ? 'day' : 'days'} so far this year`} · ${leave.hasNote ? 'sick note attached' : 'no sick note'}`
    : leave && leaveType === 'Annual'
      ? `${leave.balance.remaining} annual ${leave.balance.remaining === 1 ? 'day' : 'days'} left before this`
      : null;

  return (
    <div className={`rounded-2xl border bg-white p-4 space-y-2.5
      ${canDecideNow ? 'border-slate-200 shadow-[0_2px_8px_rgba(15,23,42,0.06)]' : r.is_overdue ? 'border-rose-200' : 'border-slate-200'}
      ${focused ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${chip.cls}`}>{chip.text}</span>
        <span className="text-sm text-slate-700">{day}{days}</span>
        {!settled && (
          <span className={`ml-auto shrink-0 text-xs tabular-nums ${r.is_overdue ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
            {waitedFor(r.hours_pending)}{r.reminder_count > 0 && ` · reminded ${r.reminder_count}×`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {canDecideNow && (
          <span aria-hidden className="h-10 w-10 shrink-0 rounded-full bg-indigo-100 text-indigo-800 text-sm font-bold flex items-center justify-center">
            {initials(r.employee_name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-900">{r.employee_name ?? 'Someone'}</p>
          {(canDecideNow || settled) && (
            <p className="text-xs text-slate-500">
              {settled ? standingLine(r, mine) : <>{r.outlet ?? ''}{r.outlet ? ' · ' : ''}sent {whenShort(r.submitted_at)}</>}
            </p>
          )}
        </div>
      </div>

      {changes.length > 0 && (
        <div className="space-y-0.5 text-[15px] tabular-nums text-slate-900">
          {changes.map((c) => (
            <p key={c.field}>
              {c.field === 'Check-in' ? 'In' : c.field === 'Check-out' ? 'Out' : c.field}{' '}
              {c.current !== '—' && (
                <span className={c.current === 'Missing' || c.current === 'Still clocked in' ? 'text-slate-400' : 'text-slate-400 line-through'}>
                  {c.current === 'Still clocked in' ? 'missing' : c.current === 'Missing' ? 'missing' : c.current}
                </span>
              )}
              {c.current !== '—' && ' → '}<b>{c.requested}</b>
            </p>
          ))}
        </div>
      )}

      {r.current_shifts > 1 && (
        <p className="text-xs text-slate-500">{r.current_shifts} shifts that day: first in and last out shown.</p>
      )}

      {leaveLine && <p className={`text-sm ${leaveType === 'Sick' && !leave?.hasNote ? 'text-rose-800' : 'text-slate-600'}`}>{leaveLine}</p>}

      {words && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{words}”</p>}

      {r.manager_decided_at && r.manager_decided_name && !settled && (
        <p className="text-xs text-emerald-700">
          <Check className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
          {r.manager_decided_name} approved · {whenShort(r.manager_decided_at)}
          {r.manager_remarks && <span className="text-slate-500"> — “{r.manager_remarks}”</span>}
        </p>
      )}

      {r.on_behalf_name && (
        <p className="text-xs text-slate-500">Filed by {r.on_behalf_name} on their behalf.</p>
      )}

      {r.changes_nothing && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>This asks for the times already on the record, so approving it changes nothing.
            Reject it and ask what they meant to correct.</span>
        </p>
      )}

      {r.override_reason && (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <ShieldAlert className="w-4 h-4 inline -mt-0.5 mr-1 text-slate-400" />
          {r.override_stage} stage overridden by {r.override_name ?? 'an owner'} — {r.override_reason}
        </p>
      )}

      {settled && r.manager_remarks && (
        <p className="text-sm text-slate-600"><span className="text-slate-400">Remarks: </span>{r.manager_remarks}</p>
      )}

      {canDecideNow && (
        <div className="space-y-2 pt-1">
          <label htmlFor={`remark-${r.id}`} className="block text-xs text-slate-500">
            Note to {r.employee_name?.split(' ')[0] ?? 'them'} (optional)
          </label>
          <input
            id={`remark-${r.id}`} value={remark} onChange={(e) => onRemark(e.target.value)}
            placeholder={leaveType === 'Sick' && !leave?.hasNote ? 'e.g. Please send the sick note' : 'Optional'}
            className="w-full min-h-[44px] text-[15px] border border-slate-300 rounded-xl px-3
                       focus:outline-none focus:ring-2 focus:ring-slate-300" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => onDecide('Rejected')}
              className="min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white
                         text-base font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              <X className="w-4 h-4" /> Reject
            </button>
            <button type="button" disabled={busy} onClick={() => onDecide('Approved')}
              className="min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700
                         text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              <Check className="w-4 h-4" /> Approve
            </button>
          </div>
        </div>
      )}

      {!canDecideNow && !settled && (
        <div className="flex items-center gap-4 pt-0.5 text-sm">
          {mine !== 'owner' && (
            <button type="button" disabled={!nudge.can || busy} onClick={onRemind} title={nudge.blocked ?? undefined}
              className="inline-flex items-center gap-1 font-medium text-amber-800 hover:underline disabled:opacity-40 disabled:no-underline">
              <BellRing className="w-4 h-4" /> Remind
            </button>
          )}
          {canOverride && (
            <button type="button" onClick={onOverride}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 hover:underline">
              <ShieldAlert className="w-4 h-4" /> Decide myself
            </button>
          )}
          {nudge.lastLine && <span className="ml-auto text-xs text-slate-400">{nudge.lastLine}</span>}
        </div>
      )}
    </div>
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
