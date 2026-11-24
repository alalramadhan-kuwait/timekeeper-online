/**
 * Attendance on the Today board (4.1.0), and the branch sheet behind it.
 *
 * The card is data only: one stacked bar of everyone (in, late, due later, no
 * shift time, away) with its counts, then each branch with its count (in /
 * needed) and a chip, and one row per person in fixed columns: dot, name,
 * clock-in time, status pill. Statuses come from the shared engine
 * (`standing()`); anybody whose shift time is not known is listed as "No time
 * set" and never called late or on time.
 *
 * Tapping a branch opens its sheet, which lives in the URL (?sheet=<branch>,
 * &person=<id> for one person's day), so Back closes it and a link can open it.
 * Closing a sheet that was opened from a link lands on Today, never outside the
 * app. On a phone the sheet is modal: the page behind it, top bar included, is
 * inert and does not scroll. From 1280px it docks to the right as a split view
 * and the page narrows beside it, so it covers nothing. Mark away, Set time and
 * Call live in the sheet. Tapping a person opens Attendance on their day.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronLeft, Phone, Clock, CalendarPlus, CalendarClock, Users, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FROM_TODAY } from './FromToday';
import { motion, useReducedMotion } from 'motion/react';
import { AttendanceDayDetail } from './AttendanceDayDetail';
import { WorkScheduleModal } from './WorkSchedule';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LEAVE_TYPES, workingDaysBetween, todayKuwait } from '../shared/kuwaitTime';
import { Dot, TONE, type Tone } from './TodayCard';
import { Pill, FIG, HEX, type BoardTone } from './TodayBoard';
import { IN, NOT_IN, noShiftTime, personLine, type StaffBranch, type StaffPerson } from './staffingFacts';

export { judgeBranch, clockInPattern, type StaffPerson, type StaffBranch } from './staffingFacts';

/** Something HR must act on, shown on the person's row: "Residency expired 23 Nov". */
export interface PersonAlert { text: string; href: string | null }

const first = (n: string) => n.trim().split(/\s+/)[0];
const toneOf: Record<StaffBranch['tone'], Tone> = { bad: 'red', warn: 'amber', good: 'green', idle: 'grey' };

/* ------------------------------------------------------------ the sheet in the URL */

interface SheetNavState { sheetDepth?: number; personPushed?: boolean }

/**
 * The branch sheet's place in the URL. Every sheet step this page pushed is
 * counted in the history entry's state, so Close goes back exactly that far;
 * a sheet that arrived by link (nothing pushed) closes by replacing the URL
 * with Today's.
 */
export function useBranchSheet() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const loc = useLocation();
  const st = (loc.state ?? {}) as SheetNavState;
  const depth = st.sheetDepth ?? 0;
  const sheet = params.get('sheet');
  const person = params.get('person');
  const to = useCallback((s: string | null, p: string | null) => {
    const q = new URLSearchParams(params);
    q.delete('sheet'); q.delete('person');
    if (s) q.set('sheet', s);
    if (s && p) q.set('person', p);
    const str = q.toString();
    return { pathname: loc.pathname, search: str ? `?${str}` : '' };
  }, [params, loc.pathname]);

  return {
    sheet, person,
    /** Open a branch (and a person in it). Switching branch replaces, so Back still closes. */
    open: (key: string, personId: string | null = null) => (sheet
      ? navigate(to(key, personId), { replace: true, state: { sheetDepth: depth } })
      : navigate(to(key, personId), { state: { sheetDepth: depth + 1 } })),
    openPerson: (id: string) => navigate(to(sheet, id), { state: { sheetDepth: depth + 1, personPushed: true } }),
    toBranch: () => (st.personPushed ? navigate(-1) : navigate(to(sheet, null), { replace: true, state: { sheetDepth: depth } })),
    close: () => (depth > 0 ? navigate(-depth) : navigate(to(null, null), { replace: true })),
  };
}

/** Wide enough for the split view. */
export function useWideSheet() {
  const q = '(min-width: 1280px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setWide(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return wide;
}

/* ------------------------------------------------------------------ the card */

/** One person's place on the board, from the shared engine's status: never invented. */
type Kind = 'in' | 'late' | 'due' | 'none' | 'away' | 'fix';
const KIND_TONE: Record<Kind, BoardTone> = { in: 'green', late: 'red', due: 'blue', none: 'grey', away: 'teal', fix: 'amber' };
const AWAY_SHORT: Record<string, string> = { 'Work trip': 'Trip', Annual: 'Leave', Sick: 'Sick', WFH: 'WFH' };
/** 25 → "25m", 92 → "1h 32m". */
const dur = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`);
/** A long name keeps its first and last word, so the columns stay put. */
const shortName = (n: string) => {
  const w = n.trim().split(/\s+/);
  return n.length > 18 && w.length > 2 ? `${w[0]} ${w[w.length - 1]}` : n.trim();
};

/** Null for somebody not working today (a day off): they are not on the board. */
export function placeOf(p: StaffPerson): { kind: Kind; pill: string; time: string } | null {
  if (p.status === 'off') return null;
  if (IN.includes(p.status)) {
    const late = (p.lateAfterGraceMin ?? 0) > 0;
    return {
      kind: late ? 'late' : 'in',
      pill: late ? `Late ${dur(p.lateAfterGraceMin!)}` : p.status === 'completed' && p.lastOut ? `Out ${p.lastOut}` : 'In',
      time: p.firstIn ?? '',
    };
  }
  if (p.status === 'needs_correction') return { kind: 'fix', pill: 'No clock-out', time: p.firstIn ?? '' };
  /* nobody with no shift time is called late or on time: there is nothing to compare with */
  if (noShiftTime(p)) return { kind: 'none', pill: 'No time set', time: '' };
  if (NOT_IN.includes(p.status)) return { kind: 'late', pill: p.status === 'missing' ? 'Missing' : 'Not in', time: '' };
  if (p.status === 'due_later') return { kind: 'due', pill: 'Due later', time: p.due ?? '' };
  if (p.status === 'on_leave') {
    const t = AWAY_SHORT[p.awayType ?? 'Annual'] ?? 'Away';
    return { kind: 'away', pill: p.awayTo ? `${t} · ${p.awayTo}` : t, time: '' };
  }
  return null;
}
const ORDER: Record<Kind, number> = { in: 0, late: 0, fix: 0, due: 2, none: 3, away: 4 };

/** The branch's count (in / needed) and its chip. */
function branchHead(b: StaffBranch, late: number): { count: string; countTone: BoardTone; chip: string; chipTone: BoardTone } {
  const count = `${b.onFloor}/${b.need}`;
  if (b.shop && !b.open) return { count, countTone: 'grey', chip: b.opensAt ? `Opens ${b.opensAt}` : 'Closed', chipTone: 'grey' };
  const short = b.need - b.onFloor;
  const countTone: BoardTone = short <= 0 ? 'green' : b.onFloor === 0 ? 'red' : 'amber';
  if (b.shop && short > 0) return { count, countTone, chip: `Short ${short}`, chipTone: b.onFloor === 0 ? 'red' : 'amber' };
  if (late > 0) return { count, countTone, chip: `${late} late`, chipTone: 'red' };
  if (short > 0) return { count, countTone, chip: `${short} not in`, chipTone: 'amber' };
  return { count, countTone, chip: 'All in', chipTone: 'green' };
}

/* "Late" covers everyone past their shift start: late in, not in yet, missing.
   A missing clock-out is its own amber column, shown only when there is one. */
const LEGEND: { kind: Kind; label: string; aria?: string }[] = [
  { kind: 'in', label: 'In' }, { kind: 'late', label: 'Late', aria: 'late or not in' }, { kind: 'fix', label: 'No out', aria: 'no clock-out' },
  { kind: 'due', label: 'Later' }, { kind: 'none', label: 'No time' }, { kind: 'away', label: 'Away' },
];
const dotStyle = (k: Kind) => (k === 'none'
  ? { background: '#ffffff', border: `2px solid ${HEX.grey}` }
  : { background: HEX[KIND_TONE[k]] });

export function StaffingCard({ branches, workStart, onChanged, at = null, alerts = {}, canAttendance = true }: {
  branches: StaffBranch[]; workStart: string; onChanged: () => void;
  /** When the figures were read, "11:30". */
  at?: string | null;
  /** By employee id: what HR must act on, shown on that person's row in the sheet. */
  alerts?: Record<string, PersonAlert>;
  /** Whether a person's row may open Attendance. */
  canAttendance?: boolean;
}) {
  const nav = useBranchSheet();
  const wide = useWideSheet();
  const [schedFor, setSchedFor] = useState<StaffPerson | null>(null);
  /* "Set Avenues times": one person after another, back to the sheet between them */
  const [timesFlow, setTimesFlow] = useState<{ branch: string; done: string[] } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  const branch = branches.find((b) => b.key === nav.sheet) ?? null;
  const person = branch?.people.find((p) => p.id === nav.person) ?? null;

  /* Focus goes back where it came from when the sheet closes. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (branch && !wasOpen.current) {
      wasOpen.current = true;
      if (!opener.current) {
        const a = document.activeElement;
        opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
      }
    } else if (!branch && wasOpen.current) {
      wasOpen.current = false;
      const back = opener.current?.isConnected ? opener.current : sectionRef.current?.closest<HTMLElement>('[id^="card-"]') ?? null;
      back?.focus({ preventScroll: true });
      opener.current = null;
      setTimesFlow(null);
    }
  }, [branch]);

  const startTimes = (b: StaffBranch) => {
    if (nav.sheet !== b.key || nav.person) nav.open(b.key);
    const next = b.people.find(noShiftTime);
    setTimesFlow({ branch: b.key, done: [] });
    if (next) setSchedFor(next);
  };
  const flowNext = timesFlow && branch && timesFlow.branch === branch.key
    ? branch.people.find((p) => noShiftTime(p) && !timesFlow.done.includes(p.id)) ?? null : null;

  /* everyone on the board, once: one stacked bar and its counts */
  const placed = branches.map((b) => ({
    b,
    people: b.people.map((p) => ({ p, at: placeOf(p) })).filter((x): x is { p: StaffPerson; at: NonNullable<ReturnType<typeof placeOf>> } => x.at !== null)
      .sort((x, y) => ORDER[x.at.kind] - ORDER[y.at.kind] || (x.at.time || '99').localeCompare(y.at.time || '99') || x.p.name.localeCompare(y.p.name)),
  }));
  const counts: Record<Kind, number> = { in: 0, late: 0, due: 0, none: 0, away: 0, fix: 0 };
  for (const x of placed) for (const y of x.people) counts[y.at.kind]++;
  const total = LEGEND.reduce((t, l) => t + counts[l.kind], 0);
  const legend = LEGEND.filter((l) => l.kind !== 'fix' || counts.fix > 0);

  return (
    <div ref={sectionRef}>
      {total > 0 && (
        <>
          <div className="mt-2.5 flex h-3.5 gap-[3px]" role="img"
            aria-label={legend.map((l) => `${counts[l.kind]} ${l.aria ?? l.label.toLowerCase()}`).join(', ')}>
            {legend.filter((l) => counts[l.kind] > 0).map((l) => (
              <span key={l.kind} className="block rounded box-border" style={{ flex: `${counts[l.kind]} 1 0`, ...dotStyle(l.kind) }} />
            ))}
          </div>
          <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${legend.length}, minmax(0, 1fr))` }} aria-hidden>
            {legend.map((l) => (
              <div key={l.kind} className="flex min-w-0 flex-col">
                <span className={`text-[20px] font-extrabold leading-6 tabular-nums ${counts[l.kind] ? FIG[KIND_TONE[l.kind]] : 'text-slate-400'}`}>{counts[l.kind]}</span>
                <span className="truncate text-[12px] font-semibold text-slate-500">{l.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {branches.length === 0 && <p className="mt-2 text-[15px] font-semibold text-slate-500">0 scheduled</p>}
      {placed.map(({ b, people }) => {
        const head = branchHead(b, people.filter((x) => x.at.kind === 'late').length);
        const active = nav.sheet === b.key;
        return (
          <div key={b.key} className="mt-2.5 border-t border-slate-200 pt-1">
            <button type="button" onClick={(e) => { opener.current = e.currentTarget; nav.open(b.key); }}
              aria-current={active ? 'true' : undefined} aria-haspopup="dialog"
              aria-label={`${b.name}: ${head.count.replace('/', ' of ')} in, ${head.chip}`}
              className={`-mx-2 flex min-h-[48px] w-[calc(100%+16px)] items-center gap-1.5 rounded-xl px-2 py-1 text-left hover:bg-slate-50 min-[360px]:gap-2.5 ${active ? 'bg-slate-100' : ''}`}>
              {/* the branch name wraps rather than being cut */}
              <span className="min-w-0 flex-1 break-words text-[17px] font-extrabold leading-tight text-slate-900">{b.name}</span>
              <span className={`shrink-0 text-[18px] font-extrabold tabular-nums min-[360px]:text-[22px] ${FIG[head.countTone]}`}>{head.count}</span>
              <Pill tone={head.chipTone}>{head.chip}</Pill>
              <ChevronRight size={16} className="-mr-1 shrink-0 text-slate-400" aria-hidden />
            </button>
            <ul>
              {people.map(({ p, at: pl }) => {
                const tone = KIND_TONE[pl.kind];
                const row = (
                  <>
                    <span className="block h-2.5 w-2.5 rounded-full box-border" style={dotStyle(pl.kind)} aria-hidden />
                    <span className={`min-w-0 break-words text-[14px] font-semibold leading-tight min-[360px]:truncate min-[360px]:text-[15px] min-[360px]:leading-normal ${pl.kind === 'none' || pl.kind === 'away' ? 'text-slate-500' : 'text-slate-900'}`}>{shortName(p.name)}</span>
                    <span className="text-right text-[13px] font-semibold tabular-nums text-slate-700 min-[360px]:text-[14px]">{pl.time}</span>
                    <Pill tone={tone} className="w-full !px-1 !text-[12px] min-[360px]:!px-1.5 min-[360px]:!text-[13px]">{pl.pill}</Pill>
                  </>
                );
                /* fixed columns at every width; under 360px the time and pill columns narrow so names stay whole */
                const cls = 'grid min-h-[44px] grid-cols-[10px_minmax(0,1fr)_38px_84px] items-center gap-1.5 min-[360px]:grid-cols-[10px_minmax(0,1fr)_44px_104px] min-[360px]:gap-2';
                return (
                  <li key={p.id}>
                    {canAttendance ? (
                      <Link to={`/attendance?day=today&branch=${encodeURIComponent(b.key)}&person=${encodeURIComponent(p.id)}`} state={FROM_TODAY}
                        className={`-mx-2 rounded-lg px-2 hover:bg-slate-50 ${cls}`}>{row}</Link>
                    ) : <div className={cls}>{row}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {branch && (
        <BranchSheet b={branch} person={person} at={at} wide={wide} alerts={alerts} workStart={workStart}
          editing={!!schedFor} onClose={nav.close} onPerson={nav.openPerson} onBack={nav.toBranch}
          onChanged={onChanged} onPersonSaved={() => { nav.toBranch(); onChanged(); }}
          onSetTime={setSchedFor} onStartTimes={() => startTimes(branch)}
          flow={timesFlow && timesFlow.branch === branch.key ? { next: flowNext, done: timesFlow.done.length } : null}
          onStopTimes={() => setTimesFlow(null)} />
      )}
      {schedFor && (
        <WorkScheduleModal employeeId={schedFor.id} employeeName={schedFor.name}
          onClose={() => {
            const id = schedFor.id;
            setSchedFor(null);
            setTimesFlow((f) => (f ? { ...f, done: [...f.done, id] } : f));
            onChanged();
          }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the sheet */

const GROUPS: { title: string; match: (p: StaffPerson) => boolean }[] = [
  { title: 'In today', match: (p) => IN.includes(p.status) },
  { title: 'Not in yet', match: (p) => NOT_IN.includes(p.status) && !p.timeUnknown },
  { title: 'No shift time set', match: noShiftTime },
  { title: 'Clock-out missing', match: (p) => p.status === 'needs_correction' },
  { title: 'Due later', match: (p) => p.status === 'due_later' && !p.timeUnknown },
  { title: 'Away or off', match: (p) => p.status === 'on_leave' || p.status === 'off' },
];

function BranchSheet({ b, person, at, wide, alerts, workStart, editing, flow, onClose, onPerson, onBack, onChanged, onPersonSaved, onSetTime, onStartTimes, onStopTimes }: {
  b: StaffBranch; person: StaffPerson | null; at: string | null; wide: boolean; alerts: Record<string, PersonAlert>; workStart: string;
  /** The shift editor is open over the sheet. */
  editing: boolean;
  flow: { next: StaffPerson | null; done: number } | null;
  onClose: () => void; onPerson: (id: string) => void; onBack: () => void; onChanged: () => void; onPersonSaved: () => void;
  onSetTime: (p: StaffPerson) => void; onStartTimes: () => void; onStopTimes: () => void;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const openedAt = useRef(0);
  useEffect(() => { openedAt.current = performance.now(); }, []);

  /* Escape closes, unless something opened over the sheet has the focus. */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || editing) return;
      const a = document.activeElement;
      if (a === document.body || a === null || ref.current?.contains(a)) onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, editing]);

  /* Phone: modal. The page behind, top bar included, is inert and does not scroll. */
  useEffect(() => {
    if (wide) return;
    const root = document.getElementById('root');
    const prev = document.body.style.overflow;
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';
    return () => {
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      document.body.style.overflow = prev;
    };
  }, [wide]);

  /* Focus moves into the sheet when it opens and when it changes view. */
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [b.key, person?.id]);
  /* Back from the shift editor: focus the next step. */
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!editing) (nextRef.current ?? titleRef.current)?.focus({ preventScroll: true }); }, [editing]);

  const hours = b.shop
    ? `${b.opensAt && b.closesAt ? `${b.opensAt}–${b.closesAt}` : b.closesAt ? `Closes ${b.closesAt}` : 'Closed'} · min ${b.need}`
    : 'Office';
  const unknown = b.people.filter(noShiftTime);

  const body = person ? (
    <PersonView p={person} alert={alerts[person.id]} workStart={workStart} onChanged={onChanged} onSaved={onPersonSaved} />
  ) : (
    <>
      <p className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-[14px] font-medium tabular-nums ${TONE[toneOf[b.tone]].soft} ${TONE[toneOf[b.tone]].border} ${b.tone === 'good' || b.tone === 'idle' ? 'text-slate-900' : TONE[toneOf[b.tone]].text}`}>
        <span className="mt-1.5"><Dot tone={toneOf[b.tone]} /></span>{b.label}
      </p>

      {flow ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3" aria-live="polite">
          {flow.next ? (
            <>
              <p className="text-[14px] text-slate-900">
                {flow.done ? 'Next' : 'First'} with no shift time: <b className="font-semibold">{flow.next.name}</b>
              </p>
              <div className="mt-2 flex gap-2">
                <button ref={nextRef} type="button" onClick={() => onSetTime(flow.next!)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-[14px] font-semibold text-white">
                  <CalendarClock size={16} aria-hidden /> Set {first(flow.next.name)}'s time
                </button>
                <button type="button" onClick={onStopTimes} className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-900">Stop</button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[14px] text-slate-900">
                {unknown.length ? `Everyone has been opened · ${unknown.length} still with no shift time` : `Every ${b.name} shift time is set`}
              </p>
              <button ref={nextRef} type="button" onClick={onStopTimes} className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-900">Done</button>
            </div>
          )}
        </div>
      ) : unknown.length > 0 && (
        <button type="button" onClick={onStartTimes}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-[15px] font-semibold text-white">
          <CalendarClock size={16} aria-hidden /> Set {b.name} {b.shop ? 'times' : 'hours'} ({unknown.length})
        </button>
      )}

      {GROUPS.map((g) => {
        const ps = b.people.filter(g.match).sort((x, y) => (x.due ?? '99').localeCompare(y.due ?? '99') || x.name.localeCompare(y.name));
        if (!ps.length) return null;
        return (
          <div key={g.title} className="mt-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-600">{g.title} · {ps.length}</h3>
            <ul className="mt-0.5 divide-y divide-slate-100">
              {ps.map((p) => <PersonRow key={p.id} p={p} alert={alerts[p.id]} onOpen={() => onPerson(p.id)} onSetTime={() => onSetTime(p)} />)}
            </ul>
          </div>
        );
      })}

      {b.pattern && (
        /* the last days' clock-ins as figures: no sentence, no question */
        <div className="mt-4 grid grid-cols-2 gap-2 tabular-nums">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[12px] font-semibold text-slate-500">Alone at opening</p>
            <p className={`text-[17px] font-extrabold ${b.pattern.alone * 2 >= b.pattern.days && b.pattern.alone ? 'text-[#b26b00]' : 'text-slate-900'}`}>{b.pattern.alone} of {b.pattern.days} days</p>
          </div>
          {b.pattern.secondFrom && (
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[12px] font-semibold text-slate-500">2nd in</p>
              <p className="text-[17px] font-extrabold text-slate-900">{b.pattern.secondFrom}{b.pattern.secondTo !== b.pattern.secondFrom ? `–${b.pattern.secondTo}` : ''}</p>
            </div>
          )}
          {b.pattern.lateOpens.map((l) => (
            <div key={l.date} className="rounded-xl bg-[#fde8e6] px-3 py-2">
              <p className="text-[12px] font-semibold text-[#b42318]">First in · {l.date}</p>
              <p className="text-[17px] font-extrabold text-[#b42318]">{l.at}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const panel = (
    <div ref={ref} role="dialog" aria-modal={wide ? undefined : true} aria-labelledby="branch-sheet-title"
      className={wide
        ? 'fixed bottom-0 right-0 top-0 z-20 flex w-[400px] flex-col border-l border-slate-200 bg-white'
        : 'flex h-full flex-col'}>
      {!wide && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300" aria-hidden />}
      <div className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-4 pb-3 pt-2" style={wide ? { paddingTop: 'calc(1rem + var(--sa-t))' } : undefined}>
        {person ? (
          <button type="button" onClick={onBack} aria-label={`Back to ${b.name}`}
            className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100"><ChevronLeft className="h-5 w-5" /></button>
        ) : (
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700" aria-hidden><Users className="h-5 w-5" /></div>
        )}
        <div className="min-w-0 flex-1">
          <h2 id="branch-sheet-title" ref={titleRef} tabIndex={-1} className="text-[19px] font-semibold leading-6 text-slate-900 focus:outline-none">
            {person ? person.name : `${b.name} today`}
          </h2>
          <p className="text-[13px] text-slate-600">{person ? `${b.name} · today` : `${hours}${at ? ` · at ${at}` : ''}`}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{body}</div>
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3" style={{ paddingBottom: 'max(12px, var(--sa-b))' }}>
        {/* opens Attendance on today, this branch (and this person), and Back returns to this sheet */}
        <Link to={`/attendance?day=today&branch=${encodeURIComponent(b.key)}${person ? `&person=${encodeURIComponent(person.id)}` : ''}`} state={FROM_TODAY}
          className="flex h-11 items-center justify-center gap-1 rounded-xl border border-slate-300 text-[15px] font-semibold text-slate-900 hover:bg-slate-50">
          {person ? `${person.name.split(' ')[0]}’s attendance` : `${b.name} attendance today`} <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );

  if (wide) return createPortal(panel, document.body);
  return createPortal(
    <>
      {/* over the top bar too: it dims, and a tap on it closes (not in the first moment, so the opening tap cannot) */}
      <div className="fixed inset-0 z-[45] bg-slate-900/50" aria-hidden
        onClick={() => { if (performance.now() - openedAt.current > 300) onClose(); }} />
      <motion.div className="fixed inset-x-0 bottom-0 z-[46] mx-auto max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-2xl"
        style={{ top: 'calc(var(--sa-t) + 40px)' }}
        initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.32 }}>
        {panel}
      </motion.div>
    </>,
    document.body,
  );
}

const TEXT: Record<Tone, string> = { green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-rose-700', grey: 'text-slate-600' };

function PersonRow({ p, alert, onOpen, onSetTime }: { p: StaffPerson; alert?: PersonAlert; onOpen: () => void; onSetTime: () => void }) {
  const l = personLine(p);
  const btn = 'grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50';
  return (
    <li className="py-1">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onOpen} className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 py-1 text-left hover:bg-slate-50">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium leading-5 text-slate-900">{p.name}</span>
            <span className={`block text-[13px] leading-[18px] tabular-nums ${TEXT[l.tone]}`}>{l.text}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        </button>
        {NOT_IN.includes(p.status) && p.phone && (
          <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${p.name}`} className={btn}><Phone size={16} /></a>
        )}
        {noShiftTime(p) && (
          <button type="button" onClick={onSetTime} aria-label={`Set a time for ${p.name}`} className={btn}><Clock size={16} /></button>
        )}
      </div>
      {alert && <AlertLine alert={alert} />}
    </li>
  );
}

function AlertLine({ alert }: { alert: PersonAlert }) {
  return alert.href
    ? <Link to={alert.href} state={FROM_TODAY} className="flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-rose-700 hover:underline">
        {alert.text} · Open HR record <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    : <p className="pb-1 text-[13px] font-semibold text-rose-700">{alert.text}</p>;
}

function PersonView({ p, alert, workStart, onChanged, onSaved }: {
  p: StaffPerson; alert?: PersonAlert; workStart: string; onChanged: () => void; onSaved: () => void;
}) {
  const l = personLine(p);
  return (
    <div className="pt-3">
      <p className={`text-[14px] font-medium tabular-nums ${TEXT[l.tone]}`}>{l.text}</p>
      {alert && <AlertLine alert={alert} />}
      {p.away && <p className="my-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">Away today: {p.away}</p>}
      <div className="mt-3"><MarkAway person={p} onSaved={onSaved} /></div>
      <AttendanceDayDetail employee={{ full_name: p.name, user_id: p.user_id, location: p.location }}
        date={todayKuwait()} workStart={workStart} onChanged={onChanged} />
    </div>
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
        className="mb-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
        <CalendarPlus size={16} /> Mark away
      </button>
    );
  }
  const inp = 'w-full min-h-[44px] rounded-lg border border-slate-300 px-2.5 py-2 text-[15px]';
  return (
    <div className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">Mark {first(person.name)} away</p>
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
        <button type="button" disabled={busy} onClick={save} className="min-h-[44px] flex-1 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={() => setOpenForm(false)} className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm">Cancel</button>
      </div>
    </div>
  );
}
