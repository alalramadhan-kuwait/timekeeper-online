import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MyRequests from '../components/MyRequests';
import AskForSchedule from '../components/AskForSchedule';
import {
  UserRound, CalendarDays, Clock, LogIn, LogOut, MapPin, AlertCircle, CheckCircle, Home,
  Plus, Send, X, Inbox, Pencil,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { locationBlockedMessage, locationAlreadyDenied, CORRECTION_FALLBACK } from '../lib/locationHelp';
import { useAuth } from '../context/AuthContext';
import { Spinner, Badge } from '../components/ui';
import { workingDaysBetween } from './Leave';
import { lateClassOf, isEarlyLeave, LATE_STYLE } from '../lib/lateness';
import { Bell } from 'lucide-react';
import { pushSupported, pushEnabled, enablePush, isIosNotInstalled } from '../lib/push';
import { dayHours, totalHours, type DayHours } from '../shared/workedHours';
import {
  fencesNear, clockIn as portalClockIn, clockOut as portalClockOut,
  applyForLeave, reviseLeave, cancelLeave as portalCancelLeave, leaveDocumentUrl,
  planCorrection, requestCorrection, submitRequest as portalSubmitRequest,
} from '../shared/portal';
import { useLive } from '../shared/live';

interface EmpRecord {
  id: string; full_name: string; user_id: string | null; job_title: string | null; location: string | null;
  civil_id: string | null; passport_number: string | null; residency_expiry: string | null;
  work_permit_expiry: string | null; joining_date: string | null; annual_leave_entitlement: number | null;
  status: string | null; portal_enabled: boolean | null; phone: string | null;
  /** Mirrors whichever dated schedule is in force today. */
  shift_start: string | null; shift_end: string | null;
}
interface LeaveRec { id: string; employee_id: string; leave_type: string; leave_start: string; leave_end: string; days: number; approval_status: string; manager_status?: string; notes: string | null; created_at: string; document_url: string | null }
interface AttRec { id: string; clock_in: string; clock_out: string | null; is_late: boolean; justified: boolean; location: string | null; correction_reason: string | null }
interface EmpRequest { id: string; request_type: string; details: string; status: string; manager_remarks: string | null; created_at: string }
interface Geofence { id: string; name: string; lat: number; lng: number; radius_m: number; active: boolean }

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-KW', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuwait' });
const todayKuwait = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
/** A Kuwait wall-clock time on a day, as an instant. Kuwait is UTC+3 all year. */
const kuwaitISO = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`).toISOString();
const kuwaitHM = (iso: string) => new Intl.DateTimeFormat('en-GB',
  { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const kwDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const satOfWeek = (ymd: string) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7)); return d.toISOString().slice(0, 10); }; // Kuwait week starts Saturday
const durationStr = (a: string, b: string | null) => {
  const mins = Math.floor(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
};
// decimal hours → "32h 12m"; live/elapsed duration between two instants → "1h 11m"
const hm = (hours: number) => { const m = Math.max(0, Math.round(hours * 60)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
/** A span of milliseconds as "7h 45m" — a day can be several shifts added up. */
const fmtHrs = (ms: number) => {
  const mins = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};
const fmtDur = (aIso: string, bIso: string | null, now: number) => {
  const mins = Math.max(0, Math.floor(((bIso ? new Date(bIso).getTime() : now) - new Date(aIso).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
};
const fmtDate = (iso?: string | null) => (iso ? new Date(`${iso}`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' }) : '');
// minutes-since-midnight of an instant in Kuwait time (for lateness maths)
const kwMinutes = (iso: string) => { const [h, m] = new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kuwait' }).split(':').map(Number); return h * 60 + m; };
const STANDARD_DAY_HOURS = 8; // expected hours per working day

/** A month of records folded into one entry per Kuwait day, hours and all. */
const groupByDay = (records: Array<{ clock_in: string; clock_out: string | null }>) => {
  const raw = new Map<string, Array<{ clockIn: string; clockOut: string | null }>>();
  for (const r of records) {
    const d = kwDate(r.clock_in);
    if (!raw.has(d)) raw.set(d, []);
    raw.get(d)!.push({ clockIn: r.clock_in, clockOut: r.clock_out });
  }
  const out = new Map<string, DayHours>();
  for (const [d, shifts] of raw) out.set(d, dayHours(shifts));
  return out;
};
const dayLabel = (ymd?: string | null) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const weekdayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kuwait' });
const monthLabel = (ym: string) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShift = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

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
  const { user, profile, role } = useAuth();
  const [emp, setEmp] = useState<EmpRecord | null>(null);
  const [leaves, setLeaves] = useState<LeaveRec[]>([]);
  const [requests, setRequests] = useState<EmpRequest[]>([]);
  // Every clock-in for today, oldest first: a day can be worked in more than
  // one shift, so this page works from the list rather than from "the" record.
  const [todayRecs, setTodayRecs] = useState<AttRec[]>([]);
  const [monthRecs, setMonthRecs] = useState<AttRec[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  // How vague a GPS fix may be and still count as proof of being on site.
  const [maxAccuracy, setMaxAccuracy] = useState(200);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [showAllReq, setShowAllReq] = useState(false);
  const [openReqId, setOpenReqId] = useState<string | null>(null);
  const [editLeaveId, setEditLeaveId] = useState<string | null>(null); // raw leave id being edited
  const [edStart, setEdStart] = useState('');
  const [edEnd, setEdEnd] = useState('');
  const [pushState, setPushState] = useState<'unknown' | 'on' | 'off' | 'unsupported' | 'ios'>('unknown');
  useEffect(() => {
    if (!pushSupported()) { setPushState('unsupported'); return; }
    if (isIosNotInstalled()) { setPushState('ios'); return; }
    pushEnabled().then((on) => setPushState(on ? 'on' : 'off'));
  }, []);
  async function handleEnablePush() {
    setMsg(null);
    const r = await enablePush();
    if (r.ok) { setPushState('on'); setMsg('Notifications enabled on this device'); }
    else setMsg(r.error ?? 'Could not enable notifications');
  }

  const [showHistory, setShowHistory] = useState(false);
  const [histMonth, setHistMonth] = useState(() => todayKuwait().slice(0, 7)); // yyyy-MM
  const [histRecs, setHistRecs] = useState<AttRec[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // lazily load a month of the employee's own attendance when the history panel is open
  useEffect(() => {
    if (!showHistory || !user) return;
    setHistLoading(true);
    const [y, m] = histMonth.split('-').map(Number);
    const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    supabase.from('attendance_records')
      .select('id, clock_in, clock_out, is_late, justified, location, correction_reason')
      .eq('user_id', user.id)
      .gte('clock_in', `${histMonth}-01T00:00:00+03:00`)
      .lt('clock_in', `${nextMonth}T00:00:00+03:00`)
      .order('clock_in', { ascending: false })
      .then(({ data }) => { setHistRecs((data as AttRec[]) ?? []); setHistLoading(false); });
  }, [showHistory, histMonth, user?.id]);

  // tick every 30s so the live shift duration updates while clocked in
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30_000); return () => clearInterval(t); }, []);

  // forms
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [lvType, setLvType] = useState<'Annual' | 'Sick' | 'WFH'>('Annual');
  /* Working from home is not a thing a shop floor can do: the job is being in
     the shop with the customers. Offering it to a salesperson invites a request
     that can only ever be refused. Head office keeps it. Same rule as the DSR
     portal — the same people use both. */
  const canWorkFromHome = !(role === 'sales' || role === 'staff');
  const [lvStart, setLvStart] = useState('');
  const [lvEnd, setLvEnd] = useState('');
  const [lvNotes, setLvNotes] = useState('');
  const [lvFile, setLvFile] = useState<File | null>(null);
  const [showReqForm, setShowReqForm] = useState<null | 'HR update' | 'Attendance correction'>(null);
  /* The minute a clock-out could not confirm a location, offered to the
     correction form as a quick fill — the app knows the moment exactly, so it
     should offer it rather than leave somebody guessing. */
  const [lastFailedClockOut, setLastFailedClockOut] = useState<string | null>(null);
  /* Same shape as the DSR's portal: a correction names the day and the times,
     because approving it writes them onto the record. */
  const [corDate, setCorDate] = useState(() => todayKuwait());
  const [corIn, setCorIn] = useState('');
  const [corOut, setCorOut] = useState('');
  const [corExisting, setCorExisting] = useState<AttRec[] | null>(null);
  /** Which shift is being corrected. Asked when a day has more than one, so an
   *  evening departure is not attached to the morning's record. */
  const [corRecordId, setCorRecordId] = useState<string | null>(null);
  const [corNextDay, setCorNextDay] = useState(false);
  const [corLoading, setCorLoading] = useState(false);
  const [reqDetails, setReqDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) { setLoading(false); return; }
    setLoadError(false);
    try {
    const today = todayKuwait();
    const monthStart = `${today.slice(0, 7)}-01`;
    const [empQ, geoQ, setQ, attQ, reqQ, monthQ] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('geofences').select('*').eq('active', true),
      supabase.from('settings').select('work_start_time, work_end_time, geo_max_accuracy_m').single(),
      supabase.from('attendance_records').select('id, clock_in, clock_out, is_late, justified, location, correction_reason')
        .eq('user_id', user.id).gte('clock_in', `${today}T00:00:00+03:00`).lte('clock_in', `${today}T23:59:59+03:00`)
        .order('clock_in', { ascending: true }),
      supabase.from('employee_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('attendance_records').select('clock_in, clock_out, is_late, justified')
        .eq('user_id', user.id).gte('clock_in', `${monthStart}T00:00:00+03:00`),
    ]);
    setMonthRecs((monthQ.data as AttRec[]) ?? []);
    // manual link only — the admin picks the account on the HR record (no name matching)
    const mine = ((empQ.data ?? []) as EmpRecord[]).find((e) => e.user_id === user.id) ?? null;
    setEmp(mine);
    setGeofences((geoQ.data as Geofence[]) ?? []);
    if (setQ.data?.work_start_time) setWorkStart(setQ.data.work_start_time);
    if (setQ.data?.work_end_time) setWorkEnd(setQ.data.work_end_time);
    if (setQ.data?.geo_max_accuracy_m) setMaxAccuracy(Number(setQ.data.geo_max_accuracy_m));
    setTodayRecs((attQ.data as AttRec[]) ?? []);
    setRequests((reqQ.data as EmpRequest[]) ?? []);
    if (mine) {
      const { data: lv } = await supabase.from('leave_records').select('*').eq('employee_id', mine.id).order('created_at', { ascending: false });
      setLeaves((lv as LeaveRec[]) ?? []);
    }
    } catch { setLoadError(true); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [user?.id]);

  /* Their own day, kept current: a correction approved by HR or a shift closed
     from another device shows up without them reloading the page. RLS means
     only their own rows reach this subscription. */
  useLive('my-portal', [
    { table: 'attendance_records', filter: user ? `user_id=eq.${user.id}` : undefined },
    { table: 'employee_requests', filter: user ? `user_id=eq.${user.id}` : undefined },
    { table: 'leave_records' },
  ], () => { void load(); }, { enabled: !!user });

  // ── clock in / out ──
  // The checks below are the courteous half: they explain the problem before a
  // request is sent. The binding half runs in the database (trigger
  // attendance_geofence_gate), which re-measures every clock-in against the
  // geofences — so a tampered page, an old tab or a hand-made request is
  // refused there even when this code is skipped entirely.

  /**
   * The first fix a phone hands back is usually the cached wifi/cell guess —
   * hundreds of metres wide, and wide enough to "place" someone at the shop
   * from the next block. So watch for a few seconds and keep the sharpest fix,
   * stopping as soon as one is tight enough to mean anything.
   */
  async function getPosition(): Promise<GeolocationPosition> {
    const GOOD_ENOUGH_M = 30;
    const WAIT_MS = 10_000;
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('GPS not supported on this device')); return; }
      let best: GeolocationPosition | null = null;
      let done = false;
      const finish = (fn: () => void) => { if (done) return; done = true; navigator.geolocation.clearWatch(watch); clearTimeout(timer); fn(); };
      const watch = navigator.geolocation.watchPosition(
        (pos) => {
          if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
          if (best.coords.accuracy <= GOOD_ENOUGH_M) finish(() => resolve(best!));
        },
        (err) => { if (!best) finish(() => reject(err)); },
        { enableHighAccuracy: true, timeout: WAIT_MS, maximumAge: 0 },
      );
      const timer = setTimeout(() => {
        finish(() => (best ? resolve(best) : reject(Object.assign(new Error('Location request timed out. Please try again.'), { code: 3 }))));
      }, WAIT_MS);
    });
  }

  async function clockIn() {
    if (geofences.length === 0) { setGeoError('No store location configured. Ask your admin to add a geofence in Settings.'); return; }
    setGeoError(null); setGeoLoading(true);
    try {
      const pos = await getPosition();
      const { latitude, longitude, accuracy } = pos.coords;
      if (accuracy > maxAccuracy) {
        setGeoError(`Your phone only placed you within ${Math.round(accuracy)}m — too vague to show you are on site. Turn on precise location and wifi, step near a window or door, and try again.`);
        setGeoLoading(false); return;
      }
      const near = fencesNear(geofences, { latitude, longitude, accuracy });
      const matched = near.find((n) => n.inside)?.fence ?? null;
      if (!matched) {
        /* Every workplace, not just the closest. Naming one place makes it read
           like the account is tied to that place, which is not the rule: you
           may clock in at whichever site you are standing in. */
        const all = near.map((n) => `${n.fence.name} ${Math.round(n.metres)}m`).join(', ');
        setGeoError(`You are not at any workplace, so there is nothing to clock in to. You can clock in at whichever one you are standing in — right now you are ${all} away.`);
        setGeoLoading(false); return;
      }
      const now = new Date();
      // Lateness belongs to the clock-in that opened the day; an evening shift
      // starting after the morning one is not late.
      const isLate = todayRecs.length === 0 && lateClassOf(now.toISOString(), workStart) !== 'On time';
      const err = await portalClockIn({
        userId: user!.id, employeeName: profile!.full_name, fenceName: matched.name,
        position: { latitude, longitude, accuracy }, isLate,
      });
      if (err) setGeoError(err); else await load();
    } catch (err: any) {
      if (err.code === 1) setGeoError(`${locationBlockedMessage()}\n${CORRECTION_FALLBACK}`);
      else if (err.code === 3) setGeoError('Location request timed out. Please try again.');
      else setGeoError(err.message ?? 'Unable to get location.');
    }
    setGeoLoading(false);
  }

  /**
   * Close the shift, with or without a location.
   *
   * A clock-out has never needed one — there is no geofence test on leaving,
   * only a flag — so refusing to write without a GPS fix enforced a rule that
   * does not exist and left the day open instead. Ten shifts were open when
   * this was written, the oldest for six weeks, because the only way out was a
   * correction request somebody had to remember to make and a manager had to
   * remember to approve.
   *
   * The leaving time is what matters and the phone knows it. Where they were
   * is a second question, and "we could not confirm it" is a better answer to
   * that than a day that never ended.
   */
  async function clockOut() {
    const open = todayRecs.find(r => !r.clock_out);
    if (!open) return;
    setGeoError(null); setGeoLoading(true);
    let where: { latitude: number; longitude: number; accuracy: number } | null = null;
    let why: string | null = null;
    try {
      const pos = await getPosition();
      where = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
    } catch (err: any) {
      why = err?.code === 1 ? locationBlockedMessage('clock out')
          : err?.code === 3 ? 'Your phone took too long to find you.'
          : err?.message ?? 'Your phone could not say where you are.';
    }
    const problem = await portalClockOut(open.id, where);
    if (problem) setGeoError(problem);
    else {
      // Said plainly, so nobody discovers weeks later that it was recorded as unconfirmed.
      if (why) setGeoError(`Clocked out. ${why}\nYour leaving time is recorded; your manager will see that the location could not be confirmed.`);
      setLastFailedClockOut(why ? kuwaitHM(new Date().toISOString()) : null);
      await load();
    }
    setGeoLoading(false);
  }

  /* What the form is actually asking for, decided by the shared rule the
     request itself will use — so the button, the warning and the submitted
     request can never disagree. */
  const corRecord = useMemo(
    () => corExisting?.find((r) => r.id === corRecordId) ?? corExisting?.[0] ?? null,
    [corExisting, corRecordId]);
  const corPlan = useMemo(() => planCorrection({
    date: corDate, arrivedAt: corIn, leftAt: corOut, leftNextDay: corNextDay,
    reason: reqDetails,
    record: corRecord && { id: corRecord.id, clock_in: corRecord.clock_in, clock_out: corRecord.clock_out },
  }), [corDate, corIn, corOut, corNextDay, reqDetails, corRecord]);

  // ── leave application ──
  /* Their own shift end if HR has set one, otherwise the shop default. Telling
     somebody who finishes at 15:30 that they left early at 15:30 every day is
     how a warning stops being read. */
  const myShiftEnd = emp?.shift_end?.slice(0, 5) ?? workEnd;

  const lvDays = useMemo(() => (lvStart && lvEnd && lvEnd >= lvStart ? workingDaysBetween(lvStart, lvEnd) : 0), [lvStart, lvEnd]);

  async function submitLeave() {
    if (!emp) return;
    if (!lvStart || !lvEnd || lvEnd < lvStart) { setMsg('Pick a valid start and end date'); return; }
    setBusy(true); setMsg(null);
    // the sick note goes to the private leave-docs bucket, in their own folder
    const problem = await applyForLeave({
      employeeId: emp.id, userId: user!.id, type: lvType, start: lvStart, end: lvEnd,
      days: lvDays, notes: lvNotes, document: lvFile,
    });
    setBusy(false);
    if (problem) { setMsg(problem); return; }
    setMsg(`${lvType} request submitted — awaiting approval`);
    setShowLeaveForm(false); setLvStart(''); setLvEnd(''); setLvNotes(''); setLvFile(null);
    load();
  }

  async function openDocument(path: string) {
    const url = await leaveDocumentUrl(path);
    if (!url) { setMsg('Could not open document'); return; }
    window.open(url, '_blank', 'noopener');
  }

  /* Both kinds of request go through the shared layer now. The correction's
     rule — what is actually being asked for — is planCorrection, the same one
     the form has been describing as they typed, so the request cannot say
     something different from the button they pressed. */
  async function submitRequest() {
    if (!showReqForm) return;
    setBusy(true); setMsg(null);
    const problem = showReqForm === 'Attendance correction'
      ? await requestCorrection({
          userId: user!.id, employeeId: emp?.id ?? null,
          date: corDate, arrivedAt: corIn, leftAt: corOut, leftNextDay: corNextDay,
          reason: reqDetails,
          record: corRecord && { id: corRecord.id, clock_in: corRecord.clock_in, clock_out: corRecord.clock_out },
        })
      : await portalSubmitRequest(user!.id, emp?.id ?? null, showReqForm, reqDetails);
    setBusy(false);
    if (problem) { setMsg(problem); return; }
    setMsg('Request submitted — HR/manager will review it');
    setShowReqForm(null); setReqDetails(''); setCorIn(''); setCorOut(''); setCorExisting(null);
    setCorRecordId(null); setCorNextDay(false); setCorDate(todayKuwait());
    load();
  }

  /* If the browser has already refused location, say so before the button is
     tapped rather than after. */
  useEffect(() => {
    let live = true;
    void locationAlreadyDenied().then((denied) => {
      if (live && denied) setGeoError(`${locationBlockedMessage()}\n${CORRECTION_FALLBACK}`);
    });
    return () => { live = false; };
  }, []);

  /* What the chosen day currently says, so the employee changes one end rather
     than retyping both. */
  useEffect(() => {
    if (showReqForm !== 'Attendance correction' || !user || !corDate) return;
    let live = true;
    setCorLoading(true);
    supabase.from('attendance_records')
      .select('id, clock_in, clock_out, is_late, justified, location, correction_reason')
      .eq('user_id', user.id)
      .gte('clock_in', `${corDate}T00:00:00+03:00`).lte('clock_in', `${corDate}T23:59:59+03:00`)
      .order('clock_in', { ascending: true })
      .then(({ data }) => {
        if (!live) return;
        const recs = (data ?? []) as unknown as AttRec[];
        setCorExisting(recs);
        /* The boxes are NOT filled in. They used to be, from the record — so the
           arrival came pre-answered and the leaving time, the thing actually
           wrong, was the only one left blank. An empty box now means "leave
           that end alone", which is what the help text always claimed. */
        setCorRecordId(recs.find((r) => !r.clock_out)?.id ?? recs[0]?.id ?? null);
        setCorLoading(false);
      }, () => { if (live) { setCorExisting([]); setCorLoading(false); } });
    return () => { live = false; };
  }, [showReqForm, corDate, user?.id]);   // the id, not the object Supabase swaps on every token refresh

  // ── employee edits / cancels their own leave request ──
  const edDays = useMemo(() => (edStart && edEnd && edEnd >= edStart ? workingDaysBetween(edStart, edEnd) : 0), [edStart, edEnd]);

  function startEditLeave(rawId: string, start: string, end: string) {
    setEditLeaveId(rawId); setEdStart(start); setEdEnd(end); setMsg(null);
  }

  async function saveEditedLeave(rawId: string, wasApproved: boolean) {
    if (!edStart || !edEnd || edEnd < edStart) { setMsg('Pick a valid start and end date'); return; }
    setBusy(true); setMsg(null);
    // editing dates always lands the request back in Pending — HR (re-)approves the final dates
    const problem = await reviseLeave(rawId, edStart, edEnd, edDays);
    setBusy(false);
    if (problem) { setMsg(problem); return; }
    setMsg(wasApproved ? 'Dates changed — sent back to HR for re-approval' : 'Leave dates updated');
    setEditLeaveId(null);
    load();
  }

  async function cancelLeave(rawId: string) {
    if (!window.confirm('Cancel this leave request? This cannot be undone — you would need to apply again.')) return;
    setBusy(true); setMsg(null);
    const problem = await portalCancelLeave(rawId);
    setBusy(false);
    if (problem) { setMsg(problem); return; }
    setMsg('Leave request cancelled');
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
      kind: 'leave' as const, rawId: l.id, leaveType: l.leave_type, startDate: l.leave_start, endDate: l.leave_end,
      // Leave is signed off twice — your manager first, then the owners.
      // While it is pending, say which desk it is sitting on.
      stage: l.approval_status !== 'Pending' ? ''
        : l.manager_status === 'Pending' ? 'With your manager'
        : 'With the owners for final approval',
    })),
    ...requests.map((r) => ({
      id: `rq-${r.id}`, when: r.created_at,
      title: r.request_type, subtitle: r.details,
      type: r.request_type, status: r.status, remarks: r.manager_remarks, doc: null as string | null, stage: '',
      kind: 'request' as const, rawId: r.id, leaveType: '', startDate: '', endDate: '',
    })),
  ].sort((a, b) => (b.when ?? '').localeCompare(a.when ?? '')), [leaves, requests]);

  // deep-link: ?req=lv-<id> / rq-<id> opens that request row (from a decision notification)
  const [sp] = useSearchParams();
  const reqParam = sp.get('req');
  useEffect(() => {
    if (!reqParam || loading) return;
    const idx = allRequests.findIndex((r) => r.id === reqParam);
    if (idx === -1) return;
    if (idx >= 4) setShowAllReq(true);
    setOpenReqId(reqParam);
    setTimeout(() => document.getElementById(`req-${reqParam}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
  }, [reqParam, loading, allRequests]);

  // is today an approved leave / WFH day? (drives the attendance banner)
  const todayLeave = useMemo(() => {
    const t = todayKuwait();
    return leaves.find((l) => l.approval_status === 'Approved' && l.leave_start <= t && l.leave_end >= t) ?? null;
  }, [leaves]);

  // this month's attendance summary — must stay above the early return (Rules of Hooks)
  const monthStats = useMemo(() => {
    const [wh, wm] = workStart.split(':').map(Number);
    const graceMin = wh * 60 + wm + 60; // on time until start + 1h grace
    // Group by day first. A day worked in two shifts is one day, its hours add
    // up, and only the clock-in that opened it can be late — counting per
    // record would call it two days and charge a shortfall against each half.
    const byDay = groupByDay(monthRecs);
    const firstOfDay = new Map<string, AttRec>();
    for (const r of monthRecs) {
      const d = kwDate(r.clock_in);
      const seen = firstOfDay.get(d);
      if (!seen || r.clock_in < seen.clock_in) firstOfDay.set(d, r);
    }
    let lateHours = 0;   // cumulative hours arrived past the grace window
    let missingHours = 0; // cumulative shortfall below 8h on days that are finished
    for (const r of firstOfDay.values()) {
      if (!r.justified) { const a = kwMinutes(r.clock_in); if (a > graceMin) lateHours += (a - graceMin) / 60; }
    }
    for (const day of byDay.values()) {
      // A day still being worked is not short of anything yet, and a day nobody
      // clocked out of is a correction to make rather than a shortfall to charge.
      if (day.onTheFloor || day.unusableShifts > 0 || day.hours === null) continue;
      if (day.hours > 0 && day.hours < STANDARD_DAY_HOURS) missingHours += STANDARD_DAY_HOURS - day.hours;
    }
    const days = byDay.size;
    const hours = totalHours([...byDay.values()]);
    const late = [...firstOfDay.values()].filter((r) => r.is_late && !r.justified).length;
    return { days, hours, onTime: Math.max(0, days - late), late, lateHours, missingHours };
  }, [monthRecs, workStart]);

  // selected-month attendance summary for the history panel
  const histStats = useMemo(() => {
    const byDay = groupByDay(histRecs);
    const firstOfDay = new Map<string, AttRec>();
    for (const r of histRecs) {
      const d = kwDate(r.clock_in);
      const seen = firstOfDay.get(d);
      if (!seen || r.clock_in < seen.clock_in) firstOfDay.set(d, r);
    }
    const days = byDay.size;
    const hours = totalHours([...byDay.values()]);
    const late = [...firstOfDay.values()].filter((r) => r.is_late && !r.justified).length;
    return { days, hours, onTime: Math.max(0, days - late), late };
  }, [histRecs]);

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

  const openRec = todayRecs.find(r => !r.clock_out) ?? null;
  const firstRec = todayRecs[0] ?? null;
  const lastRec = todayRecs[todayRecs.length - 1] ?? null;
  const clockedIn = !!openRec;
  const startedToday = todayRecs.length > 0;
  const shiftsToday = todayRecs.length;
  const workedTodayMs = todayRecs.reduce(
    (t, r) => t + (new Date(r.clock_out ?? new Date(nowMs).toISOString()).getTime() - new Date(r.clock_in).getTime()),
    0,
  );
  const lateClass = firstRec ? lateClassOf(firstRec.clock_in, workStart) : null;
  const lateLabel = lateClass && lateClass !== 'On time' && !firstRec?.justified ? lateClass : null;
  const portalReady = !!emp && emp.portal_enabled !== false;
  const onPaidLeaveToday = !!todayLeave && todayLeave.leave_type !== 'WFH';
  const wfhToday = todayLeave?.leave_type === 'WFH';
  const input = 'px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';

  // header status line
  const headerStatus = onPaidLeaveToday ? `On ${todayLeave!.leave_type.toLowerCase()} leave today`
    : wfhToday ? 'Working from home today'
    : clockedIn ? `Clocked in since ${fmtTime(openRec!.clock_in)}${lateLabel ? ` · ${lateLabel}` : ''}`
    : startedToday ? `Clocked out · ${fmtTime(lastRec!.clock_out!)}${shiftsToday > 1 ? ` · ${shiftsToday} shifts` : ''}`
    : 'Not clocked in';
  const headerDot = onPaidLeaveToday ? 'bg-sky-500' : wfhToday ? 'bg-violet-500' : clockedIn ? (lateLabel ? 'bg-amber-500' : 'bg-emerald-500') : startedToday ? 'bg-slate-400' : 'bg-slate-300';

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
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Portal</h1>
          <p className="mt-1 text-sm text-slate-500 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${headerDot}`} aria-hidden />{headerStatus}
          </p>
        </div>
        {pushState === 'off' && (
          <button onClick={handleEnablePush}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 text-sm font-medium hover:bg-indigo-100 ${btnFocus} focus-visible:ring-indigo-300`}>
            <Bell size={15} aria-hidden /> Enable notifications
          </button>
        )}
        {pushState === 'on' && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium"><Bell size={13} aria-hidden /> Notifications on</span>
        )}
        {pushState === 'ios' && (
          <span className="text-xs text-slate-400 max-w-[16rem] text-right">To get notifications on iPhone: Share → <b>Add to Home Screen</b>, then open it from there.</span>
        )}
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
              <span>{emp?.location ?? lastRec?.location ?? 'Timekeeper HQ'}</span>
              {lateLabel && <><span className="text-slate-300" aria-hidden>·</span><span className="inline-flex items-center gap-1.5 text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />{lateLabel}</span></>}
              {firstRec?.justified && <><span className="text-slate-300" aria-hidden>·</span><span className="text-emerald-600">Justified</span></>}
            </div>
          </div>
          {/* only the current valid action, strongest button on the page */}
          <div className="shrink-0">
            {onPaidLeaveToday && !clockedIn ? (
              <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 font-semibold">On {todayLeave!.leave_type.toLowerCase()} leave</span>
            ) : !clockedIn ? (
              /* Clocking out never ends the day: a split shift comes back later,
                 so the button returns instead of a dead "Completed" badge. */
              <div className="text-right">
                <button onClick={clockIn} disabled={clockBusy || geofences.length === 0}
                  className={`inline-flex items-center gap-2 px-7 py-3.5 min-h-[52px] rounded-xl bg-emerald-600 text-white text-base font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors ${btnFocus} focus-visible:ring-emerald-400`}>
                  {clockBusy ? <Spinner /> : <LogIn size={20} aria-hidden />}
                  {clockBusy ? 'Getting location…' : startedToday ? 'Clock In Again' : 'Clock In'}
                </button>
                {startedToday && (
                  <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1 justify-end">
                    <CheckCircle size={13} aria-hidden /> {fmtHrs(workedTodayMs)} so far today
                  </div>
                )}
              </div>
            ) : (
              <button onClick={clockOut} disabled={clockBusy}
                className={`inline-flex items-center gap-2 px-7 py-3.5 min-h-[52px] rounded-xl bg-slate-900 text-white text-base font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors ${btnFocus} focus-visible:ring-slate-400`}>
                {clockBusy ? <Spinner /> : <LogOut size={20} aria-hidden />}{clockBusy ? 'Getting location…' : 'Clock Out'}
              </button>
            )}
          </div>
        </div>

        {/* Weekly summary — plain values, hours are hours and days are days */}
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-slate-100 py-4">
          <div><dt className="text-xs text-slate-400 uppercase tracking-wide">Days present</dt><dd className="mt-1 text-xl font-bold text-slate-800">{monthStats.days} {monthStats.days === 1 ? 'day' : 'days'}</dd><dd className="text-[11px] text-slate-400">this month</dd></div>
          <div><dt className="text-xs text-slate-400 uppercase tracking-wide">On time</dt><dd className="mt-1 text-xl font-bold text-slate-800">{monthStats.onTime}<span className="text-sm font-medium text-slate-400">/{monthStats.days}</span></dd><dd className="text-[11px] text-slate-400">days</dd></div>
          <div><dt className="text-xs text-slate-400 uppercase tracking-wide">Late hours</dt><dd className={`mt-1 text-xl font-bold ${monthStats.lateHours > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{hm(monthStats.lateHours)}</dd><dd className="text-[11px] text-slate-400">past grace</dd></div>
          <div><dt className="text-xs text-slate-400 uppercase tracking-wide">Missing hours</dt><dd className={`mt-1 text-xl font-bold ${monthStats.missingHours > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{hm(monthStats.missingHours)}</dd><dd className="text-[11px] text-slate-400">under {STANDARD_DAY_HOURS}h/day</dd></div>
        </dl>

        {/* Today's punch — one horizontal strip */}
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold text-slate-400 uppercase">First in</span><span className="text-base font-semibold text-slate-800">{firstRec ? fmtTime(firstRec.clock_in) : '—'}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold text-slate-400 uppercase">Last out</span><span className="text-base font-semibold text-slate-800">{lastRec?.clock_out ? fmtTime(lastRec.clock_out) : '—'}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-[11px] font-semibold text-slate-400 uppercase">Total</span><span className="text-base font-semibold text-slate-800">{startedToday ? fmtHrs(workedTodayMs) : '—'}</span></div>
          {shiftsToday > 1 && <div className="text-xs text-slate-400">{shiftsToday} shifts</div>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-slate-400">Expected by {graceEnd}</span>
          {!clockedIn && lastRec?.clock_out && isEarlyLeave(lastRec.clock_out, myShiftEnd) && (
            <span className="text-amber-600">Clocked out before {myShiftEnd} — counts as early leave unless approved.</span>
          )}
          {firstRec?.correction_reason && <span className="text-blue-600">Corrected by manager: {firstRec.correction_reason}</span>}
        </div>

        {geoError && (
          <div role="alert" className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span className="whitespace-pre-line leading-relaxed">{geoError}</span>
          </div>
        )}

        {/* A forgotten clock-in is noticed at any point in the day, so this is
            not gated on having finished. */}
        {!onPaidLeaveToday && (
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

          {showReqForm === 'Attendance correction' && (
            <div className="mb-3 space-y-3 max-w-xl">
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Which day</span>
                <input type="date" value={corDate} max={todayKuwait()}
                  onChange={(e) => { setCorDate(e.target.value); setCorIn(''); setCorOut(''); setCorNextDay(false); }}
                  className={`${input} w-auto`} />
              </label>
              {/* Which shift. Only asked when the day has more than one — otherwise
                  fixing an evening departure attaches it to the morning record. */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                <span className="font-medium text-slate-500">Recorded now: </span>
                {corLoading ? <span className="text-slate-400">checking…</span>
                  : !corExisting?.length ? <span className="text-amber-700">nothing — no clock-in for that day</span>
                  : corExisting.length === 1 ? <span className="text-slate-600">
                      {kuwaitHM(corExisting[0].clock_in)} → {corExisting[0].clock_out
                        ? kuwaitHM(corExisting[0].clock_out)
                        : <span className="text-amber-700">never clocked out</span>}
                    </span>
                  : <span className="block mt-1 space-y-1">
                      <span className="block text-slate-500">Which one is wrong?</span>
                      {corExisting.map((r) => (
                        <label key={r.id} className="flex items-center gap-2 text-slate-600">
                          <input type="radio" name="corShift" checked={corRecordId === r.id}
                            onChange={() => setCorRecordId(r.id)} />
                          <span>{kuwaitHM(r.clock_in)} → {r.clock_out
                            ? kuwaitHM(r.clock_out)
                            : <span className="text-amber-700">never clocked out</span>}</span>
                        </label>
                      ))}
                    </span>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-500 mb-1">I arrived at</span>
                  <input type="time" value={corIn} onChange={(e) => setCorIn(e.target.value)}
                    className={`${input} w-full`} />
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    {corRecord ? `now ${kuwaitHM(corRecord.clock_in)} — leave empty to keep it` : 'nothing recorded'}
                  </span>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-500 mb-1">I left at</span>
                  <input type="time" value={corOut} onChange={(e) => setCorOut(e.target.value)}
                    className={`${input} w-full`} />
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    {corRecord?.clock_out ? `now ${kuwaitHM(corRecord.clock_out)} — leave empty to keep it`
                      : corRecord ? 'never clocked out' : 'nothing recorded'}
                  </span>
                </label>
              </div>

              {/* Offers, not prefills. The app knows the minute a clock-out failed,
                  so it should hand it over rather than leave somebody guessing. */}
              {!corRecord?.clock_out && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-400">Left at</span>
                  {lastFailedClockOut && corDate === todayKuwait() && (
                    <button type="button" onClick={() => setCorOut(lastFailedClockOut)}
                      className="px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                      when you tried to clock out ({lastFailedClockOut})
                    </button>
                  )}
                  {corDate === todayKuwait() && (
                    <button type="button" onClick={() => setCorOut(kuwaitHM(new Date(nowMs).toISOString()))}
                      className="px-2 py-0.5 rounded-full border border-slate-200 text-slate-600">
                      now ({kuwaitHM(new Date(nowMs).toISOString())})
                    </button>
                  )}
                  {emp?.shift_end && (
                    <button type="button" onClick={() => setCorOut(emp.shift_end!.slice(0, 5))}
                      className="px-2 py-0.5 rounded-full border border-slate-200 text-slate-600">
                      my shift ends ({emp.shift_end.slice(0, 5)})
                    </button>
                  )}
                </div>
              )}

              {/* Only offered once the times say the shift ran past midnight. */}
              {corOut && (corIn || corRecord) && corOut <= (corIn || kuwaitHM(corRecord!.clock_in)) && (
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={corNextDay} onChange={(e) => setCorNextDay(e.target.checked)} />
                  I left after midnight, the next morning
                </label>
              )}

              {corPlan.problem
                ? <p className="text-[11px] text-amber-700">{corPlan.problem}</p>
                : <p className="text-[11px] text-slate-400">Approving writes this onto the record.</p>}
            </div>
          )}

          <span className="block text-xs font-medium text-slate-500 mb-1">
            {showReqForm === 'HR update' ? 'What needs changing' : 'Why the change is needed'}
          </span>
          <textarea value={reqDetails} onChange={(e) => setReqDetails(e.target.value)} rows={3}
            placeholder={showReqForm === 'HR update' ? 'e.g. My phone number changed to 9xxxxxxx' : 'e.g. Phone died at the end of the shift, Hussain saw me leave'}
            className={`${input} w-full resize-none mb-2`} />
          <div className="flex gap-2">
            <button onClick={submitRequest}
              disabled={busy || (showReqForm === 'Attendance correction' && !!corPlan.problem)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-60 ${btnFocus} focus-visible:ring-blue-400`}>
              <Send size={13} aria-hidden />
              {busy ? 'Submitting…'
                : showReqForm === 'Attendance correction' && corPlan.summary ? corPlan.summary
                : 'Send to manager'}
            </button>
            <button onClick={() => { setShowReqForm(null); setCorIn(''); setCorOut(''); setCorNextDay(false); setMsg(null); }} aria-label="Cancel request" className={`p-2 text-slate-400 hover:text-slate-600 rounded ${btnFocus} focus-visible:ring-slate-300`}><X size={16} /></button>
          </div>
        </section>
      )}

      {/* ── Attendance history (collapsible) ── */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-800">Attendance History</h2>
          <button onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}
            className={`text-sm text-slate-500 hover:text-slate-800 rounded ${btnFocus} focus-visible:ring-slate-300`}>{showHistory ? 'Hide' : 'View history →'}</button>
        </div>

        {showHistory && (
          <div className="mt-4">
            {/* month navigator */}
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setHistMonth((m) => monthShift(m, -1))} aria-label="Previous month"
                className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 ${btnFocus} focus-visible:ring-slate-300`}>←</button>
              <span className="text-sm font-medium text-slate-700 min-w-[9rem] text-center">{monthLabel(histMonth)}</span>
              <button onClick={() => setHistMonth((m) => monthShift(m, 1))} aria-label="Next month" disabled={histMonth >= todayKuwait().slice(0, 7)}
                className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 ${btnFocus} focus-visible:ring-slate-300`}>→</button>
              {histMonth !== todayKuwait().slice(0, 7) && (
                <button onClick={() => setHistMonth(todayKuwait().slice(0, 7))} className={`text-xs text-slate-500 hover:text-slate-800 rounded ${btnFocus} focus-visible:ring-slate-300`}>This month</button>
              )}
            </div>

            {/* month summary */}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-slate-100 py-4 mb-4">
              <div><dt className="text-xs text-slate-400 uppercase tracking-wide">Days present</dt><dd className="mt-1 text-lg font-bold text-slate-800">{histStats.days}</dd></div>
              <div><dt className="text-xs text-slate-400 uppercase tracking-wide">Total hours</dt><dd className="mt-1 text-lg font-bold text-slate-800">{hm(histStats.hours)}</dd></div>
              <div><dt className="text-xs text-slate-400 uppercase tracking-wide">On time</dt><dd className="mt-1 text-lg font-bold text-slate-800">{histStats.onTime}<span className="text-sm font-medium text-slate-400">/{histStats.days}</span></dd></div>
              <div><dt className="text-xs text-slate-400 uppercase tracking-wide">Late days</dt><dd className={`mt-1 text-lg font-bold ${histStats.late ? 'text-amber-600' : 'text-slate-800'}`}>{histStats.late}</dd></div>
            </dl>

            {histLoading ? <Spinner /> : histRecs.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No attendance records in {monthLabel(histMonth)}.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {histRecs.map((r) => {
                  const st = r.justified ? { t: 'Justified', dot: 'bg-emerald-500', c: 'text-emerald-600' }
                    : r.is_late ? { t: lateClassOf(r.clock_in, workStart), dot: 'bg-amber-500', c: 'text-amber-600' }
                    : { t: 'On time', dot: 'bg-emerald-500', c: 'text-emerald-600' };
                  return (
                    <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1">
                      <div className="w-32 shrink-0 text-sm font-medium text-slate-700">{weekdayLabel(r.clock_in)}</div>
                      <div className="text-sm text-slate-700"><span className="text-[11px] text-slate-400 uppercase mr-1">In</span>{fmtTime(r.clock_in)}</div>
                      <div className="text-sm text-slate-700"><span className="text-[11px] text-slate-400 uppercase mr-1">Out</span>{r.clock_out ? fmtTime(r.clock_out) : '—'}</div>
                      <div className="text-sm text-slate-700"><span className="text-[11px] text-slate-400 uppercase mr-1">Dur</span>{r.clock_out ? fmtDur(r.clock_in, r.clock_out, nowMs) : '—'}</div>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${st.c}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden />{st.t}</span>
                      {r.correction_reason && <span className="text-[11px] text-blue-500" title={r.correction_reason}>corrected</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

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
                        {canWorkFromHome && <option value="WFH">Work from home</option>}
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
                const editable = portalReady && r.kind === 'leave' && (r.status === 'Pending' || r.status === 'Approved');
                const editing = editLeaveId === r.rawId;
                return (
                  <li key={r.id} id={`req-${r.id}`} className={reqParam === r.id ? 'ring-2 ring-amber-400 rounded-lg' : ''}>
                    <div role="button" tabIndex={0}
                      onClick={() => setOpenReqId(open ? null : r.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenReqId(open ? null : r.id); } }}
                      className={`px-1 py-3 cursor-pointer rounded-lg hover:bg-slate-50 ${btnFocus} focus-visible:ring-slate-300`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-800">{r.title}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{fmtDate(r.when)}</div>
                          {r.subtitle && <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{r.subtitle}</div>}
                          {r.stage && <div className="text-[11px] text-amber-600 mt-0.5">{r.stage}</div>}
                        </div>
                        <StatusPill s={r.status} />
                      </div>
                      {open && (r.remarks || r.doc || editable) && (
                        <div className="mt-2 pl-0.5 text-xs text-slate-500 space-y-2" onClick={(e) => e.stopPropagation()}>
                          {r.remarks && <p className="italic">↳ {r.remarks}</p>}
                          {r.doc && <button onClick={() => openDocument(r.doc!)} className={`block text-blue-600 hover:underline rounded ${btnFocus} focus-visible:ring-blue-300`}>📎 View document</button>}
                          {editable && !editing && (
                            <div className="flex flex-wrap items-center gap-3 pt-1">
                              <button onClick={() => startEditLeave(r.rawId, r.startDate, r.endDate)}
                                className={`inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 rounded ${btnFocus} focus-visible:ring-slate-300`}><Pencil size={12} aria-hidden /> Change dates</button>
                              <button onClick={() => cancelLeave(r.rawId)} disabled={busy}
                                className={`inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 rounded disabled:opacity-50 ${btnFocus} focus-visible:ring-rose-300`}><X size={12} aria-hidden /> Cancel request</button>
                              {r.status === 'Approved' && <span className="text-slate-400">Changing dates sends it back to HR.</span>}
                            </div>
                          )}
                          {editable && editing && (
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                              <div className="grid grid-cols-3 gap-2">
                                <label className="text-xs"><span className="block text-slate-500 mb-1">Start</span>
                                  <input type="date" value={edStart} onChange={(e) => setEdStart(e.target.value)} className={`${input} w-full`} /></label>
                                <label className="text-xs"><span className="block text-slate-500 mb-1">End</span>
                                  <input type="date" value={edEnd} onChange={(e) => setEdEnd(e.target.value)} className={`${input} w-full`} /></label>
                                <div className="text-xs"><span className="block text-slate-500 mb-1">Working days</span>
                                  <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold">{edDays || '—'}</div></div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => saveEditedLeave(r.rawId, r.status === 'Approved')} disabled={busy}
                                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium disabled:opacity-60 ${btnFocus} focus-visible:ring-slate-400`}>
                                  <Send size={12} aria-hidden /> {busy ? 'Saving…' : 'Save new dates'}
                                </button>
                                <button onClick={() => setEditLeaveId(null)} className={`px-2 py-1 text-slate-500 hover:text-slate-700 rounded ${btnFocus} focus-visible:ring-slate-300`}>Cancel</button>
                              </div>
                            </div>
                          )}
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

      {/* ── Everything I have asked for ──
           They could raise a request and then only watch it: no policy let them
           touch their own row, so a mistaken one waited for a manager to clear.
           Editing and withdrawing are open while it is still Pending. */}
      <MyRequests userId={user?.id ?? null} />

      {/* Asking for different hours, which had no route at all before: schedules
          moved only through set_schedule(), which an employee cannot call. */}
      <div>
        <AskForSchedule employeeId={emp?.id ?? null} userId={user?.id ?? null} onSent={load} />
      </div>
    </div>
  );
}