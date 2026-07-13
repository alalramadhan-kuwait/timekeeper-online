import { useEffect, useMemo, useState } from 'react';
import {
  UserRound, CalendarDays, Clock, LogIn, LogOut, MapPin, AlertCircle, CheckCircle,
  Plus, Send, X, Inbox, Pencil,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Spinner, Badge } from '../components/ui';
import { workingDaysBetween } from './Leave';
import { lateClassOf, isEarlyLeave, LATE_STYLE } from '../lib/lateness';

interface EmpRecord {
  id: string; full_name: string; user_id: string | null; job_title: string | null; location: string | null;
  civil_id: string | null; passport_number: string | null; residency_expiry: string | null;
  work_permit_expiry: string | null; joining_date: string | null; annual_leave_entitlement: number | null;
  status: string | null; portal_enabled: boolean | null; phone: string | null;
}
interface LeaveRec { id: string; employee_id: string; leave_type: string; leave_start: string; leave_end: string; days: number; approval_status: string; notes: string | null; created_at: string }
interface AttRec { id: string; clock_in: string; clock_out: string | null; is_late: boolean; justified: boolean; location: string | null; correction_reason: string | null }
interface EmpRequest { id: string; request_type: string; details: string; status: string; manager_remarks: string | null; created_at: string }
interface Geofence { id: string; name: string; lat: number; lng: number; radius_m: number; active: boolean }

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-KW', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuwait' });
const todayKuwait = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const durationStr = (a: string, b: string | null) => {
  const mins = Math.floor(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
};

const STATUS_BADGE: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  Rejected: 'bg-rose-100 text-rose-600 border-rose-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};
const TYPE_BADGE: Record<string, string> = {
  Annual: 'bg-blue-100 text-blue-700 border-blue-200',
  Sick: 'bg-rose-100 text-rose-600 border-rose-200',
  WFH: 'bg-violet-100 text-violet-700 border-violet-200',
};

export default function MyPortalPage() {
  const { user, profile } = useAuth();
  const [emp, setEmp] = useState<EmpRecord | null>(null);
  const [leaves, setLeaves] = useState<LeaveRec[]>([]);
  const [requests, setRequests] = useState<EmpRequest[]>([]);
  const [todayRec, setTodayRec] = useState<AttRec | null>(null);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [workStart, setWorkStart] = useState('09:00');
  const [loading, setLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // forms
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [lvType, setLvType] = useState<'Annual' | 'Sick' | 'WFH'>('Annual');
  const [lvStart, setLvStart] = useState('');
  const [lvEnd, setLvEnd] = useState('');
  const [lvNotes, setLvNotes] = useState('');
  const [showReqForm, setShowReqForm] = useState<null | 'HR update' | 'Attendance correction'>(null);
  const [reqDetails, setReqDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) { setLoading(false); return; }
    const today = todayKuwait();
    const [empQ, geoQ, setQ, attQ, reqQ] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('geofences').select('*').eq('active', true),
      supabase.from('settings').select('work_start_time').single(),
      supabase.from('attendance_records').select('id, clock_in, clock_out, is_late, justified, location, correction_reason')
        .eq('user_id', user.id).gte('clock_in', `${today}T00:00:00+03:00`).lte('clock_in', `${today}T23:59:59+03:00`)
        .order('clock_in', { ascending: false }).limit(1),
      supabase.from('employee_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    // manual link only — the admin picks the account on the HR record (no name matching)
    const mine = ((empQ.data ?? []) as EmpRecord[]).find((e) => e.user_id === user.id) ?? null;
    setEmp(mine);
    setGeofences((geoQ.data as Geofence[]) ?? []);
    if (setQ.data?.work_start_time) setWorkStart(setQ.data.work_start_time);
    setTodayRec((attQ.data?.[0] as AttRec) ?? null);
    setRequests((reqQ.data as EmpRequest[]) ?? []);
    if (mine) {
      const { data: lv } = await supabase.from('leave_records').select('*').eq('employee_id', mine.id).order('created_at', { ascending: false });
      setLeaves((lv as LeaveRec[]) ?? []);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [user?.id]);

  // ── clock in / out (geofenced, same rules as before) ──
  async function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('GPS not supported on this device')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
    });
  }

  async function clockIn() {
    if (geofences.length === 0) { setGeoError('No store location configured. Ask your admin to add a geofence in Settings.'); return; }
    setGeoError(null); setGeoLoading(true);
    try {
      const pos = await getPosition();
      const { latitude, longitude } = pos.coords;
      let matched: Geofence | null = null;
      let nearest = { name: '', dist: Infinity };
      for (const f of geofences) {
        const d = haversineMeters(latitude, longitude, Number(f.lat), Number(f.lng));
        if (d < nearest.dist) nearest = { name: f.name, dist: d };
        if (d <= f.radius_m && (!matched || d < haversineMeters(latitude, longitude, Number(matched.lat), Number(matched.lng)))) matched = f;
      }
      if (!matched) {
        setGeoError(`You are ${Math.round(nearest.dist)}m from the nearest location (${nearest.name}). You must be on-site to clock in.`);
        setGeoLoading(false); return;
      }
      const now = new Date();
      const isLate = lateClassOf(now.toISOString(), workStart) !== 'On time';
      const { error } = await supabase.from('attendance_records').insert({
        user_id: user!.id, employee_name: profile!.full_name,
        clock_in: now.toISOString(), clock_in_lat: latitude, clock_in_lng: longitude,
        is_late: isLate, location: matched.name,
      });
      if (error) setGeoError(error.message); else await load();
    } catch (err: any) {
      if (err.code === 1) setGeoError('Location access denied. Please allow location in your browser settings and try again.');
      else if (err.code === 3) setGeoError('Location request timed out. Please try again.');
      else setGeoError(err.message ?? 'Unable to get location.');
    }
    setGeoLoading(false);
  }

  async function clockOut() {
    if (!todayRec) return;
    setGeoError(null); setGeoLoading(true);
    try {
      const pos = await getPosition();
      const { error } = await supabase.from('attendance_records').update({
        clock_out: new Date().toISOString(), clock_out_lat: pos.coords.latitude, clock_out_lng: pos.coords.longitude,
      }).eq('id', todayRec.id);
      if (error) setGeoError(error.message); else await load();
    } catch (err: any) {
      if (err.code === 1) setGeoError('Location access denied. Please allow location in your browser settings.');
      else setGeoError(err.message ?? 'Unable to get location.');
    }
    setGeoLoading(false);
  }

  // ── leave application ──
  const lvDays = useMemo(() => (lvStart && lvEnd && lvEnd >= lvStart ? workingDaysBetween(lvStart, lvEnd) : 0), [lvStart, lvEnd]);

  async function submitLeave() {
    if (!emp) return;
    if (!lvStart || !lvEnd || lvEnd < lvStart) { setMsg('Pick a valid start and end date'); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('leave_records').insert({
      employee_id: emp.id, leave_type: lvType, leave_start: lvStart, leave_end: lvEnd,
      days: lvDays, approval_status: 'Pending', notes: lvNotes || null,
    });
    setBusy(false);
    if (error) { setMsg(`Could not submit: ${error.message}`); return; }
    setMsg(`${lvType} request submitted — awaiting approval`);
    setShowLeaveForm(false); setLvStart(''); setLvEnd(''); setLvNotes('');
    load();
  }

  async function submitRequest() {
    if (!showReqForm || !reqDetails.trim()) { setMsg('Describe what you need'); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('employee_requests').insert({
      user_id: user!.id, employee_id: emp?.id ?? null, request_type: showReqForm, details: reqDetails.trim(),
    });
    setBusy(false);
    if (error) { setMsg(`Could not submit: ${error.message}`); return; }
    setMsg('Request submitted — HR/manager will review it');
    setShowReqForm(null); setReqDetails('');
    load();
  }

  // ── summaries ──
  const leaveSummary = useMemo(() => {
    const year = new Date().getFullYear();
    const inYear = (l: LeaveRec) => new Date(l.leave_start).getFullYear() === year;
    const annualTaken = leaves.filter((l) => l.leave_type === 'Annual' && l.approval_status === 'Approved' && inYear(l)).reduce((s, l) => s + Number(l.days), 0);
    const sickTaken = leaves.filter((l) => l.leave_type === 'Sick' && l.approval_status === 'Approved' && inYear(l)).reduce((s, l) => s + Number(l.days), 0);
    const pending = leaves.filter((l) => l.approval_status === 'Pending').length;
    const entitlement = Number(emp?.annual_leave_entitlement ?? 30);
    return { annualTaken, sickTaken, pending, entitlement, remaining: entitlement - annualTaken };
  }, [leaves, emp]);

  const allRequests = useMemo(() => [
    ...leaves.map((l) => ({
      id: `lv-${l.id}`, when: l.created_at,
      label: `${l.leave_type} leave · ${l.leave_start} → ${l.leave_end} (${l.days}d)`,
      type: l.leave_type, status: l.approval_status, remarks: l.notes,
    })),
    ...requests.map((r) => ({
      id: `rq-${r.id}`, when: r.created_at, label: `${r.request_type}: ${r.details}`,
      type: r.request_type, status: r.status, remarks: r.manager_remarks,
    })),
  ].sort((a, b) => (b.when ?? '').localeCompare(a.when ?? '')), [leaves, requests]);

  if (loading) return <Spinner />;

  const clockedIn = !!todayRec;
  const clockedOut = !!todayRec?.clock_out;
  const lateClass = todayRec ? lateClassOf(todayRec.clock_in, workStart) : null;
  const portalReady = !!emp && emp.portal_enabled !== false;

  const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div><div className="text-xs text-slate-400">{label}</div><div className="text-sm font-medium text-slate-700">{value ?? '—'}</div></div>
  );
  const input = 'px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white';

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Portal</h1>
        <p className="text-sm text-slate-500">Clock in, apply for leave, track your requests — visible only to you.</p>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border ${msg.startsWith('Could') || msg.startsWith('Pick') || msg.startsWith('Describe') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {msg}
        </div>
      )}

      {/* ── 1 · Today Attendance ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Clock size={18} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Today's Attendance</h2>
          {clockedIn && lateClass && (
            <Badge className={todayRec!.justified ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : LATE_STYLE[lateClass]}>
              {todayRec!.justified ? 'Justified' : lateClass}
            </Badge>
          )}
          {clockedIn && todayRec!.location && <span className="text-xs text-slate-400 flex items-center gap-1"><MapPin size={11} />{todayRec!.location}</span>}
          {!clockedIn && <Badge className="bg-slate-100 text-slate-500 border-slate-200">Not clocked in</Badge>}
        </div>

        {clockedIn && (
          <div className="grid grid-cols-3 gap-4 mb-5 text-center">
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Clock In</div><div className="font-semibold text-slate-800">{fmtTime(todayRec!.clock_in)}</div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Clock Out</div><div className="font-semibold text-slate-800">{todayRec!.clock_out ? fmtTime(todayRec!.clock_out) : <span className="text-amber-500">—</span>}</div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Duration</div><div className="font-semibold text-slate-800">{durationStr(todayRec!.clock_in, todayRec!.clock_out)}</div></div>
          </div>
        )}
        {clockedOut && isEarlyLeave(todayRec!.clock_out) && (
          <p className="mb-3 text-xs text-amber-600">Clock-out before 5:00 PM — counts as early leave unless approved.</p>
        )}
        {todayRec?.correction_reason && (
          <p className="mb-3 text-xs text-blue-600">Corrected by manager: {todayRec.correction_reason}</p>
        )}

        {geoError && (
          <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /><span>{geoError}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          {!clockedIn && (
            <button onClick={clockIn} disabled={geoLoading || geofences.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {geoLoading ? <Spinner /> : <LogIn size={18} />}{geoLoading ? 'Getting location…' : 'Clock In'}
            </button>
          )}
          {clockedIn && !clockedOut && (
            <button onClick={clockOut} disabled={geoLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {geoLoading ? <Spinner /> : <LogOut size={18} />}{geoLoading ? 'Getting location…' : 'Clock Out'}
            </button>
          )}
          {clockedIn && clockedOut && (
            <span className="flex items-center gap-2 text-emerald-600 font-medium"><CheckCircle size={18} /> Shift complete</span>
          )}
          <button onClick={() => { setShowReqForm(showReqForm === 'Attendance correction' ? null : 'Attendance correction'); setShowLeaveForm(false); }}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Pencil size={12} /> Request a correction</button>
        </div>

        {geofences.length > 0 && (
          <p className="mt-3 text-xs text-slate-400 flex items-center gap-1">
            <MapPin size={11} /> {geofences.length} location{geofences.length !== 1 ? 's' : ''}: {geofences.map((f) => f.name).join(', ')} · On time until {(() => { const [h, m] = workStart.split(':').map(Number); const t = h * 60 + m + 60; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })()}
          </p>
        )}
      </div>

      {/* ── 2/3 · My Leave + apply ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <CalendarDays size={16} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">My Leave — {new Date().getFullYear()}</h2>
          {portalReady && (
            <button onClick={() => { setShowLeaveForm((v) => !v); setShowReqForm(null); }}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700">
              <Plus size={13} /> Apply for Leave
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Entitlement</div><div className="font-bold text-slate-800">{leaveSummary.entitlement}</div></div>
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Annual taken</div><div className="font-bold text-slate-800">{leaveSummary.annualTaken}</div></div>
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Remaining</div><div className={`font-bold ${leaveSummary.remaining <= 5 ? 'text-amber-600' : 'text-emerald-700'}`}>{leaveSummary.remaining}</div></div>
          <div className="bg-slate-50 rounded-xl p-3"><div className="text-xs text-slate-400 mb-1">Sick taken</div><div className="font-bold text-slate-800">{leaveSummary.sickTaken}</div></div>
        </div>

        {showLeaveForm && (
          <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              <label className="text-xs"><span className="block text-slate-500 mb-1">Type</span>
                <select value={lvType} onChange={(e) => setLvType(e.target.value as typeof lvType)} className={`${input} w-full`}>
                  <option value="Annual">Annual leave</option>
                  <option value="Sick">Sick leave</option>
                  <option value="WFH">Work from home</option>
                </select>
              </label>
              <label className="text-xs"><span className="block text-slate-500 mb-1">Start</span>
                <input type="date" value={lvStart} onChange={(e) => setLvStart(e.target.value)} className={`${input} w-full`} /></label>
              <label className="text-xs"><span className="block text-slate-500 mb-1">End</span>
                <input type="date" value={lvEnd} onChange={(e) => setLvEnd(e.target.value)} className={`${input} w-full`} /></label>
              <div className="text-xs"><span className="block text-slate-500 mb-1">Working days</span>
                <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold">{lvDays || '—'}</div></div>
            </div>
            <textarea value={lvNotes} onChange={(e) => setLvNotes(e.target.value)} rows={2}
              placeholder={lvType === 'Sick' ? 'Reason — mention if you have a sick note document' : 'Reason / notes'}
              className={`${input} w-full resize-none mb-2`} />
            <div className="flex gap-2">
              <button onClick={submitLeave} disabled={busy}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium disabled:opacity-60">
                <Send size={12} /> {busy ? 'Submitting…' : 'Submit request'}
              </button>
              <button onClick={() => setShowLeaveForm(false)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
              {lvType === 'WFH' && <span className="text-xs text-slate-400 self-center">WFH does not reduce your leave balance.</span>}
            </div>
          </div>
        )}

        {!portalReady && (
          <p className="text-sm text-slate-400">
            {emp ? 'Portal access is switched off for your account — ask HR.' : "Your HR record isn't linked to this account yet. Ask the admin to link it in HR → Employees."}
          </p>
        )}
      </div>

      {/* ── request form (HR update / attendance correction) ── */}
      {showReqForm && (
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">{showReqForm === 'HR update' ? 'Request an update to my HR information' : 'Request an attendance correction'}</h2>
          <textarea value={reqDetails} onChange={(e) => setReqDetails(e.target.value)} rows={3} autoFocus
            placeholder={showReqForm === 'HR update' ? 'e.g. My phone number changed to 9xxxxxxx' : 'e.g. I forgot to clock out yesterday — I left at 5:30 PM'}
            className={`${input} w-full resize-none mb-2`} />
          <div className="flex gap-2">
            <button onClick={submitRequest} disabled={busy}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-60">
              <Send size={12} /> {busy ? 'Submitting…' : 'Send to manager'}
            </button>
            <button onClick={() => setShowReqForm(null)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
          </div>
        </div>
      )}

      {/* ── 4 · My Requests ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Inbox size={16} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">My Requests</h2>
          {leaveSummary.pending > 0 && <Badge className="bg-amber-100 text-amber-700 border-amber-200">{leaveSummary.pending} pending</Badge>}
        </div>
        {allRequests.length === 0 ? (
          <p className="text-sm text-slate-400">No requests yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {allRequests.slice(0, 15).map((r) => (
              <div key={r.id} className="py-2.5 flex items-start gap-2 text-sm flex-wrap">
                <Badge className={TYPE_BADGE[r.type] ?? 'bg-slate-100 text-slate-600 border-slate-200'}>{r.type}</Badge>
                <span className="flex-1 min-w-40 text-slate-600">{r.label}</span>
                <Badge className={STATUS_BADGE[r.status] ?? 'bg-slate-100 text-slate-500'}>{r.status}</Badge>
                {r.remarks && <span className="w-full text-xs text-slate-400 italic">↳ {r.remarks}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 5 · Personal & HR ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <UserRound size={16} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Personal & HR Information</h2>
          {portalReady && (
            <button onClick={() => { setShowReqForm(showReqForm === 'HR update' ? null : 'HR update'); setShowLeaveForm(false); }}
              className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:underline"><Pencil size={12} /> Request update</button>
          )}
        </div>
        {!emp ? (
          <p className="text-sm text-slate-400">Your HR record isn't linked to this account yet. Ask the admin to link it in HR → Employees.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Info label="Name" value={emp.full_name} />
            <Info label="Job title" value={emp.job_title} />
            <Info label="Location" value={emp.location} />
            <Info label="Civil ID" value={emp.civil_id} />
            <Info label="Phone" value={emp.phone} />
            <Info label="Joined" value={emp.joining_date} />
            <Info label="Residency expiry" value={emp.residency_expiry} />
            <Info label="Work permit expiry" value={emp.work_permit_expiry} />
            <Info label="Status" value={emp.status} />
          </div>
        )}
      </div>
    </div>
  );
}
