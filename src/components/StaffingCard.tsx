/**
 * Staffing on the Today page, built around the decisions a manager makes.
 *
 * One line per branch says whether it is covered (shops against the minimum
 * they need on the floor while open, the office against its own rota). Below
 * it, "To do" holds only buttons, and only when something needs doing. Tapping
 * a branch opens a bottom sheet that keeps what the clock recorded (In now)
 * apart from what the rota planned (Not in), and tapping a person opens their
 * attendance for today. Anybody whose shift time is not known is listed but
 * never called late or missing.
 */
import { useState } from 'react';
import { ChevronRight, Phone, ArrowLeft, Clock, CalendarPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from './ui';
import { AttendanceDayDetail } from './AttendanceDayDetail';
import { WorkScheduleModal } from './WorkSchedule';
import type { AttendanceStatus } from '../shared/attendanceStatus';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LEAVE_TYPES, workingDaysBetween, todayKuwait } from '../shared/kuwaitTime';

export interface StaffPerson {
  id: string;
  name: string;
  phone: string | null;
  user_id: string | null;
  location: string | null;
  branch: string;
  status: AttendanceStatus;
  /** Scheduled start, HH:MM; null when not known. */
  due: string | null;
  /** Expected today but the schedule carries no hours. */
  timeUnknown: boolean;
  firstIn: string | null;
  lastOut: string | null;
  /** Minutes past the scheduled start at the first clock-in. */
  arrivedLateMin: number | null;
  /** For someone not in yet: minutes since they were due. */
  lateNowMin: number | null;
  /** On approved leave or a work trip today: "Work trip · Expo · until 26 Nov". */
  away?: string | null;
}

export interface StaffBranch {
  key: string;
  name: string;
  /** A shop has opening hours and a minimum; the office has neither. */
  shop: boolean;
  opensAt: string | null;
  closesAt: string | null;
  open: boolean;
  need: number;
  onFloor: number;
  tone: 'bad' | 'warn' | 'good' | 'idle';
  label: string;
  people: StaffPerson[];
}

const IN: AttendanceStatus[] = ['working', 'completed'];
const NOT_IN: AttendanceStatus[] = ['late', 'missing'];

const hm = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
/** "Work trip · Expo · to 26 Nov" → "Expo"; without a note, the kind of leave. */
const awayWhy = (a: string | null | undefined) => { const parts = (a ?? '').split(' · '); return parts.length > 2 ? parts[1] : parts[0] || 'on leave'; };
const first = (n: string) => n.trim().split(/\s+/)[0];
/** Long names keep their first and last word so a row stays on one line; short ones stay whole. */
const fit = (n: string) => { const w = n.trim().split(/\s+/); return n.length > 18 && w.length > 2 ? `${w[0]} ${w[w.length - 1]}` : n; };

/** Whether a branch is covered, from the people judged by the shared engine. */
export function judgeBranch(b: Omit<StaffBranch, 'tone' | 'label' | 'onFloor' | 'need'> & { minStaff: number | null }): StaffBranch {
  const onFloor = b.people.filter((p) => p.status === 'working').length;
  if (b.shop) {
    const need = b.minStaff ?? 1;
    if (!b.open) {
      const before = b.opensAt !== null;
      return { ...b, need, onFloor, tone: 'idle', label: before ? `Opens ${b.opensAt}` : 'Closed' };
    }
    if (onFloor === 0 && need > 0) return { ...b, need, onFloor, tone: 'bad', label: 'Uncovered' };
    if (onFloor < need) return { ...b, need, onFloor, tone: 'warn', label: `Short ${need - onFloor}` };
    return { ...b, need, onFloor, tone: 'good', label: 'Covered' };
  }
  // The office: judged against its own rota, counting only people with a known time.
  const planned = b.people.filter((p) => IN.includes(p.status) || NOT_IN.includes(p.status) || (p.status === 'due_later' && !p.timeUnknown));
  const inCount = planned.filter((p) => IN.includes(p.status)).length;
  const missing = planned.filter((p) => NOT_IN.includes(p.status)).length;
  const label = missing ? `Missing ${missing}` : inCount < planned.length ? `${planned.length - inCount} due later` : 'All in';
  return { ...b, need: planned.length, onFloor: inCount, tone: missing ? 'warn' : 'good', label };
}

interface Action { key: string; label: string; primary?: boolean; href?: string; onClick?: () => void }

export function StaffingCard({ branches, workStart, onChanged }: {
  branches: StaffBranch[]; workStart: string; onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [person, setPerson] = useState<StaffPerson | null>(null);
  const [schedFor, setSchedFor] = useState<StaffPerson | null>(null);
  const branch = branches.find((b) => b.key === open) ?? null;

  /* one button per thing to do, most urgent first */
  const all = branches.flatMap((b) => b.people);
  const firstNames = new Map<string, number>();
  for (const p of all) firstNames.set(first(p.name), (firstNames.get(first(p.name)) ?? 0) + 1);
  const call = (p: StaffPerson) => {
    const f = first(p.name);
    const w = p.name.trim().split(/\s+/);
    return (firstNames.get(f) ?? 0) > 1 && w.length > 1 ? `${f} ${w[w.length - 1][0]}.` : f;
  };
  const actions: Action[] = [];
  for (const b of branches.filter((x) => x.tone === 'bad')) {
    actions.push({ key: `cover-${b.key}`, label: `Send cover to ${b.name}`, primary: true, onClick: () => setOpen(b.key) });
  }
  for (const b of branches.filter((x) => x.shop && x.open && x.tone === 'warn')) {
    const unknown = b.people.filter((p) => p.timeUnknown && !IN.includes(p.status));
    if (unknown.length) actions.push({ key: `times-${b.key}`, label: `Set ${b.name} times (${unknown.length})`, onClick: () => setOpen(b.key) });
    else if (!b.people.some((p) => NOT_IN.includes(p.status))) actions.push({ key: `cover-${b.key}`, label: `Send cover to ${b.name}`, onClick: () => setOpen(b.key) });
  }
  const late = all.filter((p) => NOT_IN.includes(p.status) && !p.timeUnknown)
    .sort((x, y) => (y.lateNowMin ?? 0) - (x.lateNowMin ?? 0));
  for (const p of late) {
    actions.push(p.phone
      ? { key: `call-${p.id}`, label: `Call ${call(p)}`, href: `tel:${p.phone.replace(/[^\d+]/g, '')}` }
      : { key: `see-${p.id}`, label: `Check ${call(p)}`, onClick: () => { setOpen(p.branch); setPerson(p); } });
  }
  for (const p of all.filter((x) => x.status === 'needs_correction')) {
    actions.push({ key: `fix-${p.id}`, label: `Fix ${call(p)}'s clock-out`, onClick: () => { setOpen(p.branch); setPerson(p); } });
  }
  const shown = actions.slice(0, 5);
  const more = actions.length - shown.length;

  const dot = { bad: 'bg-rose-600', warn: 'bg-amber-500', good: 'bg-emerald-600', idle: 'bg-slate-300' } as const;
  const txt = { bad: 'text-rose-700', warn: 'text-amber-700', good: 'text-emerald-700', idle: 'text-slate-500' } as const;

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between px-3 pt-2.5 pb-1">
        <h2 className="text-[15px] font-semibold text-slate-900">Staffing</h2>
        <Link to="/attendance" className="text-[13px] text-blue-600 hover:underline">Attendance →</Link>
      </div>
      {branches.length === 0 && <p className="px-3 pb-3 text-sm text-slate-500">Nobody is scheduled today</p>}
      {branches.map((b) => (
        <button key={b.key} type="button" onClick={() => setOpen(b.key)}
          className={`flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${b.tone === 'bad' ? 'bg-rose-50/60' : ''}`}>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[b.tone]}`} aria-hidden />
          <span className="flex-1 truncate text-[15px] font-medium text-slate-900">{b.name}</span>
          <span className="text-[15px] tabular-nums text-slate-700">{b.onFloor}/{b.need}</span>
          <span className={`w-[96px] text-right text-[13px] font-semibold ${txt[b.tone]}`}>{b.label}</span>
          <ChevronRight size={16} className="shrink-0 text-slate-300" aria-hidden />
        </button>
      ))}
      {shown.length > 0 && (
        <div className="border-t border-slate-200 px-3 pt-2 pb-2.5">
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">To do</p>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((a) => {
              const cls = `inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold ${a.primary ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-900 hover:bg-slate-50'}`;
              return a.href
                ? <a key={a.key} href={a.href} className={cls}><Phone size={13} aria-hidden />{a.label}</a>
                : <button key={a.key} type="button" onClick={a.onClick} className={cls}>{a.label}</button>;
            })}
            {more > 0 && <Link to="/attendance" className="inline-flex min-h-[36px] items-center px-1 text-[13px] font-semibold text-blue-600">+{more} more</Link>}
          </div>
        </div>
      )}

      {branch && (
        <Modal title={person ? person.name : `${branch.name} · ${branch.onFloor}/${branch.need}${branch.shop ? ' on floor' : ' in'}`}
          onClose={() => { setOpen(null); setPerson(null); }}>
          {person ? (
            <div>
              <button type="button" onClick={() => setPerson(null)} className="mb-2 inline-flex items-center gap-1 text-sm text-blue-600"><ArrowLeft size={14} /> {branch.name}</button>
              {person.away && <p className="mb-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">Away today: {person.away}</p>}
              <MarkAway person={person} onSaved={() => { setPerson(null); onChanged(); }} />
              <AttendanceDayDetail employee={{ full_name: person.name, user_id: person.user_id, location: person.location }}
                date={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })} workStart={workStart}
                onChanged={onChanged} />
            </div>
          ) : (
            <BranchSheet b={branch} onPerson={setPerson} onSetTime={(p) => { setOpen(null); setSchedFor(p); }} />
          )}
        </Modal>
      )}
      {schedFor && (
        <WorkScheduleModal employeeId={schedFor.id} employeeName={schedFor.name}
          onClose={() => { setSchedFor(null); onChanged(); }} />
      )}
    </section>
  );
}

function BranchSheet({ b, onPerson, onSetTime }: {
  b: StaffBranch; onPerson: (p: StaffPerson) => void; onSetTime: (p: StaffPerson) => void;
}) {
  const by = (f: (p: StaffPerson) => boolean) => b.people.filter(f).sort((x, y) => (x.due ?? '99').localeCompare(y.due ?? '99') || x.name.localeCompare(y.name));
  const inNow = by((p) => IN.includes(p.status));
  const notIn = by((p) => (NOT_IN.includes(p.status) || p.status === 'due_later') && !p.timeUnknown);
  const unknown = by((p) => (p.timeUnknown && !IN.includes(p.status)) || p.status === 'no_schedule');
  const fix = by((p) => p.status === 'needs_correction');
  const away = by((p) => p.status === 'off' || p.status === 'on_leave');
  /* compact, so a status always fits its column: 45m late, 1h 26m late */
  const late = (m: number | null) => (m && m > 0 ? `${m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`} late` : '');

  return (
    <div className="-mx-1 space-y-3 pb-2">
      {b.shop && <p className="px-1 text-[13px] text-slate-500">{b.opensAt && b.closesAt ? `Open ${b.opensAt}–${b.closesAt} · ` : ''}needs {b.need} on the floor</p>}
      <Section title="In now · actual clock-ins" tone="text-emerald-700" empty="Nobody has clocked in">
        {inNow.map((p) => (
          <Row key={p.id} p={p} onClick={() => onPerson(p)}
            time={p.status === 'completed' ? `${p.firstIn}–${p.lastOut}` : `in ${p.firstIn}`}
            status={late(p.arrivedLateMin) || 'on time'} statusTone={p.arrivedLateMin ? 'text-amber-700' : 'text-emerald-700'} />
        ))}
      </Section>
      <Section title="Not in · planned for today" tone="text-rose-700" empty="Nobody else is due">
        {notIn.map((p) => (
          <Row key={p.id} p={p} onClick={() => onPerson(p)} time={`due ${p.due}`}
            status={NOT_IN.includes(p.status) ? late(p.lateNowMin) : 'not yet due'}
            statusTone={NOT_IN.includes(p.status) ? 'text-rose-700 font-semibold' : 'text-slate-500'}
            action={NOT_IN.includes(p.status) && p.phone ? { label: `Call ${p.name}`, icon: <Phone size={15} />, href: `tel:${p.phone.replace(/[^\d+]/g, '')}` } : undefined} />
        ))}
      </Section>
      {unknown.length > 0 && (
        <Section title="No shift time · not counted" tone="text-slate-500">
          {unknown.map((p) => (
            <Row key={p.id} p={p} onClick={() => onPerson(p)} time="—"
              status={p.status === 'no_schedule' ? 'no schedule' : 'time not set'} statusTone="text-slate-500"
              action={{ label: `Set a time for ${p.name}`, icon: <Clock size={15} />, onClick: () => onSetTime(p) }} />
          ))}
        </Section>
      )}
      {fix.length > 0 && (
        <Section title="Clock-out missing" tone="text-amber-700">
          {fix.map((p) => <Row key={p.id} p={p} onClick={() => onPerson(p)} time={p.firstIn ? `in ${p.firstIn}` : '—'} status="no clock-out" statusTone="text-amber-700" />)}
        </Section>
      )}
      <Section title="Off or away" tone="text-slate-500" empty="Nobody today">
        {away.map((p) => (
          <Row key={p.id} p={p} onClick={() => onPerson(p)}
            time={p.status === 'on_leave' ? (p.away?.split(' · ').pop() ?? '') : '—'}
            status={p.status === 'on_leave' ? awayWhy(p.away) : 'day off'}
            statusTone={p.status === 'on_leave' ? 'text-teal-700' : 'text-slate-500'} />
        ))}
      </Section>
      <p className="px-1 text-[12px] text-slate-500">Tap a name to see their day or mark them away (work trip, leave).</p>
    </div>
  );
}

function Section({ title, tone, empty, children }: { title: string; tone: string; empty?: string; children: React.ReactNode[] | React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div>
      <p className={`px-1 text-[12px] font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      {has ? <ul className="divide-y divide-slate-100">{children}</ul> : <p className="px-1 py-1.5 text-[14px] text-slate-500">{empty}</p>}
    </div>
  );
}

/* Fixed columns, so a name, a time and a status always sit in the same place
   whatever the status: name | time | status | one action slot (kept even when empty). */
function Row({ p, time, status, statusTone, action, onClick }: {
  p: StaffPerson; time: string; status: string; statusTone?: string;
  action?: { label: string; icon: React.ReactNode; href?: string; onClick?: () => void }; onClick: () => void;
}) {
  const btn = 'flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50';
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-1">
      <button type="button" onClick={onClick}
        className="grid min-h-[44px] min-w-0 grid-cols-[minmax(0,1fr)_64px_92px] items-center gap-2 px-1 text-left hover:bg-slate-50">
        <span className="truncate text-[15px] text-slate-900">{fit(p.name)}</span>
        <span className="truncate text-right text-[13px] tabular-nums text-slate-600">{time}</span>
        <span className={`truncate text-right text-[13px] ${statusTone ?? 'text-slate-600'}`}>{status}</span>
      </button>
      <span className="flex justify-end">
        {action?.href && <a href={action.href} aria-label={action.label} className={btn}>{action.icon}</a>}
        {action?.onClick && <button type="button" onClick={action.onClick} aria-label={action.label} className={btn}>{action.icon}</button>}
      </span>
    </li>
  );
}

/* Away for a reason the rota cannot know: a work trip, or leave recorded on their behalf.
   Saved as a leave record, so attendance, the scoreboard and this page all treat it the
   same way; only Annual counts against the leave balance. An owner's entry is approved
   at once; anyone else's goes to the Inbox for approval, as every leave does. */
function MarkAway({ person, onSaved }: { person: StaffPerson; onSaved: () => void }) {
  const { role } = useAuth();
  const today = todayKuwait();
  const [openForm, setOpenForm] = useState(false);
  const [type, setType] = useState<string>('Work trip');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const days = to >= from ? workingDaysBetween(from, to) : 0;

  const save = async () => {
    if (to < from) { setMsg('The last day is before the first day.'); return; }
    if (type === 'Work trip' && !note.trim()) { setMsg('Say what the trip is for, e.g. Expo.'); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('leave_records').insert({
      employee_id: person.id, leave_type: type, leave_start: from, leave_end: to, days,
      notes: note.trim() || null, approval_status: 'Approved',
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    if (role !== 'admin') { setMsg('Sent to the Inbox for approval.'); setTimeout(onSaved, 1500); return; }
    onSaved();
  };

  if (!openForm) {
    return (
      <button type="button" onClick={() => setOpenForm(true)}
        className="mb-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
        <CalendarPlus size={16} /> Mark away
      </button>
    );
  }
  const inp = 'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-[15px]';
  return (
    <div className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">Mark {person.name.split(' ')[0]} away</p>
      <label className="block text-[13px] text-slate-600" htmlFor="away-type">Why</label>
      <select id="away-type" value={type} onChange={(e) => setType(e.target.value)} className={inp}>
        {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t === 'WFH' ? 'Working from home' : t === 'Annual' ? 'Annual leave' : t === 'Sick' ? 'Sick leave' : t}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="block text-[13px] text-slate-600" htmlFor="away-from">From</label>
          <input id="away-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className={inp} /></div>
        <div><label className="block text-[13px] text-slate-600" htmlFor="away-to">To</label>
          <input id="away-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inp} /></div>
      </div>
      <label className="block text-[13px] text-slate-600" htmlFor="away-note">{type === 'Work trip' ? 'What for' : 'Note (optional)'}</label>
      <input id="away-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === 'Work trip' ? 'e.g. Expo' : ''} className={inp} />
      <p className="text-[13px] text-slate-600">{days} working day{days === 1 ? '' : 's'}{type === 'Annual' ? ' · taken from annual leave' : ' · not taken from annual leave'}</p>
      {msg && <p className="text-[13px] text-rose-700">{msg}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="min-h-[40px] flex-1 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={() => setOpenForm(false)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">Cancel</button>
      </div>
    </div>
  );
}
