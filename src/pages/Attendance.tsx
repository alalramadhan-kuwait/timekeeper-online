import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Clock, AlertTriangle, Users, LogIn, LogOut, CalendarDays, Download, Pencil, Plus, X, Check, UserRound, ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, parseISO, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Spinner, Badge } from '../components/ui';
import { locationType, LOCATION_TYPE_STYLE, LocationType } from '../lib/locationType';
import { lateClassOf, isEarlyLeave, LATE_STYLE, LateClass } from '../lib/lateness';

interface AttendanceRecord {
  id: string; user_id: string; employee_name: string;
  clock_in: string; clock_out: string | null;
  is_late: boolean; justified: boolean; notes: string | null;
  correction_reason: string | null; location: string | null;
}
interface EmpLite { id: string; full_name: string; location: string | null; job_title: string | null; status: string; user_id: string | null }
interface LeaveLite { employee_id: string; leave_type: string; leave_start: string; leave_end: string; approval_status: string }

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-KW', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuwait' });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kuwait' });
const todayKuwait = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const kuwaitDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const hoursOf = (a: string, b: string | null) => (((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 3600000);
/** yyyy-MM-dd + HH:mm in Kuwait → ISO timestamp */
const kuwaitISO = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`).toISOString();
const kuwaitHM = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

export default function AttendancePage() {
  const { role } = useAuth();
  const isManager = ['admin', 'manager', 'hr'].includes(role ?? '');

  if (!isManager) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-bold text-slate-900 mb-2">Attendance</h1>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-sm text-slate-600">
          Clocking in and out now lives in your personal portal.
          <Link to="/me" className="flex items-center gap-1.5 mt-3 text-blue-600 font-medium hover:underline">
            <UserRound size={15} /> Go to My Portal <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }
  return <ManagerDashboard />;
}

function ManagerDashboard() {
  const today = todayKuwait();
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<EmpLite[]>([]);
  const [leaves, setLeaves] = useState<LeaveLite[]>([]);
  const [workStart, setWorkStart] = useState('09:00');
  const [empFilter, setEmpFilter] = useState('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState<'All' | LocationType>('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [reload, setReload] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  // record editor state (item 11)
  const [editId, setEditId] = useState<string | null>(null);
  const [eIn, setEIn] = useState(''); const [eOut, setEOut] = useState('');
  const [eReason, setEReason] = useState(''); const [eJustified, setEJustified] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [aEmp, setAEmp] = useState(''); const [aDate, setADate] = useState(todayKuwait());
  const [aIn, setAIn] = useState('09:00'); const [aOut, setAOut] = useState('');
  const [aReason, setAReason] = useState('');

  useEffect(() => {
    supabase.from('employees').select('id, full_name, location, job_title, status, user_id')
      .then(({ data }) => setEmployees((data as EmpLite[]) ?? []));
    supabase.from('settings').select('work_start_time').single()
      .then(({ data }) => { if (data?.work_start_time) setWorkStart(data.work_start_time); });
  }, []);

  useEffect(() => {
    supabase.from('attendance_records').select('*')
      .gte('clock_in', `${from}T00:00:00+03:00`).lte('clock_in', `${to}T23:59:59+03:00`)
      .order('clock_in', { ascending: false })
      .then(({ data }) => setRecords((data as AttendanceRecord[]) ?? []));
    supabase.from('leave_records').select('employee_id, leave_type, leave_start, leave_end, approval_status')
      .eq('approval_status', 'Approved').lte('leave_start', to).gte('leave_end', from)
      .then(({ data }) => setLeaves((data as LeaveLite[]) ?? []));
  }, [from, to, reload]);

  const empByName = useMemo(() => new Map(employees.map((e) => [e.full_name, e])), [employees]);
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const areas = useMemo(() => [...new Set(employees.map((e) => e.location).filter(Boolean) as string[])].sort(), [employees]);
  const activeEmployees = useMemo(() => employees.filter((e) => ['Active', 'On leave'].includes(e.status)), [employees]);

  type RowStatus = LateClass | 'Missing clock-out' | 'Open' | 'Justified';
  const statusOf = (r: AttendanceRecord): RowStatus => {
    if (!r.clock_out && kuwaitDate(r.clock_in) < today) return 'Missing clock-out';
    if (!r.clock_out) return 'Open';
    if (r.justified) return 'Justified';
    return lateClassOf(r.clock_in, workStart);
  };
  const isLateRow = (r: AttendanceRecord) => !r.justified && lateClassOf(r.clock_in, workStart) !== 'On time';

  const filtered = useMemo(() => records.filter((r) => {
    if (empFilter !== 'All' && r.employee_name !== empFilter) return false;
    if (teamFilter !== 'All' && empByName.get(r.employee_name)?.location !== teamFilter) return false;
    if (typeFilter !== 'All' && locationType(empByName.get(r.employee_name)?.location) !== typeFilter) return false;
    if (statusFilter !== 'All') {
      if (statusFilter === 'Late (any)') { if (!isLateRow(r)) return false; }
      else if (statusOf(r) !== statusFilter) return false;
    }
    return true;
  }), [records, empFilter, teamFilter, typeFilter, statusFilter, empByName, today, workStart]);

  // approved leave / WFH covering today, per employee id (item 18: not absent)
  const onLeaveToday = useMemo(() => {
    const map = new Map<string, string>(); // employee_id -> type
    for (const l of leaves) if (l.leave_start <= today && l.leave_end >= today) map.set(l.employee_id, l.leave_type);
    return map;
  }, [leaves, today]);

  const summary = useMemo(() => {
    const late = filtered.filter(isLateRow).length;
    const stillIn = filtered.filter((r) => !r.clock_out && kuwaitDate(r.clock_in) === today).length;
    const missed = filtered.filter((r) => !r.clock_out && kuwaitDate(r.clock_in) < today).length;
    const totalHours = filtered.reduce((s, r) => s + hoursOf(r.clock_in, r.clock_out), 0);
    const presentToday = new Set(filtered.filter((r) => kuwaitDate(r.clock_in) === today).map((r) => r.employee_name));
    const inRangeToday = to >= today && from <= today;
    const absentToday = inRangeToday
      ? activeEmployees.filter((e) => !presentToday.has(e.full_name) && !onLeaveToday.has(e.id) &&
          (teamFilter === 'All' || e.location === teamFilter) &&
          (typeFilter === 'All' || locationType(e.location) === typeFilter) &&
          (empFilter === 'All' || e.full_name === empFilter))
      : [];
    const excusedToday = inRangeToday
      ? activeEmployees.filter((e) => onLeaveToday.has(e.id)).map((e) => ({ name: e.full_name, type: onLeaveToday.get(e.id)! }))
      : [];
    return { late, stillIn, missed, totalHours, records: filtered.length, absentToday, excusedToday };
  }, [filtered, activeEmployees, today, from, to, teamFilter, typeFilter, empFilter, onLeaveToday, workStart]);

  const report = useMemo(() => {
    const map = new Map<string, { name: string; area: string; days: Set<string>; late: number; justified: number; hours: number; missed: number; early: number }>();
    for (const r of filtered) {
      const e = map.get(r.employee_name) ?? { name: r.employee_name, area: empByName.get(r.employee_name)?.location ?? '—', days: new Set<string>(), late: 0, justified: 0, hours: 0, missed: 0, early: 0 };
      e.days.add(kuwaitDate(r.clock_in));
      if (isLateRow(r)) e.late++;
      if (r.justified) e.justified++;
      e.hours += hoursOf(r.clock_in, r.clock_out);
      if (!r.clock_out && kuwaitDate(r.clock_in) < today) e.missed++;
      if (isEarlyLeave(r.clock_out)) e.early++;
      map.set(r.employee_name, e);
    }
    return [...map.values()].map((e) => ({ ...e, daysPresent: e.days.size, avg: e.days.size ? e.hours / e.days.size : 0 })).sort((a, b) => b.hours - a.hours);
  }, [filtered, empByName, today, workStart]);

  const trend = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
    return days.map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      return { key, count: new Set(filtered.filter((r) => kuwaitDate(r.clock_in) === key).map((r) => r.employee_name)).size };
    });
  }, [filtered, from, to]);
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));

  const lateToday = filtered.filter((r) => isLateRow(r) && kuwaitDate(r.clock_in) === today);
  const unusual = filtered.filter((r) => r.clock_out && (hoursOf(r.clock_in, r.clock_out) > 12 || hoursOf(r.clock_in, r.clock_out) < 1));

  // ── item 11: corrections (audited via DB trigger → History Log) ──
  function startEdit(r: AttendanceRecord) {
    setEditId(editId === r.id ? null : r.id);
    setShowAdd(false);
    setEIn(kuwaitHM(r.clock_in));
    setEOut(r.clock_out ? kuwaitHM(r.clock_out) : '');
    setEReason(r.correction_reason ?? '');
    setEJustified(r.justified);
  }

  async function saveEdit(r: AttendanceRecord) {
    if (!eReason.trim()) { setErr('Correction reason is required'); return; }
    setErr(null);
    const day = kuwaitDate(r.clock_in);
    const patch: Record<string, unknown> = {
      clock_in: kuwaitISO(day, eIn || kuwaitHM(r.clock_in)),
      clock_out: eOut ? kuwaitISO(day, eOut) : null,
      correction_reason: eReason.trim(),
      justified: eJustified,
    };
    patch.is_late = !eJustified && lateClassOf(patch.clock_in as string, workStart) !== 'On time';
    const { error } = await supabase.from('attendance_records').update(patch).eq('id', r.id);
    if (error) { setErr(error.message); return; }
    setEditId(null); setReload((x) => x + 1);
  }

  async function addRecord() {
    const emp = empById.get(aEmp);
    if (!emp) { setErr('Pick an employee'); return; }
    if (!emp.user_id) { setErr(`${emp.full_name} has no linked account — link it in HR → Employees first`); return; }
    if (!aReason.trim()) { setErr('Correction reason is required'); return; }
    setErr(null);
    const clockIn = kuwaitISO(aDate, aIn);
    const { error } = await supabase.from('attendance_records').insert({
      user_id: emp.user_id,
      employee_name: emp.full_name,
      clock_in: clockIn,
      clock_out: aOut ? kuwaitISO(aDate, aOut) : null,
      is_late: lateClassOf(clockIn, workStart) !== 'On time',
      correction_reason: `[added by manager] ${aReason.trim()}`,
      location: emp.location,
    });
    if (error) { setErr(error.message); return; }
    setShowAdd(false); setAEmp(''); setAOut(''); setAReason(''); setReload((x) => x + 1);
  }

  async function removeRecord(r: AttendanceRecord) {
    const reason = window.prompt(`Mark ${r.employee_name} as absent by deleting this record?\nEnter the reason (required):`);
    if (!reason?.trim()) return;
    await supabase.from('attendance_records').update({ correction_reason: `[deleted] ${reason.trim()}` }).eq('id', r.id);
    const { error } = await supabase.from('attendance_records').delete().eq('id', r.id);
    if (error) setErr(error.message); else setReload((x) => x + 1);
  }

  function exportCsv() {
    const rows = [['Employee', 'Area', 'Days present', 'Late', 'Justified late', 'Early leaves', 'Missed clock-outs', 'Total hours', 'Avg hours/day']];
    for (const r of report) rows.push([r.name, r.area, String(r.daysPresent), String(r.late), String(r.justified), String(r.early), String(r.missed), r.hours.toFixed(1), r.avg.toFixed(1)]);
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `attendance_${from}_to_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const [wh, wm] = workStart.split(':').map(Number);
  const graceEnd = `${String(Math.floor((wh * 60 + wm + 60) / 60)).padStart(2, '0')}:${String((wh * 60 + wm + 60) % 60).padStart(2, '0')}`;

  const cards = [
    { label: 'Clock-ins', value: summary.records, icon: Clock, accent: 'text-slate-800' },
    { label: 'Late (unjustified)', value: summary.late, icon: AlertTriangle, accent: summary.late ? 'text-amber-600' : 'text-slate-400' },
    { label: 'Absent today', value: summary.absentToday.length, icon: Users, accent: summary.absentToday.length ? 'text-rose-600' : 'text-emerald-600' },
    { label: 'Still clocked in', value: summary.stillIn, icon: LogIn, accent: 'text-blue-600' },
    { label: 'Missed clock-out', value: summary.missed, icon: LogOut, accent: summary.missed ? 'text-rose-600' : 'text-slate-400' },
    { label: 'Total hours', value: summary.totalHours.toFixed(0), icon: CalendarDays, accent: 'text-slate-800' },
  ];

  const input = 'px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white';
  const statusBadge = (st: string) =>
    st === 'Missing clock-out' ? 'bg-rose-100 text-rose-600 border-rose-200'
      : st === 'Open' ? 'bg-blue-100 text-blue-700 border-blue-200'
      : st === 'Justified' ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
      : LATE_STYLE[st as LateClass] ?? 'bg-slate-100 text-slate-600';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Team Attendance</h1>
        <p className="text-sm text-slate-500">
          Work 9:00–17:00 with 1h grace — on time until {graceEnd}. Staff clock in from My Portal; corrections here are saved to the History Log.
        </p>
      </div>

      {err && <div className="px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      {/* filters */}
      <div className="flex flex-wrap gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        <span className="self-center text-slate-400 text-sm">→</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
        <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className={input}>
          <option value="All">All employees</option>
          {employees.map((e) => <option key={e.id} value={e.full_name}>{e.full_name}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'All' | LocationType)} className={input}>
          <option value="All">Office + Store</option>
          <option value="Head Office">Head Office only</option>
          <option value="Retail Store">Retail Store only</option>
        </select>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className={input}>
          <option value="All">All areas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={input}>
          <option value="All">All statuses</option>
          {['On time', 'Late (any)', 'Minor late', 'Late', 'Serious late', 'Justified', 'Open', 'Missing clock-out'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5"><c.icon size={13} /> {c.label}</div>
            <p className={`text-xl font-bold ${c.accent}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* alerts */}
      {(lateToday.length > 0 || summary.absentToday.length > 0 || summary.missed > 0 || unusual.length > 0 || summary.excusedToday.length > 0) && (
        <div className="space-y-2">
          {summary.absentToday.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <Users size={15} className="mt-0.5 shrink-0" />
              <span>Absent today: <b>{summary.absentToday.map((e) => e.full_name).join(', ')}</b></span>
            </div>
          )}
          {summary.excusedToday.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-sm">
              <CalendarDays size={15} className="mt-0.5 shrink-0" />
              <span>On approved leave/WFH today: <b>{summary.excusedToday.map((e) => `${e.name} (${e.type})`).join(', ')}</b></span>
            </div>
          )}
          {lateToday.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>Late today: <b>{lateToday.map((r) => `${r.employee_name} (${lateClassOf(r.clock_in, workStart)})`).join(', ')}</b></span>
            </div>
          )}
          {summary.missed > 0 && (
            <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <LogOut size={15} className="mt-0.5 shrink-0" />
              <span>{summary.missed} shift(s) never clocked out — correct below.</span>
            </div>
          )}
          {unusual.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{unusual.length} shift(s) with unusual hours (over 12h or under 1h).</span>
            </div>
          )}
        </div>
      )}

      {/* trend */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Attendance trend (staff present per day)</h3>
        <div className="flex items-end gap-1 h-28 overflow-x-auto">
          {trend.map((t) => (
            <div key={t.key} className="flex flex-col items-center gap-1 min-w-[22px]" title={`${t.key}: ${t.count} present`}>
              <div className="text-[10px] text-slate-500">{t.count || ''}</div>
              <div className="w-4 bg-blue-500 rounded-t" style={{ height: `${Math.max(2, (t.count / maxTrend) * 80)}px` }} />
              <div className="text-[9px] text-slate-400">{t.key.slice(8)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* payroll report */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Report by employee (payroll)</h3>
          <button onClick={exportCsv} className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Download size={13} /> Export CSV</button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5 hidden sm:table-cell">Area</th>
                <th className="px-4 py-2.5 text-right">Days</th>
                <th className="px-4 py-2.5 text-right">Late</th>
                <th className="px-4 py-2.5 text-right hidden md:table-cell">Justified</th>
                <th className="px-4 py-2.5 text-right hidden md:table-cell">Early leave</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">Missed out</th>
                <th className="px-4 py-2.5 text-right">Total hrs</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">Avg/day</th>
              </tr>
            </thead>
            <tbody>
              {report.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-400">No attendance in this range</td></tr>}
              {report.map((r) => (
                <tr key={r.name} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      {(() => { const lt = locationType(empByName.get(r.name)?.location); return lt ? <span className={`h-2 w-2 rounded-full shrink-0 ${LOCATION_TYPE_STYLE[lt].dot}`} /> : null; })()}
                      {r.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{r.area}</td>
                  <td className="px-4 py-2.5 text-right">{r.daysPresent}</td>
                  <td className={`px-4 py-2.5 text-right ${r.late ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>{r.late || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400 hidden md:table-cell">{r.justified || '—'}</td>
                  <td className={`px-4 py-2.5 text-right hidden md:table-cell ${r.early ? 'text-amber-600' : 'text-slate-400'}`}>{r.early || '—'}</td>
                  <td className={`px-4 py-2.5 text-right hidden sm:table-cell ${r.missed ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>{r.missed || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.hours.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums hidden sm:table-cell">{r.avg.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* records + corrections */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Records</h3>
          <button onClick={() => { setShowAdd((v) => !v); setEditId(null); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700">
            <Plus size={13} /> Add missing record
          </button>
        </div>

        {showAdd && (
          <div className="mb-3 p-4 rounded-xl bg-white border border-blue-200 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
              <label className="text-xs sm:col-span-1"><span className="block text-slate-500 mb-1">Employee</span>
                <select value={aEmp} onChange={(e) => setAEmp(e.target.value)} className={`${input} w-full`}>
                  <option value="">Pick…</option>
                  {activeEmployees.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.user_id ? '' : ' (no account)'}</option>)}
                </select></label>
              <label className="text-xs"><span className="block text-slate-500 mb-1">Date</span>
                <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} className={`${input} w-full`} /></label>
              <label className="text-xs"><span className="block text-slate-500 mb-1">Clock in</span>
                <input type="time" value={aIn} onChange={(e) => setAIn(e.target.value)} className={`${input} w-full`} /></label>
              <label className="text-xs"><span className="block text-slate-500 mb-1">Clock out (optional)</span>
                <input type="time" value={aOut} onChange={(e) => setAOut(e.target.value)} className={`${input} w-full`} /></label>
              <label className="text-xs sm:col-span-1"><span className="block text-slate-500 mb-1">Reason (required)</span>
                <input value={aReason} onChange={(e) => setAReason(e.target.value)} placeholder="e.g. forgot phone" className={`${input} w-full`} /></label>
            </div>
            <div className="flex gap-2">
              <button onClick={addRecord} className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium"><Check size={12} /> Add record</button>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">In</th>
                <th className="px-4 py-2.5">Out</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">Hrs</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 hidden md:table-cell">Location</th>
                <th className="px-4 py-2.5 w-px" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No records</td></tr>}
              {filtered.map((r) => {
                const st = statusOf(r);
                return (
                  <Fragment key={r.id}>
                  <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{fmtDate(r.clock_in)}</td>
                    <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{r.employee_name}</td>
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">{fmtTime(r.clock_in)}</td>
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">
                      {r.clock_out ? <>{fmtTime(r.clock_out)}{isEarlyLeave(r.clock_out) && <span className="text-amber-500 text-xs ml-1">early</span>}</> : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums hidden sm:table-cell">{r.clock_out ? hoursOf(r.clock_in, r.clock_out).toFixed(1) : '—'}</td>
                    <td className="px-4 py-2">
                      <Badge className={statusBadge(st)}>{st}</Badge>
                      {r.correction_reason && <span className="block text-[10px] text-blue-500 mt-0.5" title={r.correction_reason}>corrected</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400 hidden md:table-cell">{r.location ?? '—'}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(r)} className={`mr-2 ${editId === r.id ? 'text-blue-600' : 'text-slate-400'} hover:text-blue-600`} title="Correct record"><Pencil size={14} /></button>
                      <button onClick={() => removeRecord(r)} className="text-slate-400 hover:text-red-600" title="Delete (mark absent)"><X size={15} /></button>
                    </td>
                  </tr>
                  {editId === r.id && (
                    <tr className="bg-blue-50/40 border-b border-slate-100">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-xs"><span className="block text-slate-500 mb-1">Clock in</span>
                            <input type="time" value={eIn} onChange={(e) => setEIn(e.target.value)} className={input} /></label>
                          <label className="text-xs"><span className="block text-slate-500 mb-1">Clock out</span>
                            <input type="time" value={eOut} onChange={(e) => setEOut(e.target.value)} className={input} /></label>
                          <label className="text-xs flex-1 min-w-48"><span className="block text-slate-500 mb-1">Correction reason (required)</span>
                            <input value={eReason} onChange={(e) => setEReason(e.target.value)} placeholder="Why is this being corrected?" className={`${input} w-full`} /></label>
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-2">
                            <input type="checkbox" checked={eJustified} onChange={(e) => setEJustified(e.target.checked)} className="h-3.5 w-3.5" /> Justified late
                          </label>
                          <button onClick={() => saveEdit(r)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium"><Check size={12} /> Save correction</button>
                          <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-slate-600 pb-1.5"><X size={15} /></button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5">Old and new values are recorded automatically in the History Log.</p>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
