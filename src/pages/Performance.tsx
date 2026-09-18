import { useCallback, useEffect, useMemo, useState } from 'react';
import { dayPunctuality, punctualityTotals } from '../shared/punctuality';
import { scheduleFromRow, type ScheduleRow } from '../shared/schedule';
import { formatHours } from '../shared/workedHours';
import { Link } from 'react-router-dom';
import { UserRound, Clock, Activity as ActivityIcon, Pencil, CalendarDays, MapPin, Briefcase, Trophy, Medal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/roles';

// One place to see a person from every angle: attendance, app activity, and the edits
// they've made. Everything is keyed by user_id (the login), so names never duplicate.

interface Person { id: string; name: string; role: string; job_title: string | null; location: string | null; status: string | null; joining_date: string | null; employee_id: string | null; linked: boolean }

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

const TABLE_LABEL: Record<string, string> = {
  purchase_orders: 'Supplier Payments', cases: 'Sales', sale_items: 'Sale items', customers: 'Customers',
  limited_projects: 'Limited Projects', repair_watches: 'Repairs', employees: 'Employees', leave_records: 'Leave',
  attendance_records: 'Attendance', waiting_list: 'Demand List', content_tasks: 'Content', paid_ads: 'Paid Ads',
  influencers: 'Influencers', influencer_collaborations: 'Collaborations', consignments: 'Consignments',
  company_documents: 'Documents', settings: 'Settings', employee_requests: 'Requests',
};
const PAGE_LABEL: Record<string, string> = {
  '/': 'Dashboard', '/me': 'My Portal', '/sales': 'Sales', '/crm': 'CRM', '/follow-ups': 'Follow-ups', '/vip': 'VIP',
  '/waiting-list': 'Demand', '/stock': 'Stock', '/purchase-orders': 'Supplier Payments', '/consignments': 'Consignments',
  '/limited-projects': 'Limited Projects', '/repairs': 'Repairs', '/attendance': 'Attendance', '/hr': 'Employees',
  '/leave': 'Leave', '/instagram': 'Instagram', '/content': 'Content', '/paid-ads': 'Paid Ads', '/influencers': 'Influencers',
  '/history': 'History', '/settings': 'Settings', '/activity': 'User Activity', '/performance': 'Performance',
};

const kdate = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const hm = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(11, 16);
const hoursBetween = (a: string, b: string | null) => (b ? (new Date(b).getTime() - new Date(a).getTime()) / 3600_000 : 0);
const rel = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function Kpi({ icon, label, value, sub, accent, link }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string; link?: string }) {
  const inner = (
    <div className="h-full bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 hover:border-slate-400 hover:shadow-md transition-all">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">{icon} {label}</div>
      <p className={`text-xl font-bold ${accent ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
}

// Cumulative performance points — transparent formula, shown as a legend on the leaderboard.
interface Score { user_id: string; days_present: number; late_count: number; full_days: number; overtime_days: number; short_days: number; active_days: number; views: number; created: number; updated: number }
const pointsOf = (s: Score) =>
  s.days_present * 3                              // showing up
  + Math.max(0, s.days_present - s.late_count) * 2 // on-time days
  - s.late_count * 5                              // late penalty (heavier)
  + s.full_days * 3                               // completed the 8h shift
  + s.overtime_days * 2                           // stayed past 8:10
  - s.short_days * 3                              // left short of 6h
  + s.active_days * 2                             // using the system
  + s.created * 3 + s.updated * 1;                // contributions (edits)
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 mt-6">{children}</h2>;
}

export default function PerformancePage() {
  const { role } = useAuth();
  const canView = ['admin', 'manager'].includes(role ?? '');
  const [people, setPeople] = useState<Person[]>([]);
  const [sel, setSel] = useState<string>('');
  const [range, setRange] = useState('30');
  const [mode, setMode] = useState<'individual' | 'overall'>('individual');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<Score[] | null>(null);
  const [boardBusy, setBoardBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: emps }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role'),
        supabase.from('employees').select('id, user_id, full_name, job_title, location, status, joining_date'),
      ]);
      const empByUser = new Map((emps ?? []).filter((e: any) => e.user_id).map((e: any) => [e.user_id, e]));
      const list: Person[] = (profs ?? []).map((p: any) => {
        const e = empByUser.get(p.id);
        return {
          id: p.id, name: (e?.full_name ?? p.full_name ?? '').trim(), role: p.role,
          job_title: e?.job_title ?? null, location: e?.location ?? null, status: e?.status ?? null,
          joining_date: e?.joining_date ?? null, employee_id: e?.id ?? null, linked: !!e,
        };
      }).filter((p) => p.role !== 'admin') // admins are not scored employees
        .sort((a, b) => a.name.localeCompare(b.name));
      setPeople(list);
      setSel(list[0]?.id ?? '');
      setLoading(false);
    })();
  }, []);

  const person = useMemo(() => people.find((p) => p.id === sel) ?? null, [people, sel]);

  const loadPerson = useCallback(async () => {
    if (!person) return;
    setBusy(true);
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const sinceIso = days ? new Date(Date.now() - days * 86400_000).toISOString() : '1970-01-01T00:00:00Z';

    const [att, act, edits, lv, sch, st] = await Promise.all([
      supabase.from('attendance_records').select('clock_in, clock_out, is_late, justified, location').eq('user_id', person.id).gte('clock_in', sinceIso).order('clock_in', { ascending: false }),
      supabase.from('user_activity').select('path, occurred_at').eq('user_id', person.id).gte('occurred_at', sinceIso),
      supabase.from('audit_log').select('table_name, action, changed_at').eq('changed_by', person.id).gte('changed_at', sinceIso).order('changed_at', { ascending: false }).limit(1000),
      person.employee_id
        ? supabase.from('leave_records').select('leave_type, leave_start, leave_end, days, approval_status, manager_status').eq('employee_id', person.employee_id)
        : Promise.resolve({ data: [] as any[] }),
      /* This page used to read the stored is_late flag, written at clock-in
         against whatever rule was in force that morning. It disagreed with HR →
         Attendance for the same person on the same days — Avenues staff showed
         "3 late" here and "—" there. Both now ask the same engine. */
      person.employee_id
        ? supabase.from('employee_schedules')
            .select('id, employee_id, effective_from, effective_to, working_days, shift_start, shift_end, grace_minutes, note')
            .eq('employee_id', person.employee_id)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('settings').select('work_start_time, work_end_time, late_grace_minutes').maybeSingle(),
    ]);

    // attendance
    const arows = (att.data ?? []) as any[];
    const dayset = new Set(arows.map((r) => kdate(r.clock_in)));
    const daysPresent = dayset.size;

    /* Lateness, from the one engine, against this person's own shift. */
    const schedules = ((sch.data ?? []) as ScheduleRow[]).map(scheduleFromRow);
    const setting = (st.data ?? null) as { work_start_time?: string; work_end_time?: string; late_grace_minutes?: number } | null;
    const byDay = new Map<string, any[]>();
    for (const r of arows) {
      const k = kdate(r.clock_in);
      byDay.set(k, [...(byDay.get(k) ?? []), r]);
    }
    const punctDays = [...byDay.entries()].map(([date, recs]) => dayPunctuality({
      date, schedules,
      records: recs.map((r) => ({ clockIn: r.clock_in, clockOut: r.clock_out, justified: r.justified })),
    }, {
      defaultStart: setting?.work_start_time ?? '09:00',
      defaultEnd: setting?.work_end_time ?? '17:00',
      graceMinutes: setting?.late_grace_minutes ?? 60,
    }));
    const punct = punctualityTotals(punctDays);
    const lateCount = punct.timesLate;
    const hoursLate = punct.hoursLate;
    const hoursEarly = punct.hoursEarly;
    /* "Hours vary" people have no shift to be late against, so an on-time rate
       would be a number invented out of nothing. */
    const judged = punctDays.filter((d) => d.hoursLate !== null).length;
    const onTimePct = judged ? Math.round(((judged - lateCount) / judged) * 100) : null;
    const totalHours = arows.reduce((s, r) => s + hoursBetween(r.clock_in, r.clock_out), 0);
    const hoursByDay = new Map<string, number>();
    for (const r of arows) if (r.clock_out) hoursByDay.set(kdate(r.clock_in), (hoursByDay.get(kdate(r.clock_in)) ?? 0) + hoursBetween(r.clock_in, r.clock_out));
    const dayHours = [...hoursByDay.values()];
    const fullDays = dayHours.filter((h) => h >= 7.9).length;
    const overtimeDays = dayHours.filter((h) => h > 8.1667).length;
    const shortDays = dayHours.filter((h) => h < 6).length;
    const missedOut = arows.filter((r) => !r.clock_out && kdate(r.clock_in) < new Date().toISOString().slice(0, 10)).length;
    const arrivalMins = arows.map((r) => { const t = hm(r.clock_in); return parseInt(t.slice(0, 2)) * 60 + parseInt(t.slice(3)); });
    const avgArr = arrivalMins.length ? Math.round(arrivalMins.reduce((s, m) => s + m, 0) / arrivalMins.length) : null;
    const avgArrStr = avgArr != null ? `${String(Math.floor(avgArr / 60)).padStart(2, '0')}:${String(avgArr % 60).padStart(2, '0')}` : '—';
    const lastClock = arows[0]?.clock_in ?? null;

    // activity
    const acts = (act.data ?? []) as any[];
    const actDays = new Set(acts.map((r) => kdate(r.occurred_at)));
    const lastActive = acts.reduce<string | null>((mx, r) => (!mx || r.occurred_at > mx ? r.occurred_at : mx), null);
    const pageCount = new Map<string, number>();
    for (const r of acts) pageCount.set(r.path, (pageCount.get(r.path) ?? 0) + 1);
    const topPages = [...pageCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    // edits (audit_log)
    const erows = (edits.data ?? []) as any[];
    const byAction = { INSERT: 0, UPDATE: 0, DELETE: 0 } as Record<string, number>;
    const byTable = new Map<string, number>();
    for (const r of erows) {
      byAction[r.action] = (byAction[r.action] ?? 0) + 1;
      byTable.set(r.table_name, (byTable.get(r.table_name) ?? 0) + 1);
    }
    const topTables = [...byTable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const recentEdits = erows.slice(0, 10);

    /* Leave in the chosen range, by type.
       Two things were wrong here. The query had no date filter at all, so
       "leave days" was every day the person had ever taken while every other
       figure on the page respected the 30/90-day range beside it. And the days
       were recomputed as the calendar span, which counts the Fridays and the
       halves that the leave itself does not — `days` is the figure the balance,
       the portal and Leave Tracking all use, so it is the figure to use here.
       A leave that straddles the start of the range counts: it is leave taken
       in the period, and its stored length is the whole booking. */
    const sinceDay = sinceIso.slice(0, 10);
    const inRange = (r: any) => !days || (r.leave_end ?? r.leave_start) >= sinceDay;
    const lrows = ((lv.data ?? []) as any[]).filter(inRange);
    const approvedLeave = lrows.filter((r) => r.approval_status === 'Approved');
    const pendingReq = lrows.filter((r) => r.approval_status === 'Pending').length;
    const leaveDays = approvedLeave.reduce((s, r) => s + Number(r.days ?? 0), 0);
    // Built from the rows, not a fixed list, so a new leave type appears here
    // the day it is first used instead of silently landing in nothing.
    const leaveByType = [...approvedLeave.reduce((m, r) => {
      const t = r.leave_type ?? 'Annual';
      const cur = m.get(t) ?? { days: 0, times: 0 };
      m.set(t, { days: cur.days + Number(r.days ?? 0), times: cur.times + 1 });
      return m;
    }, new Map<string, { days: number; times: number }>())]
      .sort((a, b) => b[1].days - a[1].days);

    setData({
      daysPresent, lateCount, hoursLate, hoursEarly, judged, fullDays, overtimeDays, shortDays, onTimePct, avgHours: daysPresent ? totalHours / daysPresent : 0, avgArrStr, lastClock, missedOut,
      views: acts.length, activeDays: actDays.size, lastActive, topPages,
      editTotal: erows.length, byAction, topTables, recentEdits,
      leaveDays, pendingReq, leaveByType,
    });
    setBusy(false);
  }, [person, range]);

  useEffect(() => { if (mode === 'individual') loadPerson(); }, [loadPerson, mode]);

  const loadBoard = useCallback(async () => {
    setBoardBusy(true);
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const sinceIso = days ? new Date(Date.now() - days * 86400_000).toISOString() : '1970-01-01T00:00:00Z';
    const { data: rows } = await supabase.rpc('employee_scoreboard', { since: sinceIso });
    setBoard((rows as Score[]) ?? []);
    setBoardBusy(false);
  }, [range]);
  useEffect(() => { if (mode === 'overall') loadBoard(); }, [loadBoard, mode]);

  const ranked = useMemo(() => {
    if (!board) return [];
    const nameById = new Map(people.map((p) => [p.id, p]));
    return board
      .map((s) => ({ ...s, person: nameById.get(s.user_id), pts: Math.round(pointsOf(s)) }))
      .filter((r) => r.person) // only real people
      .sort((a, b) => b.pts - a.pts);
  }, [board, people]);

  if (!canView) return <div className="text-slate-500 py-16 text-center">Only an admin or manager can view performance.</div>;
  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><UserRound size={20} /> Employee Performance</h1>
          <p className="text-sm text-slate-500">Attendance, app activity and edits for one person — all from their login.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
            {(['individual', 'overall'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-2 ${mode === m ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {m === 'individual' ? 'Individual' : 'Overall'}
              </button>
            ))}
          </div>
          {mode === 'individual' && (
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p.role)}</option>)}
            </select>
          )}
          <select value={range} onChange={(e) => setRange(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* Overall leaderboard */}
      {mode === 'overall' && (
        boardBusy || !board ? <div className="py-10"><Spinner /></div> : (
          <div>
            <p className="text-xs text-slate-400 mb-3">
              Cumulative points = days present ×3 · on-time days ×2 · late −5 · full 8h days ×3 · overtime (8:10+) ×2 · short (&lt;6h) −3 · active days ×2 · created ×3 · updated ×1. Approved paid leave (annual/sick) counts as a full present day; WFH counts as a present day only (no full-8h bonus); admin accounts are excluded.
            </p>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2 w-10">#</th>
                    <th className="text-left px-4 py-2">Employee</th>
                    <th className="text-right px-4 py-2">Points</th>
                    <th className="text-right px-4 py-2 hidden sm:table-cell">Present</th>
                    <th className="text-right px-4 py-2 hidden md:table-cell">Full 8h</th>
                    <th className="text-right px-4 py-2 hidden lg:table-cell">OT</th>
                    <th className="text-right px-4 py-2 hidden lg:table-cell">Short</th>
                    <th className="text-right px-4 py-2 hidden sm:table-cell">Late</th>
                    <th className="text-right px-4 py-2 hidden md:table-cell">Active days</th>
                    <th className="text-right px-4 py-2 hidden md:table-cell">Created</th>
                    <th className="text-right px-4 py-2 hidden md:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ranked.map((r, i) => (
                    <tr key={r.user_id} className={`hover:bg-slate-50 cursor-pointer ${i < 3 ? 'bg-amber-50/40' : ''}`}
                      onClick={() => { setSel(r.user_id); setMode('individual'); }}>
                      <td className="px-4 py-2.5 font-bold text-slate-500">
                        {i === 0 ? <Trophy size={16} className="text-amber-500" /> : i < 3 ? <Medal size={16} className="text-slate-400" /> : i + 1}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-800">{r.person!.name}</span>
                        <span className="text-xs text-slate-400 ml-1.5">{roleLabel(r.person!.role)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900 tabular-nums">{r.pts.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums hidden sm:table-cell">{r.days_present}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell text-emerald-600">{r.full_days}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums hidden lg:table-cell text-emerald-600">{r.overtime_days}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums hidden lg:table-cell ${r.short_days ? 'text-rose-600' : 'text-slate-400'}`}>{r.short_days}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums hidden sm:table-cell ${r.late_count ? 'text-rose-600' : 'text-slate-400'}`}>{r.late_count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">{r.active_days}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell text-emerald-600">{r.created}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell text-blue-600">{r.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-2">Click a row to open that person's full profile.</p>
          </div>
        )
      )}

      {/* Identity */}
      {mode === 'individual' && person && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-xl font-bold text-slate-400">{person.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{person.name}</h2><Badge className="bg-slate-100 text-slate-600 border-slate-200">{roleLabel(person.role)}</Badge>{person.status && <Badge className={person.status === 'Active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>{person.status}</Badge>}</div>
            <div className="text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-1 mt-1">
              {person.job_title && <span className="flex items-center gap-1"><Briefcase size={13} /> {person.job_title}</span>}
              {person.location && <span className="flex items-center gap-1"><MapPin size={13} /> {person.location}</span>}
              {person.joining_date && <span className="flex items-center gap-1"><CalendarDays size={13} /> joined {person.joining_date}</span>}
              {!person.linked && <span className="text-amber-600">no HR record linked</span>}
            </div>
          </div>
        </div>
      )}

      {mode === 'individual' && (busy || !data ? <div className="py-10"><Spinner /></div> : (
        <>
          {/* Attendance */}
          <SectionTitle>Attendance</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={<Clock size={13} />} label="Days present" value={String(data.daysPresent)} link="/attendance" />
            <Kpi icon={<Clock size={13} />} label="Full days (8h)" value={`${data.fullDays}/${data.daysPresent}`} accent={data.daysPresent && data.fullDays === data.daysPresent ? 'text-emerald-600' : undefined} sub={data.shortDays ? `${data.shortDays} short (<6h)` : undefined} link="/attendance" />
            <Kpi icon={<Clock size={13} />} label="Overtime days (8:10+)" value={String(data.overtimeDays)} accent={data.overtimeDays ? 'text-emerald-600' : undefined} link="/attendance" />
            <Kpi icon={<Clock size={13} />} label="On-time rate" value={data.onTimePct != null ? `${data.onTimePct}%` : '—'} accent={data.onTimePct == null ? undefined : data.onTimePct >= 90 ? 'text-emerald-600' : data.onTimePct >= 70 ? 'text-amber-600' : 'text-rose-600'} sub={`${data.lateCount} late`} link="/attendance" />
            <Kpi icon={<Clock size={13} />} label="Avg hours / day" value={data.avgHours ? data.avgHours.toFixed(1) : '—'} link="/attendance" />
            {/* The figure somebody actually asks for out loud. A count of late
                days does not separate five minutes from two hours. */}
            <Kpi icon={<Clock size={13} />} label="Hours late"
              value={data.judged ? formatHours(data.hoursLate, '0') : '—'}
              accent={data.hoursLate ? 'text-amber-600' : undefined}
              sub={data.judged ? `over ${data.lateCount} ${data.lateCount === 1 ? 'day' : 'days'}` : 'hours vary — nothing to judge'}
              link="/attendance" />
            <Kpi icon={<Clock size={13} />} label="Hours left early"
              value={data.judged ? formatHours(data.hoursEarly, '0') : '—'}
              accent={data.hoursEarly ? 'text-amber-600' : undefined}
              link="/attendance" />
            <Kpi icon={<Clock size={13} />} label="Avg arrival" value={data.avgArrStr} link="/attendance" />
            <Kpi icon={<Clock size={13} />} label="Missed clock-outs" value={String(data.missedOut)} accent={data.missedOut ? 'text-amber-600' : undefined} link="/attendance" />
            <Kpi icon={<Clock size={13} />} label="Last clock-in" value={data.lastClock ? kdate(data.lastClock) : '—'} sub={data.lastClock ? hm(data.lastClock) : undefined} link="/attendance" />
          </div>

          {/* Activity */}
          <SectionTitle>App activity</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={<ActivityIcon size={13} />} label="Active days" value={String(data.activeDays)} link="/activity" />
            <Kpi icon={<ActivityIcon size={13} />} label="Page views" value={String(data.views)} link="/activity" />
            <Kpi icon={<ActivityIcon size={13} />} label="Last active" value={rel(data.lastActive)} link="/activity" />
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 col-span-2 xl:col-span-3">
              <div className="text-xs text-slate-500 mb-1">Most-used pages</div>
              <div className="flex flex-wrap gap-1.5">
                {data.topPages.length ? data.topPages.map(([p, n]: [string, number]) => (
                  <Badge key={p} className="bg-slate-100 text-slate-600 border-slate-200">{PAGE_LABEL[p] ?? p} · {n}</Badge>
                )) : <span className="text-xs text-slate-400">no activity in range</span>}
              </div>
            </div>
          </div>

          {/* Edits / contributions */}
          <SectionTitle>Edits &amp; input changes</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={<Pencil size={13} />} label="Total changes" value={String(data.editTotal)} accent="text-slate-800" link="/history" />
            <Kpi icon={<Pencil size={13} />} label="Created" value={String(data.byAction.INSERT ?? 0)} accent="text-emerald-600" link="/history" />
            <Kpi icon={<Pencil size={13} />} label="Updated" value={String(data.byAction.UPDATE ?? 0)} accent="text-blue-600" link="/history" />
            <Kpi icon={<Pencil size={13} />} label="Deleted" value={String(data.byAction.DELETE ?? 0)} accent={data.byAction.DELETE ? 'text-rose-600' : undefined} link="/history" />
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 col-span-2">
              <div className="text-xs text-slate-500 mb-1">Where they work</div>
              <div className="flex flex-wrap gap-1.5">
                {data.topTables.length ? data.topTables.map(([t, n]: [string, number]) => (
                  <Badge key={t} className="bg-slate-100 text-slate-600 border-slate-200">{TABLE_LABEL[t] ?? t} · {n}</Badge>
                )) : <span className="text-xs text-slate-400">no edits in range</span>}
              </div>
            </div>
          </div>
          {data.recentEdits.length > 0 && (
            <div className="mt-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase"><tr>
                  <th className="text-left px-4 py-2">When</th><th className="text-left px-4 py-2">Action</th><th className="text-left px-4 py-2">Module</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentEdits.map((e: any, i: number) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{new Date(e.changed_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuwait' })}</td>
                      <td className="px-4 py-2"><Badge className={e.action === 'INSERT' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : e.action === 'DELETE' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-blue-100 text-blue-700 border-blue-200'}>{e.action === 'INSERT' ? 'Created' : e.action === 'DELETE' ? 'Deleted' : 'Updated'}</Badge></td>
                      <td className="px-4 py-2 text-slate-700">{TABLE_LABEL[e.table_name] ?? e.table_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Leave */}
          {person?.linked && (
            <>
              <SectionTitle>Leave</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Kpi icon={<CalendarDays size={13} />} label="Approved leave days" value={String(data.leaveDays)}
                  sub={range === 'all' ? 'all time' : `in the last ${range} days`} link="/leave" />
                <Kpi icon={<CalendarDays size={13} />} label="Pending requests" value={String(data.pendingReq)} accent={data.pendingReq ? 'text-amber-600' : undefined} link="/leave" />
              </div>
              {/* The total on its own never says whether someone took a holiday
                  or was off sick nine times, which is the question actually
                  being asked of this page. */}
              {data.leaveByType.length > 0 && (
                <div className="mt-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr><th className="text-left px-4 py-2 font-medium">Type</th>
                          <th className="text-right px-4 py-2 font-medium">Days</th>
                          <th className="text-right px-4 py-2 font-medium">Times</th>
                          <th className="text-right px-4 py-2 font-medium">Share</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.leaveByType.map(([type, v]: [string, { days: number; times: number }]) => (
                        <tr key={type}>
                          <td className="px-4 py-2 text-slate-700">{type === 'WFH' ? 'Work from home' : `${type} leave`}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-800">{v.days}</td>
                          <td className="px-4 py-2 text-right text-slate-500">{v.times}</td>
                          <td className="px-4 py-2 text-right text-slate-400">
                            {data.leaveDays ? `${Math.round((v.days / data.leaveDays) * 100)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      ))}
    </div>
  );
}
