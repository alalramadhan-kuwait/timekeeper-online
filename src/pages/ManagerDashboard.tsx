/**
 * Today: the manager's board. Data only (4.1.0).
 *
 * The owner's words on 24 Nov: "still too much text", "why is it asking
 * questions? I only need to see data with good visuals", "show the attendance
 * clearly". So every card is a label, figures and marks, and colour carries the
 * meaning (green good, red bad, amber warning, grey neutral). No sentences, no
 * questions. In this order on a phone:
 *
 *   1. Sales · Nov — the regular outlets' % of target, coloured by pace, the
 *                    points behind or ahead, the month as a line against the
 *                    straight line to the target with a dotted forecast, and
 *                    Need / day, Doing / day, Yesterday.
 *   2. Outlets     — one bar per regular outlet with the month-gone mark;
 *                    events (the Expo) as grey rows, never in the %.
 *   3. Overdue     — one short row per overdue thing with its days late; what
 *                    is stuck with somebody else as one amber row.
 *   4. Attendance  — everyone in one stacked bar, then each branch: in /
 *                    needed, a chip, and one row per person (shared engine).
 *   5. Watch       — amber or red tiles, only when they have something to say.
 *
 * From 1024px the cards sit in two columns.
 *
 * Each of the four reads loads on its own, checks every query's error, and
 * gives up after ten seconds. A card that did not load shows a grey dash,
 * "Didn't load" and Retry: never a zero and never an all-clear. A card whose
 * refresh failed keeps its last figures with an amber "as of HH:mm". That is
 * what this page got wrong on 23 Nov while the database was down.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessPath } from '../components/Layout';
import { useLive } from '../shared/live';
import { outletOf, hasAttendance, outletName } from '../shared/outlets';
import { standing, kuwaitDate } from '../shared/attendanceStatus';
import { shiftTimesOn, DEFAULT_GRACE_MINUTES } from '../shared/punctuality';
import { scheduleFromRow, type Schedule, type ScheduleRow } from '../shared/schedule';
import { StaffingCard, judgeBranch, clockInPattern, useBranchSheet, useWideSheet, type StaffPerson, type StaffBranch, type PersonAlert } from '../components/StaffingCard';
import { loadRequests, stageOf, tabOf, type RequestRow } from '../shared/requests';
import { monthSales, daySales, sameDaysBefore, prevMonthOf, type MonthSales, type TillRow, type DaySales, type SameDays } from '../shared/tillSales';
import { type Tone } from '../components/TodayCard';
import { BoardCard, Pill, AsOf, Failed, RetryButton, Skeleton, FIG, HEX, PILL } from '../components/TodayBoard';
import { FROM_TODAY } from '../components/FromToday';

/* ------------------------------------------------------------------ types */

interface Emp { id: string; full_name: string; location: string | null; status: string; user_id: string | null; phone: string | null }
interface Rec { user_id: string | null; employee_name: string; clock_in: string; clock_out: string | null }
interface Leave { employee_id: string; leave_start: string; leave_end: string; leave_type: string | null; notes: string | null }

interface Item {
  key: string;
  /** A short label, no sentence: "Task · Winter Collection", "Follow-ups ×2". */
  label: string;
  /** How late, or how long it has waited: "25d", "6h"; a date for a heads-up. */
  chip: string;
  /** Hours it has been waiting, or late; sorts the list. */
  age: number;
  overdue: boolean;
  link: string;
  /** An expired document: whose, which, and when, so their row in a branch sheet can say so too. */
  person?: { id: string; doc: string; date: string };
}

interface StuckRow { id: string; kind: string; hours: number }

interface StaffData { branches: StaffBranch[]; workStart: string }
interface SalesData {
  month: MonthSales;
  /** Regular sales added up day by day, the 1st to the last till day: the line on the chart. */
  cum: number[];
  /** The last till day's regular sales ("yesterday" when the tills are up to date). */
  lastDay: DaySales | null;
  /** The same till days of the month before. */
  sameDays: SameDays | null;
  syncedAt: string | null;
}
interface NeedsData {
  items: Item[];
  /** Requests past due that are with somebody else, not with you; null when the requests did not load. */
  stuck: { count: number; rows: StuckRow[]; withWhom: 'manager' | 'owner' | 'others' } | null;
  /** The reads that failed while the others loaded: what they would add is unknown. */
  missing: { what: string; error: string }[];
}
interface LostData {
  lost7: number;
  lostMonth: number;
  notAvailableMonth: number;
  /** The most recent lost sale ever logged; null when none ever has been. */
  lastLost: string | null;
}
interface PoData {
  /** Placed with a supplier (Ordered or Partially Received), not merged. */
  placedPOs: number;
  latePOs: number;
  duePOs: number;
  /** Placed orders nobody has given an expected date: they can never show as late. */
  noDatePOs: number;
}
/** The two Watch reads load and fail on their own: one failing never hides the other. */
interface WatchData {
  lost: LostData | null; lostError: string | null;
  po: PoData | null; poError: string | null;
}

type Key = 'staff' | 'sales' | 'needs' | 'watch';
interface Slot<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** When `data` was loaded. */
  at: number | null;
}
interface Slots { staff: Slot<StaffData>; sales: Slot<SalesData>; needs: Slot<NeedsData>; watch: Slot<WatchData> }

const KEYS: Key[] = ['staff', 'sales', 'needs', 'watch'];
const TIMEOUT_MS = 10_000;

/* What Today last showed, kept in memory between visits so that coming back
   from a drill-down shows it straight away instead of a skeleton. A section
   older than a minute is read again in the background; until the new answer
   arrives the old one stays, with its own "as of" time where it has one. Kept
   per person, role and page access, and never written to storage. */
const FRESH_MS = 60_000;
interface Memo { who: string; slots: Partial<Record<Key, { data: unknown; at: number }>> }
let memo: Memo | null = null;

interface Targets {
  sales_target_month: number | null; sales_target_avenues: number | null; sales_target_timegallery: number | null;
  sales_target_online: number | null; sales_target_whatsapp: number | null; work_start_time: string | null;
  late_grace_minutes: number | null;
}

/** “Time Keeper - Avenues” → “Avenues”: the brand is on every line and adds nothing here. */
const bare = (name: string) => name.replace(/^time ?keeper\s*-?\s*/i, '') || name;

const dayOf = (d: string | null) => (!d ? '' : new Date(`${d.slice(0, 10)}T12:00:00+03:00`)
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuwait' }));

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || name;
/** First + last word: "Ahmed Yasari", not "Ahmed". */
const firstLast = (name: string) => {
  const w = name.trim().split(/\s+/);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : name.trim();
};
/** A first name, unless another row on the card shares it: then first + last word, so two people never read as one. */
const namer = (names: string[]) => {
  const n = new Map<string, number>();
  for (const x of names) n.set(firstOf(x).toLowerCase(), (n.get(firstOf(x).toLowerCase()) ?? 0) + 1);
  return (x: string) => ((n.get(firstOf(x).toLowerCase()) ?? 0) > 1 ? firstLast(x) : firstOf(x));
};
/** Hours waiting → "6h" under a day, "14d" after. */
const ageChip = (hours: number) => (hours >= 24 ? `${Math.round(hours / 24)}d` : `${Math.max(1, Math.round(hours))}h`);
/** "Delivery overdue — Winter Collection" → "Winter Collection": the card already says overdue. */
const taskName = (t: string | null) => (t?.trim() || 'untitled').replace(/^.*?\boverdue\b\s*[—–-]\s*/i, '') || (t ?? '').trim();
/** 53879 → 53.9k, 3399 → 3.4k, 800 → 800. */
const short = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
const kd = (n: number) => `${short(n)} KD`;
/** Whole days from `date` to `today`, both yyyy-mm-dd. */
const daysSince = (today: string, date: string) => Math.round((Date.parse(today) - Date.parse(date.slice(0, 10))) / 86_400_000);
const hhmmOf = (ms: number) => format(new Date(ms), 'HH:mm');

/* ------------------------------------------------------------------- data */

/** A query's rows, or the reason it failed. Never `[]` for a failure. */
function rowsOf<T>(q: { data: unknown; error: { message?: string } | null }, what: string): T {
  if (q.error) throw new Error(`${what}: ${q.error.message || 'could not be read'}`);
  return (q.data ?? []) as T;
}

/** A query's rows, or null with the failure noted in `missing`: for a section
    that shows what did load and names what did not. */
function partOf<T>(q: { data: unknown; error: { message?: string } | null }, what: string, missing: { what: string; error: string }[]): T | null {
  if (!q.error) return (q.data ?? []) as T;
  missing.push({ what, error: q.error.message || 'could not be read' });
  return null;
}

/** Give up on a section the database does not answer, instead of spinning for ever. */
function within<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`The database did not answer within ${ms / 1000} seconds.`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const readSettings = async (): Promise<Partial<Targets>> => {
  const q = await supabase.from('settings')
    .select('sales_target_month, sales_target_avenues, sales_target_timegallery, sales_target_online, sales_target_whatsapp, work_start_time, late_grace_minutes')
    .maybeSingle();
  return (rowsOf<Partial<Targets> | null>(q, 'Settings') ?? {}) as Partial<Targets>;
};

/** "Work trip · Expo · to 26 Nov" — what kind of away, why, and until when. */
function awayLabel(l: Leave | undefined): string | null {
  if (!l) return null;
  const until = new Date(`${l.leave_end}T12:00:00+03:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuwait' });
  return [l.leave_type || 'Annual', (l.notes ?? '').trim() || null, `to ${until}`].filter(Boolean).join(' · ');
}

/* ---- staffing: judged by the shared engine, against each person's own shift */
async function loadStaff(settings: Promise<Partial<Targets>>): Promise<StaffData> {
  const now = new Date();
  const today = kuwaitDate(now);
  const since = kuwaitDate(new Date(now.getTime() - 10 * 86_400_000));
  const [empQ, schedQ, recQ, leaveQ, outQ, targets] = await Promise.all([
    supabase.from('employees').select('id, full_name, location, status, user_id, phone').in('status', ['Active', 'On leave']),
    supabase.from('employee_schedules')
      .select('id, employee_id, effective_from, effective_to, working_days, shift_start, shift_end, grace_minutes, note'),
    /* today, and the ten days before for each shop's clock-in pattern */
    supabase.from('attendance_records').select('user_id, employee_name, clock_in, clock_out')
      .gte('clock_in', `${since}T00:00:00+03:00`).lte('clock_in', `${today}T23:59:59+03:00`),
    supabase.from('leave_records').select('employee_id, leave_start, leave_end, leave_type, notes')
      .eq('approval_status', 'Approved').lte('leave_start', today).gte('leave_end', today),
    supabase.from('outlets').select('code, opens_at, closes_at, min_staff'),
    settings,
  ]);
  const emps = rowsOf<Emp[]>(empQ, 'Employees');
  const schedRows = rowsOf<ScheduleRow[]>(schedQ, 'Schedules');
  const allRecs = rowsOf<Rec[]>(recQ, 'Attendance');
  const recs = allRecs.filter((r) => kuwaitDate(new Date(r.clock_in)) === today);
  const leaveRows = rowsOf<Leave[]>(leaveQ, 'Leave');
  const outRows = rowsOf<{ code: string; opens_at: string | null; closes_at: string | null; min_staff: number | null }[]>(outQ, 'Outlets');

  const defaultStart = targets.work_start_time ?? '09:00';
  const companyGrace = targets.late_grace_minutes ?? DEFAULT_GRACE_MINUTES;
  const scheds = new Map<string, Schedule[]>();
  for (const row of schedRows) {
    const list = scheds.get(row.employee_id) ?? [];
    list.push(scheduleFromRow(row));
    scheds.set(row.employee_id, list);
  }
  const leaves = new Map(leaveRows.map((l) => [l.employee_id, l]));
  const leaveIds = new Set(leaves.keys());
  const outletRows = new Map(outRows.map((o) => [o.code, o]));
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kuwait' });
  const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const nowMin = toMin(hhmm(now.toISOString())) ?? 0;
  const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const byBranch = new Map<string, StaffPerson[]>();
  const names = new Map<string, string>();
  /* branch → day before today → each person's first clock-in that day */
  const past = new Map<string, Map<string, Map<string, string>>>();
  for (const e of emps) {
    if (!hasAttendance(e.location)) continue;
    const mine = recs.filter((r) => (e.user_id && r.user_id === e.user_id) || (!r.user_id && r.employee_name === e.full_name))
      .sort((x, y) => x.clock_in.localeCompare(y.clock_in));
    const schedules = scheds.get(e.id) ?? [];
    const s = standing({ records: mine.map((r) => ({ clockIn: r.clock_in, clockOut: r.clock_out })), schedules, date: today, onLeave: leaveIds.has(e.id), defaultStart }, now);
    const times = shiftTimesOn(schedules, today, { defaultStart });
    const expected = s.expected === true;
    const firstIn = mine.length ? hhmm(mine[0].clock_in) : null;
    const lastOutIso = mine.length ? mine[mine.length - 1].clock_out : null;
    const due = times.start;
    const dueMin = toMin(due);
    const graceMin = dueMin !== null ? dueMin + (times.graceMinutes ?? companyGrace) : null;
    const o = outletOf(e.location);
    const key = o?.code ?? e.location ?? 'other';
    for (const r of allRecs) {
      if (!((e.user_id && r.user_id === e.user_id) || (!r.user_id && r.employee_name === e.full_name))) continue;
      const d = kuwaitDate(new Date(r.clock_in));
      if (d >= today) continue;
      const days = past.get(key) ?? new Map<string, Map<string, string>>();
      const ins = days.get(d) ?? new Map<string, string>();
      const t = hhmm(r.clock_in);
      if (!ins.has(e.id) || t < ins.get(e.id)!) ins.set(e.id, t);
      days.set(d, ins); past.set(key, days);
    }
    const leave = leaves.get(e.id);
    names.set(key, bare(outletName(e.location)).replace(/^Timekeeper /, ''));
    const person: StaffPerson = {
      id: e.id, name: e.full_name, phone: e.phone, user_id: e.user_id, location: e.location, branch: key,
      status: s.status, due, dueEnd: times.end, graceUntil: graceMin !== null ? fromMin(graceMin) : null,
      timeUnknown: expected && due === null,
      away: awayLabel(leave), awayType: leave ? leave.leave_type || 'Annual' : null, awayTo: leave ? dayOf(leave.leave_end) : null,
      firstIn, lastOut: lastOutIso ? hhmm(lastOutIso) : null,
      lateAfterGraceMin: firstIn && graceMin !== null ? Math.max(0, (toMin(firstIn) ?? 0) - graceMin) : null,
      lateNowMin: (s.status === 'late' || s.status === 'missing') && dueMin !== null ? Math.max(0, nowMin - dueMin) : null,
    };
    byBranch.set(key, [...(byBranch.get(key) ?? []), person]);
  }
  const rank = { bad: 0, warn: 1, good: 2, idle: 3 } as const;
  const branches = [...byBranch.entries()].map(([key, people]) => {
    const o = outletRows.get(key);
    const opensAt = o?.opens_at?.slice(0, 5) ?? null;
    const closesAt = o?.closes_at?.slice(0, 5) ?? null;
    const shop = opensAt !== null;
    const om = toMin(opensAt), cm = toMin(closesAt);
    const open = shop && om !== null && nowMin >= om && (cm === null || nowMin < cm);
    const b = judgeBranch({ key, name: names.get(key) ?? key, shop, opensAt: shop && !open && om !== null && nowMin >= om ? null : opensAt, closesAt, open, minStaff: o?.min_staff ?? null, people });
    const days = new Map([...(past.get(key) ?? new Map<string, Map<string, string>>()).entries()].map(([d, ins]) => [d, [...ins.values()]]));
    return { ...b, pattern: shop ? clockInPattern({ name: b.name, opensAt, need: b.need }, days) : null };
  }).filter((b) => b.people.some((p) => !['off', 'on_leave'].includes(p.status)) || b.shop)
    .sort((x, y) => rank[x.tone] - rank[y.tone] || x.name.localeCompare(y.name));
  return { branches, workStart: defaultStart };
}

/* ---- sales: what rang through the tills, refreshed each morning */
async function loadSales(settings: Promise<Partial<Targets>>): Promise<SalesData> {
  const month = kuwaitDate().slice(0, 7);
  /* From the first of last month: the same read, a wider range, so the card can
     set this month's till days against the same days of the last. */
  const [posQ, syncQ, targets] = await Promise.all([
    supabase.from('pos_channel_sales').select('channel_code, outlet, sale_date, revenue, sale_count').gte('sale_date', `${prevMonthOf(month)}-01`),
    supabase.from('lightspeed_sync_log').select('finished_at').eq('status', 'ok').not('finished_at', 'is', null)
      .order('finished_at', { ascending: false }).limit(1),
    settings,
  ]);
  const pos = rowsOf<TillRow[]>(posQ, 'Till sales');
  const sync = rowsOf<{ finished_at: string | null }[]>(syncQ, 'Till sync log');
  const num = (v: unknown) => (v == null ? null : Number(v));
  const ms = monthSales(pos, {
    month,
    monthTarget: num(targets.sales_target_month),
    targets: {
      avenues: num(targets.sales_target_avenues), time_gallery: num(targets.sales_target_timegallery),
      online: num(targets.sales_target_online), whatsapp: num(targets.sales_target_whatsapp),
    },
  });
  /* the line on the chart: regular sales only, as the target is, day by day */
  const cum: number[] = [];
  for (let d = 1; d <= (ms.tillDays ?? 0); d++) {
    cum.push((cum[d - 2] ?? 0) + daySales(pos, `${month}-${String(d).padStart(2, '0')}`).sales);
  }
  return {
    month: ms,
    cum,
    lastDay: ms.lastSaleDay ? daySales(pos, ms.lastSaleDay) : null,
    sameDays: ms.tillDays ? sameDaysBefore(pos, month, ms.tillDays) : null,
    syncedAt: sync[0]?.finished_at ?? null,
  };
}

/* ---- waiting on you */
async function loadNeeds(role: string | null, canHR: boolean): Promise<NeedsData> {
  const now = new Date();
  const today = kuwaitDate(now);
  const in30 = kuwaitDate(new Date(now.getTime() + 30 * 86_400_000));
  const mine = stageOf(role);
  const [reqs, fuQ, repQ, preQ, projQ, taskQ, docQ] = await Promise.all([
    loadRequests({ openOnly: true }),
    supabase.from('cases_visible').select('id, customer_name, outlet, staff, promised_callback').eq('case_type', 'Follow-up').eq('status', 'Open')
      .eq('deleted', false).lt('promised_callback', today).order('promised_callback'),
    supabase.from('repair_watches').select('status, estimated_completion, updated_at'),
    supabase.from('waiting_list').select('customer_name, status, updated_at').eq('list_type', 'Pre-Order').eq('status', 'Arrived'),
    supabase.from('limited_projects').select('id, project_name, brand, status, launch_date'),
    supabase.from('assigned_tasks').select('id, title, due_date, priority, assignee_name, assignee_role').eq('status', 'Open').lt('due_date', today).order('due_date'),
    canHR
      ? supabase.from('employees').select('id, full_name, residency_expiry, work_permit_expiry').in('status', ['Active', 'On leave'])
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  /* Each read stands on its own: one that fails is named, and the rest still
     show. Only when every one failed is the whole section "not loaded". */
  const missing: { what: string; error: string }[] = [];
  const reqRows = reqs.error ? null : (reqs.rows as RequestRow[]);
  if (reqs.error) missing.push({ what: 'Requests', error: reqs.error });
  const fus = partOf<{ id: string; customer_name: string | null; outlet: string | null; staff: string | null; promised_callback: string }[]>(fuQ, 'Follow-ups', missing) ?? [];
  const reps = partOf<{ status: string; estimated_completion: string | null; updated_at: string }[]>(repQ, 'Repairs', missing) ?? [];
  const pre = partOf<{ customer_name: string; updated_at: string }[]>(preQ, 'Pre-orders', missing) ?? [];
  const projs = partOf<{ id: string; project_name: string | null; brand: string | null; status: string; launch_date: string | null }[]>(projQ, 'Limited projects', missing) ?? [];
  const tasks = partOf<{ id: string; title: string | null; due_date: string; priority: string | null; assignee_name: string | null; assignee_role: string | null }[]>(taskQ, 'Tasks', missing) ?? [];
  const docs = partOf<{ id: string; full_name: string; residency_expiry: string | null; work_permit_expiry: string | null }[]>(docQ, 'Staff documents', missing) ?? [];
  if (missing.length === (canHR ? 7 : 6)) throw new Error(missing.map((m) => `${m.what}: ${m.error}`).join(' · '));

  const items: Item[] = [];
  const mineNow = (reqRows ?? []).filter((r) => tabOf(r, mine) === 'action');
  const reqName = namer(mineNow.map((r) => r.employee_name ?? 'Someone'));
  for (const r of mineNow) {
    items.push({
      key: `req:${r.id}`, label: `${r.kind} · ${reqName(r.employee_name ?? 'Someone')}`, chip: ageChip(r.hours_pending),
      age: r.hours_pending, overdue: r.is_overdue, link: `/inbox?focus=${r.id}`,
    });
  }
  /* Requests past due that sit with somebody else. Not yours to decide, but
     yours to chase: one amber row, apart from what is waiting on you. */
  const stuckRows = (reqRows ?? []).filter((r) => tabOf(r, mine) === 'waiting' && r.is_overdue)
    .sort((a, b) => b.hours_pending - a.hours_pending);
  const holders = [...new Set(stuckRows.map((r) => r.stage_owner))];
  const stuck = !reqRows ? null : {
    count: stuckRows.length,
    rows: stuckRows.map((r) => ({ id: r.id, kind: r.kind, hours: r.hours_pending })),
    withWhom: (holders.length === 1 && holders[0] === 'manager' ? 'manager' : holders.length === 1 && holders[0] === 'owner' ? 'owner' : 'others') as 'manager' | 'owner' | 'others',
  };

  if (fus.length) {
    const days = Math.max(1, daysSince(today, fus[0].promised_callback));
    items.push({
      key: 'fu', label: fus.length === 1 ? `Follow-up · ${firstOf(fus[0].customer_name?.trim() || 'Customer')}` : `Follow-ups ×${fus.length}`,
      chip: `${days}d`, age: days * 24, overdue: true, link: '/follow-ups?bucket=overdue',
    });
  }
  const overdueReps = reps.filter((r) => r.estimated_completion && r.estimated_completion < today && !['Returned to customer', 'Cancelled'].includes(r.status));
  if (overdueReps.length) {
    const days = daysSince(today, overdueReps.map((r) => r.estimated_completion!).sort()[0]);
    items.push({ key: 'rep-late', label: overdueReps.length === 1 ? 'Repair' : `Repairs ×${overdueReps.length}`, chip: days > 0 ? `${days}d` : '0d', age: days * 24, overdue: true, link: '/repairs' });
  }
  const ready = reps.filter((r) => r.status === 'Ready for pickup');
  if (ready.length) {
    const oldest = Math.max(...ready.map((r) => (now.getTime() - Date.parse(r.updated_at)) / 3_600_000));
    items.push({ key: 'rep-ready', label: `Pickup ×${ready.length}`, chip: ageChip(oldest), age: oldest, overdue: oldest >= 24 * 7, link: '/repairs' });
  }
  if (pre.length) {
    const oldest = Math.max(...pre.map((p) => (now.getTime() - Date.parse(p.updated_at)) / 3_600_000));
    items.push({ key: 'pre', label: `Pre-orders ×${pre.length}`, chip: ageChip(oldest), age: oldest, overdue: oldest >= 48, link: '/waiting-list' });
  }

  /* A project past its launch date, a task past its due date and a document
     past its expiry are all late: they were counted as not overdue until 24 Nov. */
  const delayed = projs.filter((p) => ['Upcoming', 'Confirmed'].includes(p.status) && p.launch_date && p.launch_date < today)
    .sort((a, b) => a.launch_date!.localeCompare(b.launch_date!));
  if (delayed.length) {
    const first = delayed[0];
    const days = daysSince(today, first.launch_date!);
    /* the first two words are enough to know it: "DVO Winter" */
    const name = [first.brand, first.project_name].filter(Boolean).join(' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    items.push(delayed.length === 1
      ? { key: 'proj', label: `Launch · ${name || 'unnamed'}`, chip: `${days}d`, age: days * 24, overdue: true, link: `/limited-projects?focus=${first.id}` }
      : { key: 'proj', label: `Launches ×${delayed.length}`, chip: `${days}d`, age: days * 24, overdue: true, link: '/limited-projects' });
  }
  if (tasks.length) {
    const first = tasks[0];
    const days = daysSince(today, first.due_date);
    items.push(tasks.length === 1
      ? { key: 'task', label: `Task · ${taskName(first.title)}`, chip: `${days}d`, age: days * 24, overdue: true, link: `/tasks?focus=${first.id}` }
      : { key: 'task', label: `Tasks ×${tasks.length}`, chip: `${days}d`, age: days * 24, overdue: true, link: `/tasks?focus=${first.id}` });
  }

  /* Documents: an expired one is named, person by person, and is overdue. One
     still to expire is a heads-up, counted apart, with the next date. */
  const expiring: { date: string; name: string }[] = [];
  const docName = namer(docs.filter((e) => [e.residency_expiry, e.work_permit_expiry].some((d) => d && d < today)).map((e) => e.full_name));
  for (const e of docs) {
    for (const [doc, date] of [['Residency', e.residency_expiry], ['Work permit', e.work_permit_expiry]] as const) {
      if (!date) continue;
      if (date < today) {
        const days = Math.max(1, daysSince(today, date));
        items.push({
          key: `doc:${e.id}:${doc}`, label: `${doc} · ${docName(e.full_name)}`, chip: `${days}d`,
          age: days * 24, overdue: true, link: `/hr?focus=${e.id}`, person: { id: e.id, doc, date },
        });
      } else if (date <= in30) expiring.push({ date, name: e.full_name });
    }
  }
  if (expiring.length) {
    const next = expiring.sort((a, b) => a.date.localeCompare(b.date))[0];
    items.push({ key: 'docs', label: expiring.length === 1 ? `Expiring · ${firstOf(next.name)}` : `Expiring ×${expiring.length}`, chip: dayOf(next.date), age: 12, overdue: false, link: '/hr' });
  }
  items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.age - a.age);
  return { items, stuck, missing };
}

/* ---- watch: lost sales and purchase orders load, and fail, on their own */
async function loadWatch(want: { lost: boolean; po: boolean }): Promise<WatchData> {
  const now = new Date();
  const today = kuwaitDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const in7 = kuwaitDate(new Date(now.getTime() + 7 * 86_400_000));
  /* "Last 7 days" is today and the six before it, as Visits & lost sales counts it. */
  const sevenAgo = kuwaitDate(new Date(now.getTime() - 6 * 86_400_000));
  const none = Promise.resolve({ data: [] as unknown[], error: null });
  const [lostQ, poQ] = await Promise.all([
    /* Newest first and not cut off at the month: an empty month has to say when
       a lost sale was last logged, or "none" reads as good news. */
    want.lost ? supabase.from('cases_visible').select('lost_reason, date_logged').eq('case_type', 'Lost Sale')
      .eq('deleted', false).order('date_logged', { ascending: false }).limit(1000) : none,
    want.po ? supabase.from('purchase_orders').select('po_number, status, expected_arrival')
      .in('status', ['Ordered', 'Partially Received']).is('merged_into', null) : none,
  ]);
  const errOf = (q: { error: { message?: string } | null }, what: string) => (q.error ? `${what}: ${q.error.message || 'could not be read'}` : null);
  const lostError = want.lost ? errOf(lostQ, 'Lost sales') : null;
  const poError = want.po ? errOf(poQ, 'Purchase orders') : null;
  if ((!want.lost || lostError) && (!want.po || poError)) throw new Error([lostError, poError].filter(Boolean).join(' · ') || 'Nothing to watch');
  let lost: LostData | null = null;
  if (want.lost && !lostError) {
    const rows = (lostQ.data ?? []) as { lost_reason: string | null; date_logged: string }[];
    const inMonth = rows.filter((l) => l.date_logged.slice(0, 10) >= monthStart);
    lost = {
      lost7: rows.filter((l) => l.date_logged.slice(0, 10) >= sevenAgo).length,
      lostMonth: inMonth.length,
      notAvailableMonth: inMonth.filter((l) => (l.lost_reason ?? '').toLowerCase() === 'not available').length,
      lastLost: rows[0]?.date_logged?.slice(0, 10) ?? null,
    };
  }
  let po: PoData | null = null;
  if (want.po && !poError) {
    const rows = (poQ.data ?? []) as { expected_arrival: string | null }[];
    po = {
      placedPOs: rows.length,
      latePOs: rows.filter((p) => p.expected_arrival && p.expected_arrival < today).length,
      duePOs: rows.filter((p) => p.expected_arrival && p.expected_arrival >= today && p.expected_arrival <= in7).length,
      noDatePOs: rows.filter((p) => !p.expected_arrival).length,
    };
  }
  return { lost, lostError, po, poError };
}

/* ------------------------------------------------------------- the screen */

type Verdict = 'behind' | 'ahead' | 'ok' | 'none';

const empty = <T,>(): Slot<T> => ({ data: null, error: null, loading: true, at: null });

/** 2006 → "2,006". For figures read one by one. */
const full = (n: number, dp = 0) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp });
const monName = (ym: string) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(ym.slice(5, 7)) - 1];

const TILE: Record<'red' | 'green' | 'grey', { box: string; fig: string }> = {
  red: { box: 'bg-[#fdf2f1]', fig: 'text-[#b42318]' },
  green: { box: 'bg-[#eefaf3]', fig: 'text-[#0b5e36]' },
  grey: { box: 'bg-slate-100', fig: 'text-slate-900' },
};
const WATCH_TILE: Record<'red' | 'amber' | 'grey', string> = {
  red: 'bg-[#fde8e6] text-[#b42318]',
  amber: 'bg-[#fff6e0] text-[#7a4b00]',
  grey: 'border border-slate-200 bg-white text-slate-900',
};

export default function ManagerDashboard() {
  const { role, user, pageAccess } = useAuth();
  const canHR = ['admin', 'manager', 'hr'].includes(role ?? '');
  const wantLost = canAccessPath('/sales', role, pageAccess);
  const wantPo = canAccessPath('/purchase-orders', role, pageAccess);
  const who = `${user?.id ?? ''}|${role ?? ''}|${JSON.stringify(pageAccess ?? null)}`;
  const [cached] = useState(() => (memo && memo.who === who ? memo : null));
  const [slots, setSlots] = useState<Slots>(() => {
    const s: Record<Key, Slot<unknown>> = { staff: empty(), sales: empty(), needs: empty(), watch: empty() };
    for (const k of KEYS) {
      const c = cached?.slots[k];
      if (c) s[k] = { data: c.data, error: null, loading: false, at: c.at };
    }
    return s as unknown as Slots;
  });
  const sheetNav = useBranchSheet();
  const wide = useWideSheet();
  /* Each section's latest load; an older answer arriving late is dropped. */
  const gen = useRef<Record<Key, number>>({ staff: 0, sales: 0, needs: 0, watch: 0 });

  /* Reads the sections; state changes only when each answer arrives. */
  const start = useCallback((keys: Key[]) => {
    /* Settings feed staffing (the default start) and sales (the targets): read
       once for both, and marked handled so a failure is reported by the
       sections, not as an unhandled rejection. */
    const settings = keys.includes('staff') || keys.includes('sales') ? readSettings() : Promise.resolve({});
    settings.catch(() => undefined);
    const loaders: Record<Key, () => Promise<unknown>> = {
      staff: () => loadStaff(settings),
      sales: () => loadSales(settings),
      needs: () => loadNeeds(role, canHR),
      watch: () => loadWatch({ lost: wantLost, po: wantPo }),
    };
    for (const k of keys) {
      const g = ++gen.current[k];
      within(loaders[k]()).then(
        (data) => { if (g === gen.current[k]) setSlots((s) => ({ ...s, [k]: { data, error: null, loading: false, at: Date.now() } })); },
        (e: unknown) => {
          if (g !== gen.current[k]) return;
          const msg = e instanceof Error ? e.message : String(e);
          setSlots((s) => ({ ...s, [k]: { ...s[k], error: msg || 'Unknown error', loading: false } }));
        },
      );
    }
  }, [role, canHR, wantLost, wantPo]);
  /* A retry or a live change: marked as loading, then read. */
  const run = useCallback((keys: Key[]) => {
    setSlots((s) => {
      const next = { ...s } as Record<Key, Slot<unknown>>;
      for (const k of keys) next[k] = { ...next[k], loading: true };
      return next as unknown as Slots;
    });
    start(keys);
  }, [start]);

  /* On the first visit everything is read; on a return only what is over a
     minute old, the rest being shown from memory as it was. */
  const firstLoad = useRef(true);
  useEffect(() => {
    const now = Date.now();
    const keys = firstLoad.current && cached
      ? KEYS.filter((k) => { const c = cached.slots[k]; return !c || now - c.at > FRESH_MS; })
      : KEYS;
    firstLoad.current = false;
    if (keys.length) start(keys);
  }, [start, cached]);
  /* Remember what loaded for the next visit. */
  useEffect(() => {
    const kept: Memo['slots'] = memo && memo.who === who ? { ...memo.slots } : {};
    for (const k of KEYS) {
      const sl = slots[k] as Slot<unknown>;
      if (sl.data && sl.at && !sl.error) kept[k] = { data: sl.data, at: sl.at };
    }
    memo = { who, slots: kept };
  }, [who, slots]);
  const refreshStaff = useCallback(() => run(['staff']), [run]);
  /* only staffing follows live changes */
  useLive('mgr-dash', [{ table: 'attendance_records' }, { table: 'leave_records' }], refreshStaff);

  const can = (p: string) => canAccessPath(p, role, pageAccess);
  /* A row links only where this person may open the page; otherwise it is read-only. */
  const canOpen = (to: string) => can(to.split('?')[0]);

  const { staff, sales, needs, watch } = slots;
  const m = sales.data?.month ?? null;
  const pace = m && m.tillDays && m.paceFrac !== null ? { day: m.tillDays, frac: m.paceFrac } : null;

  const verdictOf = (pct: number | null): Verdict => {
    if (pct === null || !pace) return 'none';
    if (pace.day >= 7 && pct < pace.frac * 100 - 15) return 'behind';
    if (pct >= pace.frac * 100 + 10) return 'ahead';
    return 'ok';
  };
  /* One colour rule: red well behind, amber a little behind, green on or
     ahead, grey with nothing to judge against. */
  const toneOf = (pct: number | null): Tone => {
    const v = verdictOf(pct);
    if (v === 'none') return 'grey';
    if (v === 'behind') return 'red';
    return pct !== null && pace && pct < pace.frac * 100 ? 'amber' : 'green';
  };

  /* Which sections are shown to this person at all. */
  const visible: Key[] = [
    ...(can('/attendance') ? ['staff' as Key] : []),
    ...(can('/sales') ? ['sales' as Key] : []),
    'needs',
    ...(can('/sales') || can('/purchase-orders') ? ['watch' as Key] : []),
  ];
  const anyRetrying = visible.some((k) => slots[k].loading);
  /** The time of the figures shown, when the last refresh failed. */
  const staleAt = (k: Key) => (slots[k].error && slots[k].data && slots[k].at ? hhmmOf(slots[k].at!) : null);
  /* ---- sales */
  const reg = m?.regular ?? null;
  const regPct = reg?.pct ?? null;
  const regTone = toneOf(regPct);
  const pacePct = pace ? pace.frac * 100 : null;
  const daysLeft = m && m.tillDays ? m.daysInMonth - m.tillDays : null;
  /* The tills sync once a morning; figures that stop before yesterday did not refresh. */
  const yesterday = sales.at ? kuwaitDate(new Date(sales.at - 86_400_000)) : '';
  const tillsBehind = !!m?.lastSaleDay && m.lastSaleDay < yesterday;
  /* Till sales for this month, one outlet or the regular outlets together. */
  const tillHref = (code: string | null) => `/till-sales?${code ? `outlet=${code}&` : ''}month=${m?.month ?? kuwaitDate().slice(0, 7)}`;
  const retrySales = () => run(['sales']);
  const salesLabel = `Sales · ${monName(m?.month ?? kuwaitDate().slice(0, 7))}`;

  let salesCard: JSX.Element | null = null;
  let outletsCard: JSX.Element | null = null;
  if (visible.includes('sales')) {
    if (!m || !reg) {
      salesCard = <BoardCard id="card-sales" label={salesLabel} busy={!sales.error}><NotYet slot={sales} onRetry={retrySales} rows={4} /></BoardCard>;
    } else {
      const target = reg.target;
      const need = target && daysLeft ? Math.max(0, target - reg.sales) / daysLeft : null;
      const doing = m.tillDays ? reg.sales / m.tillDays : null;
      const ld = sales.data?.lastDay ?? null;
      /* from the two rounded figures shown, so 77% − 55% reads 22 */
      const gap = pace && regPct !== null ? Math.round(pace.frac * 100) - Math.round(regPct) : null;
      const tiles: { label: string; value: string; tone: 'red' | 'green' | 'grey' }[] = [];
      if (need !== null) tiles.push({ label: 'Need / day', value: need === 0 ? 'Met' : full(need), tone: need === 0 ? 'green' : doing !== null && need > doing ? 'red' : 'grey' });
      if (doing !== null) tiles.push({ label: 'Doing / day', value: full(doing), tone: 'grey' });
      if (ld) tiles.push({ label: ld.date === yesterday ? 'Yesterday' : dayOf(ld.date), value: full(ld.sales), tone: 'grey' });
      const figures = (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <span className={`text-[52px] font-extrabold leading-none tracking-[-0.04em] tabular-nums ${FIG[regTone]}`}>
              {regPct !== null ? `${Math.round(regPct)}%` : short(reg.sales)}
            </span>
            <span className="text-[18px] font-bold tabular-nums text-slate-900">
              {regPct !== null ? short(reg.sales) : ''} <span className="font-semibold text-slate-500">{target ? `/ ${short(target)} KD` : 'KD'}</span>
            </span>
          </div>
          {m.tillDays && sales.data && (
            <SalesChart cum={sales.data.cum} days={m.daysInMonth} target={target} projected={reg.projected} tone={regTone} />
          )}
          {tiles.length > 0 && (
            <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
              {tiles.map((t) => (
                <div key={t.label} className={`flex min-w-0 flex-col rounded-xl px-2 py-2 ${TILE[t.tone].box}`}>
                  <span className="text-[12px] leading-tight text-slate-500">{t.label}</span>
                  <span className={`text-[17px] font-extrabold tabular-nums ${TILE[t.tone].fig}`}>{t.value}</span>
                </div>
              ))}
            </div>
          )}
        </>
      );
      salesCard = (
        <BoardCard id="card-sales" label={salesLabel} right={<>
          <Stale slot={sales} onRetry={retrySales} />
          {tillsBehind && <Pill tone="amber">to {dayOf(m.lastSaleDay)}</Pill>}
          {gap !== null && <Pill tone={gap > 0 ? (regTone === 'grey' ? 'grey' : regTone) : 'green'}>{gap > 0 ? `−${gap}` : `+${-gap}`} pts</Pill>}
        </>}>
          {can('/till-sales')
            ? <Link to={tillHref(null)} state={FROM_TODAY} className="-mx-2 mt-2 block rounded-2xl px-2 pb-1 hover:bg-slate-50">{figures}</Link>
            : <div className="mt-2">{figures}</div>}
        </BoardCard>
      );

      /* each outlet against its own target, on the same month-gone mark */
      const rowCls = 'grid min-h-[48px] grid-cols-[104px_minmax(0,1fr)_44px] items-center gap-2.5';
      outletsCard = (
        <BoardCard id="card-outlets" label="Outlets" right={pacePct !== null && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-slate-500" aria-label={`Mark: ${Math.round(pacePct)}% of the month gone`}>
            <span className="inline-block h-3.5 w-[2px] bg-slate-900" aria-hidden />{Math.round(pacePct)}%
          </span>
        )}>
          <ul className="mt-1">
            {[...m.channels].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)).map((c) => {
              const t = toneOf(c.pct);
              const name = bare(outletName(c.code));
              const row = (
                <>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold leading-tight text-slate-900">{name}</span>
                    <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums leading-tight text-slate-600">
                      {short(c.sales)}{c.target ? <span className="font-medium"> / {short(c.target)}</span> : ' KD'}
                    </span>
                  </span>
                  {c.target ? (
                    <span className="relative block h-2.5 rounded-full bg-[#edf1f5]" role="img"
                      aria-label={`${name} ${Math.round(c.pct ?? 0)}% of ${short(c.target)}`}>
                      <span className="absolute inset-y-0 left-0 block rounded-full" style={{ width: `${Math.min(100, Math.max(0, c.pct ?? 0))}%`, background: HEX[t] }} />
                      {pacePct !== null && <span className="absolute -top-1 block h-[18px] w-[2px] bg-slate-900" style={{ left: `calc(${Math.min(100, pacePct)}% - 1px)` }} />}
                    </span>
                  ) : <span className="text-[14px] tabular-nums text-slate-500">{kd(c.sales)}</span>}
                  <span className={`text-right text-[16px] font-extrabold tabular-nums ${FIG[t]}`}>{c.pct !== null ? `${Math.round(c.pct)}%` : ''}</span>
                </>
              );
              return (
                <li key={c.code} className="border-b border-slate-100">
                  {can('/till-sales')
                    ? <Link to={tillHref(c.code)} state={FROM_TODAY} className={`-mx-2 rounded-lg px-2 hover:bg-slate-50 ${rowCls}`}>{row}</Link>
                    : <div className={rowCls}>{row}</div>}
                </li>
              );
            })}
            {/* events: their own grey rows, never in the % */}
            {m.events.map((e) => {
              const row = (
                <>
                  <span className="truncate text-[14px] font-semibold text-slate-500">{e.name}</span>
                  {/* no bar and no %: the figure takes both columns and stays on one line */}
                  <span className="col-span-2 whitespace-nowrap text-[14px] tabular-nums text-slate-500">{short(e.sales)} · event</span>
                </>
              );
              return (
                <li key={e.name}>
                  {can('/till-sales')
                    ? <Link to={tillHref(null)} state={FROM_TODAY} className={`-mx-2 rounded-lg px-2 hover:bg-slate-50 ${rowCls.replace('min-h-[48px]', 'min-h-[44px]')}`}>{row}</Link>
                    : <div className={rowCls.replace('min-h-[48px]', 'min-h-[44px]')}>{row}</div>}
                </li>
              );
            })}
          </ul>
        </BoardCard>
      );
    }
  }

  /* ---- overdue */
  const nd = needs.data;
  const retryNeeds = () => run(['needs']);
  const lateRow = (key: string, to: string, label: string, chip: string, tone: 'red' | 'amber') => {
    const body = (
      <>
        <span className="block h-2 w-2 shrink-0 rounded-full" style={{ background: HEX[tone] }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900">{label}</span>
        <Pill tone={tone}>{chip}</Pill>
      </>
    );
    const cls = 'flex min-h-[48px] items-center gap-2.5';
    return (
      <li key={key} className="border-b border-slate-100 last:border-0">
        {canOpen(to)
          ? <Link to={to} state={FROM_TODAY} className={`-mx-2 rounded-lg px-2 hover:bg-slate-50 ${cls}`}>{body}</Link>
          : <div className={cls}>{body}</div>}
      </li>
    );
  };
  let needsCard: JSX.Element;
  if (!nd) {
    needsCard = <BoardCard id="card-needs" label="Overdue" busy={!needs.error}><NotYet slot={needs} onRetry={retryNeeds} /></BoardCard>;
  } else {
    const overdueN = nd.items.filter((i) => i.overdue).length;
    const st = nd.stuck;
    const kinds = st ? [...new Set(st.rows.map((r) => r.kind))] : [];
    const stuckLabel = st && st.count
      ? `${kinds.length === 1 ? kinds[0] : 'Requests'}${st.count > 1 ? ` ×${st.count}` : ''} · with ${st.withWhom}` : null;
    const badgeTone = overdueN ? 'red' : nd.missing.length ? 'grey' : 'green';
    needsCard = (
      <BoardCard id="card-needs" label="Overdue"
        lead={<span className={`grid h-7 min-w-[28px] place-items-center rounded-full px-1.5 text-[15px] font-extrabold tabular-nums ${badgeTone === 'red' ? 'bg-[#d92d20] text-white' : PILL[badgeTone]}`}>{nd.missing.length ? (overdueN ? `${overdueN}+` : '—') : overdueN}</span>}
        right={<Stale slot={needs} onRetry={retryNeeds} />}>
        <ul className="mt-1">
          {nd.items.map((it) => lateRow(it.key, it.link, it.label, it.chip, it.overdue ? 'red' : 'amber'))}
          {st && stuckLabel && lateRow('stuck', `/inbox?focus=${st.rows[0].id}`, stuckLabel, ageChip(st.rows[0].hours), 'amber')}
          {/* the reads that failed while the rest loaded: unknown, never an all-clear */}
          {nd.missing.length > 0 && (
            <li role="alert" className="flex min-h-[48px] items-center gap-2.5">
              <span className="text-[20px] font-extrabold leading-none text-slate-300" aria-hidden>—</span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-900" title={nd.missing.map((x) => `${x.what}: ${x.error}`).join(' · ')}>
                {nd.missing.map((x) => x.what).join(', ')}
              </span>
              <span className="text-[13px] font-bold text-[#b42318]">Didn&apos;t load</span>
              <RetryButton small busy={needs.loading} onClick={retryNeeds} />
            </li>
          )}
        </ul>
      </BoardCard>
    );
  }

  /* ---- watch: two tiles at most, only when they have something to say */
  const wd = watch.data;
  const retryWatch = () => run(['watch']);
  let watchBlock: JSX.Element | null = null;
  if (visible.includes('watch')) {
    if (!wd) {
      watchBlock = watch.error
        ? <BoardCard id="card-watch" label="Watch"><NotYet slot={watch} onRetry={retryWatch} /></BoardCard>
        : <div className="grid grid-cols-2 gap-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-slate-200" />)}</div>;
    } else {
      const today = kuwaitDate();
      type T = { key: string; value: string; label: string; tone: 'red' | 'amber' | 'grey'; to: string } | { key: string; failed: string };
      const tiles: T[] = [];
      if (can('/purchase-orders')) {
        if (!wd.po) tiles.push({ key: 'po', failed: 'POs' });
        else {
          if (wd.po.latePOs > 0) tiles.push({ key: 'po-late', value: String(wd.po.latePOs), label: 'POs · late', tone: 'red', to: '/purchase-orders?filter=late' });
          if (wd.po.noDatePOs > 0) tiles.push({ key: 'po-nodate', value: String(wd.po.noDatePOs), label: 'POs · no date', tone: 'amber', to: '/purchase-orders?filter=no-expected-date' });
          if (wd.po.latePOs === 0 && wd.po.duePOs > 0) tiles.push({ key: 'po-due', value: String(wd.po.duePOs), label: 'POs · due 7d', tone: 'grey', to: '/purchase-orders?filter=due-this-week' });
        }
      }
      if (can('/sales')) {
        if (!wd.lost) tiles.push({ key: 'lost', failed: 'Lost sales' });
        else if (wd.lost.lostMonth === 0) {
          /* an empty month is missing data until shown otherwise, not good news */
          tiles.push(wd.lost.lastLost
            ? { key: 'lost-none', value: `${daysSince(today, wd.lost.lastLost)}d`, label: 'No lost sales logged', tone: 'amber', to: '/sales?view=lost&period=30d' }
            : { key: 'lost-none', value: '0', label: 'Lost sales · ever', tone: 'amber', to: '/sales?view=lost&period=30d' });
        } else {
          if (wd.lost.notAvailableMonth > 0) {
            tiles.push({ key: 'lost-na', value: `${wd.lost.notAvailableMonth}/${wd.lost.lostMonth}`, label: 'Not available', tone: wd.lost.notAvailableMonth * 2 >= wd.lost.lostMonth ? 'red' : 'grey', to: '/sales?view=lost&reason=Not%20Available' });
          }
          tiles.push({ key: 'lost-7', value: String(wd.lost.lost7), label: 'Lost sales · 7d', tone: 'grey', to: '/sales?view=lost&period=7d' });
        }
      }
      const stale = staleAt('watch') ? <Stale slot={watch} onRetry={retryWatch} /> : null;
      watchBlock = tiles.length > 0 || stale ? (
        <section id="card-watch" aria-label="Watch">
          {stale && <div className="-mt-1 mb-1 flex justify-end">{stale}</div>}
          <div className="grid grid-cols-2 gap-2">
            {tiles.map((t) => ('failed' in t ? (
              <div key={t.key} role="alert" className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[24px] font-extrabold leading-none text-slate-300" aria-hidden>—</span>
                  <RetryButton small busy={watch.loading} onClick={retryWatch} />
                </span>
                <span className="truncate text-[13px] font-semibold text-slate-700">{t.failed}</span>
                <span className="text-[13px] font-bold text-[#b42318]">Didn&apos;t load</span>
              </div>
            ) : (
              <Link key={t.key} to={t.to} state={FROM_TODAY} className={`flex min-w-0 flex-col rounded-2xl p-3 hover:brightness-[0.98] ${WATCH_TILE[t.tone]}`}>
                <span className="text-[24px] font-extrabold leading-7 tabular-nums">{t.value}</span>
                <span className="text-[13px] font-semibold">{t.label}</span>
              </Link>
            )))}
          </div>
        </section>
      ) : null;
    }
  }

  /* An expired document shows on the person's row in their branch sheet too. */
  const personAlerts: Record<string, PersonAlert> = {};
  for (const it of needs.data?.items ?? []) {
    if (!it.person || personAlerts[it.person.id]) continue;
    personAlerts[it.person.id] = { text: `${it.person.doc} expired ${dayOf(it.person.date)}`, href: can('/hr') ? `/hr?focus=${it.person.id}` : null };
  }
  /* From 1280px a branch sheet docks beside the page, which narrows to make room. */
  const split = wide && !!sheetNav.sheet && !!staff.data?.branches.some((b) => b.key === sheetNav.sheet);

  const staffCard = visible.includes('staff') && (
    <BoardCard id="card-staff" label="Attendance" busy={!staff.data && !staff.error}
      right={staleAt('staff') ? <Stale slot={staff} onRetry={refreshStaff} /> : staff.data && staff.at ? <span className="text-[13px] tabular-nums text-slate-500">at {hhmmOf(staff.at)}</span> : null}>
      {staff.data ? (
        <StaffingCard branches={staff.data.branches} workStart={staff.data.workStart} onChanged={refreshStaff}
          at={staff.at ? hhmmOf(staff.at) : null} alerts={personAlerts} canAttendance={can('/attendance')} />
      ) : <NotYet slot={staff} onRetry={refreshStaff} rows={5} />}
    </BoardCard>
  );

  return (
    <div className={`mx-auto max-w-2xl lg:max-w-5xl xl:max-w-6xl ${split ? 'xl:mr-[392px]' : ''}`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-slate-900">Today</h1>
        <div className="flex items-center gap-1">
          <span className="text-[14px] tabular-nums text-slate-500">{format(new Date(), 'EEE d MMM')}</span>
          {can('/money') && (
            <Link to="/money" aria-label="Money" title="Money"
              className="-mr-2 grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100">
              <Wallet className="h-5 w-5" aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {/* phone: Sales, Outlets, Overdue, Attendance, Watch; from 1024px two columns */}
      <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {salesCard && <div className="order-1">{salesCard}</div>}
          {outletsCard && <div className="order-2">{outletsCard}</div>}
          {watchBlock && <div className="order-5">{watchBlock}</div>}
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <div className="order-3">{needsCard}</div>
          {staffCard && <div className={`order-4 ${split ? 'xl:order-first' : ''}`}>{staffCard}</div>}
        </div>
      </div>

      {can('/sales') && (
        <a href="https://alalramadhan-kuwait.github.io/watch-store-crm/#/reports" target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-[44px] items-center gap-2 px-1 text-[13px] text-slate-500 hover:text-slate-900">
          <ExternalLink size={14} aria-hidden /> Store Daily Report
        </a>
      )}
      {anyRetrying && <span className="sr-only" aria-live="polite">Loading</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

/** A card with nothing to show yet: loading, or failed. */
function NotYet<T>({ slot, onRetry, rows = 3 }: { slot: Slot<T>; onRetry: () => void; rows?: number }) {
  return slot.error ? <Failed error={slot.error} busy={slot.loading} onRetry={onRetry} /> : <Skeleton rows={rows} />;
}

/** The time of the figures shown, when the last refresh failed. */
function Stale<T>({ slot, onRetry }: { slot: Slot<T>; onRetry: () => void }) {
  if (!slot.error || !slot.data || !slot.at) return null;
  return <AsOf at={hhmmOf(slot.at)} busy={slot.loading} error={slot.error} onRetry={onRetry} />;
}

/** The month so far, day by day, against a straight line to the target, with
    a dotted line from the last till day to where this pace ends the month. */
function SalesChart({ cum, days, target, projected, tone }: {
  cum: number[]; days: number; target: number | null; projected: number | null; tone: Tone;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(326);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setW(Math.max(200, Math.round(el.clientWidth)));
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 150, TOP = 14;
  const now = cum.length;
  const last = cum[now - 1] ?? 0;
  const max = Math.max(target ?? 0, projected ?? 0, last) || 1;
  const x = (d: number) => +((d / days) * W).toFixed(1);
  const y = (v: number) => +(H - (v / max) * (H - TOP)).toFixed(1);
  const line = [[0, H], ...cum.map((v, i) => [x(i + 1), y(v)])].map((p) => p.join(',')).join(' ');
  const c = HEX[tone];
  const nowX = x(now), nowY = y(last);
  const tY = target ? y(target) : null;
  const pY = projected !== null && now < days ? y(projected) : null;
  let tL = tY !== null ? Math.max(12, tY - 4) : null;
  let pL = pY !== null ? Math.min(H - 4, Math.max(12, pY - 8)) : null;
  if (tL !== null && pL !== null && Math.abs(tL - pL) < 14) {
    if (pL >= tL) pL = tL + 14; else tL = pL + 14;
  }
  const label = `${short(last)} KD by day ${now}${target ? `, target ${short(target)}` : ''}${pY !== null && projected !== null ? `, heading for ${short(projected)}` : ''}`;
  return (
    <div ref={ref} className="mt-2 w-full">
      <svg width={W} height={168} viewBox={`0 0 ${W} 168`} role="img" aria-label={label} className="block overflow-visible">
        <line x1={0} y1={H} x2={W} y2={H} stroke="#e2e8f0" strokeWidth={1} />
        {tY !== null && <line x1={0} y1={H} x2={W} y2={tY} stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" />}
        <polygon points={`${line} ${nowX},${H}`} fill={c} fillOpacity={0.1} />
        <polyline points={line} fill="none" stroke={c} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {pY !== null && <line x1={nowX} y1={nowY} x2={W} y2={pY} stroke={c} strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" />}
        <circle cx={nowX} cy={nowY} r={5} fill={c} />
        {tY !== null && <circle cx={W} cy={tY} r={4} fill="#94a3b8" />}
        {tL !== null && target && <text x={W - 6} y={tL} textAnchor="end" fontSize={12} fontWeight={700} fill="#64748b">{short(target)}</text>}
        {pL !== null && projected !== null && <text x={W - 6} y={pL} textAnchor="end" fontSize={12} fontWeight={700} fill={c}>{short(projected)}</text>}
        <text x={0} y={166} fontSize={12} fill="#64748b">1</text>
        {nowX > 24 && nowX < W - 24 && <text x={nowX} y={166} textAnchor="middle" fontSize={12} fill="#64748b">{now}</text>}
        <text x={W} y={166} textAnchor="end" fontSize={12} fill="#64748b">{days}</text>
      </svg>
    </div>
  );
}
