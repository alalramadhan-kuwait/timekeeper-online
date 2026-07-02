import { useEffect, useState } from 'react';
import { MapPin, LogIn, LogOut, Clock, AlertCircle, CheckCircle, XCircle, CalendarDays } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Spinner, Badge } from '../components/ui';

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

export default function AttendancePage() {
  const { user, profile, role } = useAuth();
  const isManager = ['admin', 'manager', 'hr'].includes(role ?? '');

  const [settings, setSettings] = useState<GeofenceSettings | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [teamRecords, setTeamRecords] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKuwait());
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
    setLoading(false);
  }

  async function loadTeam(date: string) {
    if (!isManager) return;
    const dayStart = `${date}T00:00:00+03:00`;
    const dayEnd = `${date}T23:59:59+03:00`;
    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .gte('clock_in', dayStart)
      .lte('clock_in', dayEnd)
      .order('clock_in', { ascending: true });
    setTeamRecords((data as AttendanceRecord[]) ?? []);
  }

  useEffect(() => { load(); }, [user?.id, profile?.id]);
  useEffect(() => { loadTeam(selectedDate); }, [selectedDate, isManager]);

  async function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('GPS not supported on this device')); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
    });
  }

  async function handleClockIn() {
    if (!settings?.geofence_lat || !settings?.geofence_lng) {
      setGeoError('Geofence not configured. Ask your admin to set up the store location in Settings.');
      return;
    }
    setGeoError(null);
    setGeoLoading(true);
    try {
      const pos = await getPosition();
      const { latitude, longitude } = pos.coords;
      const dist = haversineMeters(latitude, longitude, settings.geofence_lat, settings.geofence_lng);
      const radius = settings.geofence_radius_m ?? 200;
      if (dist > radius) {
        setGeoError(`You are ${Math.round(dist)}m from the store. You must be on-site to clock in (allowed radius: ${radius}m).`);
        setGeoLoading(false);
        return;
      }

      // Determine if late
      const now = new Date();
      const workStart = settings.work_start_time ?? '09:00';
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
      });
      if (error) { setGeoError(error.message); }
      else { await load(); await loadTeam(selectedDate); }
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
      else { await load(); await loadTeam(selectedDate); }
    } catch (err: any) {
      if (err.code === 1) setGeoError('Location access denied. Please allow location in your browser settings.');
      else setGeoError(err.message ?? 'Unable to get location.');
    }
    setGeoLoading(false);
  }

  if (loading) return <Spinner />;

  const fenceConfigured = !!(settings?.geofence_lat && settings?.geofence_lng);
  const clockedIn = !!todayRecord;
  const clockedOut = !!todayRecord?.clock_out;

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Attendance</h1>
        <p className="text-sm text-slate-500">Clock in and out from the store. GPS required.</p>
      </div>

      {/* ── Team view (managers) ── */}
      {isManager && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Team Attendance</h2>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 py-1 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          {teamRecords.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No clock-ins recorded for this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-100">
                    <th className="pb-2 text-left">Employee</th>
                    <th className="pb-2 text-left">Clock In</th>
                    <th className="pb-2 text-left">Clock Out</th>
                    <th className="pb-2 text-left">Duration</th>
                    <th className="pb-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRecords.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium">{r.employee_name}</td>
                      <td className="py-2">{formatTime(r.clock_in)}</td>
                      <td className="py-2">{r.clock_out ? formatTime(r.clock_out) : <span className="text-amber-500">Still in</span>}</td>
                      <td className="py-2 tabular-nums">{durationStr(r.clock_in, r.clock_out)}</td>
                      <td className="py-2">
                        {r.is_late
                          ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">Late</Badge>
                          : <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">On time</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-400">{teamRecords.length} record(s) for {selectedDate}</p>
            </div>
          )}
        </div>
      )}

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
            Geofence: {settings!.geofence_radius_m ?? 200}m radius · Work starts {settings!.work_start_time ?? '09:00'}
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
  );
}
