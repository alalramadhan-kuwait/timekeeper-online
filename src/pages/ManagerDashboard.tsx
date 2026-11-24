/**
 * The manager's dashboard: what needs fixing today.
 *
 * Designed by the review panel on 29 Sep. The old dashboard answered "how is
 * the company doing?" — supplier balance, stock value, ad spend, followers —
 * which is the owner's question, and it lives on at /money. The manager runs the
 * day. Since 24 Nov (3.26.0) it opens with three sentences, one per card,
 * each of which jumps to its card, and then three cards built from one card
 * component (TodayCard), in this order on a phone:
 *
 *   1. Sales     — the month against target in till days, the gap in KD, what
 *                  it needs a day, yesterday, the same days last month, each
 *                  outlet with its pace mark, and the one outlet to push.
 *                  Event sales (the Expo) stand apart, with a view switch to
 *                  see them counted: whether they count is the owner's call.
 *   2. Needs you — overdue first, numbered, each with what to do about it and
 *                  how late it is; then requests stuck with somebody else, and
 *                  the Watch lines (lost sales, purchase orders).
 *   3. Staffing  — who is not here who should be, branch by branch.
 *
 * On a wide screen the three cards sit side by side.
 *
 * Nothing here is a count with no action behind it.
 *
 * Each of the four loads on its own, checks every query's error, and gives up
 * after ten seconds. A section that did not load says so — "unknown, not an
 * all-clear" — and never turns into "Everyone due is in" or "Nothing is waiting
 * on you". That is what this page said on 23 Nov while the database was down.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ChevronRight, ChevronDown, Check, AlertTriangle, RotateCw, TrendingUp, ListChecks, Users, Eye } from 'lucide-react';
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
import { loadRequests, waitedFor, stageOf, tabOf, type RequestRow } from '../shared/requests';
import { monthSales, eventDates, daySales, sameDaysBefore, prevMonthOf, type MonthSales, type TillRow, type DaySales, type SameDays } from '../shared/tillSales';
import { TodayCard, Chip, Dot, PaceBar, SubHead, TONE, type Tone } from '../components/TodayCard';
import { FROM_TODAY } from '../components/FromToday';

/* ------------------------------------------------------------------ types */

interface Emp { id: string; full_name: string; location: string | null; status: string; user_id: string | null; phone: string | null }
interface Rec { user_id: string | null; employee_name: string; clock_in: string; clock_out: string | null }
interface Leave { employee_id: string; leave_start: string; leave_end: string; leave_type: string | null; notes: string | null }

interface Item {
  key: string;
  /** What kind of thing it is, e.g. "Residency expired"; red when overdue. */
  kind: string;
  /** Which one, e.g. the person's name or the task's title. */
  what?: string;
  sub?: string;
  /** What to do about it, in a few words. */
  verb: string;
  /** How late, for the chip on the right: "25d late", "expired". */
  chip?: string;
  /** Hours it has been waiting, or late; sorts the list. */
  age: number;
  overdue: boolean;
  link: string;
  /** An expired document: whose, which, and when, so their row in a branch sheet can say so too. */
  person?: { id: string; doc: string; date: string };
  /** Shown in place when the row is opened: the follow-ups behind a count. */
  children?: { key: string; text: string; sub: string; chip: string }[];
}

interface StuckRow { id: string; who: string; what: string; hours: number }

interface StaffData { branches: StaffBranch[]; workStart: string }
interface SalesData {
  month: MonthSales;
  /** The last till day's regular sales ("yesterday" when the tills are up to date). */
  lastDay: DaySales | null;
  /** The same till days of the month before. */
  sameDays: SameDays | null;
  syncedAt: string | null;
}
interface NeedsData {
  items: Item[];
  /** Requests past due that are with somebody else, not with you; null when the requests did not load. */
  stuck: { count: number; rows: StuckRow[]; withWhom: string } | null;
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
interface Memo { who: string; slots: Partial<Record<Key, { data: unknown; at: number }>>; openRows: Record<string, boolean>; all: boolean }
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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** 53879 → 53.9k, 3399 → 3.4k, 800 → 800. */
const short = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
const kd = (n: number) => `${short(n)} KD`;
/** Whole days from `date` to `today`, both yyyy-mm-dd. */
const daysSince = (today: string, date: string) => Math.round((Date.parse(today) - Date.parse(date.slice(0, 10))) / 86_400_000);
const lateBy = (days: number) => (days <= 0 ? 'due today' : `${plural(days, 'day')} late`);
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
  return {
    month: ms,
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
  for (const r of reqRows ?? []) {
    if (tabOf(r, mine) !== 'action') continue;
    const when = r.kind === 'Leave' ? r.proposed_from : r.attendance_date;
    items.push({
      key: `req:${r.id}`, kind: `${r.kind} request`, what: `${r.employee_name ?? 'Someone'}${when ? ` · ${dayOf(when)}` : ''}`,
      sub: `Waiting ${waitedFor(r.hours_pending)}`, verb: 'Decide in the Inbox',
      chip: r.is_overdue ? `waiting ${waitedFor(r.hours_pending)}` : undefined,
      age: r.hours_pending, overdue: r.is_overdue, link: `/inbox?focus=${r.id}`,
    });
  }
  /* Requests past due that sit with somebody else. Not yours to decide, but
     yours to chase: they are counted apart from what is waiting on you. */
  const stuckRows = (reqRows ?? []).filter((r) => tabOf(r, mine) === 'waiting' && r.is_overdue)
    .sort((a, b) => a.hours_pending - b.hours_pending);
  const holders = [...new Set(stuckRows.map((r) => r.stage_owner))];
  const stuck = !reqRows ? null : {
    count: stuckRows.length,
    rows: stuckRows.map((r) => {
      const when = r.kind === 'Leave' ? r.proposed_from : r.attendance_date;
      return { id: r.id, who: r.employee_name ?? 'Someone', what: `${r.kind}${when ? ` ${dayOf(when)}` : ''}`, hours: r.hours_pending };
    }),
    withWhom: holders.length === 1 && holders[0] === 'manager' ? 'the store manager' : holders.length === 1 && holders[0] === 'owner' ? 'the owner' : 'others',
  };

  if (fus.length) {
    const oldest = fus[0].promised_callback;
    const days = Math.max(1, daysSince(today, oldest));
    items.push({
      key: 'fu', kind: 'Follow-ups overdue', what: plural(fus.length, 'customer'),
      sub: `Oldest callback promised ${dayOf(oldest)}`, verb: fus.length === 1 ? 'Call them back' : 'Call them back · tap to see who',
      chip: `${fus.length === 1 ? '' : 'oldest '}${days}d late`, age: days * 24, overdue: true, link: '/follow-ups?bucket=overdue',
      children: fus.map((f) => ({
        key: f.id, text: f.customer_name?.trim() || 'Customer',
        sub: [f.outlet, f.staff, `promised ${dayOf(f.promised_callback)}`].filter(Boolean).join(' · '),
        chip: `${Math.max(1, daysSince(today, f.promised_callback))}d late`,
      })),
    });
  }
  const overdueReps = reps.filter((r) => r.estimated_completion && r.estimated_completion < today && !['Returned to customer', 'Cancelled'].includes(r.status));
  if (overdueReps.length) {
    const oldest = overdueReps.map((r) => r.estimated_completion!).sort()[0];
    const days = daysSince(today, oldest);
    items.push({ key: 'rep-late', kind: 'Repairs late', what: `${plural(overdueReps.length, 'repair')} past the promised date`, sub: `Oldest promised ${dayOf(oldest)} · ${lateBy(days)}`, verb: 'Open Repairs and call the workshop', chip: days > 0 ? `${days}d late` : 'due today', age: days * 24, overdue: true, link: '/repairs' });
  }
  const ready = reps.filter((r) => r.status === 'Ready for pickup');
  if (ready.length) {
    const oldest = Math.max(...ready.map((r) => (now.getTime() - Date.parse(r.updated_at)) / 3_600_000));
    items.push({ key: 'rep-ready', kind: 'Ready for pickup', what: plural(ready.length, 'repair'), sub: `Oldest waiting ${waitedFor(oldest)}`, verb: 'Tell the customers', chip: oldest >= 24 * 7 ? `waiting ${waitedFor(oldest)}` : undefined, age: oldest, overdue: oldest >= 24 * 7, link: '/repairs' });
  }
  if (pre.length) {
    const oldest = Math.max(...pre.map((p) => (now.getTime() - Date.parse(p.updated_at)) / 3_600_000));
    items.push({ key: 'pre', kind: 'Pre-orders arrived', what: `${plural(pre.length, 'customer')} to be told`, sub: `Oldest waiting ${waitedFor(oldest)}`, verb: 'Tell the customers', chip: oldest >= 48 ? `waiting ${waitedFor(oldest)}` : undefined, age: oldest, overdue: oldest >= 48, link: '/waiting-list' });
  }

  /* A project past its launch date, a task past its due date and a document
     past its expiry are all late: they were counted as not overdue until 24 Nov. */
  const delayed = projs.filter((p) => ['Upcoming', 'Confirmed'].includes(p.status) && p.launch_date && p.launch_date < today)
    .sort((a, b) => a.launch_date!.localeCompare(b.launch_date!));
  if (delayed.length) {
    const first = delayed[0];
    const days = daysSince(today, first.launch_date!);
    const name = [first.project_name, first.brand ? `(${first.brand})` : null].filter(Boolean).join(' ');
    items.push(delayed.length === 1
      ? { key: 'proj', kind: 'Project past launch', what: name || 'unnamed project', sub: `Launch was ${dayOf(first.launch_date)} · ${first.status}`, verb: 'Open the project to set a new date', chip: `${days}d late`, age: days * 24, overdue: true, link: `/limited-projects?focus=${first.id}` }
      : { key: 'proj', kind: 'Projects past launch', what: plural(delayed.length, 'project'), sub: `Oldest launch ${dayOf(first.launch_date)} · ${name}`, verb: 'Open Limited projects to set new dates', chip: `oldest ${days}d late`, age: days * 24, overdue: true, link: '/limited-projects' });
  }
  if (tasks.length) {
    const first = tasks[0];
    const days = daysSince(today, first.due_date);
    /* A task given to a team (operations, hr…) has a role and no name: it is assigned. */
    const who = first.assignee_name?.trim() || (first.assignee_role ? `team: ${first.assignee_role}` : 'nobody assigned');
    const held = !!(first.assignee_name?.trim() || first.assignee_role);
    items.push(tasks.length === 1
      ? { key: 'task', kind: 'Task overdue', what: first.title?.trim() || 'untitled task', sub: [`Due ${dayOf(first.due_date)}`, first.priority ? `${first.priority} priority` : null, who].filter(Boolean).join(' · '), verb: held ? 'Open the task to chase or close it' : 'Open the task: nobody has it yet', chip: `${days}d late`, age: days * 24, overdue: true, link: `/tasks?focus=${first.id}` }
      : { key: 'task', kind: 'Tasks overdue', what: plural(tasks.length, 'assigned task'), sub: `Oldest due ${dayOf(first.due_date)} · ${first.title?.trim() || 'untitled task'}`, verb: 'Open the oldest to chase or close it', chip: `oldest ${days}d late`, age: days * 24, overdue: true, link: `/tasks?focus=${first.id}` });
  }

  /* Documents: an expired one is named, person by person, and is overdue. One
     still to expire is a heads-up, counted apart and worded as such. */
  const expiring: { date: string; name: string }[] = [];
  for (const e of docs) {
    for (const [doc, date] of [['Residency', e.residency_expiry], ['Work permit', e.work_permit_expiry]] as const) {
      if (!date) continue;
      if (date < today) {
        const days = daysSince(today, date);
        items.push({
          key: `doc:${e.id}:${doc}`, kind: `${doc} expired`, what: e.full_name,
          sub: `Expired ${dayOf(date)} · ${days === 1 ? 'yesterday' : `${plural(days, 'day')} ago`}`,
          verb: `Open ${e.full_name.trim().split(/\s+/)[0]}'s HR record`, chip: 'expired',
          age: days * 24, overdue: true, link: `/hr?focus=${e.id}`, person: { id: e.id, doc, date },
        });
      } else if (date <= in30) expiring.push({ date, name: e.full_name });
    }
  }
  if (expiring.length) {
    const next = expiring.sort((a, b) => a.date.localeCompare(b.date))[0];
    items.push({
      key: 'docs', kind: 'Documents expiring', what: `${plural(expiring.length, 'staff document')} within 30 days`,
      sub: `Next ${dayOf(next.date)} · ${next.name}`, verb: 'Open Employees to renew', age: 12, overdue: false, link: '/hr',
    });
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

/** 2006 → "2,006"; 61039.3 → "61,039.3". For figures read one by one. */
const full = (n: number, dp = 0) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp });
/** −10 → "−10%", 5 → "+5%", with a true minus sign. */
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`;
const monName = (ym: string) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(ym.slice(5, 7)) - 1];
const longMonth = (ym: string) => new Date(`${ym}-15T12:00:00+03:00`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'Asia/Kuwait' });

interface Headline {
  key: 'sales' | 'needs' | 'staff'; tone: Tone; lead: string; rest?: string;
  /** A branch the sentence names: the tap opens its sheet as well. */
  branch?: string;
}

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
  const [all, setAll] = useState(cached?.all ?? false);
  /* Whether the event sales are shown counted toward the target. A way of
     looking only, never saved: whether they count is the owner's call. */
  const [eventsCounted, setEventsCounted] = useState(false);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>(cached?.openRows ?? {});
  const [flash, setFlash] = useState<string | null>(null);
  const sheetNav = useBranchSheet();
  const wide = useWideSheet();
  const flashTimer = useRef<number | undefined>(undefined);
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
  /* Remember what loaded, and which rows were open, for the next visit. */
  useEffect(() => {
    const kept: Memo['slots'] = memo && memo.who === who ? { ...memo.slots } : {};
    for (const k of KEYS) {
      const sl = slots[k] as Slot<unknown>;
      if (sl.data && sl.at && !sl.error) kept[k] = { data: sl.data, at: sl.at };
    }
    memo = { who, slots: kept, openRows, all };
  }, [who, slots, openRows, all]);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  const refreshStaff = useCallback(() => run(['staff']), [run]);
  useLive('mgr-dash', [{ table: 'attendance_records' }, { table: 'leave_records' }], refreshStaff);

  const can = (p: string) => canAccessPath(p, role, pageAccess);

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

  /* Which sections are shown to this person at all; only those count toward
     "did not load". */
  const visible: Key[] = [
    ...(can('/attendance') ? ['staff' as Key] : []),
    ...(can('/sales') ? ['sales' as Key] : []),
    'needs',
    ...(can('/sales') || can('/purchase-orders') ? ['watch' as Key] : []),
  ];
  const failed = visible.filter((k) => slots[k].error && !slots[k].data);
  const anyRetrying = visible.some((k) => slots[k].loading);
  const staleAt = (k: Key) => (slots[k].error && slots[k].data && slots[k].at ? hhmmOf(slots[k].at!) : null);

  const jump = (k: 'sales' | 'needs' | 'staff') => {
    const el = document.getElementById(`card-${k}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.focus({ preventScroll: true });
    }
    setFlash(k);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
  };

  /* ---- the sales figures the card and the headline share */
  const reg = m?.regular ?? null;
  const regPct = reg?.pct ?? null;
  const regTone = toneOf(regPct);
  const daysLeft = m && m.tillDays ? m.daysInMonth - m.tillDays : null;
  const perDay = (v: number) => (m?.tillDays ? v / m.tillDays : null);
  const neededPerDay = (v: number, t: number | null) => (t && daysLeft ? Math.max(0, t - v) / daysLeft : null);
  const behindChannels = m ? m.channels.filter((c) => verdictOf(c.pct) === 'behind') : [];
  /* The one outlet to push: of those well behind, the one furthest short in KD. */
  const push = behindChannels.length
    ? [...behindChannels].sort((a, b) => ((b.target ?? 0) - b.sales) - ((a.target ?? 0) - a.sales))[0]
    : null;
  const eventsTotal = m ? m.events.reduce((t, e) => t + e.sales, 0) : 0;
  const canCount = !!(m && m.events.length && reg?.target);
  const counted = canCount && eventsCounted;

  /* ---- headline sentences: one per card, an all-clear only from a section that loaded */
  const heads: Headline[] = [];
  if (visible.includes('sales')) {
    const at = staleAt('sales');
    const cue = at ? ` · as of ${at}, could not refresh` : '';
    if (m && reg) {
      const v = verdictOf(regPct);
      const outlets = m.channels.filter((c) => c.target).length;
      if (counted) heads.push({ key: 'sales', tone: 'grey', lead: 'Sales with events counted', rest: `regular outlets alone ${v === 'behind' ? 'are behind pace' : 'are on pace'}${cue}` });
      else if (v === 'behind') heads.push({ key: 'sales', tone: 'red', lead: 'Sales behind pace', rest: `${behindChannels.length} of ${outlets} outlets behind${push ? ` · push ${bare(outletName(push.code))}` : ''}${cue}` });
      else if (v === 'none') heads.push({ key: 'sales', tone: 'grey', lead: m.tillDays ? 'Sales: no monthly target set' : 'No till sales yet this month', rest: cue.replace(/^ · /, '') || undefined });
      else heads.push({ key: 'sales', tone: regTone, lead: v === 'ahead' ? 'Sales ahead of pace' : regTone === 'amber' ? 'Sales a little behind pace' : 'Sales on pace', rest: `${behindChannels.length ? `${behindChannels.length} of ${outlets} outlets behind` : 'every outlet on or near pace'}${cue}` });
    } else if (sales.error) heads.push({ key: 'sales', tone: 'red', lead: 'Sales did not load', rest: 'unknown, not zero' });
    else heads.push({ key: 'sales', tone: 'grey', lead: 'Sales', rest: 'loading…' });
  }
  {
    const at = staleAt('needs');
    const cue = at ? ` · as of ${at}, could not refresh` : '';
    if (needs.data) {
      const n = needs.data.items.length;
      const overdue = needs.data.items.filter((i) => i.overdue).length;
      const stuckN = needs.data.stuck?.count ?? 0;
      const stuckTxt = stuckN ? ` · ${stuckN} stuck with others` : '';
      const miss = needs.data.missing.map((x) => x.what);
      const missTxt = miss.length ? ` · ${miss.join(', ')} did not load` : '';
      heads.push(overdue
        ? { key: 'needs', tone: 'red', lead: `${overdue} overdue`, rest: `${plural(n, 'thing')} waiting on you${stuckTxt}${missTxt}${cue}` }
        : n
          ? { key: 'needs', tone: 'amber', lead: `${plural(n, 'thing')} waiting on you`, rest: `${miss.length ? 'none overdue in what loaded' : 'none overdue'}${stuckTxt}${missTxt}${cue}` }
          : miss.length
            /* nothing among what loaded is not an all-clear */
            ? { key: 'needs', tone: 'red', lead: 'Needs you partly loaded', rest: `${miss.join(', ')} did not load · unknown, not an all-clear${stuckTxt}${cue}` }
            : { key: 'needs', tone: stuckN ? 'amber' : 'green', lead: 'Nothing is waiting on you', rest: `${stuckTxt.replace(/^ · /, '')}${cue}` || undefined });
    } else if (needs.error) heads.push({ key: 'needs', tone: 'red', lead: 'Needs you did not load', rest: 'unknown, not an all-clear' });
    else heads.push({ key: 'needs', tone: 'grey', lead: 'Needs you', rest: 'checking…' });
  }
  if (visible.includes('staff')) {
    const at = staleAt('staff');
    const cue = at ? ` · as of ${at}, could not refresh` : '';
    if (staff.data) {
      const nobodyIn = staff.data.branches.filter((b) => b.tone === 'bad');
      const shortB = staff.data.branches.filter((b) => b.shop && b.tone === 'warn');
      const gapCount = staff.data.branches.reduce((n, b) => n + b.people.filter((p) => p.status === 'late' || p.status === 'missing').length, 0);
      /* Naming one branch: the tap opens its sheet, one tap from the top. */
      /* Every branch the card flags is named here, so none of them is only
         found by scrolling; with more than one, the tap goes to the card. */
      const flagged = staff.data.branches.filter((b) => b.tone === 'bad' || b.tone === 'warn');
      const alsoOf = (shown: StaffBranch[]) => {
        const others = flagged.filter((b) => !shown.includes(b)).map((b) => b.name);
        return others.length ? `${others.join(', ')} also to check` : '';
      };
      const join = (...parts: string[]) => parts.filter(Boolean).join(' · ') || undefined;
      if (nobodyIn.length) heads.push({ key: 'staff', tone: 'red', lead: `${nobodyIn.map((s) => s.name).join(' and ')}: nobody on the floor`, rest: join(alsoOf(nobodyIn), cue.replace(/^ · /, '')), branch: flagged.length === 1 ? nobodyIn[0].key : undefined });
      else if (shortB.length) {
        const b = shortB[0];
        /* as the To-do button counts them: not in, and no shift time to judge by */
        const unknown = b.people.filter((p) => p.timeUnknown && !['working', 'completed'].includes(p.status)).length;
        heads.push({
          key: 'staff', tone: 'amber', lead: `${b.name} ${b.onFloor} in · minimum ${b.need}`,
          rest: join(unknown ? `${unknown} with no shift time` : '', alsoOf([b]), cue.replace(/^ · /, '')),
          branch: flagged.length === 1 ? b.key : undefined,
        });
      } else if (gapCount) {
        const where = staff.data.branches.filter((b) => b.people.some((p) => p.status === 'late' || p.status === 'missing'));
        heads.push({ key: 'staff', tone: 'amber', lead: `${gapCount === 1 ? 'One person is' : `${gapCount} people are`} not in yet`, rest: join(where.map((b) => b.name).join(', '), cue.replace(/^ · /, '')), branch: where.length === 1 ? where[0].key : undefined });
      }
      else heads.push({ key: 'staff', tone: 'green', lead: 'Everyone due is in', rest: cue.replace(/^ · /, '') || undefined });
    } else if (staff.error) heads.push({ key: 'staff', tone: 'red', lead: 'Staffing did not load', rest: 'unknown, not an all-clear' });
    else heads.push({ key: 'staff', tone: 'grey', lead: 'Staffing', rest: 'checking…' });
  }

  /* The figures run to the last day the tills synced, not to now. */
  const salesCtx = !visible.includes('sales') ? null
    : m?.lastSaleDay ? { text: `sales to end of ${dayOf(m.lastSaleDay)}`, bad: false }
      : sales.data ? { text: 'no till sales yet this month', bad: false }
        : sales.error ? { text: 'sales not loaded', bad: true } : null;
  const staffCtx = !visible.includes('staff') ? null
    : staff.data && staff.at ? { text: `staff at ${hhmmOf(staff.at)}${staff.error ? ', could not refresh' : ''}`, bad: !!staff.error }
      : staff.error ? { text: 'staff not loaded', bad: true } : null;
  /* The tills sync once a morning; figures that stop before yesterday did not refresh. */
  const yesterday = sales.at ? kuwaitDate(new Date(sales.at - 86_400_000)) : '';
  const tillsBehind = !!m?.lastSaleDay && m.lastSaleDay < yesterday;

  const toggleRow = (k: string) => setOpenRows((o) => ({ ...o, [k]: !o[k] }));
  /* Till sales for this month, one outlet or the regular outlets together. */
  const tillHref = (code: string | null) => `/till-sales?${code ? `outlet=${code}&` : ''}month=${m?.month ?? kuwaitDate().slice(0, 7)}`;

  /* ---- the cards */
  const salesCard = visible.includes('sales') && (
    <TodayCard id="card-sales" icon={<TrendingUp className="h-5 w-5" />} title="Sales" flash={flash === 'sales'}
      chip={m && pace && regPct !== null ? (counted
        ? <Chip tone="grey">events counted</Chip>
        /* from the two rounded figures the card shows, so 77% − 55% reads 22 */
        : Math.round(pace.frac * 100) > Math.round(regPct)
          ? <Chip tone={regTone}>{Math.round(pace.frac * 100) - Math.round(regPct)} pts behind</Chip>
          : <Chip tone="green">on pace</Chip>) : undefined}
      meta={m ? `${longMonth(m.month)} · ${m.tillDays ? `${m.tillDays} of ${m.daysInMonth} till days` : 'no till sales yet'}` : sales.error ? 'Not loaded' : 'Loading till sales'}
      link={can('/till-sales') ? { label: 'Till sales', to: tillHref(null) } : undefined}>
      {!m || !reg ? <SectionState slot={sales} name="sales" onRetry={() => run(['sales'])} /> : (
        <>
          {sales.error && <StaleBar at={sales.at} error={sales.error} busy={sales.loading} onRetry={() => run(['sales'])}
            what={m.lastSaleDay ? `sales to end of ${dayOf(m.lastSaleDay)}` : undefined} syncedAt={sales.data?.syncedAt ?? null} />}
          {tillsBehind && (
            <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[13px] text-amber-800">
              Till figures stop at {dayOf(m.lastSaleDay)}: the morning sync may not have run{sales.data?.syncedAt ? ` (last good sync ${format(new Date(sales.data.syncedAt), 'd MMM HH:mm')})` : ''}.
            </p>
          )}
          {salesBody()}
        </>
      )}
    </TodayCard>
  );

  function salesBody() {
    if (!m || !reg) return null;
    const pacePct = pace ? pace.frac * 100 : null;
    const target = reg.target;
    const cPct = target ? ((reg.sales + eventsTotal) / target) * 100 : null;
    const bigPct = counted ? cPct : regPct;
    const bigTone: Tone = counted ? (cPct !== null && pacePct !== null && cPct >= pacePct ? 'green' : toneOf(cPct)) : regTone;
    const shortBy = reg.projectedShort !== null && reg.projectedShort > 0 ? reg.projectedShort : null;
    const sd = sales.data?.sameDays ?? null;
    const ld = sales.data?.lastDay ?? null;
    const need = neededPerDay(reg.sales, target);
    const doing = perDay(reg.sales);
    const vs = sd && sd.rows && sd.sales ? Math.round(((reg.sales - sd.sales) / sd.sales) * 100) : null;
    const sdRange = sd ? `${Number(sd.from.slice(8))}–${Number(sd.to.slice(8))} ${monName(sd.month)}` : '';
    const remaining = target ? Math.max(0, target - reg.sales) : null;
    return (
      <>
        {/* the month in one figure, with the gap in KD under it */}
        <div className="flex items-center gap-3">
          <span className={`text-[40px] font-bold leading-[44px] tabular-nums ${TONE[bigTone].text}`}>{bigPct !== null ? `${Math.round(bigPct)}%` : kd(reg.sales)}</span>
          <div className="min-w-0 text-[14px] leading-[18px]">
            <p className="font-semibold tabular-nums text-slate-900">
              {target ? `${short(counted ? reg.sales + eventsTotal : reg.sales)} of ${kd(target)}` : `${kd(reg.sales)} · no monthly target set`}
            </p>
            <p className="text-slate-600">{counted ? 'regular + events' : 'regular'}{pace ? ` · ${Math.round(pace.frac * 100)}% of month gone` : ''}</p>
          </div>
        </div>
        {target && bigPct !== null && (
          <div className="mb-1.5 mt-2.5">
            <PaceBar pct={bigPct} pace={pacePct} tone={bigTone} thick
              label={`${Math.round(bigPct)}% of target${pace ? `, ${Math.round(pace.frac * 100)}% of the month gone` : ''}`} />
          </div>
        )}
        {counted ? (
          <>
            <p className="text-[14px] font-semibold tabular-nums text-slate-700">
              {reg.projected !== null ? `On pace for ~${kd(reg.projected + eventsTotal)} with events counted once` : 'Events counted once'}
            </p>
            <p className={`text-[14px] font-semibold tabular-nums ${TONE[regTone].text}`}>
              Regular outlets alone: {regPct !== null ? `${Math.round(regPct)}%` : kd(reg.sales)}{shortBy ? ` · ~${short(shortBy)} short` : ''}
            </p>
          </>
        ) : reg.projected !== null && (
          <p className={`text-[15px] font-semibold tabular-nums ${TONE[regTone].text}`}>
            On pace for ~{kd(reg.projected)}{target ? (shortBy ? ` · ~${short(shortBy)} short` : ` · ~${short(reg.projected - target)} over`) : ''}
          </p>
        )}

        {canCount && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[13px] leading-[17px] text-slate-600">{m.events.map((e) => e.name).join(', ')} {kd(eventsTotal)} in the target? <span className="block font-semibold text-slate-700">Owner decides</span></p>
            <div role="radiogroup" aria-label="Show event sales apart or counted toward the target" className="flex shrink-0 rounded-xl bg-slate-100 p-0.5">
              {[{ v: false, l: 'Apart' }, { v: true, l: 'Counted' }].map((o) => (
                <button key={o.l} type="button" role="radio" aria-checked={eventsCounted === o.v} onClick={() => setEventsCounted(o.v)}
                  className={`h-11 min-w-[68px] rounded-[10px] px-2.5 text-[13px] font-semibold ${eventsCounted === o.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* three facts: what it needs a day, yesterday, the same days last month */}
        {counted && <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-slate-600">Below: regular outlets only</p>}
        <div className={`${counted ? 'mt-1' : 'mt-3'} grid grid-cols-3 divide-x divide-slate-200 rounded-xl bg-slate-50 py-2 text-center tabular-nums`}>
          <div className="px-1">
            <p className="text-[12px] text-slate-600">Needs a day</p>
            <p className={`text-[15px] font-semibold leading-5 ${need !== null && doing !== null && need > doing ? TONE.red.text : 'text-slate-900'}`}>
              {need === null ? '—' : need === 0 ? 'Target met' : `${full(need)} KD`}
            </p>
            <p className="text-[12px] text-slate-600">{doing !== null ? `doing ${full(doing)}` : 'no till days yet'}</p>
          </div>
          <div className="px-1">
            <p className="text-[12px] text-slate-600">{ld ? (ld.date === yesterday ? 'Yesterday' : dayOf(ld.date)) : 'Yesterday'}</p>
            <p className="text-[15px] font-semibold leading-5 text-slate-900">{ld ? `${full(ld.sales)} KD` : '—'}</p>
            <p className="text-[12px] text-slate-600">{ld ? plural(ld.count, 'sale') : 'no till sales'}</p>
          </div>
          <div className="px-1">
            <p className="text-[12px] text-slate-600">{sd ? `vs ${sdRange}` : 'Last month'}</p>
            <p className={`text-[15px] font-semibold leading-5 ${vs === null ? 'text-slate-600' : vs < 0 ? TONE.red.text : TONE.green.text}`}>{vs === null ? 'no figures' : signed(vs)}</p>
            <p className="text-[12px] text-slate-600">{sd && sd.rows ? `was ${short(sd.sales)}` : '—'}</p>
          </div>
        </div>

        {/* each outlet on the same pace mark, so the bars read as one picture */}
        <ul className="mt-2">
          {m.channels.map((c) => {
            const t = toneOf(c.pct);
            const v = verdictOf(c.pct);
            const name = bare(outletName(c.code));
            const prev = sd?.rows ? sd.byChannel[c.code] ?? 0 : null;
            const vsC = prev ? Math.round(((c.sales - prev) / prev) * 100) : null;
            const needC = neededPerDay(c.sales, c.target);
            const doingC = perDay(c.sales);
            const isPush = push?.code === c.code;
            const row = (
              <>
                {isPush && <p className={`mb-1 text-[12px] font-semibold uppercase tracking-wide ${TONE.red.text}`}>One thing to push</p>}
                <div className="flex items-center gap-2">
                  <span className="w-[100px] shrink-0 truncate text-[15px] font-semibold text-slate-900">{name}</span>
                  <div className="flex-1">{c.target ? <PaceBar pct={c.pct ?? 0} pace={pacePct} tone={t} /> : null}</div>
                  <span className={`w-11 text-right text-[15px] font-bold tabular-nums ${TONE[t].text}`}>{c.pct !== null ? `${Math.round(c.pct)}%` : ''}</span>
                  {can('/till-sales') && <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />}
                </div>
                <p className="text-[13px] leading-[18px] tabular-nums text-slate-600">
                  {c.target ? `${short(c.sales)} of ${short(c.target)}` : `${kd(c.sales)} · no target set`}
                  {c.target && !isPush && (v === 'behind' && needC !== null
                    ? <> · <span className={TONE.red.text}>needs {full(needC)}/day</span></>
                    : v === 'ahead' ? <> · <span className={TONE.green.text}>ahead</span></>
                      : v === 'ok' ? <> · <span className={TONE[t].text}>{t === 'amber' ? 'a little behind' : 'on pace'}</span></> : null)}
                  {vsC !== null && <> · {signed(vsC)} vs {monName(sd!.month)}</>}
                </p>
                {isPush && remaining !== null && needC !== null && doingC !== null && (
                  <>
                    <p className={`text-[13px] font-semibold leading-[18px] tabular-nums ${TONE.red.text}`}>
                      {short(Math.max(0, (c.target ?? 0) - c.sales))} of the {short(remaining)} gap · needs {full(needC)}/day, doing {full(doingC)}
                    </p>
                    {c.code === 'online' && (
                      <p className="mt-0.5 text-[13px] leading-[18px] text-slate-700">
                        Open question for the owner: do all Shopify orders go through Lightspeed? If not, part of this fall is orders the tills never saw.
                      </p>
                    )}
                  </>
                )}
              </>
            );
            /* each outlet opens its own month, day by day */
            return (
              <li key={c.code} className={isPush ? `-mx-2 my-1 rounded-xl ${TONE.red.soft}` : 'border-t border-slate-100 first:border-0'}>
                {can('/till-sales') ? (
                  <Link to={tillHref(c.code)} state={FROM_TODAY}
                    className={`block rounded-xl py-2 hover:bg-slate-900/[0.03] ${isPush ? 'px-2' : '-mx-2 px-2'}`}>{row}</Link>
                ) : <div className={`py-2 ${isPush ? 'px-2' : ''}`}>{row}</div>}
              </li>
            );
          })}
        </ul>

        {/* the exact figure the percentage is of */}
        {target && (() => {
          const body = (
            <>
              <span className="flex-1 text-[14px] text-slate-900"><span className="font-semibold">Regular outlets</span> <span className="tabular-nums">{full(reg.sales, 1)} KD of {full(target)} = {Math.round(regPct ?? 0)}%</span></span>
              {can('/till-sales') && <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />}
            </>
          );
          return can('/till-sales')
            ? <Link to={tillHref(null)} state={FROM_TODAY} className="-mx-2 flex min-h-[44px] items-center gap-2 rounded-lg border-t border-slate-200 px-2 hover:bg-slate-50">{body}</Link>
            : <div className="flex min-h-[44px] items-center gap-2 border-t border-slate-200">{body}</div>;
        })()}

        {/* events: their own rows, never inside the regular figure */}
        {m.events.map((e) => {
          const body = (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-slate-900">{e.name} <span className="font-normal text-slate-600">(event)</span></span>
                <Chip tone="grey">no target</Chip>
                <span className="ml-auto text-[15px] font-bold tabular-nums text-slate-900">{kd(e.sales)}</span>
                {can('/till-sales') && <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />}
              </div>
              <p className="text-[13px] leading-[18px] tabular-nums text-slate-600">
                {eventDates(e.from, e.to)} · {plural(e.count, 'sale')} · {counted ? `counted once in the ${Math.round(((reg.sales + eventsTotal) / (target ?? 1)) * 100)}%` : target ? `not in the ${Math.round(regPct ?? 0)}%` : 'not in the regular total'}
              </p>
            </>
          );
          return can('/till-sales')
            ? <Link key={e.name} to={tillHref(null)} state={FROM_TODAY} className="-mx-2 block rounded-lg border-t border-slate-100 px-2 py-2 hover:bg-slate-50">{body}</Link>
            : <div key={e.name} className="border-t border-slate-100 py-2">{body}</div>;
        })}
        {pace && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-600">
            <span className="inline-block h-3 w-0.5 bg-slate-900" aria-hidden /> where each outlet should be after {plural(pace.day, 'till day')} of {m.daysInMonth}
          </p>
        )}
      </>
    );
  }

  const nd = needs.data;
  const overdueItems = nd ? nd.items.filter((i) => i.overdue) : [];
  const otherItems = nd ? nd.items.filter((i) => !i.overdue) : [];
  const shownOther = all ? otherItems : otherItems.slice(0, 4);
  /* A row links only where this person may open the page; otherwise it is read-only. */
  const canOpen = (to: string) => can(to.split('?')[0]);
  const missOther = nd ? nd.missing.filter((x) => x.what !== 'Requests') : [];
  const wd = watch.data;
  const needsCard = (
    <TodayCard id="card-needs" icon={<ListChecks className="h-5 w-5" />} title="Needs you" flash={flash === 'needs'}
      chip={nd ? (overdueItems.length ? <Chip tone="red">{overdueItems.length} overdue</Chip> : nd.items.length ? <Chip tone="amber">{nd.items.length} waiting</Chip> : nd.missing.length ? <Chip tone="red">partly loaded</Chip> : <Chip tone="green">all clear</Chip>) : undefined}
      meta={nd ? `Overdue first${nd.stuck?.count ? `, then ${nd.stuck.count} stuck` : ''}` : needs.error ? 'Not loaded' : 'Checking what needs you'}
      link={{ label: 'Inbox', to: '/inbox' }}>
      {!nd ? <SectionState slot={needs} name="what is waiting on you" onRetry={() => run(['needs'])} /> : (
        <>
          {needs.error && <StaleBar at={needs.at} error={needs.error} busy={needs.loading} onRetry={() => run(['needs'])} />}
          {/* the reads that failed while the rest loaded: named, never an all-clear */}
          {missOther.length > 0 && (
            <div role="alert" className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              <p className="flex items-start gap-2 font-semibold"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                {missOther.map((x) => x.what).join(', ')} could not load: what {missOther.length === 1 ? 'it' : 'they'} would add is unknown, not an all-clear.</p>
              <p className="mt-0.5 break-words text-xs">{missOther.map((x) => `${x.what}: ${x.error}`).join(' · ')}</p>
              <div className="mt-1.5"><RetryButton busy={needs.loading} onClick={() => run(['needs'])} /></div>
            </div>
          )}
          {nd.items.length === 0 && nd.missing.length === 0 && (
            <p className="flex min-h-[44px] items-center gap-2 text-[14px] text-slate-700"><Check size={16} className="text-emerald-600" aria-hidden /> Nothing is waiting on you</p>
          )}
          <ol>
            {overdueItems.map((it, i) => <NeedRow key={it.key} it={it} n={i + 1} open={!!openRows[it.key]} onToggle={() => toggleRow(it.key)} canOpen={canOpen} />)}
          </ol>
          {shownOther.length > 0 && (
            <ul className={overdueItems.length ? 'mt-1 border-t border-slate-200' : ''}>
              {shownOther.map((it) => <NeedRow key={it.key} it={it} open={!!openRows[it.key]} onToggle={() => toggleRow(it.key)} canOpen={canOpen} />)}
            </ul>
          )}
          {otherItems.length > 4 && (
            <button type="button" onClick={() => setAll((a) => !a)} className="min-h-[44px] text-[13px] font-semibold text-slate-700 hover:underline">
              {all ? 'Show fewer' : `See all ${otherItems.length} not yet overdue`}
            </button>
          )}

          {nd.stuck === null ? (
            /* the requests did not load: what waits on you and what is stuck with others are both unknown */
            <>
              <SubHead>Stuck with others</SubHead>
              <div role="alert" className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[13px] text-rose-700">
                <span><span className="font-semibold">Requests could not load</span>: those waiting on you and stuck with others are unknown. {nd.missing.find((x) => x.what === 'Requests')?.error}</span>
                <RetryButton busy={needs.loading} onClick={() => run(['needs'])} />
              </div>
            </>
          ) : nd.stuck.count > 0 && (
            <>
              <SubHead right={<span className="text-[12px] font-semibold text-slate-600">nudge</span>}>Stuck with others</SubHead>
              <p className="mt-1 text-[14px] leading-5 text-slate-900">
                {plural(nd.stuck.count, 'request')} overdue with {nd.stuck.withWhom}
              </p>
              <ul className="mt-0.5">
                {nd.stuck.rows.map((r) => {
                  const body = (
                    <>
                      <span className="min-w-0 flex-1 text-slate-900">{r.who} <span className="text-slate-600">· {r.what}</span></span>
                      <span className={`text-[13px] font-semibold tabular-nums ${TONE.amber.text}`}>waiting {waitedFor(r.hours)}</span>
                    </>
                  );
                  return (
                    <li key={r.id}>
                      {canOpen('/inbox')
                        ? <Link to={`/inbox?focus=${r.id}`} state={FROM_TODAY} className="-mx-2 flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-[14px] hover:bg-slate-50">{body}</Link>
                        : <div className="flex min-h-[44px] items-center gap-2 text-[14px]">{body}</div>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {visible.includes('watch') && (
        <>
          <SubHead right={<Eye className="h-4 w-4 text-slate-600" aria-hidden />}>Watch</SubHead>
          {!wd ? <div className="mt-2"><SectionState slot={watch} name="the watch list" onRetry={() => run(['watch'])} /></div> : (
            <ul>
              {watch.error && <li className="mt-2"><StaleBar at={watch.at} error={watch.error} busy={watch.loading} onRetry={() => run(['watch'])} /></li>}
              {can('/sales') && (!wd.lost ? (
                <WatchFail what="Lost sales" error={wd.lostError} busy={watch.loading} onRetry={() => run(['watch'])} />
              ) : wd.lost.lostMonth === 0 ? (
                /* An empty month is missing data until shown otherwise, not good news. */
                <WatchLine to="/sales?view=lost&period=30d" tone="amber" sub="Missing, not proof of none"
                  label={wd.lost.lastLost ? `No lost sales logged since ${dayOf(wd.lost.lastLost)}` : 'No lost sales have ever been logged'} />
              ) : (
                <>
                  <WatchLine to="/sales?view=lost&reason=Not%20Available" label="Asked for, not available this month"
                    value={`${wd.lost.notAvailableMonth} of ${wd.lost.lostMonth}`} tone={wd.lost.notAvailableMonth > 0 && wd.lost.notAvailableMonth * 2 >= wd.lost.lostMonth ? 'red' : 'grey'} />
                  <WatchLine to="/sales?view=lost&period=7d" label="Lost sales · last 7 days" value={String(wd.lost.lost7)} tone="grey" />
                </>
              ))}
              {can('/purchase-orders') && (!wd.po ? (
                <WatchFail what="Purchase orders" error={wd.poError} busy={watch.loading} onRetry={() => run(['watch'])} />
              ) : (
                /* "Placed" is Ordered or Partially Received: orders a supplier has.
                   Money's "Open POs" also counts those still waiting for approval. */
                <>
                  {wd.po.latePOs > 0 && (
                    <WatchLine to="/purchase-orders?filter=late" label="Deliveries past their expected date" value={plural(wd.po.latePOs, 'PO')} tone="red" />
                  )}
                  {wd.po.noDatePOs > 0 && (
                    <WatchLine to="/purchase-orders?filter=no-expected-date" tone="amber" sub="Placed with suppliers, so none of them can show as late"
                      label={`${plural(wd.po.noDatePOs, 'placed order')} ${wd.po.noDatePOs === 1 ? 'has' : 'have'} no expected date`} />
                  )}
                  {/* "due this week" means something only for orders that have a date */}
                  {wd.po.latePOs === 0 && wd.po.placedPOs > wd.po.noDatePOs && (
                    <WatchLine to="/purchase-orders?filter=due-this-week" label="Deliveries due this week" value={String(wd.po.duePOs)} tone="grey" />
                  )}
                  {wd.po.placedPOs === 0 && <WatchLine to="/purchase-orders" label="Orders placed with suppliers" value="none" tone="grey" />}
                </>
              ))}
            </ul>
          )}
        </>
      )}
    </TodayCard>
  );

  /* An expired document shows on the person's row in their branch sheet too. */
  const personAlerts: Record<string, PersonAlert> = {};
  for (const it of needs.data?.items ?? []) {
    if (!it.person || personAlerts[it.person.id]) continue;
    personAlerts[it.person.id] = { text: `${it.person.doc} expired ${dayOf(it.person.date)}`, href: can('/hr') ? `/hr?focus=${it.person.id}` : null };
  }
  /* From 1280px a branch sheet docks beside the page, which narrows to make room. */
  const split = wide && !!sheetNav.sheet && !!staff.data?.branches.some((b) => b.key === sheetNav.sheet);

  const staffCard = visible.includes('staff') && (
    <TodayCard id="card-staff" icon={<Users className="h-5 w-5" />} title="Staffing" flash={flash === 'staff'}
      chip={staff.data ? (() => {
        const bad = staff.data.branches.filter((b) => b.tone === 'bad').length;
        const warn = staff.data.branches.filter((b) => b.tone === 'warn').length;
        return bad ? <Chip tone="red">{bad} uncovered</Chip> : warn ? <Chip tone="amber">{warn} to check</Chip> : <Chip tone="green">covered</Chip>;
      })() : undefined}
      meta={staff.data && staff.at ? `Who is in at ${hhmmOf(staff.at)}` : staff.error ? 'Not loaded' : 'Loading clock-ins'}
      link={{ label: 'Attendance', to: '/attendance?day=today' }}>
      {staff.data ? (
        <>
          {staff.error && <StaleBar at={staff.at} error={staff.error} busy={staff.loading} onRetry={refreshStaff} label="Staffing" />}
          <StaffingCard branches={staff.data.branches} workStart={staff.data.workStart} onChanged={refreshStaff} embedded
            at={staff.at ? hhmmOf(staff.at) : null} alerts={personAlerts} />
        </>
      ) : <SectionState slot={staff} name="staffing" onRetry={refreshStaff} />}
    </TodayCard>
  );

  return (
    <div className={`mx-auto max-w-2xl xl:max-w-none ${split ? 'xl:mr-[392px]' : ''}`}>
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">Today</h1>
          {can('/money') && (
            <Link to="/money" className="-mr-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-lg px-2 text-[14px] font-semibold text-slate-700 hover:bg-slate-100">
              Money <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
        {/* one line: the day, and how fresh each set of figures is */}
        <p className="text-[13px] text-slate-600">
          {format(new Date(), 'EEE d MMM')}
          {[salesCtx, staffCtx].filter(Boolean).map((c, i) => (
            <span key={i} className={c!.bad ? 'font-semibold text-rose-700' : ''}> · {c!.text}</span>
          ))}
        </p>
      </div>

      {/* one sentence per card; each one jumps to its card */}
      <section aria-label="Today in three lines" className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm" aria-live="polite">
        <ul className={split ? '' : 'xl:grid xl:grid-cols-3 xl:gap-1'}>
          {heads.map((h) => (
            <li key={h.key}>
              <button type="button" onClick={() => { if (h.branch) sheetNav.open(h.branch); else jump(h.key); }}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                <Dot tone={h.tone} />
                <span className="flex-1 text-[15px] leading-5 text-slate-700">
                  <span className={`font-semibold ${h.tone === 'grey' ? 'text-slate-900' : TONE[h.tone].text}`}>{h.lead}</span>
                  {h.rest ? ` · ${h.rest}` : ''}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {failed.length >= 2 && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[14px] text-rose-700">
          <span>{failed.length} sections did not load. What they would show is unknown, not zero.</span>
          <RetryButton busy={failed.some((k) => slots[k].loading)} onClick={() => run(failed)} label="Retry all" />
        </div>
      )}

      {/* phone: Sales, Needs you, Staffing; wide: the three side by side, or two beside an open branch sheet with Staffing first */}
      <div className={`mt-3 space-y-3 xl:grid xl:items-start xl:gap-4 xl:space-y-0 ${split ? 'xl:grid-cols-2' : 'xl:grid-cols-3'}`}>
        {salesCard}
        {needsCard}
        {staffCard && <div className={split ? 'xl:order-first' : undefined}>{staffCard}</div>}
      </div>

      {can('/sales') && (
        <a href="https://alalramadhan-kuwait.github.io/watch-store-crm/#/reports" target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-[13px] text-slate-600 hover:text-slate-900">
          <ExternalLink size={14} aria-hidden /> Store Daily Report
        </a>
      )}
      {anyRetrying && <span className="sr-only" aria-live="polite">Loading</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

/** One thing that needs you: numbered when overdue, with what to do and how late. */
function NeedRow({ it, n, open, onToggle, canOpen }: { it: Item; n?: number; open: boolean; onToggle: () => void; canOpen: (to: string) => boolean }) {
  const linkable = canOpen(it.link);
  const tone: Tone = it.overdue ? 'red' : 'amber';
  const inner = (
    <>
      {n !== undefined
        ? <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular-nums ${TONE.red.soft} ${TONE.red.text}`} aria-hidden>{n}</span>
        : <span className="mt-1.5"><Dot tone={tone} /></span>}
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[15px] leading-5 text-slate-900">
          <span className={`font-semibold ${TONE[tone].text}`}>{it.kind}</span>{it.what ? ` · ${it.what}` : ''}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className="min-w-0 text-[13px] leading-[18px] tabular-nums text-slate-600">{it.sub}</span>
          {it.chip && <Chip tone={tone}>{it.chip}</Chip>}
        </span>
        <span className="mt-0.5 block text-[13px] font-semibold leading-[18px] text-slate-900">{it.verb}</span>
      </span>
      {it.children
        ? <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        : linkable ? <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden /> : null}
    </>
  );
  const cls = '-mx-2 flex min-h-[52px] w-[calc(100%+16px)] items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-slate-50';
  return (
    <li className="border-t border-slate-100 first:border-0">
      {it.children ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className={cls}>{inner}</button>
      ) : linkable ? (
        <Link to={it.link} state={FROM_TODAY} className={cls}>{inner}</Link>
      ) : (
        <div className={cls.replace(' hover:bg-slate-50', '')}>{inner}</div>
      )}
      {/* The customers behind the count, to read: Follow-ups opens on the
          overdue list, not on one customer, so they are not links each. */}
      {it.children && open && (
        <ul className="mb-2 ml-3 border-l-2 border-slate-200 pl-3">
          {it.children.map((c) => (
            <li key={c.key} className="flex min-h-[44px] items-center gap-2 py-1">
              <span className="min-w-0 flex-1 text-[14px] leading-5 text-slate-900">{c.text}
                <span className="block text-[13px] leading-[18px] text-slate-600">{c.sub}</span>
              </span>
              <span className={`text-[13px] font-semibold tabular-nums ${TONE[tone].text}`}>{c.chip}</span>
            </li>
          ))}
          {linkable && (
            <li>
              <Link to={it.link} state={FROM_TODAY} className="inline-flex min-h-[44px] items-center gap-0.5 text-[14px] font-semibold text-slate-900 hover:underline">
                Open Follow-ups <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function RetryButton({ busy, onClick, label = 'Retry' }: { busy: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60">
      <RotateCw size={14} className={busy ? 'animate-spin' : ''} aria-hidden /> {busy ? 'Retrying…' : label}
    </button>
  );
}

/** A section with nothing to show yet: loading, or failed with nothing to fall back on. */
function SectionState<T>({ slot, name, onRetry }: { slot: Slot<T>; name: string; onRetry: () => void }) {
  if (slot.error) {
    return (
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        <p className="flex items-start gap-2 font-semibold"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          Could not load {name}: unknown, not zero and not an all-clear.</p>
        <p className="mt-0.5 break-words text-xs text-rose-700">{slot.error}</p>
        <div className="mt-2"><RetryButton busy={slot.loading} onClick={onRetry} /></div>
      </div>
    );
  }
  return (
    <div className="space-y-2 py-1" aria-busy="true" aria-label={`Loading ${name}`}>
      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
      <p className="text-xs text-slate-600">Loading {name}…</p>
    </div>
  );
}

/** The last figures that did load, with the time they are from, after a refresh failed. */
function StaleBar({ at, error, busy, onRetry, label, what, syncedAt }: {
  at: number | null; error: string; busy: boolean; onRetry: () => void; label?: string;
  /** What the figures shown cover, e.g. "sales to end of 23 Nov". */
  what?: string;
  syncedAt?: string | null;
}) {
  const cover = what ? `last good figures: ${what}${syncedAt ? `, synced ${format(new Date(syncedAt), 'd MMM HH:mm')} Kuwait` : ''}` : at ? `showing what loaded at ${hhmmOf(at)}` : '';
  return (
    <div role="status" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
      <span>{label ? `${label} could` : 'Could'} not refresh{cover ? `: ${cover}` : ''}. <span className="text-amber-800">{error}</span></span>
      <RetryButton busy={busy} onClick={onRetry} />
    </div>
  );
}

/** One Watch read that failed while the other loaded. */
function WatchFail({ what, error, busy, onRetry }: { what: string; error: string | null; busy: boolean; onRetry: () => void }) {
  return (
    <li role="alert" className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[13px] text-rose-700">
      <span><span className="font-semibold">{what} could not load</span>: unknown, not zero. {error}</span>
      <RetryButton busy={busy} onClick={onRetry} />
    </li>
  );
}

function WatchLine({ to, label, sub, value, tone }: { to: string; label: string; sub?: string; value?: string; tone: Tone }) {
  return (
    <li className="border-t border-slate-100 first:border-0">
      <Link to={to} state={FROM_TODAY} className="-mx-2 flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
        <Dot tone={tone} />
        <span className="min-w-0 flex-1 text-[14px] leading-5 text-slate-900">{label}
          {sub && <span className="block text-[13px] leading-[18px] text-slate-600">{sub}</span>}
        </span>
        {value !== undefined && <span className={`whitespace-nowrap text-[14px] font-semibold tabular-nums ${tone === 'grey' ? 'text-slate-900' : TONE[tone].text}`}>{value}</span>}
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      </Link>
    </li>
  );
}
