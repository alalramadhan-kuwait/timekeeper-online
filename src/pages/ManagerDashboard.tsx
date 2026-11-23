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
 *   3. Waiting on you — one list, oldest first, of everything that needs a
 *                   decision or a phone call.
 *   4. Watch      — lost sales, what customers asked for that we did not have,
 *                   and deliveries that are late.
 *
 * Nothing here is a count with no action behind it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ChevronRight, Check } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui';
import { canAccessPath } from '../components/Layout';
import { useLive } from '../shared/live';
import { outletOf, hasAttendance, outletName, type OutletCode } from '../shared/outlets';
import { standing, kuwaitDate, type AttendanceStatus } from '../shared/attendanceStatus';
import { shiftTimesOn } from '../shared/punctuality';
import { scheduleFromRow, type Schedule, type ScheduleRow } from '../shared/schedule';
import { StaffingCard, judgeBranch, type StaffPerson, type StaffBranch } from '../components/StaffingCard';
import { loadRequests, waitedFor, stageOf, tabOf, type RequestRow } from '../shared/requests';

/* ------------------------------------------------------------------ types */

interface Emp { id: string; full_name: string; location: string | null; status: string; user_id: string | null; phone: string | null }
interface Rec { user_id: string | null; employee_name: string; clock_in: string; clock_out: string | null }
interface Leave { employee_id: string; leave_start: string; leave_end: string }


interface SalesRow { code: OutletCode; name: string; sales: number; target: number | null }

interface Item {
  key: string;
  text: string;
  sub?: string;
  /** Hours it has been waiting; sorts the list. */
  age: number;
  overdue: boolean;
  link: string;
}

interface Data {
  branches: StaffBranch[];
  workStart: string;
  sales: SalesRow[];
  companySales: number;
  companyTarget: number | null;
  lastSaleDay: string | null;
  daysInMonth: number;
  syncedAt: string | null;
  items: Item[];
  lost7: number;
  lostMonth: number;
  notAvailableMonth: number;
  latePOs: number;
  duePOs: number;
}

const SELLING: { code: OutletCode; target: keyof Targets }[] = [
  { code: 'avenues', target: 'sales_target_avenues' },
  { code: 'time_gallery', target: 'sales_target_timegallery' },
  { code: 'online', target: 'sales_target_online' },
  { code: 'whatsapp', target: 'sales_target_whatsapp' },
];
interface Targets {
  sales_target_month: number | null; sales_target_avenues: number | null; sales_target_timegallery: number | null;
  sales_target_online: number | null; sales_target_whatsapp: number | null; work_start_time: string | null;
}

/** “Time Keeper - Avenues” → “Avenues”: the brand is on every line and adds nothing here. */
const bare = (name: string) => name.replace(/^time ?keeper\s*-?\s*/i, '') || name;

const dayOf = (d: string | null) => (!d ? '' : new Date(`${d}T12:00:00+03:00`)
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuwait' }));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** 53879 → 53.9k, 3399 → 3.4k, 800 → 800. */
const short = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
const kd = (n: number) => `${short(n)} KD`;

/* ------------------------------------------------------------------- data */

async function load(role: string | null, canHR: boolean): Promise<Data> {
  const now = new Date();
  const today = kuwaitDate(now);
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const since = format(new Date(now.getTime() - 30 * 86_400_000), 'yyyy-MM-dd');
  const lostFrom = since < monthStart ? since : monthStart;
  const in7 = kuwaitDate(new Date(now.getTime() + 7 * 86_400_000));
  const in30 = kuwaitDate(new Date(now.getTime() + 30 * 86_400_000));
  const mine = stageOf(role);

  const [
    empQ, schedQ, recQ, leaveQ, outQ, posQ, setQ, syncQ, reqs, fuQ, repQ, preQ, projQ, taskQ, poQ, lostQ, docQ,
  ] = await Promise.all([
    supabase.from('employees').select('id, full_name, location, status, user_id, phone').in('status', ['Active', 'On leave']),
    supabase.from('employee_schedules')
      .select('id, employee_id, effective_from, effective_to, working_days, shift_start, shift_end, grace_minutes, note'),
    supabase.from('attendance_records').select('user_id, employee_name, clock_in, clock_out')
      .gte('clock_in', `${today}T00:00:00+03:00`).lte('clock_in', `${today}T23:59:59+03:00`),
    supabase.from('leave_records').select('employee_id, leave_start, leave_end')
      .eq('approval_status', 'Approved').lte('leave_start', today).gte('leave_end', today),
    supabase.from('outlets').select('code, opens_at, closes_at, min_staff'),
    supabase.from('pos_channel_sales').select('channel_code, sale_date, revenue').gte('sale_date', monthStart),
    supabase.from('settings')
      .select('sales_target_month, sales_target_avenues, sales_target_timegallery, sales_target_online, sales_target_whatsapp, work_start_time').single(),
    supabase.from('lightspeed_sync_log').select('finished_at').eq('status', 'ok').not('finished_at', 'is', null)
      .order('finished_at', { ascending: false }).limit(1),
    loadRequests({ openOnly: true }),
    supabase.from('cases_visible').select('promised_callback').eq('case_type', 'Follow-up').eq('status', 'Open')
      .eq('deleted', false).lt('promised_callback', today).order('promised_callback'),
    supabase.from('repair_watches').select('status, estimated_completion, updated_at'),
    supabase.from('waiting_list').select('customer_name, status, updated_at').eq('list_type', 'Pre-Order').eq('status', 'Arrived'),
    supabase.from('limited_projects').select('status, launch_date'),
    supabase.from('assigned_tasks').select('due_date').eq('status', 'Open').lt('due_date', today),
    supabase.from('purchase_orders').select('po_number, status, expected_arrival')
      .in('status', ['Ordered', 'Partially Received']).is('merged_into', null),
    supabase.from('cases_visible').select('lost_reason, date_logged').eq('case_type', 'Lost Sale')
      .eq('deleted', false).gte('date_logged', lostFrom),
    canHR
      ? supabase.from('employees').select('residency_expiry, work_permit_expiry').in('status', ['Active', 'On leave'])
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  /* ---- staffing: judged by the shared engine, against each person's own shift */
  const targets = (setQ.data ?? {}) as Partial<Targets>;
  const defaultStart = targets.work_start_time ?? '09:00';
  const scheds = new Map<string, Schedule[]>();
  for (const row of ((schedQ.data ?? []) as ScheduleRow[])) {
    const list = scheds.get(row.employee_id) ?? [];
    list.push(scheduleFromRow(row));
    scheds.set(row.employee_id, list);
  }
  const recs = (recQ.data ?? []) as Rec[];
  const leaveIds = new Set(((leaveQ.data ?? []) as Leave[]).map((l) => l.employee_id));
  const outletRows = new Map(((outQ.data ?? []) as { code: string; opens_at: string | null; closes_at: string | null; min_staff: number | null }[])
    .map((o) => [o.code, o]));
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kuwait' });
  const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const nowMin = toMin(hhmm(now.toISOString())) ?? 0;
  const byBranch = new Map<string, StaffPerson[]>();
  const names = new Map<string, string>();
  for (const e of (empQ.data ?? []) as Emp[]) {
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

  /* ---- sales: what rang through the tills, refreshed each morning */
  const pos = (posQ.data ?? []) as { channel_code: string | null; sale_date: string; revenue: unknown }[];
  const sum = (code?: string) => pos.filter((r) => !code || r.channel_code === code)
    .reduce((t, r) => t + Number(r.revenue ?? 0), 0);
  const lastSaleDay = pos.reduce<string | null>((m, r) => (m === null || r.sale_date > m ? r.sale_date : m), null);
  const num = (v: unknown) => (v == null ? null : Number(v));
  const sales: SalesRow[] = SELLING.map((s) => ({
    code: s.code, name: bare(outletName(s.code)), sales: sum(s.code), target: num(targets[s.target]),
  }));
  const y = now.getFullYear(), mo = now.getMonth();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();

  /* ---- waiting on you */
  const items: Item[] = [];
  for (const r of reqs as RequestRow[]) {
    if (tabOf(r, mine) !== 'action') continue;
    items.push({
      key: `req:${r.id}`, text: `${r.employee_name ?? 'Someone'} — ${r.kind}${(r.kind === 'Leave' ? r.proposed_from : r.attendance_date) ? ` · ${dayOf(r.kind === 'Leave' ? r.proposed_from : r.attendance_date)}` : ''}`,
      sub: `Waiting ${waitedFor(r.hours_pending)}`, age: r.hours_pending, overdue: r.is_overdue, link: '/inbox',
    });
  }
  const fus = (fuQ.data ?? []) as { promised_callback: string }[];
  if (fus.length) {
    const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(fus[0].promised_callback)) / 86_400_000));
    items.push({ key: 'fu', text: `${plural(fus.length, 'follow-up')} overdue`, sub: `Oldest ${days} day${days === 1 ? '' : 's'}`, age: days * 24, overdue: true, link: '/follow-ups' });
  }
  const reps = (repQ.data ?? []) as { status: string; estimated_completion: string | null; updated_at: string }[];
  const overdueReps = reps.filter((r) => r.estimated_completion && r.estimated_completion < today && !['Returned to customer', 'Cancelled'].includes(r.status));
  if (overdueReps.length) items.push({ key: 'rep-late', text: `${plural(overdueReps.length, 'repair')} past the promised date`, age: 24 * 3, overdue: true, link: '/repairs' });
  const ready = reps.filter((r) => r.status === 'Ready for pickup');
  if (ready.length) {
    const oldest = Math.max(...ready.map((r) => (now.getTime() - Date.parse(r.updated_at)) / 3_600_000));
    items.push({ key: 'rep-ready', text: `${plural(ready.length, 'repair')} ready for pickup`, sub: `Oldest ${waitedFor(oldest)}`, age: oldest, overdue: oldest >= 24 * 7, link: '/repairs' });
  }
  const pre = (preQ.data ?? []) as { customer_name: string; updated_at: string }[];
  if (pre.length) {
    const oldest = Math.max(...pre.map((p) => (now.getTime() - Date.parse(p.updated_at)) / 3_600_000));
    items.push({ key: 'pre', text: `${plural(pre.length, 'pre-order')} arrived, customer to be told`, sub: `Oldest ${waitedFor(oldest)}`, age: oldest, overdue: oldest >= 48, link: '/waiting-list' });
  }
  const delayed = ((projQ.data ?? []) as { status: string; launch_date: string | null }[])
    .filter((p) => ['Upcoming', 'Confirmed'].includes(p.status) && p.launch_date && p.launch_date < today).length;
  if (delayed) items.push({ key: 'proj', text: `${plural(delayed, 'project')} past launch date`, age: 24, overdue: false, link: '/limited-projects' });
  const tasks = (taskQ.data ?? []).length;
  if (tasks) items.push({ key: 'task', text: `${plural(tasks, 'assigned task')} overdue`, age: 24, overdue: false, link: '/tasks' });
  const docs = ((docQ as { data: unknown[] | null }).data ?? []) as { residency_expiry: string | null; work_permit_expiry: string | null }[];
  const expiring = docs.filter((e) => (e.residency_expiry && e.residency_expiry <= in30) || (e.work_permit_expiry && e.work_permit_expiry <= in30)).length;
  if (expiring) items.push({ key: 'docs', text: `${plural(expiring, 'staff document')} expire within 30 days`, age: 12, overdue: false, link: '/hr' });
  items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.age - a.age);

  /* ---- watch */
  const lost = (lostQ.data ?? []) as { lost_reason: string | null; date_logged: string }[];
  const sevenAgo = format(new Date(now.getTime() - 7 * 86_400_000), 'yyyy-MM-dd');
  const inMonth = lost.filter((l) => l.date_logged >= monthStart);
  const pos2 = (poQ.data ?? []) as { expected_arrival: string | null }[];

  return {
    branches, workStart: defaultStart, sales,
    companySales: sum(), companyTarget: num(targets.sales_target_month),
    lastSaleDay, daysInMonth,
    syncedAt: ((syncQ.data?.[0] as { finished_at?: string } | undefined)?.finished_at) ?? null,
    items,
    lost7: lost.filter((l) => l.date_logged >= sevenAgo).length,
    lostMonth: inMonth.length,
    notAvailableMonth: inMonth.filter((l) => (l.lost_reason ?? '').toLowerCase() === 'not available').length,
    latePOs: pos2.filter((p) => p.expected_arrival && p.expected_arrival < today).length,
    duePOs: pos2.filter((p) => p.expected_arrival && p.expected_arrival >= today && p.expected_arrival <= in7).length,
  };
}

/* ------------------------------------------------------------- the screen */

type Verdict = 'behind' | 'ahead' | 'ok' | 'none';

export default function ManagerDashboard() {
  const { role, profile, pageAccess } = useAuth();
  const canHR = ['admin', 'manager', 'hr'].includes(role ?? '');
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    load(role, canHR).then(setD).catch((e) => setErr(String(e?.message ?? e)));
  }, [role, canHR, reload]);
  const refresh = useCallback(() => setReload((n) => n + 1), []);
  useLive('mgr-dash', [{ table: 'attendance_records' }, { table: 'leave_records' }], refresh);

  const can = (p: string) => canAccessPath(p, role, pageAccess);

  /* how far through the month the tills have counted */
  const pace = useMemo(() => {
    if (!d?.lastSaleDay) return null;
    const day = Number(d.lastSaleDay.slice(8, 10));
    return { day, frac: day / d.daysInMonth };
  }, [d]);

  const verdictOf = (pct: number | null): Verdict => {
    if (pct === null || !pace) return 'none';
    if (pace.day >= 7 && pct < pace.frac * 100 - 15) return 'behind';
    if (pct >= pace.frac * 100 + 10) return 'ahead';
    return 'ok';
  };

  if (err) return <p className="text-sm text-rose-600">Could not load the dashboard: {err}</p>;
  if (!d) return <Spinner />;

  const pctOf = (v: number, t: number | null) => (t ? Math.round((v / t) * 100) : null);
  const behind = d.sales.filter((s) => verdictOf(pctOf(s.sales, s.target)) === 'behind');
  const nobodyIn = d.branches.filter((b) => b.tone === 'bad');
  const shortB = d.branches.filter((b) => b.shop && b.tone === 'warn');
  const gapCount = d.branches.reduce((n, b) => n + b.people.filter((p) => p.status === 'late' || p.status === 'missing').length, 0);
  const goneTxt = pace ? `${Math.round(pace.frac * 100)}% of the month gone` : '';
  const shown = all ? d.items : d.items.slice(0, 5);

  /* the headline: one sentence per thing worth saying, and nothing when all is well */
  const bits: { text: string; bad: boolean }[] = [];
  if (nobodyIn.length) bits.push({ text: `${nobodyIn.map((s) => s.name).join(' and ')} ${nobodyIn.length === 1 ? 'has' : 'have'} nobody on the floor.`, bad: true });
  else if (shortB.length) bits.push({ text: `${shortB.map((s) => s.name).join(' and ')} ${shortB.length === 1 ? 'is' : 'are'} short-staffed.`, bad: true });
  else if (gapCount) bits.push({ text: `${plural(gapCount, 'person is', 'people are')} not in yet.`.replace('1 person is', 'One person is'), bad: true });
  else bits.push({ text: 'Everyone due is in.', bad: false });
  if (behind.length === 1) {
    const b = behind[0]; const p = pctOf(b.sales, b.target);
    const same = nobodyIn.length === 1 && nobodyIn[0].name === b.name;
    bits.push({ text: `${same ? 'It is' : `${b.name} is`} at ${p}% of its target with ${goneTxt}.`, bad: true });
  } else if (behind.length > 1) bits.push({ text: `${behind.length} outlets are behind pace.`, bad: true });
  else if (d.sales.some((s) => s.target)) bits.push({ text: 'All outlets are on or ahead of pace.', bad: false });
  const overdue = d.items.filter((i) => i.overdue).length;
  bits.push(d.items.length
    ? { text: `${plural(d.items.length, 'thing')} waiting on you${overdue ? `, ${overdue} overdue` : ''}.`, bad: overdue > 0 }
    : { text: 'Nothing is waiting on you.', bad: false });

  const asOf = d.syncedAt ? `sales as of ${format(new Date(d.syncedAt), 'HH:mm')}` : 'waiting for the first till sync';
  const companyPct = pctOf(d.companySales, d.companyTarget);
  const projected = pace ? Math.round((d.companySales / pace.day) * d.daysInMonth) : null;

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Today</h1>
          <p className="text-sm text-slate-500">{format(new Date(), 'EEEE d MMMM')}{profile ? ` · ${profile.full_name}` : ''}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{asOf}</span>
          {role === 'admin' && <Link to="/money" className="text-blue-600 hover:underline">Money →</Link>}
        </div>
      </div>

      {/* headline */}
      <div className="rounded-xl bg-slate-900 px-4 py-3 text-[15px] leading-snug text-white">
        {bits.map((b, i) => <span key={i} className={b.bad ? 'text-amber-300' : ''}>{b.text} </span>)}
      </div>

      {/* 1 — staffing: is each branch covered, and what to do about it */}
      {can('/attendance') && <StaffingCard branches={d.branches} workStart={d.workStart} onChanged={refresh} />}

      {/* 2 — outlet sales */}
      {can('/sales') && (
        <Group title="Outlet sales" right={pace ? `${format(new Date(), 'MMM')} · ${goneTxt}` : undefined} link="/sales">
          <SalesLine name="All outlets" sales={d.companySales} target={d.companyTarget} pct={companyPct}
            frac={pace?.frac ?? null} verdict="ok" note={projected ? `on pace for ~${short(projected)}` : ''} total />
          {d.sales.map((s) => {
            const p = pctOf(s.sales, s.target);
            const v = verdictOf(p);
            const note = v === 'behind' && pace ? `behind by ${Math.round(pace.frac * 100 - (p ?? 0))} pts`
              : v === 'ahead' ? 'ahead' : v === 'ok' ? 'on pace' : 'no target set';
            return <SalesLine key={s.code} name={s.name} sales={s.sales} target={s.target} pct={p}
              frac={pace?.frac ?? null} verdict={v} note={note} />;
          })}
          {pace && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400"><span className="inline-block h-3 w-0.5 bg-slate-800" /> where each outlet should be today</p>}
        </Group>
      )}

      {/* 3 — waiting on you */}
      <Group title="Waiting on you" right={d.items.length ? `${d.items.length}` : undefined} link="/inbox">
        {d.items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><Check size={14} className="text-emerald-600" /> Nothing is waiting on you</p>
        ) : shown.map((i) => (
          <Link key={i.key} to={i.link} className="flex items-center gap-2 border-t border-slate-100 py-2 first:border-t-0">
            <Dot bad={i.overdue} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-800">{i.text}</span>
              {i.sub && <span className="block text-xs text-slate-500">{i.sub}</span>}
            </span>
            <ChevronRight size={14} className="shrink-0 text-slate-300" />
          </Link>
        ))}
        {d.items.length > 5 && (
          <button onClick={() => setAll((a) => !a)} className="mt-1 text-xs text-blue-600 hover:underline">
            {all ? 'Show fewer' : `See all ${d.items.length}`}
          </button>
        )}
      </Group>

      {/* 4 — watch */}
      <Group title="Watch">
        {can('/sales') && (
          <WatchLine to="/sales" label="Asked for, not available (month)"
            value={d.lostMonth ? `${d.notAvailableMonth} of ${d.lostMonth}` : 'none'} bad={d.notAvailableMonth > 0 && d.notAvailableMonth * 2 >= d.lostMonth} />
        )}
        {can('/sales') && <WatchLine to="/sales" label="Lost sales · last 7 days" value={String(d.lost7)} />}
        {can('/purchase-orders') && (
          <WatchLine to="/purchase-orders" label={d.latePOs ? 'Deliveries · past expected date' : 'Deliveries · due this week'}
            value={d.latePOs ? plural(d.latePOs, 'PO') : String(d.duePOs)} bad={d.latePOs > 0} />
        )}
      </Group>

      {can('/sales') && (
        <a href="https://alalramadhan-kuwait.github.io/watch-store-crm/#/reports" target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800">
          <ExternalLink size={13} /> Store Daily Report
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

function Group({ title, right, link, children }: { title: string; right?: string; link?: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
        <span className="flex items-center gap-2 text-[11px] text-slate-400">
          {right}
          {link && <Link to={link} className="text-blue-600 hover:underline">Open →</Link>}
        </span>
      </div>
      {children}
    </section>
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
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span className="tabular-nums">{target ? `${short(sales)} of ${kd(target)}` : kd(sales)}</span>
        <span>{note}</span>
      </div>
    </div>
  );
}

function WatchLine({ to, label, value, bad }: { to: string; label: string; value: string; bad?: boolean }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2 text-sm first:border-t-0">
      <span className="text-slate-600">{label}</span>
      <span className={`whitespace-nowrap font-mono font-semibold ${bad ? 'text-rose-600' : 'text-slate-800'}`}>{value}</span>
    </Link>
  );
}
