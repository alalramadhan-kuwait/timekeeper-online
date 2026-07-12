import { useEffect, useMemo, useState } from 'react';
import { MapPin, LogIn, LogOut, Clock, AlertCircle, CheckCircle, CalendarDays, Users, AlertTriangle, Download, Pencil } from 'lucide-react';
import { format, parseISO, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Spinner, Badge } from '../components/ui';
import { locationType, LOCATION_TYPE_STYLE, LocationType } from '../lib/locationType';

interface AttendanceRecord {
  id: string;
  user_id: string;
  employee_name: string;
  clock_in: string;
  clock_out: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  is_late: boolean;
  notes: string | null;
}

interface GeofenceSettings {
  id: string;
  geofence_lat: number | null;
  geofence_lng: number | null;
  geofence_radius_m: number | null;
  work_start_time: string | null;
}

interface Geofence { id: string; name: string; lat: number; lng: number; radius_m: number; active: boolean }

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-KW', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuwait' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' });
}

function durationStr(clockIn: string, clockOut: string | null): string {
  const end = clockOut ? new Date(clockOut) : new Date();
  const mins = Math.floor((end.getTime() - new Date(clockIn).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function todayKuwait(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
}

/** Kuwait calendar date (yyyy-MM-dd) of a timestamp. */
function kuwaitDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
}

/** Worked hours (decimal); open shifts count up to now. */
function hoursOf(clockIn: string, clockOut: string | null): number {
  const end = clockOut ? new Date(clockOut) : new Date();
  return (end.getTime() - new Date(clockIn).getTime()) / 3600000;
}

interface EmpLite { id: string; full_name: string; location: string | null; job_title: string | null; status: string }

// ─────────────────────────────── Manager dashboard ───────────────────────────────
function ManagerDashboard() {
  const today = todayKuwait();
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<EmpLite[]>([]);
  const [empFilter, setEmpFilter] = useState('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState<'All' | LocationType>('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    supabase.from('employees').select('id, full_name, location, job_title, status')
      .then(({ data }) => setEmployees((data as EmpLite[]) ?? []));
  }, []);

  useEffect(() => {
    supabase.from('attendance_records').select('*')
      .gte('clock_in', `${from}T00:00:00+03:00`).lte('clock_in', `${to}T23:59:59+03:00`)
      .order('clock_in', { ascending: false })
      .then(({ data }) => setRecords((data as AttendanceRecord[]) ?? []));
  }, [from, to, reload]);

  const empByName = useMemo(() => new Map(employees.map((e) => [e.full_name, e])), [employees]);
  const areas = useMemo(() => [...new Set(employees.map((e) => e.location).filter(Boolean) as string[])].sort(), [employees]);
  const activeEmployees = useMemo(() => employees.filter((e) => ['Active', 'On leave'].includes(e.status)), [employees]);

  const statusOf = (r: AttendanceRecord): 'Late' | 'On time' | 'Missing clock-out' | 'Open' => {
    if (!r.clock_out) return kuwaitDate(r.clock_in) < today ? 'Missing clock-out' : 'Open';
    return r.is_late ? 'Late' : 'On time';
  };

  const filtered = useMemo(() => records.filter((r) => {
    if (empFilter !== 'All' && r.employee_name !== empFilter) return false;
    if (teamFilter !== 'All' && empByName.get(r.employee_name)?.location !== teamFilter) return false;
    if (typeFilter !== 'All' && locationType(empByName.get(r.employee_name)?.location) !== typeFilter) return false;
    if (statusFilter !== 'All' && statusOf(r) !== statusFilter) return false;
    return true;
  }), [records, empFilter, teamFilter, typeFilter, statusFilter, empByName, today]);

  // summary
  const summary = useMemo(() => {
    const late = filtered.filter((r) => r.is_late).length;
    const stillIn = filtered.filter((r) => !r.clock_out && kuwaitDate(r.clock_in) === today).length;
    const missed = filtered.filter((r) => !r.clock_out && kuwaitDate(r.clock_in) < today).length;
    const totalHours = filtered.reduce((s, r) => s + hoursOf(r.clock_in, r.clock_out), 0);
    const presentToday = new Set(filtered.filter((r) => kuwaitDate(r.clock_in) === today).map((r) => r.employee_name));
    const absentToday = (to >= today && from <= today)
      ? activeEmployees.filter((e) => !presentToday.has(e.full_name) &&
          (teamFilter === 'All' || e.location === teamFilter) &&
          (typeFilter === 'All' || locationType(e.location) === typeFilter) &&
          (empFilter === 'All' || e.full_name === empFilter))
      : [];
    return { late, stillIn, missed, totalHours, records: filtered.length, absentToday };
  }, [filtered, activeEmployees, today, from, to, teamFilter, typeFilter, empFilter]);

  // per-employee report (payroll)
  const report = useMemo(() => {
    const map = new Map<string, { name: string; area: string; days: Set<string>; late: number; hours: number; missed: number }>();
    for (const r of filtered) {
      const key = r.employee_name;
      const e = map.get(key) ?? { name: key, area: empByName.get(key)?.location ?? '—', days: new Set<string>(), late: 0, hours: 0, missed: 0 };
      e.days.add(kuwaitDate(r.clock_in));
      if (r.is_late) e.late++;
      e.hours += hoursOf(r.clock_in, r.clock_out);
      if (!r.clock_out && kuwaitDate(r.clock_in) < today) e.missed++;
      map.set(key, e);
    }
    return [...map.values()].map((e) => ({ ...e, daysPresent: e.days.size, avg: e.days.size ? e.hours / e.days.size : 0 }))
      .sort((a, b) => b.hours - a.hours);
  }, [filtered, empByName, today]);

  // daily trend (headcount present per day)
  const trend = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
    return days.map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      const count = new Set(filtered.filter((r) => kuwaitDate(r.clock_in) === key).map((r) => r.employee_name)).size;
      return { key, count };
    });
  }, [filtered, from, to]);
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));

  // alerts
  const lateToday = filtered.filter((r) => r.is_late && kuwaitDate(r.clock_in) === today);
  const unusual = filtered.filter((r) => r.clock_out && (hoursOf(r.clock_in, r.clock_out) > 12 || hoursOf(r.clock_in, r.clock_out) < 1));

  async function saveNote(id: string) {
    await supabase.from('attendance_records').update({ notes: editNote || null }).eq('id', id);
    setEditId(null); setReload((x) => x + 1);
  }

  function exportCsv() {
    const rows = [['Employee', 'Area', 'Days present', 'Late days', 'Missed clock-outs', 'Total hours', 'Avg hours/day']];
    for (const r of report) rows.push([r.name, r.area, String(r.daysPresent), String(r.late), String(r.missed), r.hours.toFixed(1), r.avg.toFixed(1)]);
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `attendance_${from}_to_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const cards = [
    { label: 'Clock-ins', value: summary.records, icon: Clock, accent: 'text-slate-800' },
    { label: 'Late', value: summary.late, icon: AlertTriangle, accent: summary.late ? 'text-amber-600' : 'text-slate-400' },
    { label: 'Absent today', value: summary.absentToday.length, icon: Users, accent: summary.absentToday.length ? 'text-rose-600' : 'text-emerald-600' },
    { label: 'Still clocked in', value: summary.stillIn, icon: LogIn, accent: 'text-blue-600' },
    { label: 'Missed clock-out', value: summary.missed, icon: LogOut, accent: summary.missed ? 'text-rose-600' : 'text-slate-400' },
    { label: 'Total hours', value: summary.totalHours.toFixed(0), icon: CalendarDays, accent: 'text-slate-800' },
  ];

  return (
    <div className="space-y-5 mb-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Team Attendance</h2>
        <p className="text-sm text-slate-500">Summary, alerts and payroll report for the selected range.</p>
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
        <span className="self-center text-slate-400 text-sm">→</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white" />
        <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option value="All">All employees</option>
          {employees.map((e) => <option key={e.id} value={e.full_name}>{e.full_name}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'All' | LocationType)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option value="All">Office + Store</option>
          <option value="Head Office">Head Office only</option>
          <option value="Retail Store">Retail Store only</option>
        </select>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option value="All">All areas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option value="All">All statuses</option>
          {['On time', 'Late', 'Open', 'Missing clock-out'].map((s) => <option key={s} value={s}>{s}</option>)}
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
      {(lateToday.length > 0 || summary.absentToday.length > 0 || summary.missed > 0 || unusual.length > 0) && (
        <div className="space-y-2">
          {summary.absentToday.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <Users size={15} className="mt-0.5 shrink-0" />
              <span>Absent today: <b>{summary.absentToday.map((e) => e.full_name).join(', ')}</b></span>
            </div>
          )}
          {lateToday.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>Late today: <b>{lateToday.map((r) => r.employee_name).join(', ')}</b></span>
            </div>
          )}
          {summary.missed > 0 && (
            <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <LogOut size={15} className="mt-0.5 shrink-0" />
              <span>{summary.missed} shift(s) never clocked out — correct or add a note below.</span>
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
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">Missed out</th>
                <th className="px-4 py-2.5 text-right">Total hrs</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">Avg/day</th>
              </tr>
            </thead>
            <tbody>
              {report.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No attendance in this range</td></tr>}
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
                  <td className={`px-4 py-2.5 text-right hidden sm:table-cell ${r.missed ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>{r.missed || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.hours.toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums hidden sm:table-cell">{r.avg.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* detailed records with notes */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Records</h3>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">In</th>
                <th className="px-4 py-2.5">Out</th>
                <th className="px-4 py-2.5 text-right">Hrs</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No records</td></tr>}
              {filtered.map((r) => {
                const st = statusOf(r);
                const stCls = st === 'Late' ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : st === 'Missing clock-out' ? 'bg-rose-100 text-rose-600 border-rose-200'
                  : st === 'Open' ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-200';
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 align-top">
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{formatDate(r.clock_in)}</td>
                    <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{r.employee_name}</td>
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">{formatTime(r.clock_in)}</td>
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap">{r.clock_out ? formatTime(r.clock_out) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.clock_out ? hoursOf(r.clock_in, r.clock_out).toFixed(1) : '—'}</td>
                    <td className="px-4 py-2"><Badge className={stCls}>{st}</Badge></td>
                    <td className="px-4 py-2 min-w-[160px]">
                      {editId === r.id ? (
                        <div className="flex items-center gap-1">
                          <input value={editNote} onChange={(e) => setEditNote(e.target.value)} autoFocus
                            className="px-2 py-1 rounded border border-slate-300 text-xs flex-1" placeholder="Reason / follow-up" />
                          <button onClick={() => saveNote(r.id)} className="text-emerald-600 text-xs font-medium">Save</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditId(r.id); setEditNote(r.notes ?? ''); }} className="flex items-center gap-1 text-left text-slate-500 hover:text-blue-600">
                          {r.notes || <span className="text-slate-300">Add note</span>} <Pencil size={11} className="shrink-0" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const { user, profile, role } = useAuth();
  const isManager = ['admin', 'manager', 'hr'].includes(role ?? '');

  const [settings, setSettings] = useState<GeofenceSettings | null>(null);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  async function load() {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    const today = todayKuwait();
    const todayStart = `${today}T00:00:00+03:00`;
    const todayEnd = `${today}T23:59:59+03:00`;

    const hist14Start = new Date();
    hist14Start.setDate(hist14Start.getDate() - 14);

    const [settingsRes, todayRes, histRes] = await Promise.all([
      supabase.from('settings').select('id, geofence_lat, geofence_lng, geofence_radius_m, work_start_time').single(),
      supabase.from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .gte('clock_in', todayStart)
        .lte('clock_in', todayEnd)
        .order('clock_in', { ascending: false })
        .limit(1),
      supabase.from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .gte('clock_in', hist14Start.toISOString())
        .order('clock_in', { ascending: false }),
    ]);

    if (settingsRes.data) setSettings(settingsRes.data as GeofenceSettings);
    setTodayRecord((todayRes.data?.[0] as AttendanceRecord) ?? null);
    setHistory((histRes.data as AttendanceRecord[]) ?? []);
    const { data: geo } = await supabase.from('geofences').select('*').eq('active', true);
    setGeofences((geo as Geofence[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user?.id, profile?.id]);

  async function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('GPS not supported on this device')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
    });
  }

  // active fences: prefer the geofences table; fall back to the legacy single settings fence
  const activeFences: Geofence[] = geofences.length > 0
    ? geofences
    : (settings?.geofence_lat && settings?.geofence_lng
        ? [{ id: 'legacy', name: 'Store', lat: settings.geofence_lat, lng: settings.geofence_lng, radius_m: settings.geofence_radius_m ?? 200, active: true }]
        : []);

  async function handleClockIn() {
    if (activeFences.length === 0) {
      setGeoError('No store location configured. Ask your admin to add a geofence in Settings.');
      return;
    }
    setGeoError(null);
    setGeoLoading(true);
    try {
      const pos = await getPosition();
      const { latitude, longitude } = pos.coords;
      // check against every fence; clock in at the nearest one within range
      let matched: Geofence | null = null;
      let nearest = { name: '', dist: Infinity };
      for (const f of activeFences) {
        const d = haversineMeters(latitude, longitude, Number(f.lat), Number(f.lng));
        if (d < nearest.dist) nearest = { name: f.name, dist: d };
        if (d <= f.radius_m && (!matched || d < haversineMeters(latitude, longitude, Number(matched.lat), Number(matched.lng)))) matched = f;
      }
      if (!matched) {
        setGeoError(`You are ${Math.round(nearest.dist)}m from the nearest location (${nearest.name}). You must be on-site to clock in.`);
        setGeoLoading(false);
        return;
      }

      // Determine if late
      const now = new Date();
      const workStart = settings?.work_start_time ?? '09:00';
      const [wh, wm] = workStart.split(':').map(Number);
      const kuwaitNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kuwait' }));
      const isLate = kuwaitNow.getHours() > wh || (kuwaitNow.getHours() === wh && kuwaitNow.getMinutes() > wm);

      const { error } = await supabase.from('attendance_records').insert({
        user_id: user!.id,
        employee_name: profile!.full_name,
        clock_in: now.toISOString(),
        clock_in_lat: latitude,
        clock_in_lng: longitude,
        is_late: isLate,
        location: matched.name,
      });
      if (error) { setGeoError(error.message); }
      else { await load(); }
    } catch (err: any) {
      if (err.code === 1) setGeoError('Location access denied. Please allow location in your browser settings and try again.');
      else if (err.code === 3) setGeoError('Location request timed out. Please try again.');
      else setGeoError(err.message ?? 'Unable to get location.');
    }
    setGeoLoading(false);
  }

  async function handleClockOut() {
    if (!todayRecord) return;
    setGeoError(null);
    setGeoLoading(true);
    try {
      const pos = await getPosition();
      const { latitude, longitude } = pos.coords;
      const { error } = await supabase.from('attendance_records').update({
        clock_out: new Date().toISOString(),
        clock_out_lat: latitude,
        clock_out_lng: longitude,
      }).eq('id', todayRecord.id);
      if (error) { setGeoError(error.message); }
      else { await load(); }
    } catch (err: any) {
      if (err.code === 1) setGeoError('Location access denied. Please allow location in your browser settings.');
      else setGeoError(err.message ?? 'Unable to get location.');
    }
    setGeoLoading(false);
  }

  if (loading) return <Spinner />;

  const fenceConfigured = activeFences.length > 0;
  const clockedIn = !!todayRecord;
  const clockedOut = !!todayRecord?.clock_out;

  return (
    <div className={isManager ? '' : 'max-w-3xl'}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Attendance</h1>
        <p className="text-sm text-slate-500">Clock in and out from the store. GPS required.</p>
      </div>

      {/* ── Manager dashboard ── */}
      {isManager && <ManagerDashboard />}

      {isManager && <h2 className="text-lg font-bold text-slate-900 mb-3">My Attendance</h2>}
      <div className="max-w-3xl">
      {/* ── Personal clock-in card ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">My Attendance — Today</h2>
          {clockedIn && (
            todayRecord.is_late
              ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">Late</Badge>
              : <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">On time</Badge>
          )}
          {!clockedIn && <Badge className="bg-slate-100 text-slate-500 border-slate-200">Not clocked in</Badge>}
        </div>

        {clockedIn && (
          <div className="grid grid-cols-3 gap-4 mb-5 text-center">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Clock In</div>
              <div className="font-semibold text-slate-800">{formatTime(todayRecord.clock_in)}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Clock Out</div>
              <div className="font-semibold text-slate-800">
                {todayRecord.clock_out ? formatTime(todayRecord.clock_out) : <span className="text-amber-500">—</span>}
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Duration</div>
              <div className="font-semibold text-slate-800">{durationStr(todayRecord.clock_in, todayRecord.clock_out)}</div>
            </div>
          </div>
        )}

        {geoError && (
          <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{geoError}</span>
          </div>
        )}

        {!fenceConfigured && (
          <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            <MapPin size={15} className="mt-0.5 shrink-0" />
            <span>Store geofence not set up yet. Ask your admin to configure it in Settings.</span>
          </div>
        )}

        <div className="flex gap-3">
          {!clockedIn && (
            <button
              onClick={handleClockIn}
              disabled={geoLoading || !fenceConfigured}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {geoLoading ? <Spinner /> : <LogIn size={18} />}
              {geoLoading ? 'Getting location…' : 'Clock In'}
            </button>
          )}
          {clockedIn && !clockedOut && (
            <button
              onClick={handleClockOut}
              disabled={geoLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {geoLoading ? <Spinner /> : <LogOut size={18} />}
              {geoLoading ? 'Getting location…' : 'Clock Out'}
            </button>
          )}
          {clockedIn && clockedOut && (
            <div className="flex items-center gap-2 text-emerald-600 font-medium">
              <CheckCircle size={18} />
              Shift complete
            </div>
          )}
        </div>

        {fenceConfigured && (
          <p className="mt-3 text-xs text-slate-400 flex items-center gap-1">
            <MapPin size={11} />
            {activeFences.length} location{activeFences.length !== 1 ? 's' : ''}: {activeFences.map((f) => f.name).join(', ')} · Work starts {settings?.work_start_time ?? '09:00'}
          </p>
        )}
      </div>

      {/* ── Personal history ── */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">My Recent History (14 days)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="pb-2 text-left">Date</th>
                  <th className="pb-2 text-left">Clock In</th>
                  <th className="pb-2 text-left">Clock Out</th>
                  <th className="pb-2 text-left">Duration</th>
                  <th className="pb-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-600">{formatDate(r.clock_in)}</td>
                    <td className="py-2 tabular-nums">{formatTime(r.clock_in)}</td>
                    <td className="py-2 tabular-nums">{r.clock_out ? formatTime(r.clock_out) : <span className="text-amber-500">—</span>}</td>
                    <td className="py-2 tabular-nums">{r.clock_out ? durationStr(r.clock_in, r.clock_out) : '—'}</td>
                    <td className="py-2">
                      {r.is_late
                        ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">Late</Badge>
                        : <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">On time</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
