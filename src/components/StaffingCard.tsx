/**
 * Staffing on the Today page, built around the decisions a manager makes.
 *
 * One line per branch says what is known: who the clock has in, the minimum a
 * shop needs on the floor, and how many have no shift time to judge them by
 * ("Avenues 1 in · minimum 2 · 3 with no shift time"). Below it, "To do" holds
 * only buttons, and only when something needs doing.
 *
 * Tapping a branch opens its sheet, which lives in the URL (?sheet=<branch>,
 * &person=<id> for one person's day), so Back closes it and a link can open it.
 * Closing a sheet that was opened from a link lands on Today, never outside the
 * app. On a phone the sheet is modal: the page behind it, top bar included, is
 * inert and does not scroll. From 1280px it docks to the right as a split view
 * and the page narrows beside it, so it covers nothing.
 *
 * Anybody whose shift time is not known is listed but never called late,
 * missing or on time.
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
import { Chip, Dot, TONE, type Tone } from './TodayCard';
import { IN, NOT_IN, noShiftTime, personLine, type StaffBranch, type StaffPerson } from './staffingFacts';

export { judgeBranch, clockInPattern, type StaffPerson, type StaffBranch } from './staffingFacts';

/** Something HR must act on, shown on the person's row: "Residency expired 23 Nov". */
export interface PersonAlert { text: string; href: string | null }

const first = (n: string) => n.trim().split(/\s+/)[0];
const toneOf: Record<StaffBranch['tone'], Tone> = { bad: 'red', warn: 'amber', good: 'green', idle: 'grey' };
const labelTone: Record<StaffBranch['tone'], string> = { bad: 'text-rose-700', warn: 'text-amber-700', good: 'text-slate-700', idle: 'text-slate-700' };

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

type Run = { open: string; person?: string } | { times: string };
interface Action { key: string; label: string; primary?: boolean; href?: string; run?: Run }

export function StaffingCard({ branches, workStart, onChanged, embedded = false, at = null, alerts = {} }: {
  branches: StaffBranch[]; workStart: string; onChanged: () => void;
  /** Inside a Today card, which already carries the title and the Attendance link. */
  embedded?: boolean;
  /** When the figures were read, "11:30". */
  at?: string | null;
  /** By employee id: what HR must act on, shown on that person's row in the sheet. */
  alerts?: Record<string, PersonAlert>;
}) {
  const nav = useBranchSheet();
  const wide = useWideSheet();
  const [schedFor, setSchedFor] = useState<StaffPerson | null>(null);
  /* "Set Avenues times": one person after another, back to the sheet between them */
  const [timesFlow, setTimesFlow] = useState<{ branch: string; done: string[] } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

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

  const remember = (e: React.MouseEvent<HTMLElement>) => { opener.current = e.currentTarget; };

  const startTimes = (b: StaffBranch, e?: React.MouseEvent<HTMLElement>) => {
    if (e) remember(e);
    if (nav.sheet !== b.key || nav.person) nav.open(b.key);
    const next = b.people.find(noShiftTime);
    setTimesFlow({ branch: b.key, done: [] });
    if (next) setSchedFor(next);
  };
  const flowNext = timesFlow && branch && timesFlow.branch === branch.key
    ? branch.people.find((p) => noShiftTime(p) && !timesFlow.done.includes(p.id)) ?? null : null;

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
    actions.push({ key: `cover-${b.key}`, label: `Send cover to ${b.name}`, primary: true, run: { open: b.key } });
  }
  for (const b of branches.filter((x) => x.shop && x.open && x.tone === 'warn')) {
    const unknown = b.people.filter(noShiftTime);
    if (unknown.length) actions.push({ key: `times-${b.key}`, label: `Set ${b.name} times (${unknown.length})`, run: { times: b.key } });
    else if (!b.people.some((p) => NOT_IN.includes(p.status))) actions.push({ key: `cover-${b.key}`, label: `Send cover to ${b.name}`, run: { open: b.key } });
  }
  const late = all.filter((p) => NOT_IN.includes(p.status) && !p.timeUnknown)
    .sort((x, y) => (y.lateNowMin ?? 0) - (x.lateNowMin ?? 0));
  for (const p of late) {
    actions.push(p.phone
      ? { key: `call-${p.id}`, label: `Call ${call(p)}`, href: `tel:${p.phone.replace(/[^\d+]/g, '')}` }
      : { key: `see-${p.id}`, label: `Check ${call(p)}`, run: { open: p.branch, person: p.id } });
  }
  for (const p of all.filter((x) => x.status === 'needs_correction')) {
    actions.push({ key: `fix-${p.id}`, label: `Fix ${call(p)}'s clock-out`, run: { open: p.branch, person: p.id } });
  }
  const act = (r: Run, e: React.MouseEvent<HTMLElement>) => {
    if ('times' in r) { const b = branches.find((x) => x.key === r.times); if (b) startTimes(b, e); return; }
    remember(e);
    nav.open(r.open, r.person ?? null);
  };
  const shown = actions.slice(0, 5);
  const more = actions.length - shown.length;

  return (
    <section ref={sectionRef} className={embedded ? '-mx-4 -mb-4 overflow-hidden rounded-b-2xl' : 'mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white'}>
      {!embedded && (
        <div className="flex items-baseline justify-between px-3 pt-2.5 pb-1">
          <h2 className="text-[15px] font-semibold text-slate-900">Staffing</h2>
          <Link to="/attendance?day=today" state={FROM_TODAY} className="text-[13px] text-blue-600 hover:underline">Attendance →</Link>
        </div>
      )}
      {branches.length === 0 && <p className="px-4 pb-3 text-sm text-slate-600">Nobody is scheduled today</p>}
      {branches.map((b) => {
        const active = nav.sheet === b.key;
        return (
          <button key={b.key} type="button" onClick={(e) => { remember(e); nav.open(b.key); }}
            aria-current={active ? 'true' : undefined} aria-haspopup="dialog"
            className={`flex min-h-[56px] w-full items-center gap-3 border-t border-slate-100 ${embedded ? 'px-4' : 'px-3'} py-2 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none ${active ? 'bg-slate-100' : b.tone === 'bad' ? 'bg-rose-50/60' : ''}`}>
            <Dot tone={toneOf[b.tone]} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-5 text-slate-900">{b.name}</span>
              <span className={`block text-[13px] leading-[18px] tabular-nums ${labelTone[b.tone]}`}>{b.label}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-slate-500" aria-hidden />
          </button>
        );
      })}
      {shown.length > 0 && (
        <div className={`border-t border-slate-200 ${embedded ? 'px-4 pb-4' : 'px-3 pb-2.5'} pt-2`}>
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-600">To do</p>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((a) => {
              const cls = `inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold ${a.primary ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-900 hover:bg-slate-50'}`;
              return a.href
                ? <a key={a.key} href={a.href} className={cls}><Phone size={13} aria-hidden />{a.label}</a>
                : <button key={a.key} type="button" onClick={(e) => a.run && act(a.run, e)} className={cls}>{a.label}</button>;
            })}
            {more > 0 && <Link to="/attendance?day=today" state={FROM_TODAY} className="inline-flex min-h-[44px] items-center px-1 text-[13px] font-semibold text-blue-600">+{more} more</Link>}
          </div>
        </div>
      )}

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
    </section>
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
    ? `${b.opensAt && b.closesAt ? `Open ${b.opensAt}–${b.closesAt}` : b.closesAt ? `Closes ${b.closesAt}` : 'Closed now'} · minimum ${b.need} on the floor`
    : 'Office · each person against their own hours';
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
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-[13px] leading-5 text-slate-700">
          <b className="font-semibold text-slate-900">Pattern:</b> {b.pattern.text}
        </p>
      )}
      {b.pattern?.question && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <Chip tone="grey">Owner to decide</Chip>
          <p className="mt-1.5 text-[14px] font-medium leading-5 text-slate-900">{b.pattern.question}</p>
          <p className="text-[13px] leading-5 text-slate-700">Until it is answered, the minimum stays {b.need} from opening.</p>
        </div>
      )}
      <p className="mt-3 text-[12px] text-slate-600">Tap a name to see their day or mark them away (work trip, leave).</p>
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
          <p className="text-[13px] text-slate-600">{person ? `${b.name} · today` : `${hours}${at ? ` · staff at ${at}` : ''}`}</p>
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
