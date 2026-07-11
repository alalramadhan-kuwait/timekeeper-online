import { useEffect, useMemo, useState } from 'react';
import {
  addDays, getDay, isAfter, parseISO, format, startOfMonth, endOfMonth,
  eachDayOfInterval, differenceInCalendarDays,
} from 'date-fns';
import { AlertTriangle, CalendarClock, Clock3, CalendarDays } from 'lucide-react';
import { CrudModule, CrudConfig } from '../components/CrudModule';
import { Badge } from '../components/ui';
import { supabase } from '../lib/supabase';

/**
 * Kuwait Labor Law (Law No. 6 of 2010): annual leave is 30 paid WORKING days.
 * The weekly rest day (Friday) inside a leave period does not consume leave,
 * so auto-calculated days skip Fridays.
 */
export function workingDaysBetween(startStr: string, endStr: string): number {
  let d = parseISO(startStr);
  const end = parseISO(endStr);
  let days = 0;
  while (!isAfter(d, end)) {
    if (getDay(d) !== 5) days++; // 5 = Friday
    d = addDays(d, 1);
  }
  return days;
}

interface Employee { id: string; full_name: string; annual_leave_entitlement: number; status: string; location: string | null; job_title: string | null }
interface LeaveRow { id: string; employee_id: string; leave_start: string; leave_end: string; days: number; approval_status: string; notes: string | null }

type Phase = 'Pending' | 'Rejected' | 'Cancelled' | 'Upcoming' | 'Active' | 'Completed';
const PHASE_STYLE: Record<Phase, string> = {
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  Rejected: 'bg-rose-100 text-rose-600 border-rose-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  Upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
  Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Completed: 'bg-slate-100 text-slate-400 border-slate-200',
};

function phaseOf(l: LeaveRow, today: string): Phase {
  if (l.approval_status === 'Pending') return 'Pending';
  if (l.approval_status === 'Rejected') return 'Rejected';
  if (l.approval_status === 'Cancelled') return 'Cancelled';
  // Approved → derive from dates
  if (l.leave_end < today) return 'Completed';
  if (l.leave_start > today) return 'Upcoming';
  return 'Active';
}

const STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

export default function LeavePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [reload, setReload] = useState(0);
  const [employeeFilter, setEmployeeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | Phase>('All');
  const [areaFilter, setAreaFilter] = useState('All');
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    supabase.from('employees').select('id, full_name, annual_leave_entitlement, status, location, job_title')
      .order('full_name').then(({ data }) => setEmployees((data as Employee[]) ?? []));
    supabase.from('leave_records').select('id, employee_id, leave_start, leave_end, days, approval_status, notes')
      .then(({ data }) => setLeaves((data as LeaveRow[]) ?? []));
  }, [reload]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const empNames = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.full_name])), [employees]);
  const areas = useMemo(() => [...new Set(employees.map((e) => e.location).filter(Boolean) as string[])].sort(), [employees]);

  // ── enrich leaves with phase + employee context, apply filters
  const enriched = useMemo(() =>
    leaves.map((l) => ({ ...l, phase: phaseOf(l, today), emp: empById.get(l.employee_id) })),
    [leaves, empById, today]);

  const filtered = useMemo(() => enriched.filter((l) => {
    if (employeeFilter !== 'All' && l.employee_id !== employeeFilter) return false;
    if (statusFilter !== 'All' && l.phase !== statusFilter) return false;
    if (areaFilter !== 'All' && l.emp?.location !== areaFilter) return false;
    return true;
  }), [enriched, employeeFilter, statusFilter, areaFilter]);

  // ── overlap detection: two live leaves (Pending/Approved) sharing area OR role with intersecting dates
  const { overlaps, overlapCells } = useMemo(() => {
    const live = enriched.filter((l) => ['Pending', 'Upcoming', 'Active'].includes(l.phase));
    const overlaps: { a: string; b: string; group: string; start: string; end: string }[] = [];
    const overlapCells = new Set<string>(); // `${employee_id}|${yyyy-MM-dd}`
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const A = live[i], B = live[j];
        if (A.employee_id === B.employee_id) continue;
        const ea = A.emp, eb = B.emp;
        if (!ea || !eb) continue;
        const sameArea = ea.location && ea.location === eb.location;
        const sameRole = ea.job_title && ea.job_title === eb.job_title;
        if (!sameArea && !sameRole) continue;
        const start = A.leave_start > B.leave_start ? A.leave_start : B.leave_start;
        const end = A.leave_end < B.leave_end ? A.leave_end : B.leave_end;
        if (start > end) continue; // no intersection
        overlaps.push({ a: ea.full_name, b: eb.full_name, group: sameArea ? ea.location! : ea.job_title!, start, end });
        for (const d of eachDayOfInterval({ start: parseISO(start), end: parseISO(end) })) {
          const key = format(d, 'yyyy-MM-dd');
          overlapCells.add(`${A.employee_id}|${key}`);
          overlapCells.add(`${B.employee_id}|${key}`);
        }
      }
    }
    return { overlaps, overlapCells };
  }, [enriched]);

  // ── alerts (item 9)
  const startingSoon = useMemo(() =>
    enriched.filter((l) => l.phase === 'Upcoming' && differenceInCalendarDays(parseISO(l.leave_start), parseISO(today)) <= 7),
    [enriched, today]);
  const pendingCount = enriched.filter((l) => l.phase === 'Pending').length;

  // ── summary counts (item 7)
  const counts = useMemo(() => {
    const c: Record<Phase, number> = { Pending: 0, Rejected: 0, Cancelled: 0, Upcoming: 0, Active: 0, Completed: 0 };
    for (const l of enriched) c[l.phase]++;
    return c;
  }, [enriched]);

  // ── planner grid for the selected month
  const monthDays = useMemo(() => {
    const start = startOfMonth(parseISO(`${month}-01`));
    return eachDayOfInterval({ start, end: endOfMonth(start) });
  }, [month]);

  // coverage[empId][yyyy-MM-dd] = 'Approved'|'Pending'
  const coverage = useMemo(() => {
    const map = new Map<string, Map<string, 'Approved' | 'Pending'>>();
    for (const l of filtered) {
      if (!['Pending', 'Upcoming', 'Active', 'Completed'].includes(l.phase)) continue;
      const kind = l.approval_status === 'Approved' ? 'Approved' : 'Pending';
      const s = parseISO(l.leave_start), e = parseISO(l.leave_end);
      for (const d of eachDayOfInterval({ start: s, end: e })) {
        const key = format(d, 'yyyy-MM-dd');
        if (key.slice(0, 7) !== month) continue;
        if (!map.has(l.employee_id)) map.set(l.employee_id, new Map());
        const inner = map.get(l.employee_id)!;
        // approved wins over pending for display
        if (inner.get(key) !== 'Approved') inner.set(key, kind);
      }
    }
    return map;
  }, [filtered, month]);

  const plannerEmployees = useMemo(() =>
    employees.filter((e) => ['Active', 'On leave'].includes(e.status) &&
      (employeeFilter === 'All' || e.id === employeeFilter) &&
      (areaFilter === 'All' || e.location === areaFilter)),
    [employees, employeeFilter, areaFilter]);

  // ── balances (unchanged logic)
  const balances = useMemo(() => {
    const year = new Date().getFullYear();
    return employees
      .filter((e) => ['Active', 'On leave'].includes(e.status))
      .map((e) => {
        const taken = leaves
          .filter((l) => l.employee_id === e.id && l.approval_status === 'Approved' && new Date(l.leave_start).getFullYear() === year)
          .reduce((s, l) => s + Number(l.days), 0);
        return { ...e, taken, remaining: Number(e.annual_leave_entitlement) - taken };
      });
  }, [employees, leaves]);

  const config: CrudConfig = useMemo(() => ({
    table: 'leave_records',
    title: 'Leave Requests',
    description: 'Days auto-calculate as working days (Fridays excluded) if left blank — override manually for public holidays.',
    canWrite: (r) => ['admin', 'hr'].includes(r ?? ''),
    stampCreatedBy: false,
    orderBy: { column: 'leave_start', ascending: false },
    onChanged: () => setReload((x) => x + 1),
    filter: (r) => {
      if (employeeFilter !== 'All' && r.employee_id !== employeeFilter) return false;
      if (statusFilter !== 'All' && phaseOf(r as LeaveRow, today) !== statusFilter) return false;
      if (areaFilter !== 'All' && empById.get(r.employee_id)?.location !== areaFilter) return false;
      return true;
    },
    beforeSave: (p) => {
      if ((p.days == null || p.days === 0) && p.leave_start && p.leave_end) {
        p.days = workingDaysBetween(p.leave_start, p.leave_end);
      }
      return p;
    },
    fields: [
      { key: 'employee_id', label: 'Employee', type: 'select', required: true, options: employees.map((e) => ({ value: e.id, label: e.full_name })) },
      { key: 'leave_start', label: 'Leave start', type: 'date', required: true },
      { key: 'leave_end', label: 'Leave end', type: 'date', required: true },
      { key: 'days', label: 'Working days (blank = auto, Fridays excluded)', type: 'number' },
      { key: 'approval_status', label: 'Approval status', type: 'select', options: STATUS_OPTIONS, defaultValue: 'Pending', required: true },
      { key: 'notes', label: 'Notes / remarks', type: 'textarea' },
    ],
    columns: [
      { key: 'employee_id', label: 'Employee', sortable: true, sortValue: (r) => empNames[r.employee_id] ?? '', render: (r) => empNames[r.employee_id] ?? '—' },
      { key: 'leave_start', label: 'Start', sortable: true },
      { key: 'leave_end', label: 'End', sortable: true },
      { key: 'days', label: 'Days', sortable: true },
      { key: 'phase', label: 'Status', sortable: true, sortValue: (r) => phaseOf(r as LeaveRow, today), render: (r) => {
        const p = phaseOf(r as LeaveRow, today);
        return <Badge className={PHASE_STYLE[p]}>{p}</Badge>;
      } },
      { key: 'notes', label: 'Notes' },
    ],
  }), [employees, empNames, today, employeeFilter, statusFilter, areaFilter, empById]);

  const cardData: { label: string; value: number; icon: typeof CalendarDays; accent: string }[] = [
    { label: 'Pending approval', value: counts.Pending, icon: CalendarClock, accent: counts.Pending ? 'text-amber-600' : 'text-slate-400' },
    { label: 'Upcoming', value: counts.Upcoming, icon: CalendarDays, accent: 'text-blue-600' },
    { label: 'Active today', value: counts.Active, icon: Clock3, accent: 'text-emerald-600' },
    { label: 'Overlaps', value: overlaps.length, icon: AlertTriangle, accent: overlaps.length ? 'text-rose-600' : 'text-slate-400' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Leave Tracking</h1>
        <p className="text-sm text-slate-500">
          Planner, balances and approvals — 30 paid working days/year per Kuwait Labor Law (Fridays excluded).
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cardData.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5"><c.icon size={13} /> {c.label}</div>
            <p className={`text-xl font-bold ${c.accent}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(overlaps.length > 0 || startingSoon.length > 0 || pendingCount > 0) && (
        <div className="space-y-2">
          {overlaps.map((o, i) => (
            <div key={`ov-${i}`} className="flex items-start gap-2 px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span><b>{o.a}</b> and <b>{o.b}</b> ({o.group}) are both on leave {o.start} → {o.end}.</span>
            </div>
          ))}
          {startingSoon.map((l) => (
            <div key={`ss-${l.id}`} className="flex items-start gap-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
              <CalendarClock size={15} className="mt-0.5 shrink-0" />
              <span><b>{l.emp?.full_name ?? empNames[l.employee_id]}</b> starts leave in {differenceInCalendarDays(parseISO(l.leave_start), parseISO(today))} day(s) ({l.leave_start}).</span>
            </div>
          ))}
          {pendingCount > 0 && (
            <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              <CalendarClock size={15} className="mt-0.5 shrink-0" />
              <span>{pendingCount} leave request{pendingCount !== 1 ? 's' : ''} awaiting approval.</span>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option value="All">All employees</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'All' | Phase)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option value="All">All statuses</option>
          {(['Pending', 'Upcoming', 'Active', 'Completed', 'Rejected', 'Cancelled'] as Phase[]).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option value="All">All areas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
      </div>

      {/* Planner / Gantt */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Leave planner — {format(parseISO(`${month}-01`), 'MMMM yyyy')}</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600 border-b border-r border-slate-200 min-w-[140px]">Employee</th>
                {monthDays.map((d) => {
                  const key = format(d, 'yyyy-MM-dd');
                  const fri = getDay(d) === 5;
                  return (
                    <th key={key} className={`px-0 py-1 w-6 text-center font-medium border-b border-slate-200 ${fri ? 'bg-slate-100 text-slate-400' : 'text-slate-500'} ${key === today ? 'bg-amber-100' : ''}`}>
                      <div>{format(d, 'd')}</div>
                      <div className="text-[9px]">{format(d, 'EEEEE')}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {plannerEmployees.length === 0 && (
                <tr><td colSpan={monthDays.length + 1} className="px-3 py-6 text-center text-slate-400">No employees to show</td></tr>
              )}
              {plannerEmployees.map((e) => {
                const cov = coverage.get(e.id);
                return (
                  <tr key={e.id}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-slate-700 border-b border-r border-slate-100 whitespace-nowrap">
                      {e.full_name}
                      {e.location && <span className="block text-[10px] text-slate-400">{e.location}</span>}
                    </td>
                    {monthDays.map((d) => {
                      const key = format(d, 'yyyy-MM-dd');
                      const kind = cov?.get(key);
                      const overlap = overlapCells.has(`${e.id}|${key}`);
                      const fri = getDay(d) === 5;
                      const bg = kind === 'Approved' ? 'bg-emerald-400' : kind === 'Pending' ? 'bg-amber-300' : fri ? 'bg-slate-50' : '';
                      return (
                        <td key={key} className="p-0 border-b border-slate-100 h-7">
                          <div
                            className={`h-6 w-6 mx-auto ${bg} ${overlap ? 'ring-2 ring-rose-500 ring-inset rounded-sm' : ''}`}
                            title={kind ? `${e.full_name}: ${kind}${overlap ? ' · OVERLAP' : ''} (${key})` : ''}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-400 inline-block" /> Approved</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-300 inline-block" /> Pending</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm ring-2 ring-rose-500 ring-inset inline-block" /> Overlap (same area/role)</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-100 inline-block" /> Today · <span className="h-3 w-3 rounded-sm bg-slate-100 inline-block" /> Friday</span>
        </div>
      </div>

      {/* Balances */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Leave balances — {new Date().getFullYear()}</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3 text-right">Entitlement</th>
                <th className="px-4 py-3 text-right">Taken (approved)</th>
                <th className="px-4 py-3 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Add employees in the HR module first</td></tr>}
              {balances.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{b.full_name}</td>
                  <td className="px-4 py-2.5 text-right">{b.annual_leave_entitlement}</td>
                  <td className="px-4 py-2.5 text-right">{b.taken}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${b.remaining < 0 ? 'text-red-600' : b.remaining <= 5 ? 'text-amber-600' : 'text-emerald-700'}`}>{b.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Requests list + editor (respects the filters above) */}
      <CrudModule config={config} />
    </div>
  );
}
