import { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { CrudModule, CrudConfig } from '../components/CrudModule';
import { supabase } from '../lib/supabase';

interface Employee { id: string; full_name: string; annual_leave_entitlement: number; status: string }
interface LeaveRow { employee_id: string; days: number; approval_status: string; leave_start: string }

export default function LeavePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [reload, setReload] = useState(0);
  const [employeeFilter, setEmployeeFilter] = useState('All');

  useEffect(() => {
    supabase.from('employees').select('id, full_name, annual_leave_entitlement, status')
      .order('full_name').then(({ data }) => setEmployees((data as Employee[]) ?? []));
    supabase.from('leave_records').select('employee_id, days, approval_status, leave_start')
      .then(({ data }) => setLeaves((data as LeaveRow[]) ?? []));
  }, [reload]);

  // Leave taken = approved leave starting in the current year
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

  const empNames = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e.full_name])), [employees]);

  const config: CrudConfig = useMemo(() => ({
    table: 'leave_records',
    title: 'Leave Requests',
    description: 'Vacations and approvals. Days auto-calculate from the dates if left blank.',
    canWrite: (r) => ['admin', 'hr'].includes(r ?? ''),
    statusField: 'approval_status',
    statusOptions: ['Pending', 'Approved', 'Rejected'],
    stampCreatedBy: false,
    orderBy: { column: 'leave_start', ascending: false },
    onChanged: () => setReload((x) => x + 1),
    filter: employeeFilter === 'All' ? undefined : (r) => r.employee_id === employeeFilter,
    toolbarExtra: (
      <select
        value={employeeFilter}
        onChange={(e) => setEmployeeFilter(e.target.value)}
        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
        title="Filter by employee"
      >
        <option value="All">All employees</option>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
      </select>
    ),
    beforeSave: (p) => {
      if ((p.days == null || p.days === 0) && p.leave_start && p.leave_end) {
        p.days = differenceInCalendarDays(parseISO(p.leave_end), parseISO(p.leave_start)) + 1;
      }
      return p;
    },
    fields: [
      {
        key: 'employee_id', label: 'Employee', type: 'select', required: true,
        options: employees.map((e) => ({ value: e.id, label: e.full_name })),
      },
      { key: 'leave_start', label: 'Leave start', type: 'date', required: true },
      { key: 'leave_end', label: 'Leave end', type: 'date', required: true },
      { key: 'days', label: 'Days (blank = auto)', type: 'number' },
      { key: 'approval_status', label: 'Approval status', type: 'select', options: ['Pending', 'Approved', 'Rejected'], defaultValue: 'Pending', required: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'employee_id', label: 'Employee', render: (r) => empNames[r.employee_id] ?? '—' },
      { key: 'leave_start', label: 'Start' },
      { key: 'leave_end', label: 'End' },
      { key: 'days', label: 'Days' },
      { key: 'approval_status', label: 'Status' },
      { key: 'notes', label: 'Notes' },
    ],
  }), [employees, empNames, employeeFilter]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 mb-3">Leave Balances — {new Date().getFullYear()}</h1>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Entitlement</th>
                <th className="px-4 py-3">Taken (approved)</th>
                <th className="px-4 py-3">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Add employees in the HR module first</td></tr>}
              {balances.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium">{b.full_name}</td>
                  <td className="px-4 py-2.5">{b.annual_leave_entitlement}</td>
                  <td className="px-4 py-2.5">{b.taken}</td>
                  <td className={`px-4 py-2.5 font-semibold ${b.remaining < 0 ? 'text-red-600' : b.remaining <= 5 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {b.remaining}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CrudModule config={config} />
    </div>
  );
}
