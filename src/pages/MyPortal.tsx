import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRound, CalendarDays, Clock, LogIn, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Spinner, Badge } from '../components/ui';

interface EmpRecord {
  id: string; full_name: string; user_id: string | null; job_title: string | null; location: string | null;
  civil_id: string | null; passport_number: string | null; residency_expiry: string | null;
  work_permit_expiry: string | null; joining_date: string | null; annual_leave_entitlement: number | null; status: string | null;
}
interface LeaveRec { id: string; employee_id: string; leave_start: string; leave_end: string; days: number; approval_status: string; notes: string | null }
interface AttRec { clock_in: string; clock_out: string | null; is_late: boolean }

function hoursOf(a: string, b: string | null) {
  return ((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 3600000;
}
const LEAVE_BADGE: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  Rejected: 'bg-rose-100 text-rose-600 border-rose-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function MyPortalPage() {
  const { user, profile } = useAuth();
  const [emp, setEmp] = useState<EmpRecord | null>(null);
  const [leaves, setLeaves] = useState<LeaveRec[]>([]);
  const [att, setAtt] = useState<AttRec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) { setLoading(false); return; }
      // RLS returns only the user's own rows for regular staff; filter defensively for managers/HR who can read all
      const { data: emps } = await supabase.from('employees').select('*');
      const mine = (emps as EmpRecord[] | null)?.find(
        (e) => e.user_id === user.id || (e.full_name ?? '').trim().toLowerCase() === (profile?.full_name ?? '').trim().toLowerCase(),
      ) ?? null;
      setEmp(mine);

      if (mine) {
        const { data: lv } = await supabase.from('leave_records').select('*').eq('employee_id', mine.id).order('leave_start', { ascending: false });
        setLeaves((lv as LeaveRec[]) ?? []);
      }
      const monthStart = new Date();
      monthStart.setDate(1);
      const { data: at } = await supabase.from('attendance_records').select('clock_in, clock_out, is_late')
        .eq('user_id', user.id).gte('clock_in', monthStart.toISOString()).order('clock_in', { ascending: false });
      setAtt((at as AttRec[]) ?? []);
      setLoading(false);
    })();
  }, [user?.id, profile?.full_name]);

  const leaveSummary = useMemo(() => {
    const year = new Date().getFullYear();
    const taken = leaves.filter((l) => l.approval_status === 'Approved' && new Date(l.leave_start).getFullYear() === year)
      .reduce((s, l) => s + Number(l.days), 0);
    const entitlement = Number(emp?.annual_leave_entitlement ?? 30);
    return { taken, entitlement, remaining: entitlement - taken };
  }, [leaves, emp]);

  const attSummary = useMemo(() => {
    const days = new Set(att.map((a) => new Date(a.clock_in).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })));
    const hours = att.reduce((s, a) => s + hoursOf(a.clock_in, a.clock_out), 0);
    const late = att.filter((a) => a.is_late).length;
    return { days: days.size, hours, late };
  }, [att]);

  if (loading) return <Spinner />;

  const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div><div className="text-xs text-slate-400">{label}</div><div className="text-sm font-medium text-slate-700">{value ?? '—'}</div></div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Portal</h1>
        <p className="text-sm text-slate-500">Your personal information, leave and attendance — visible only to you.</p>
      </div>

      {/* Personal */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4"><UserRound size={16} className="text-slate-500" /><h2 className="text-sm font-semibold text-slate-700">Personal & HR</h2></div>
        {!emp ? (
          <p className="text-sm text-slate-400">Your HR record isn't linked to this account yet. Ask HR to add or link your employee profile.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Info label="Name" value={emp.full_name} />
            <Info label="Job title" value={emp.job_title} />
            <Info label="Location" value={emp.location} />
            <Info label="Civil ID" value={emp.civil_id} />
            <Info label="Passport" value={emp.passport_number} />
            <Info label="Joined" value={emp.joining_date} />
            <Info label="Residency expiry" value={emp.residency_expiry} />
            <Info label="Work permit expiry" value={emp.work_permit_expiry} />
            <Info label="Status" value={emp.status} />
          </div>
        )}
      </div>

      {/* Leave */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4"><CalendarDays size={16} className="text-slate-500" /><h2 className="text-sm font-semibold text-slate-700">My Leave — {new Date().getFullYear()}</h2></div>
        <div className="grid grid-cols-3 gap-4 mb-4 text-center">
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Entitlement</div><div className="font-bold text-slate-800">{leaveSummary.entitlement}</div></div>
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Taken</div><div className="font-bold text-slate-800">{leaveSummary.taken}</div></div>
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Remaining</div><div className={`font-bold ${leaveSummary.remaining <= 5 ? 'text-amber-600' : 'text-emerald-700'}`}>{leaveSummary.remaining}</div></div>
        </div>
        {leaves.length === 0 ? (
          <p className="text-sm text-slate-400">No leave requests on record.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {leaves.slice(0, 12).map((l) => (
              <div key={l.id} className="py-2 flex items-center gap-3 text-sm">
                <span className="text-slate-600">{l.leave_start} → {l.leave_end}</span>
                <span className="text-slate-400">{l.days}d</span>
                <Badge className={LEAVE_BADGE[l.approval_status] ?? 'bg-slate-100 text-slate-500'}>{l.approval_status}</Badge>
                {l.notes && <span className="text-xs text-slate-400 truncate">{l.notes}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attendance */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4"><Clock size={16} className="text-slate-500" /><h2 className="text-sm font-semibold text-slate-700">My Attendance — this month</h2></div>
        <div className="grid grid-cols-3 gap-4 mb-4 text-center">
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Days present</div><div className="font-bold text-slate-800">{attSummary.days}</div></div>
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Total hours</div><div className="font-bold text-slate-800">{attSummary.hours.toFixed(1)}</div></div>
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Late arrivals</div><div className={`font-bold ${attSummary.late ? 'text-amber-600' : 'text-slate-800'}`}>{attSummary.late}</div></div>
        </div>
        <Link to="/attendance" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
          <LogIn size={14} /> Go to clock in / out <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
