/**
 * The only place an attendance record is written by hand.
 *
 * Correcting a day, adding one somebody never clocked, and removing one all
 * used to live inside the Attendance page's List view, as closures over its
 * state. Nothing else could reach them, so the calendar beside it could show a
 * red square and do nothing about it.
 *
 * They are here so that both views call the same code. Every write still goes
 * through `attendance_records`, still passes the geofence trigger, and is still
 * audited into the History Log by the database — none of that moved.
 */
import { supabase } from './supabase';
import { lateClassOf } from './lateness';

export interface AttendanceRecord {
  id: string; user_id: string; employee_name: string;
  clock_in: string; clock_out: string | null;
  is_late: boolean; justified: boolean; notes: string | null;
  correction_reason: string | null; location: string | null;
  // Written by the database when the record is stored, never by the phone.
  clock_in_distance_m: number | null; clock_in_accuracy_m: number | null;
  clock_out_distance_m: number | null;
  geo_source: string | null; geo_flag: string | null;
}

/** yyyy-MM-dd + HH:mm in Kuwait → an instant. Kuwait is UTC+3 all year. */
export const kuwaitISO = (date: string, time: string) =>
  new Date(`${date}T${time}:00+03:00`).toISOString();
/** The HH:MM an instant reads as in Kuwait, for a time input. */
export const kuwaitHM = (iso: string) => new Intl.DateTimeFormat('en-GB',
  { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
export const kuwaitDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
export const fmtTime = (iso: string) => new Date(iso)
  .toLocaleTimeString('en-KW', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kuwait' });
export const hoursOf = (a: string, b: string | null) =>
  (((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 3600000);

/** Every record a person has on one Kuwait day — not the first one. A split
 *  shift is two rows, and a detail view that showed one of them would be
 *  quietly wrong about the day's hours. */
export async function loadDay(userId: string, date: string): Promise<AttendanceRecord[]> {
  const { data } = await supabase.from('attendance_records').select('*')
    .eq('user_id', userId)
    .gte('clock_in', `${date}T00:00:00+03:00`).lte('clock_in', `${date}T23:59:59+03:00`)
    .order('clock_in', { ascending: true });
  return (data as AttendanceRecord[]) ?? [];
}

/** Returns null on success, or the message to show. */
export async function saveCorrection(
  r: AttendanceRecord,
  edit: { clockIn: string; clockOut: string; reason: string; justified: boolean },
  workStart: string,
): Promise<string | null> {
  if (!edit.reason.trim()) return 'Correction reason is required';
  const day = kuwaitDate(r.clock_in);
  const clockIn = kuwaitISO(day, edit.clockIn || kuwaitHM(r.clock_in));
  const { error } = await supabase.from('attendance_records').update({
    clock_in: clockIn,
    clock_out: edit.clockOut ? kuwaitISO(day, edit.clockOut) : null,
    correction_reason: edit.reason.trim(),
    justified: edit.justified,
    // Lateness follows the corrected arrival, unless it has been excused.
    is_late: !edit.justified && lateClassOf(clockIn, workStart) !== 'On time',
  }).eq('id', r.id);
  return error ? error.message : null;
}

export async function addRecord(
  a: { userId: string; employeeName: string; location: string | null;
       date: string; clockIn: string; clockOut: string; reason: string },
  workStart: string,
): Promise<string | null> {
  if (!a.userId) return 'This employee has no linked account — link it in HR → Employees first';
  if (!a.reason.trim()) return 'Correction reason is required';
  const clockIn = kuwaitISO(a.date, a.clockIn);
  const { error } = await supabase.from('attendance_records').insert({
    user_id: a.userId,
    employee_name: a.employeeName,
    clock_in: clockIn,
    clock_out: a.clockOut ? kuwaitISO(a.date, a.clockOut) : null,
    is_late: lateClassOf(clockIn, workStart) !== 'On time',
    correction_reason: `[added by manager] ${a.reason.trim()}`,
    location: a.location,
  });
  return error ? error.message : null;
}

/** Marking somebody absent. The reason is written onto the row first so the
 *  audit trigger captures why it went, then the row is removed. */
export async function deleteRecord(r: AttendanceRecord, reason: string): Promise<string | null> {
  if (!reason.trim()) return 'A reason is required';
  await supabase.from('attendance_records')
    .update({ correction_reason: `[deleted] ${reason.trim()}` }).eq('id', r.id);
  const { error } = await supabase.from('attendance_records').delete().eq('id', r.id);
  return error ? error.message : null;
}
