/**
 * The manager's dashboard: what needs fixing today.
 *
 * Designed by the review panel on 29 Sep. The old dashboard answered "how is
 * the company doing?" — supplier balance, stock value, ad spend, followers —
 * which is the owner's question, and it lives on at /money. The manager runs the
 * day, so this answers four things in the order a morning goes:
 *
 *   1. Staffing   — who is not here who should be (gaps first; one quiet line
 *                   when everybody is in).
 *   2. Outlet sales — each outlet against its target with a pace mark, so it is
 *                   clear which team needs a word.
 *   3. Waiting on you — one list, overdue first, of everything that needs a
 *                   decision or a phone call.
 *   4. Watch      — lost sales, what customers asked for that we did not have,
 *                   and deliveries that are late.
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
import { ExternalLink, ChevronRight, Check, AlertTriangle, RotateCw } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessPath } from '../components/Layout';
import { useLive } from '../shared/live';
import { outletOf, hasAttendance, outletName } from '../shared/outlets';
import { standing, kuwaitDate } from '../shared/attendanceStatus';
import { shiftTimesOn } from '../shared/punctuality';
import { scheduleFromRow, type Schedule, type ScheduleRow } from '../shared/schedule';
import { StaffingCard, judgeBranch, type StaffPerson, type StaffBranch } from '../components/StaffingCard';
import { loadRequests, waitedFor, stageOf, tabOf, type RequestRow } from '../shared/requests';
import { monthSales, eventDates, type MonthSales, type TillRow } from '../shared/tillSales';

/* ------------------------------------------------------------------ types */

interface Emp { id: string; full_name: string; location: string | null; status: string; user_id: string | null; phone: string | null }
interface Rec { user_id: string | null; employee_name: string; clock_in: string; clock_out: string | null }
interface Leave { employee_id: string; leave_start: string; leave_end: string; leave_type: string | null; notes: string | null }

interface Item {
  key: string;
  text: string;
  sub?: string;
  /** Hours it has been waiting, or late; sorts the list. */
  age: number;
  overdue: boolean;
  link: string;
}

interface StaffData { branches: StaffBranch[]; workStart: string }
interface SalesData { month: MonthSales; syncedAt: string | null }
interface NeedsData {
  items: Item[];
  /** Requests past due that are with somebody else, not with you. */
  stuck: { count: number; hours: number[]; withWhom: string };
}
interface WatchData {
  lost7: number;
  lostMonth: number;
  notAvailableMonth: number;
  /** The most recent lost sale ever logged; null when none ever has been. */
  lastLost: string | null;
  openPOs: number;
  latePOs: number;
  duePOs: number;
  /** Open orders nobody has given an expected date: they can never show as late. */
  noDatePOs: number;
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
const SECTION_NAME: Record<Key, string> = { staff: 'Staffing', sales: 'Outlet sales', needs: 'Waiting on you', watch: 'Watch' };
const TIMEOUT_MS = 10_000;

interface Targets {
  sales_target_month: number | null; sales_target_avenues: number | null; sales_target_timegallery: number | null;
  sales_target_online: number | null; sales_target_whatsapp: number | null; work_start_time: string | null;
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

/** Give up on a section the database does not answer, instead of spinning for ever. */
function within<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`The database did not answer within ${ms / 1000} seconds.`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const readSettings = async (): Promise<Partial<Targets>> => {
  const q = await supabase.from('settings')
    .select('sales_target_month, sales_target_avenues, sales_target_timegallery, sales_target_online, sales_target_whatsapp, work_start_time')
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
  const [empQ, schedQ, recQ, leaveQ, outQ, targets] = await Promise.all([
    supabase.from('employees').select('id, full_name, location, status, user_id, phone').in('status', ['Active', 'On leave']),
    supabase.from('employee_schedules')
      .select('id, employee_id, effective_from, effective_to, working_days, shift_start, shift_end, grace_minutes, note'),
    supabase.from('attendance_records').select('user_id, employee_name, clock_in, clock_out')
      .gte('clock_in', `${today}T00:00:00+03:00`).lte('clock_in', `${today}T23:59:59+03:00`),
    supabase.from('leave_records').select('employee_id, leave_start, leave_end, leave_type, notes')
      .eq('approval_status', 'Approved').lte('leave_start', today).gte('leave_end', today),
    supabase.from('outlets').select('code, opens_at, closes_at, min_staff'),
    settings,
  ]);
  const emps = rowsOf<Emp[]>(empQ, 'Employees');
  const schedRows = rowsOf<ScheduleRow[]>(schedQ, 'Schedules');
  const recs = rowsOf<Rec[]>(recQ, 'Attendance');
  const leaveRows = rowsOf<Leave[]>(leaveQ, 'Leave');
  const outRows = rowsOf<{ code: string; opens_at: string | null; closes_at: string | null; min_staff: number | null }[]>(outQ, 'Outlets');

  const defaultStart = targets.work_start_time ?? '09:00';
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
  const byBranch = new Map<string, StaffPerson[]>();
  const names = new Map<string, string>();
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
    const o = outletOf(e.location);
    const key = o?.code ?? e.location ?? 'other';
    names.set(key, bare(outletName(e.location)).replace(/^Timekeeper /, ''));
    const person: StaffPerson = {
      id: e.id, name: e.full_name, phone: e.phone, user_id: e.user_id, location: e.location, branch: key,
      status: s.status, due, timeUnknown: expected && due === null,
      away: awayLabel(leaves.get(e.id)),
      firstIn, lastOut: lastOutIso ? hhmm(lastOutIso) : null,
      arrivedLateMin: firstIn && dueMin !== null ? Math.max(0, (toMin(firstIn) ?? 0) - dueMin) : null,
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
    return judgeBranch({ key, name: names.get(key) ?? key, shop, opensAt: shop && !open && om !== null && nowMin >= om ? null : opensAt, closesAt, open, minStaff: o?.min_staff ?? null, people });
  }).filter((b) => b.people.some((p) => !['off', 'on_leave'].includes(p.status)) || b.shop)
    .sort((x, y) => rank[x.tone] - rank[y.tone] || x.name.localeCompare(y.name));
  return { branches, workStart: defaultStart };
}

/* ---- sales: what rang through the tills, refreshed each morning */
async function loadSales(settings: Promise<Partial<Targets>>): Promise<SalesData> {
  const month = kuwaitDate().slice(0, 7);
  const [posQ, syncQ, targets] = await Promise.all([
    supabase.from('pos_channel_sales').select('channel_code, outlet, sale_date, revenue, sale_count').gte('sale_date', `${month}-01`),
    supabase.from('lightspeed_sync_log').select('finished_at').eq('status', 'ok').not('finished_at', 'is', null)
      .order('finished_at', { ascending: false }).limit(1),
    settings,
  ]);
  const pos = rowsOf<TillRow[]>(posQ, 'Till sales');
  const sync = rowsOf<{ finished_at: string | null }[]>(syncQ, 'Till sync log');
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    month: monthSales(pos, {
      month,
      monthTarget: num(targets.sales_target_month),
      targets: {
        avenues: num(targets.sales_target_avenues), time_gallery: num(targets.sales_target_timegallery),
        online: num(targets.sales_target_online), whatsapp: num(targets.sales_target_whatsapp),
      },
    }),
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
    supabase.from('cases_visible').select('promised_callback').eq('case_type', 'Follow-up').eq('status', 'Open')
      .eq('deleted', false).lt('promised_callback', today).order('promised_callback'),
    supabase.from('repair_watches').select('status, estimated_completion, updated_at'),
    supabase.from('waiting_list').select('customer_name, status, updated_at').eq('list_type', 'Pre-Order').eq('status', 'Arrived'),
    supabase.from('limited_projects').select('project_name, brand, status, launch_date'),
    supabase.from('assigned_tasks').select('title, due_date').eq('status', 'Open').lt('due_date', today).order('due_date'),
    canHR
      ? supabase.from('employees').select('id, full_name, residency_expiry, work_permit_expiry').in('status', ['Active', 'On leave'])
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (reqs.error) throw new Error(`Requests: ${reqs.error}`);
  const fus = rowsOf<{ promised_callback: string }[]>(fuQ, 'Follow-ups');
  const reps = rowsOf<{ status: string; estimated_completion: string | null; updated_at: string }[]>(repQ, 'Repairs');
  const pre = rowsOf<{ customer_name: string; updated_at: string }[]>(preQ, 'Pre-orders');
  const projs = rowsOf<{ project_name: string | null; brand: string | null; status: string; launch_date: string | null }[]>(projQ, 'Limited projects');
  const tasks = rowsOf<{ title: string | null; due_date: string }[]>(taskQ, 'Tasks');
  const docs = rowsOf<{ id: string; full_name: string; residency_expiry: string | null; work_permit_expiry: string | null }[]>(docQ, 'Staff documents');

  const items: Item[] = [];
  for (const r of reqs.rows as RequestRow[]) {
    if (tabOf(r, mine) !== 'action') continue;
    items.push({
      key: `req:${r.id}`, text: `${r.employee_name ?? 'Someone'} — ${r.kind}${(r.kind === 'Leave' ? r.proposed_from : r.attendance_date) ? ` · ${dayOf(r.kind === 'Leave' ? r.proposed_from : r.attendance_date)}` : ''}`,
      sub: `Waiting ${waitedFor(r.hours_pending)}`, age: r.hours_pending, overdue: r.is_overdue, link: '/inbox',
    });
  }
  /* Requests past due that sit with somebody else. Not yours to decide, but
     yours to chase: they are counted apart from what is waiting on you. */
  const stuckRows = (reqs.rows as RequestRow[]).filter((r) => tabOf(r, mine) === 'waiting' && r.is_overdue)
    .sort((a, b) => a.hours_pending - b.hours_pending);
  const holders = [...new Set(stuckRows.map((r) => r.stage_owner))];
  const stuck = {
    count: stuckRows.length,
    hours: stuckRows.map((r) => r.hours_pending),
    withWhom: holders.length === 1 && holders[0] === 'manager' ? 'the store manager' : holders.length === 1 && holders[0] === 'owner' ? 'the owner' : 'others',
  };

  if (fus.length) {
    const oldest = fus[0].promised_callback;
    const days = Math.max(1, daysSince(today, oldest));
    items.push({ key: 'fu', text: `${plural(fus.length, 'follow-up')} overdue`, sub: `Oldest promised ${dayOf(oldest)} · ${plural(days, 'day')} late`, age: days * 24, overdue: true, link: '/follow-ups' });
  }
  const overdueReps = reps.filter((r) => r.estimated_completion && r.estimated_completion < today && !['Returned to customer', 'Cancelled'].includes(r.status));
  if (overdueReps.length) {
    const oldest = overdueReps.map((r) => r.estimated_completion!).sort()[0];
    const days = daysSince(today, oldest);
    items.push({ key: 'rep-late', text: `${plural(overdueReps.length, 'repair')} past the promised date`, sub: `Oldest promised ${dayOf(oldest)} · ${lateBy(days)}`, age: days * 24, overdue: true, link: '/repairs' });
  }
  const ready = reps.filter((r) => r.status === 'Ready for pickup');
  if (ready.length) {
    const oldest = Math.max(...ready.map((r) => (now.getTime() - Date.parse(r.updated_at)) / 3_600_000));
    items.push({ key: 'rep-ready', text: `${plural(ready.length, 'repair')} ready for pickup`, sub: `Oldest ${waitedFor(oldest)}`, age: oldest, overdue: oldest >= 24 * 7, link: '/repairs' });
  }
  if (pre.length) {
    const oldest = Math.max(...pre.map((p) => (now.getTime() - Date.parse(p.updated_at)) / 3_600_000));
    items.push({ key: 'pre', text: `${plural(pre.length, 'pre-order')} arrived, customer to be told`, sub: `Oldest ${waitedFor(oldest)}`, age: oldest, overdue: oldest >= 48, link: '/waiting-list' });
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
      ? { key: 'proj', text: `Project past launch · ${name || 'unnamed project'}`, sub: `Launch was ${dayOf(first.launch_date)} · ${lateBy(days)} · ${first.status}`, age: days * 24, overdue: true, link: '/limited-projects' }
      : { key: 'proj', text: `${plural(delayed.length, 'project')} past launch date`, sub: `Oldest launch ${dayOf(first.launch_date)} · ${lateBy(days)}`, age: days * 24, overdue: true, link: '/limited-projects' });
  }
  if (tasks.length) {
    const first = tasks[0];
    const days = daysSince(today, first.due_date);
    items.push(tasks.length === 1
      ? { key: 'task', text: `Task overdue · ${first.title?.trim() || 'untitled task'}`, sub: `Due ${dayOf(first.due_date)} · ${lateBy(days)}`, age: days * 24, overdue: true, link: '/tasks' }
      : { key: 'task', text: `${plural(tasks.length, 'assigned task')} overdue`, sub: `Oldest due ${dayOf(first.due_date)} · ${lateBy(days)}`, age: days * 24, overdue: true, link: '/tasks' });
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
          key: `doc:${e.id}:${doc}`, text: `${doc} expired ${dayOf(date)} · ${e.full_name}`,
          sub: days === 1 ? 'Expired yesterday' : `Expired ${plural(days, 'day')} ago`,
          age: days * 24, overdue: true, link: '/hr',
        });
      } else if (date <= in30) expiring.push({ date, name: e.full_name });
    }
  }
  if (expiring.length) {
    const next = expiring.sort((a, b) => a.date.localeCompare(b.date))[0];
    items.push({
      key: 'docs', text: `${plural(expiring.length, 'staff document')} ${expiring.length === 1 ? 'expires' : 'expire'} within 30 days`,
      sub: `Next ${dayOf(next.date)} · ${next.name}`, age: 12, overdue: false, link: '/hr',
    });
  }
  items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.age - a.age);
  return { items, stuck };
}

/* ---- watch */
async function loadWatch(): Promise<WatchData> {
  const now = new Date();
  const today = kuwaitDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const in7 = kuwaitDate(new Date(now.getTime() + 7 * 86_400_000));
  const sevenAgo = kuwaitDate(new Date(now.getTime() - 7 * 86_400_000));
  const [lostQ, poQ] = await Promise.all([
    /* Newest first and not cut off at the month: an empty month has to say when
       a lost sale was last logged, or "none" reads as good news. */
    supabase.from('cases_visible').select('lost_reason, date_logged').eq('case_type', 'Lost Sale')
      .eq('deleted', false).order('date_logged', { ascending: false }).limit(1000),
    supabase.from('purchase_orders').select('po_number, status, expected_arrival')
      .in('status', ['Ordered', 'Partially Received']).is('merged_into', null),
  ]);
  const lost = rowsOf<{ lost_reason: string | null; date_logged: string }[]>(lostQ, 'Lost sales');
  const pos = rowsOf<{ expected_arrival: string | null }[]>(poQ, 'Purchase orders');
  const inMonth = lost.filter((l) => l.date_logged.slice(0, 10) >= monthStart);
  return {
    lost7: lost.filter((l) => l.date_logged.slice(0, 10) >= sevenAgo).length,
    lostMonth: inMonth.length,
    notAvailableMonth: inMonth.filter((l) => (l.lost_reason ?? '').toLowerCase() === 'not available').length,
    lastLost: lost[0]?.date_logged?.slice(0, 10) ?? null,
    openPOs: pos.length,
    latePOs: pos.filter((p) => p.expected_arrival && p.expected_arrival < today).length,
    duePOs: pos.filter((p) => p.expected_arrival && p.expected_arrival >= today && p.expected_arrival <= in7).length,
    noDatePOs: pos.filter((p) => !p.expected_arrival).length,
  };
}

/* ------------------------------------------------------------- the screen */

type Verdict = 'behind' | 'ahead' | 'ok' | 'none';

const empty = <T,>(): Slot<T> => ({ data: null, error: null, loading: true, at: null });

export default function ManagerDashboard() {
  const { role, profile, pageAccess } = useAuth();
  const canHR = ['admin', 'manager', 'hr'].includes(role ?? '');
  const [slots, setSlots] = useState<Slots>({ staff: empty(), sales: empty(), needs: empty(), watch: empty() });
  const [all, setAll] = useState(false);
  /* Each section's latest load; an older answer arriving late is dropped. */
  const gen = useRef<Record<Key, number>>({ staff: 0, sales: 0, needs: 0, watch: 0 });

  const run = useCallback((keys: Key[]) => {
    /* Settings feed staffing (the default start) and sales (the targets): read
       once for both, and marked handled so a failure is reported by the
       sections, not as an unhandled rejection. */
    const settings = keys.includes('staff') || keys.includes('sales') ? readSettings() : Promise.resolve({});
    settings.catch(() => undefined);
    const loaders: Record<Key, () => Promise<unknown>> = {
      staff: () => loadStaff(settings),
      sales: () => loadSales(settings),
      needs: () => loadNeeds(role, canHR),
      watch: () => loadWatch(),
    };
    for (const k of keys) {
      const g = ++gen.current[k];
      setSlots((s) => ({ ...s, [k]: { ...s[k], loading: true } }));
      within(loaders[k]()).then(
        (data) => { if (g === gen.current[k]) setSlots((s) => ({ ...s, [k]: { data, error: null, loading: false, at: Date.now() } })); },
        (e: unknown) => {
          if (g !== gen.current[k]) return;
          const msg = e instanceof Error ? e.message : String(e);
          setSlots((s) => ({ ...s, [k]: { ...s[k], error: msg || 'Unknown error', loading: false } }));
        },
      );
    }
  }, [role, canHR]);

  useEffect(() => { run(KEYS); }, [run]);
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
  const staleNote = (k: Key) => (slots[k].error && slots[k].data && slots[k].at ? ` (as of ${hhmmOf(slots[k].at!)}, could not refresh)` : '');

  const round = (p: number | null) => (p === null ? null : Math.round(p));
  const goneTxt = pace ? `${Math.round(pace.frac * 100)}% of the month gone` : '';

  /* the headline: one sentence per thing worth saying, and an all-clear only
     from a section that actually loaded */
  const bits: { text: string; bad: boolean; muted?: boolean }[] = [];
  if (staff.data) {
    const nobodyIn = staff.data.branches.filter((b) => b.tone === 'bad');
    const shortB = staff.data.branches.filter((b) => b.shop && b.tone === 'warn');
    const gapCount = staff.data.branches.reduce((n, b) => n + b.people.filter((p) => p.status === 'late' || p.status === 'missing').length, 0);
    const sn = staleNote('staff');
    if (nobodyIn.length) bits.push({ text: `${nobodyIn.map((s) => s.name).join(' and ')} ${nobodyIn.length === 1 ? 'has' : 'have'} nobody on the floor${sn}.`, bad: true });
    else if (shortB.length) bits.push({ text: `${shortB.map((s) => s.name).join(' and ')} ${shortB.length === 1 ? 'is' : 'are'} short-staffed${sn}.`, bad: true });
    else if (gapCount) bits.push({ text: `${plural(gapCount, 'person is', 'people are')} not in yet${sn}.`.replace('1 person is', 'One person is'), bad: true });
    else bits.push({ text: `Everyone due is in${sn}.`, bad: false });
  } else if (staff.error && visible.includes('staff')) bits.push({ text: 'Staffing did not load: unknown, not an all-clear.', bad: true });
  else if (visible.includes('staff')) bits.push({ text: 'Checking staffing…', bad: false, muted: true });

  if (m) {
    const behind = m.channels.filter((c) => verdictOf(round(c.pct)) === 'behind');
    const sn = staleNote('sales');
    if (behind.length === 1) {
      const b = behind[0];
      bits.push({ text: `${bare(outletName(b.code))} is at ${round(b.pct)}% of its target with ${goneTxt}${sn}.`, bad: true });
    } else if (behind.length > 1) bits.push({ text: `${behind.length} outlets are behind pace${sn}.`, bad: true });
    else if (pace && m.channels.some((c) => c.target)) bits.push({ text: `All outlets are on or ahead of pace${sn}.`, bad: false });
  } else if (sales.error && visible.includes('sales')) bits.push({ text: 'Sales did not load.', bad: true });

  if (needs.data) {
    const n = needs.data.items.length;
    const overdue = needs.data.items.filter((i) => i.overdue).length;
    const sn = staleNote('needs');
    bits.push(n
      ? { text: `${plural(n, 'thing')} waiting on you${overdue ? `, ${overdue} overdue` : ''}${sn}.`, bad: overdue > 0 }
      : { text: `Nothing is waiting on you${sn}.`, bad: false });
  } else if (needs.error) bits.push({ text: 'What is waiting on you did not load: unknown, not an all-clear.', bad: true });
  else bits.push({ text: 'Checking what is waiting on you…', bad: false, muted: true });

  /* The figures run to the last day the tills synced, not to now. */
  const asOf = !can('/sales') ? '' : m?.lastSaleDay ? `sales to end of ${dayOf(m.lastSaleDay)}`
    : sales.data ? 'no till sales yet this month' : sales.error ? 'sales not loaded' : '';
  /* The tills sync once a morning; figures that stop before yesterday did not refresh. */
  const yesterday = kuwaitDate(new Date(Date.now() - 86_400_000));
  const tillsBehind = !!m?.lastSaleDay && m.lastSaleDay < yesterday;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Today</h1>
          <p className="text-sm text-slate-500">{format(new Date(), 'EEEE d MMMM')}{profile ? ` · ${profile.full_name}` : ''}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {asOf && <span className={sales.error && !sales.data ? 'text-rose-600' : ''}>{asOf}</span>}
          {role === 'admin' && <Link to="/money" className="text-blue-600 hover:underline">Money →</Link>}
        </div>
      </div>

      {/* headline */}
      <div className="rounded-xl bg-slate-900 px-4 py-3 text-[15px] leading-snug text-white" aria-live="polite">
        {bits.map((b, i) => <span key={i} className={b.bad ? 'text-amber-300' : b.muted ? 'text-white/70' : ''}>{b.text} </span>)}
      </div>

      {failed.length >= 2 && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <span>{failed.length} sections did not load. What they would show is unknown, not zero.</span>
          <RetryButton busy={failed.some((k) => slots[k].loading)} onClick={() => run(failed)} label="Retry all" />
        </div>
      )}

      {/* 1 — staffing: is each branch covered, and what to do about it */}
      {can('/attendance') && (staff.data ? (
        <>
          {staff.error && <div className="mt-3 -mb-1"><StaleBar at={staff.at} error={staff.error} busy={staff.loading} onRetry={refreshStaff} label="Staffing" /></div>}
          <StaffingCard branches={staff.data.branches} workStart={staff.data.workStart} onChanged={refreshStaff} />
        </>
      ) : (
        <Group title="Staffing">
          <SectionState slot={staff} name="staffing" onRetry={refreshStaff} />
        </Group>
      ))}

      {/* 2 — outlet sales */}
      {can('/sales') && (
        <Group title="Outlet sales" right={pace ? `${format(new Date(), 'MMM')} · ${goneTxt}` : undefined} link="/sales">
          {!m ? <SectionState slot={sales} name="sales" onRetry={() => run(['sales'])} /> : (
            <>
              {sales.error && <StaleBar at={sales.at} error={sales.error} busy={sales.loading} onRetry={() => run(['sales'])} />}
              {tillsBehind && (
                <p className="mb-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                  Till figures stop at {dayOf(m.lastSaleDay)}: the morning sync may not have run{sales.data?.syncedAt ? ` (last good sync ${format(new Date(sales.data.syncedAt), 'd MMM HH:mm')})` : ''}.
                </p>
              )}
              {(() => {
                const r = m.regular;
                const p = round(r.pct);
                const v = verdictOf(p);
                const shortBy = r.projectedShort !== null && r.projectedShort > 0 ? ` · ~${short(r.projectedShort)} short` : '';
                const note = r.projected !== null ? `on pace for ~${short(r.projected)}${r.target ? shortBy : ''}` : '';
                return <SalesLine name="Regular outlets" sales={r.sales} target={r.target} pct={p}
                  frac={pace?.frac ?? null} verdict={v} note={note} total />;
              })()}
              {m.channels.map((c) => {
                const p = round(c.pct);
                const v = verdictOf(p);
                const note = v === 'behind' && pace ? `behind by ${Math.round(pace.frac * 100 - (p ?? 0))} pts`
                  : v === 'ahead' ? 'ahead' : v === 'ok' ? 'on pace' : c.target ? '' : 'no target set';
                return <SalesLine key={c.code} name={bare(outletName(c.code))} sales={c.sales} target={c.target} pct={p}
                  frac={pace?.frac ?? null} verdict={v} note={note} />;
              })}
              {/* Event sales stand apart: whether they count toward the target is the owner's call. */}
              {m.events.map((e) => (
                <div key={e.name} className="border-t border-slate-100 py-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-slate-700">{e.name} <span className="text-slate-500">(event · {eventDates(e.from, e.to)})</span></span>
                    <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-700">{kd(e.sales)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {plural(e.count, 'sale')} · no target · {m.regular.target ? `not in the ${round(m.regular.pct)}%` : 'not in the regular total'}
                  </p>
                </div>
              ))}
              {pace && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><span className="inline-block h-3 w-0.5 bg-slate-800" /> where each outlet should be after {plural(pace.day, 'till day')} of {m.daysInMonth}</p>}
            </>
          )}
        </Group>
      )}

      {/* 3 — waiting on you */}
      <Group title="Waiting on you" right={needs.data?.items.length ? `${needs.data.items.length}` : undefined} link="/inbox">
        {!needs.data ? <SectionState slot={needs} name="what is waiting on you" onRetry={() => run(['needs'])} /> : (
          <>
            {needs.error && <StaleBar at={needs.at} error={needs.error} busy={needs.loading} onRetry={() => run(['needs'])} />}
            {needs.data.items.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-slate-500"><Check size={14} className="text-emerald-600" /> Nothing is waiting on you</p>
            ) : (all ? needs.data.items : needs.data.items.slice(0, 5)).map((i) => (
              <Link key={i.key} to={i.link} className="flex items-center gap-2 border-t border-slate-100 py-2 first:border-t-0">
                <Dot bad={i.overdue} />
                <span className="min-w-0 flex-1">
                  <span className={`block break-words text-sm ${i.overdue ? 'text-rose-700' : 'text-slate-800'}`}>{i.text}</span>
                  {i.sub && <span className="block text-xs text-slate-500">{i.sub}</span>}
                </span>
                <ChevronRight size={14} className="shrink-0 text-slate-400" />
              </Link>
            ))}
            {needs.data.items.length > 5 && (
              <button onClick={() => setAll((a) => !a)} className="mt-1 text-xs text-blue-600 hover:underline">
                {all ? 'Show fewer' : `See all ${needs.data.items.length}`}
              </button>
            )}
            {needs.data.stuck.count > 0 && (
              <Link to="/inbox?tab=waiting" className="mt-1 flex items-center gap-2 border-t border-slate-100 pt-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-800">Stuck with others · {plural(needs.data.stuck.count, 'request')} overdue with {needs.data.stuck.withWhom}</span>
                  <span className="block text-xs text-slate-500">Waiting {needs.data.stuck.hours.map((h) => waitedFor(h)).join(' and ')}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-slate-400" />
              </Link>
            )}
          </>
        )}
      </Group>

      {/* 4 — watch */}
      {visible.includes('watch') && (
        <Group title="Watch">
          {!watch.data ? <SectionState slot={watch} name="the watch list" onRetry={() => run(['watch'])} /> : (
            <>
              {watch.error && <StaleBar at={watch.at} error={watch.error} busy={watch.loading} onRetry={() => run(['watch'])} />}
              {can('/sales') && (watch.data.lostMonth === 0 ? (
                /* An empty month is missing data until shown otherwise, not good news. */
                <WatchLine to="/sales" tone="warn"
                  label={watch.data.lastLost ? `No lost sales logged since ${dayOf(watch.data.lastLost)}` : 'No lost sales have ever been logged'} />
              ) : (
                <>
                  <WatchLine to="/sales" label="Asked for, not available (month)"
                    value={`${watch.data.notAvailableMonth} of ${watch.data.lostMonth}`} tone={watch.data.notAvailableMonth > 0 && watch.data.notAvailableMonth * 2 >= watch.data.lostMonth ? 'bad' : undefined} />
                  <WatchLine to="/sales" label="Lost sales · last 7 days" value={String(watch.data.lost7)} />
                </>
              ))}
              {can('/purchase-orders') && (
                <>
                  {watch.data.latePOs > 0 && (
                    <WatchLine to="/purchase-orders" label="Deliveries · past expected date" value={plural(watch.data.latePOs, 'PO')} tone="bad" />
                  )}
                  {watch.data.noDatePOs > 0 && (
                    <WatchLine to="/purchase-orders" tone="warn"
                      label={`${plural(watch.data.noDatePOs, 'open order')} ${watch.data.noDatePOs === 1 ? 'has' : 'have'} no expected date`} />
                  )}
                  {/* "due this week" means something only for orders that have a date */}
                  {watch.data.latePOs === 0 && watch.data.openPOs > watch.data.noDatePOs && (
                    <WatchLine to="/purchase-orders" label="Deliveries · due this week" value={String(watch.data.duePOs)} />
                  )}
                  {watch.data.openPOs === 0 && <WatchLine to="/purchase-orders" label="Open purchase orders" value="none" />}
                </>
              )}
            </>
          )}
        </Group>
      )}

      {can('/sales') && (
        <a href="https://alalramadhan-kuwait.github.io/watch-store-crm/#/reports" target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800">
          <ExternalLink size={13} /> Store Daily Report
        </a>
      )}
      {anyRetrying && <span className="sr-only" aria-live="polite">Loading</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

function Group({ title, right, link, children }: { title: string; right?: string; link?: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
        <span className="flex items-center gap-2 text-[11px] text-slate-500">
          {right}
          {link && <Link to={link} className="text-blue-600 hover:underline">Open →</Link>}
        </span>
      </div>
      {children}
    </section>
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
        <p className="mt-0.5 break-words text-xs text-rose-700/90">{slot.error}</p>
        <div className="mt-2"><RetryButton busy={slot.loading} onClick={onRetry} /></div>
      </div>
    );
  }
  return (
    <div className="space-y-2 py-1" aria-busy="true" aria-label={`Loading ${name}`}>
      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
      <p className="text-xs text-slate-500">Loading {name}…</p>
    </div>
  );
}

/** The last figures that did load, with the time they are from, after a refresh failed. */
function StaleBar({ at, error, busy, onRetry, label }: { at: number | null; error: string; busy: boolean; onRetry: () => void; label?: string }) {
  return (
    <div role="status" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
      <span>{label ? `${label} could` : 'Could'} not refresh{at ? `: showing what loaded at ${hhmmOf(at)}` : ''}. <span className="text-amber-700/90">{error}</span></span>
      <RetryButton busy={busy} onClick={onRetry} />
    </div>
  );
}

function Dot({ bad }: { bad: boolean }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${bad ? 'bg-rose-600' : 'bg-amber-500'}`} aria-hidden />;
}

function SalesLine({ name, sales, target, pct, frac, verdict, note, total }: {
  name: string; sales: number; target: number | null; pct: number | null; frac: number | null;
  verdict: Verdict; note: string; total?: boolean;
}) {
  const fill = Math.min(100, pct ?? 0);
  const bar = verdict === 'behind' ? 'bg-rose-600' : total ? 'bg-slate-800' : 'bg-slate-400';
  const pctCls = verdict === 'behind' ? 'text-rose-600' : verdict === 'ahead' ? 'text-emerald-600' : 'text-slate-800';
  return (
    <div className={`py-2 ${verdict === 'behind' ? '-mx-2 rounded-lg bg-rose-50 px-2' : 'border-t border-slate-100 first:border-t-0'}`}>
      <div className="flex items-baseline justify-between text-sm">
        <span className={total ? 'font-semibold text-slate-900' : 'text-slate-700'}>{name}</span>
        {/* without a target there is no percentage; the line below already says "no target set" */}
        {target ? <span className={`font-mono text-sm font-semibold ${pctCls}`}>{pct}%</span> : null}
      </div>
      <div className="relative mt-1.5 h-2 rounded bg-slate-200">
        <div className={`absolute inset-y-0 left-0 rounded ${target ? bar : ''}`} style={{ width: `${target ? fill : 0}%` }} />
        {frac !== null && target && <div className="absolute -inset-y-[3px] w-0.5 rounded bg-slate-800" style={{ left: `${frac * 100}%` }} />}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[11px] text-slate-500">
        <span className="tabular-nums">{target ? `${short(sales)} of ${kd(target)}` : kd(sales)}</span>
        <span className={`text-right ${verdict === 'behind' ? 'text-rose-700' : ''}`}>{note}</span>
      </div>
    </div>
  );
}

function WatchLine({ to, label, value, tone }: { to: string; label: string; value?: string; tone?: 'bad' | 'warn' }) {
  const cls = tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-700' : 'text-slate-800';
  return (
    <Link to={to} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2 text-sm first:border-t-0">
      <span className={tone === 'warn' ? 'font-medium text-amber-800' : 'text-slate-600'}>
        {tone === 'warn' && <AlertTriangle size={13} className="mr-1.5 inline -translate-y-px text-amber-600" aria-hidden />}{label}
      </span>
      {value !== undefined && <span className={`whitespace-nowrap font-mono font-semibold ${cls}`}>{value}</span>}
      {value === undefined && <ChevronRight size={14} className="shrink-0 text-slate-400" aria-hidden />}
    </Link>
  );
}

