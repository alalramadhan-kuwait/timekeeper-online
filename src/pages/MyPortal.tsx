import { useEffect, useMemo, useState } from 'react';
import {
  UserRound, CalendarDays, Clock, LogIn, LogOut, MapPin, AlertCircle, CheckCircle, Home,
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
interface LeaveRec { id: string; employee_id: string; leave_type: string; leave_start: string; leave_end: string; days: number; approval_status: string; notes: string | null; created_at: string; document_url: string | null }
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
const kwDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const satOfWeek = (ymd: string) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7)); return d.toISOString().slice(0, 10); }; // Kuwait week starts Saturday
const hoursBetween = (a: string, b: string | null) => (b ? (new Date(b).getTime() - new Date(a).getTime()) / 3600000 : 0);
const durationStr = (a: string, b: string | null) => {
  const mins = Math.floor(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
};
// decimal hours → "32h 12m"; live/elapsed duration between two instants → "1h 11m"
const hm = (hours: number) => { const m = Math.max(0, Math.round(hours * 60)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
const fmtDur = (aIso: string, bIso: string | null, now: number) => {
  const mins = Math.max(0, Math.floor(((bIso ? new Date(bIso).getTime() : now) - new Date(aIso).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};
const fmtDate = (iso?: string | null) => (iso ? new Date(`${iso}`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' }) : '');
const dayLabel = (ymd?: string | null) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

// one consistent status system — dot + text (never colour alone)
const STATUS_STYLE: Record<string, { dot: string; cls: string }> = {
  Pending: { dot: 'bg-amber-500', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  Approved: { dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  Completed: { dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  Rejected: { dot: 'bg-rose-500', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  Cancelled: { dot: 'bg-slate-400', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};
const StatusPill = ({ s }: { s: string }) => {
  const st = STATUS_STYLE[s] ?? { dot: 'bg-slate-400', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${st.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden />{s}</span>;
};
const HrInfo = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div>
    <div className="text-xs text-slate-400 mb-1">{label}</div>
    <div className="text-sm font-medium text-slate-700 break-words">
      {value == null || value === '' ? <span className="text-slate-400 font-normal">Not provided</span> : value}
    </div>
  </div>
);
const SkeletonBand = ({ h }: { h: string }) => <div className={`bg-white rounded-2xl border border-slate-200 ${h} animate-pulse`} />;
function PortalSkeleton() {
  return (
    <div className="max-w-6xl space-y-5">
      <div className="h-12 w-56 bg-slate-100 rounded-lg animate-pulse" />
      <SkeletonBand h="h-56" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><SkeletonBand h="h-64" /><SkeletonBand h="h-64" /></div>
      <SkeletonBand h="h-40" />
    </div>
  );
}

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
  const [weekRecs, setWeekRecs] = useState<AttRec[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [workStart, setWorkStart] = useState('09:00');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [showAllReq, setShowAllReq] = useState(false);
  const [openReqId, setOpenReqId] = useState<string | null>(null);

  // tick every 30s so the live shift duration updates while clocked in
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30_000); return () => clearInterval(t); }, []);

  // forms
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [lvType, setLvType] = useState<'Annual' | 'Sick' | 'WFH'>('Annual');
  const [lvStart, setLvStart] = useState('');
  const [lvEnd, setLvEnd] = useState('');
  const [lvNotes, setLvNotes] = useState('');
  const [lvFile, setLvFile] = useState<File | null>(null);
  const [showReqForm, setShowReqForm] = useState<null | 'HR update' | 'Attendance correction'>(null);
  const [reqDetails, setReqDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) { setLoading(false); return; }
    setLoadError(false);
    try {
    const today = todayKuwait();
    const weekStart = satOfWeek(today);
    const [empQ, geoQ, setQ, attQ, reqQ, weekQ] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('geofences').select('*').eq('active', true),
      supabase.from('settings').select('work_start_time').single(),
      supabase.from('attendance_records').select('id, clock_in, clock_out, is_late, justified, location, correction_reason')
        .eq('user_id', user.id).gte('clock_in', `${today}T00:00:00+03:00`).lte('clock_in', `${today}T23:59:59+03:00`)
        .order('clock_in', { ascending: false }).limit(1),
      supabase.from('employee_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('attendance_records').select('clock_in, clock_out, is_late, justified')
        .eq('user_id', user.id).gte('clock_in', `${weekStart}T00:00:00+03:00`),
    ]);
    setWeekRecs((weekQ.data as AttRec[]) ?? []);
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
    } catch { setLoadError(true); }
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

    // sick-note document goes to the private leave-docs bucket (own folder)
    let documentPath: string | null = null;
    if (lvFile) {
      if (lvFile.size > 10 * 1024 * 1024) { setMsg('Could not submit: document is larger than 10 MB'); setBusy(false); return; }
      const safeName = lvFile.name.replace(/[^\w.\-]+/g, '_');
      const path = `${user!.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from('leave-docs').upload(path, lvFile);
      if (upErr) { setMsg(`Could not upload document: ${upErr.message}`); setBusy(false); return; }
      documentPath = path;
    }

    const { error } = await supabase.from('leave_records').insert({
      employee_id: emp.id, leave_type: lvType, leave_start: lvStart, leave_end: lvEnd,
      days: lvDays, approval_status: 'Pending', notes: lvNotes || null, document_url: documentPath,
    });
    setBusy(false);
    if (error) { setMsg(`Could not submit: ${error.message}`); return; }
    setMsg(`${lvType} request submitted — awaiting approval`);
    setShowLeaveForm(false); setLvStart(''); setLvEnd(''); setLvNotes(''); setLvFile(null);
    load();
  }

  async function openDocument(path: string) {
    const { data, error } = await supabase.storage.from('leave-docs').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { setMsg('Could not open document'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
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
      title: `${l.leave_type === 'WFH' ? 'WFH' : `${l.leave_type} leave`}${l.days ? ` — ${l.days} day${Number(l.days) > 1 ? 's' : ''}` : ''}`,
      subtitle: l.leave_start === l.leave_end ? l.leave_start : `${l.leave_start} → ${l.leave_end}`,
      type: l.leave_type, status: l.approval_status, remarks: l.notes, doc: l.document_url,
    })),
    ...requests.map((r) => ({
      id: `rq-${r.id}`, when: r.created_at,
      title: r.request_type, subtitle: r.details,
      type: r.request_type, status: r.status, remarks: r.manager_remarks, doc: null as string | null,
    })),
  ].sort((a, b) => (b.when ?? '').localeCompare(a.when ?? '')), [leaves, requests]);

  // is today an approved leave / WFH day? (drives the attendance banner)
  const todayLeave = useMemo(() => {
    const t = todayKuwait();
    return leaves.find((l) => l.approval_status === 'Approved' && l.leave_start <= t && l.leave_end >= t) ?? null;
  }, [leaves]);

  // this week's attendance summary (Kuwait week, Sat→now) — must stay above the early return (Rules of Hooks)
  const weekStats = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of weekRecs) byDay.set(kwDate(r.clock_in), (byDay.get(kwDate(r.clock_in)) ?? 0) + hoursBetween(r.clock_in, r.clock_out));
    const days = byDay.size;
    const hours = [...byDay.values()].reduce((s, h) => s + h, 0);
    const late = weekRecs.filter((r) => r.is_late && !r.justified).length;
    return { days, hours, onTime: Math.max(0, days - late), late };
  }, [weekRecs]);

  if (loading) return <PortalSkeleton />;
  if (loadError) return (
    <div className="max-w-6xl">
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
        <AlertCircle size={36} className="mx-auto text-rose-500 mb-3" />
        <div className="font-semibold text-slate-700">Your portal data couldn't be loaded</div>
        <button onClick={() => { setLoading(true); load(); }}
          className="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2">Try again</button>
      </div>
    </div>
  );

  const clockedIn = !!todayRec;
  const clockedOut = !!todayRec?.clock_out;
  const lateClass = todayRec ? lateClassOf(todayRec.clock_in, workStart) : null;
  const lateLabel = lateClass && lateClass !== 'On time' && !todayRec?.justified ? lateClass : null;
  const portalReady = !!emp && emp.portal_enabled !== false;
  const onPaidLeaveToday = !!todayLeave && todayLeave.leave_type !== 'WFH';
  const wfhToday = todayLeave?.leave_type === 'WFH';
  const input = 'px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';

  // header status line
  const headerStatus = onPaidLeaveToday ? `On ${todayLeave!.leave_type.toLowerCase()} leave today`
    : wfhToday ? 'Working from home today'
    : clockedIn && !clockedOut ? `Clocked in since ${fmtTime(todayRec!.clock_in)}${lateLabel ? ` · ${lateLabel}` : ''}`
    : clockedOut ? `Clocked out · ${fmtTime(todayRec!.clock_out!)}`
    : 'Not clocked in';
  const headerDot = onPaidLeaveToday ? 'bg-sky-500' : wfhToday ? 'bg-violet-500' : clockedIn && !clockedOut ? (lateLabel ? 'bg-amber-500' : 'bg-emerald-500') : clockedOut ? 'bg-slate-400' : 'bg-slate-300';

  // on time until = work start + 1h grace
  const graceEnd = (() => { const [h, m] = workStart.split(':').map(Number); const t = h * 60 + m + 60; const hr = Math.floor(t / 60), mn = t % 60; const ap = hr >= 12 ? 'PM' : 'AM'; return `${((hr + 11) % 12) + 1}:${String(mn).padStart(2, '0')} ${ap}`; })();

  const entitlement = leaveSummary.entitlement;
  const usedPct = entitlement > 0 ? Math.min(100, Math.round((leaveSummary.annualTaken / entitlement) * 100)) : 0;
  const shownRequests = showAllReq ? allRequests.slice(0, 20) : allRequests.slice(0, 4);

  const clockBusy = geoLoading;
  const btnFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

  return (
    <div className="max-w-6xl space-y-5">
      {/* ── Band 1 · Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Portal</h1>
        <p className="mt-1 text-sm text-slate-500 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${headerDot}`} aria-hidden />{headerStatus}
        </p>
      </div>

      {msg && (
        <div role="status" className={`px-4 py-2.5 rounded-lg text-sm border ${msg.startsWith('Could') || msg.startsWith('Pick') || msg.startsWith('Describe') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {msg}
        </div>
      )}

      {/* ── Band 2 · Today's Attendance (strongest priority) ── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Today's Attendance</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <span>{emp?.location ?? todayRec?.location ?? 'Timekeeper HQ'}</span>
              {lateLabel && <><span className="text-slate-300" aria-hidden>·</span><span className="inline-flex items-center gap-1.5 text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />{lateLabel}</span></>}
              {todayRec?.justified && <><span className="text-slate-300" aria-hidden>·</span><span className="text-emerald-600">Justified</span></>}
            </div>
          </div>
          {/* only the current valid action, strongest button on the page */}
          <div className="shrink-0">
            {clockedOut ? (
              <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold"><CheckCircle size={18} aria-hidden /> Completed · {fmtDur(todayRec!.clock_in, todayRec!.clock_out, nowMs)}</span>
            ) : onPaidLeaveToday ? (
              <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 font-semibold">On {todayLeave!.leave_type.toLowerCase()} leave</span>
            ) : !clockedIn ? (
              <button onClick={clockIn} disabled={clockBusy || geofences.length === 0}
                className={`inline-flex items-center gap-2 px-7 py-3.5 min-h-[52px] rounded-xl bg-emerald-600 text-white text-base font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors ${btnFocus} focus-visible:ring-emerald-400`}>
                {clockBusy ? <Spinner /> : <LogIn size={20} aria-hidden />}{clockBusy ? 'Getting location…' : 'Clock In'}
              </button>
            ) : (
              <button onClick={clockOut} disabled={clockBusy}
                className={`inline-flex items-center gap-2 px-7 py-3.5 min-h-[52px] rounded-xl bg-slate-900 text-white text-base font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors ${btnFocus} focus-visible:ring-slate-400`}>
                {clockBusy ? <Spinner /> : <LogOut size={20} aria-hidden />}{clockBusy ? 'Getting location…' : 'Clock Out'}
              </button>
            )}
          </div>
        </div>

        {/* Weekly summary — plain values, hours are hours and days are days */}
        <dl className="mt-5 grid grid-cols-3 gap-4 border-y border-slate-100 py-4">
          <div><dt className="text-xs text-slate-400 uppercase tracking-wide">This week</dt><dd className="mt-1 text-xl font-bold text-slate-800">{hm(weekStats.hours)}</dd></div>
          <div><dt className="text-xs text-slate-400 uppercase tracking-wide">Days present</dt><dd className="mt-1 text-xl font-bold text-slate-800">{weekStats.days} {weekStats.days === 1 ? 'day' : 'days'}</dd></div>
          <div><dt className="text-xs text-slate-400 uppercase tracking-wide">On time</dt><dd className="mt-1 text-xl font-bold text-slate-800">{weekStats.onTime} {weekStats.onTime === 1 ? 'day' : 'days'}</dd></div>
        </dl>

        {/* Today's punch — one horizontal strip */}
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold text-slate-400 uppercase">In</span><span className="text-base font-semibold text-slate-800">{clockedIn ? fmtTime(todayRec!.clock_in) : '—'}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold text-slate-400 uppercase">Out</span><span className="text-base font-semibold text-slate-800">{clockedOut ? fmtTime(todayRec!.clock_out!) : '—'}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold text-slate-400 uppercase">Duration</span><span className="text-base font-semibold text-slate-800">{clockedIn ? fmtDur(todayRec!.clock_in, todayRec!.clock_out, nowMs) : '—'}</span></div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-slate-400">Expected by {graceEnd}</span>
          {clockedOut && isEarlyLeave(todayRec!.clock_out) && <span className="text-amber-600">Clock-out before 5:00 PM — counts as early leave unless approved.</span>}
          {todayRec?.correction_reason && <span className="text-blue-600">Corrected by manager: {todayRec.correction_reason}</span>}
        </div>

        {geoError && (
          <div role="alert" className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden /><span>{geoError}</span>
          </div>
        )}

        {!clockedOut && !onPaidLeaveToday && (
          <div className="mt-3">
            <button onClick={() => { setShowReqForm(showReqForm === 'Attendance correction' ? null : 'Attendance correction'); setShowLeaveForm(false); }}
              className={`inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 rounded ${btnFocus} focus-visible:ring-slate-300`}>
              <Pencil size={13} aria-hidden /> Request a correction →
            </button>
          </div>
        )}
      </section>

      {/* ── request form (HR update / attendance correction) — full width ── */}
      {showReqForm && (
        <section className="bg-white rounded-2xl border border-blue-200 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">{showReqForm === 'HR update' ? 'Request an update to my HR information' : 'Request an attendance correction'}</h2>
          <textarea value={reqDetails} onChange={(e) => setReqDetails(e.target.value)} rows={3} autoFocus
            placeholder={showReqForm === 'HR update' ? 'e.g. My phone number changed to 9xxxxxxx' : 'e.g. I forgot to clock out yesterday — I left at 5:30 PM'}
            className={`${input} w-full resize-none mb-2`} />
          <div className="flex gap-2">
            <button onClick={submitRequest} disabled={busy}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-60 ${btnFocus} focus-visible:ring-blue-400`}>
              <Send size={13} aria-hidden /> {busy ? 'Submitting…' : 'Send to manager'}
            </button>
            <button onClick={() => setShowReqForm(null)} aria-label="Cancel request" className={`p-2 text-slate-400 hover:text-slate-600 rounded ${btnFocus} focus-visible:ring-slate-300`}><X size={16} /></button>
          </div>
        </section>
      )}

      {/* ── Band 3 · My Leave (3A) + My Requests (3B), 50/50 on desktop ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* 3A · My Leave */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold text-slate-800">My Leave</h2>
            {portalReady && (
              <button onClick={() => { setShowLeaveForm((v) => !v); setLvType('Annual'); setShowReqForm(null); }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 ${btnFocus} focus-visible:ring-slate-300`}>
                <Plus size={15} aria-hidden /> Apply for Leave
              </button>
            )}
          </div>

          {!portalReady ? (
            <p className="text-sm text-slate-400">
              {emp ? 'Portal access is switched off for your account — ask HR.' : "Your HR record isn't linked to this account yet. Ask the admin to link it in HR → Employees."}
            </p>
          ) : (
            <>
              {/* primary — annual */}
              <div className="text-sm font-medium text-slate-500">Annual Leave</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-4xl font-bold leading-none ${leaveSummary.remaining <= 5 ? 'text-amber-600' : 'text-slate-900'}`}>{leaveSummary.remaining}</span>
                <span className="text-sm text-slate-500">days remaining</span>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1"><span>{leaveSummary.annualTaken} of {entitlement} used</span><span>{usedPct}%</span></div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={leaveSummary.annualTaken} aria-valuemin={0} aria-valuemax={entitlement} aria-label="Annual leave used">
                  <div className={`h-full rounded-full ${leaveSummary.remaining <= 5 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usedPct}%` }} />
                </div>
              </div>

              {/* secondary — sick, visually separated */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="text-sm font-medium text-slate-500">Sick Leave</div>
                <div className="mt-0.5 text-slate-800"><span className="text-lg font-semibold">{leaveSummary.sickTaken}</span> <span className="text-sm text-slate-500">{leaveSummary.sickTaken === 1 ? 'day' : 'days'} taken</span></div>
              </div>

              {showLeaveForm && (
                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
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
                      <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold">{lvDays || '—'}</div></div>
                  </div>
                  <textarea value={lvNotes} onChange={(e) => setLvNotes(e.target.value)} rows={2} placeholder="Reason / notes" className={`${input} w-full resize-none mb-2`} />
                  {lvType === 'Sick' && (
                    <label className="block text-xs mb-2">
                      <span className="block text-slate-500 mb-1">Sick note document (photo or PDF, optional)</span>
                      <input type="file" accept="image/*,application/pdf" onChange={(e) => setLvFile(e.target.files?.[0] ?? null)}
                        className="block text-sm text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:text-xs file:font-medium hover:file:bg-slate-700" />
                      {lvFile && <span className="text-slate-400">Attached: {lvFile.name}</span>}
                    </label>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={submitLeave} disabled={busy}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-60 ${btnFocus} focus-visible:ring-slate-400`}>
                      <Send size={13} aria-hidden /> {busy ? 'Submitting…' : 'Submit request'}
                    </button>
                    <button onClick={() => setShowLeaveForm(false)} aria-label="Cancel" className={`p-2 text-slate-400 hover:text-slate-600 rounded ${btnFocus} focus-visible:ring-slate-300`}><X size={16} /></button>
                    {lvType === 'WFH' && <span className="text-xs text-slate-400">WFH does not reduce your leave balance.</span>}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* 3B · My Requests */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="text-base font-semibold text-slate-800">My Requests</h2>
            <div className="flex items-center gap-3">
              {portalReady && (
                <button onClick={() => {
                  const t = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
                  setLvType('WFH'); setLvStart(t); setLvEnd(t); setShowLeaveForm(true); setShowReqForm(null);
                }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 ${btnFocus} focus-visible:ring-slate-300`}>
                  <Home size={15} aria-hidden /> Request WFH
                </button>
              )}
              {allRequests.length > 4 && (
                <button onClick={() => setShowAllReq((v) => !v)} className={`text-sm text-slate-500 hover:text-slate-800 rounded ${btnFocus} focus-visible:ring-slate-300`}>{showAllReq ? 'Show less' : 'View all →'}</button>
              )}
            </div>
          </div>

          {allRequests.length === 0 ? (
            <div className="py-6 text-center"><div className="text-sm font-medium text-slate-600">No requests yet</div><div className="text-xs text-slate-400 mt-0.5">Leave, WFH and correction requests will appear here.</div></div>
          ) : (
            <ul className="divide-y divide-slate-100 -mx-1">
              {shownRequests.map((r) => {
                const open = openReqId === r.id;
                return (
                  <li key={r.id}>
                    <div role="button" tabIndex={0}
                      onClick={() => setOpenReqId(open ? null : r.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenReqId(open ? null : r.id); } }}
                      className={`px-1 py-3 cursor-pointer rounded-lg hover:bg-slate-50 ${btnFocus} focus-visible:ring-slate-300`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-800">{r.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{fmtDate(r.when)}</div>
                          {r.subtitle && <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{r.subtitle}</div>}
                        </div>
                        <StatusPill s={r.status} />
                      </div>
                      {open && (r.remarks || r.doc) && (
                        <div className="mt-2 pl-0.5 text-xs text-slate-500 space-y-1">
                          {r.remarks && <p className="italic">↳ {r.remarks}</p>}
                          {r.doc && <button onClick={(e) => { e.stopPropagation(); openDocument(r.doc!); }} className={`text-blue-600 hover:underline rounded ${btnFocus} focus-visible:ring-blue-300`}>📎 View document</button>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ── Band 4 · Personal & HR Information (full width) ── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-800">Personal & HR Information</h2>
          {portalReady && (
            <button onClick={() => { setShowReqForm(showReqForm === 'HR update' ? null : 'HR update'); setShowLeaveForm(false); }}
              className={`text-sm text-slate-500 hover:text-slate-800 rounded ${btnFocus} focus-visible:ring-slate-300`}>Request update →</button>
          )}
        </div>
        {!emp ? (
          <p className="text-sm text-slate-400">Your HR record isn't linked to this account yet. Ask the admin to link it in HR → Employees.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
            <HrInfo label="Civil ID" value={emp.civil_id} />
            <HrInfo label="Department / Location" value={emp.location} />
            <HrInfo label="Phone" value={emp.phone} />
            <HrInfo label="Work Permit Expiry" value={dayLabel(emp.work_permit_expiry)} />
            <HrInfo label="Job Title" value={emp.job_title} />
            <HrInfo label="Residency Expiry" value={dayLabel(emp.residency_expiry)} />
            <HrInfo label="Email" value={user?.email} />
            <HrInfo label="Joined" value={dayLabel(emp.joining_date)} />
          </div>
        )}
      </section>
    </div>
  );
}
