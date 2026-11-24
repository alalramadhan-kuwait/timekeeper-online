/**
 * What the Staffing card says, worded only from facts the app holds.
 *
 * A branch line counts what the clock recorded and what the rota planned, and
 * names what is not known instead of guessing: "Avenues 1 in · minimum 2 · 3
 * with no shift time", "HQ 3 in · 2 late · 1 no hours set · 1 on work trip to
 * 26 Nov", "Time Gallery opens 14:00 · 1 planned". Nobody without a shift
 * time is called late, missing or on time: there is nothing to compare with.
 *
 * Pure functions, so the wording can be checked without a page.
 */
import type { AttendanceStatus } from '../shared/attendanceStatus';

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
  /** Scheduled end, HH:MM; null when not known. */
  dueEnd?: string | null;
  /** The start plus the shift's grace (or the company's): arriving by then is on time. */
  graceUntil?: string | null;
  /** Expected today but the schedule carries no hours. */
  timeUnknown: boolean;
  firstIn: string | null;
  lastOut: string | null;
  /** Minutes past the grace limit at the first clock-in; 0 within it; null with no shift time. */
  lateAfterGraceMin: number | null;
  /** For someone not in yet: minutes since they were due. */
  lateNowMin: number | null;
  /** On approved leave or a work trip today: "Work trip · Expo · to 26 Nov". */
  away?: string | null;
  /** The leave type behind `away` ("Work trip", "Annual", "Sick", "WFH"…). */
  awayType?: string | null;
  /** The last day away, "26 Nov". */
  awayTo?: string | null;
}

/** How the branch's own clock-ins have gone lately, for the sheet. */
export interface ClockInPattern {
  /** "Clock-ins 14–23 Nov: on 9 of 10 days one person was alone on the floor…" */
  text: string;
  /** The question only the owner can answer, or null when the pattern raises none. */
  question: string | null;
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
  /** The branch's line, from facts only: "1 in · minimum 2 · 3 with no shift time". */
  label: string;
  people: StaffPerson[];
  pattern?: ClockInPattern | null;
}

export const IN: AttendanceStatus[] = ['working', 'completed'];
export const NOT_IN: AttendanceStatus[] = ['late', 'missing'];

/** 32 → "32 min", 92 → "1 h 32 min". */
export const hm = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

/** Not in, and no shift time to judge them by: the ones a "Set times" button is for. */
export const noShiftTime = (p: StaffPerson) => (p.timeUnknown && !IN.includes(p.status)) || p.status === 'no_schedule';

const AWAY_WORDS: Record<string, string> = { 'Work trip': 'on work trip', Sick: 'off sick', WFH: 'working from home' };
/** "1 on work trip to 26 Nov", "2 on leave", "3 away" — as much as the records say in common. */
function awayPhrase(people: StaffPerson[]): string | null {
  if (!people.length) return null;
  const types = new Set(people.map((p) => p.awayType || 'Annual'));
  if (types.size > 1) return `${people.length} away`;
  const word = AWAY_WORDS[[...types][0]] ?? 'on leave';
  const tos = new Set(people.map((p) => p.awayTo ?? ''));
  const to = tos.size === 1 && people[0].awayTo ? ` to ${people[0].awayTo}` : '';
  return `${people.length} ${word}${to}`;
}

/** Whether a branch is covered, and its line, from the people judged by the shared engine. */
export function judgeBranch(b: Omit<StaffBranch, 'tone' | 'label' | 'onFloor' | 'need'> & { minStaff: number | null }): StaffBranch {
  const P = b.people;
  const onFloor = P.filter((p) => p.status === 'working').length;
  const inToday = P.filter((p) => IN.includes(p.status));
  const notInYet = P.filter((p) => NOT_IN.includes(p.status)).length;
  const unknown = P.filter(noShiftTime).length;
  const fix = P.filter((p) => p.status === 'needs_correction').length;
  const away = awayPhrase(P.filter((p) => p.status === 'on_leave'));
  const lateIn = inToday.filter((p) => (p.lateAfterGraceMin ?? 0) > 0).length;
  const parts = (...xs: (string | null | false)[]) => xs.filter(Boolean).join(' · ');

  if (b.shop) {
    const need = b.minStaff ?? 1;
    if (!b.open) {
      if (b.opensAt !== null) {
        /* before opening: who the rota has planned, with or without a time */
        const planned = P.filter((p) => p.status === 'due_later' || NOT_IN.includes(p.status) || p.status === 'working').length;
        return {
          ...b, need, onFloor, tone: 'idle',
          label: parts(`Opens ${b.opensAt}`, planned ? `${planned} planned` : 'nobody planned', onFloor > 0 && `${onFloor} in early`, unknown > 0 && `${unknown} with no shift time`, away),
        };
      }
      const worked = inToday.length;
      return { ...b, need, onFloor, tone: 'idle', label: parts('Closed', worked > 0 && `${worked} worked today`, fix > 0 && `${fix} clock-out missing`) };
    }
    const dueLater = P.filter((p) => p.status === 'due_later' && !p.timeUnknown).length;
    const gone = P.filter((p) => p.status === 'completed').length;
    const label = parts(`${onFloor} in`, `minimum ${need}`, notInYet > 0 && `${notInYet} not in yet`, unknown > 0 && `${unknown} with no shift time`,
      dueLater > 0 && `${dueLater} due later`, gone > 0 && `${gone} clocked out`, fix > 0 && `${fix} clock-out missing`, away);
    const tone = onFloor === 0 && need > 0 ? 'bad' : onFloor < need ? 'warn' : 'good';
    return { ...b, need, onFloor, tone, label };
  }
  /* The office: judged against its own rota, counting only people with a known time. */
  const planned = P.filter((p) => IN.includes(p.status) || NOT_IN.includes(p.status) || (p.status === 'due_later' && !p.timeUnknown));
  const dueLater = P.filter((p) => p.status === 'due_later' && !p.timeUnknown).length;
  const label = parts(`${inToday.length} in`, lateIn > 0 && `${lateIn} late`, notInYet > 0 && `${notInYet} not in yet`, dueLater > 0 && `${dueLater} due later`,
    unknown > 0 && `${unknown} no hours set`, fix > 0 && `${fix} clock-out missing`, away);
  return { ...b, need: planned.length, onFloor: inToday.length, tone: notInYet || lateIn ? 'warn' : 'good', label };
}

export type LineTone = 'green' | 'amber' | 'red' | 'grey';

/** One person's line in the sheet: what the clock and the rota say, and nothing more. */
export function personLine(p: StaffPerson): { text: string; tone: LineTone } {
  if (IN.includes(p.status)) {
    const when = p.status === 'completed' && p.lastOut ? `In ${p.firstIn}–${p.lastOut}` : `In ${p.firstIn}`;
    if (!p.due) return { text: `${when} · no shift time to compare`, tone: 'grey' };
    if (p.lateAfterGraceMin && p.lateAfterGraceMin > 0) return { text: `${when} · ${hm(p.lateAfterGraceMin)} after the ${p.graceUntil} grace limit`, tone: 'amber' };
    return { text: `${when} · within the ${p.graceUntil} grace limit`, tone: 'green' };
  }
  if (p.status === 'needs_correction') return { text: `${p.firstIn ? `In ${p.firstIn} · ` : ''}no clock-out recorded`, tone: 'amber' };
  if (NOT_IN.includes(p.status)) {
    const past = p.lateNowMin !== null && p.graceUntil ? p.graceUntil : null;
    return p.status === 'missing'
      ? { text: `Not in · was due ${p.due}`, tone: 'red' }
      : { text: `Not in yet · due ${p.due}${past ? ` · grace to ${past}` : ''}`, tone: 'red' };
  }
  if (p.status === 'no_schedule') return { text: 'Not clocked in · no schedule on record', tone: 'amber' };
  if (p.status === 'due_later') {
    if (p.timeUnknown) return { text: 'Not clocked in · no shift time set', tone: 'amber' };
    return { text: `Due ${p.due}${p.dueEnd ? `–${p.dueEnd}` : ''}`, tone: 'grey' };
  }
  if (p.status === 'on_leave') return { text: p.away || 'On leave', tone: 'grey' };
  return { text: 'Day off', tone: 'grey' };
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dayWord = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuwait' });

/**
 * A shop's recent clock-ins against its minimum: on how many days one person was
 * alone on the floor, and when the second arrived. Only for a shop that needs two
 * or more, from the days before today that have clock-ins at all.
 *
 * `days` maps a Kuwait date to each person's first clock-in that day (HH:MM).
 */
export function clockInPattern(b: { name: string; opensAt: string | null; need: number }, days: Map<string, string[]>): ClockInPattern | null {
  if (!b.opensAt || b.need < 2) return null;
  const dates = [...days.keys()].filter((d) => days.get(d)!.length).sort();
  if (dates.length < 3) return null;
  const opens = toMin(b.opensAt);
  let alone = 0;
  const seconds: number[] = [];
  const lateOpen: { date: string; at: string }[] = [];
  for (const d of dates) {
    const ins = days.get(d)!.map(toMin).sort((x, y) => x - y);
    const firstAt = ins[0];
    if (firstAt > opens + 60) lateOpen.push({ date: d, at: toHM(firstAt) });
    const second = ins[1] ?? null;
    /* alone: the second came an hour or more after the shop had somebody in it, or never */
    if (firstAt <= opens + 60 && (second === null || second - Math.max(firstAt, opens) >= 60)) {
      alone++;
      if (second !== null) seconds.push(second);
    }
  }
  const [d0, d1] = [dates[0], dates[dates.length - 1]];
  const range = `${d0.slice(0, 7) === d1.slice(0, 7) ? String(Number(d0.slice(8))) : dayWord(d0)}–${dayWord(d1)}`;
  const bits: string[] = [];
  if (alone) {
    const s = [...seconds].sort((x, y) => x - y);
    bits.push(`on ${alone} of ${dates.length} days one person was alone on the floor from opening`
      + (s.length ? ` until a second arrived ${toHM(s[0])}${s.length > 1 ? `–${toHM(s[s.length - 1])}` : ''}` : '')
      + (alone > s.length ? `${s.length ? '; on ' : ' and on '}${alone - s.length} of them nobody else came in` : ''));
  } else bits.push(`${b.need} or more were in within an hour of opening on every day with clock-ins`);
  const text = `Clock-ins ${range}: ${bits.join('')}.`
    + lateOpen.map((l) => ` On ${dayWord(l.date)} nobody clocked in until ${l.at}.`).join('');
  let question: string | null = null;
  if (seconds.length && alone * 2 >= dates.length) {
    const s = [...seconds].sort((x, y) => x - y);
    const mid = s[Math.floor(s.length / 2)];
    const hour = Math.round(mid / 60);
    question = `Does ${b.name} need ${b.need} people before ${String(hour).padStart(2, '0')}:00?`;
  }
  return { text, question };
}
