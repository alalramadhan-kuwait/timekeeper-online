/**
 * Applying an approved attendance correction to the record it is about.
 *
 * Approving one used to set a status and stop there, so "Approved" and "fixed"
 * were two different states wearing the same word: the manager still had to
 * open HR → Attendance, find the day, and retype the times out of the
 * employee's paragraph. That is where a 17:30 becomes a 17:00, and where an
 * agreed correction quietly never happens.
 *
 * Kept out of the Inbox screen because what it does is not a screen's job and
 * because it is the part worth testing on its own.
 */
import { supabase } from './supabase';
import { lateClassOf } from './lateness';

export interface CorrectionRequest {
  id: string;
  request_type: string;
  details: string;
  requester: string;
  attendance_date: string | null;
  proposed_clock_in: string | null;
  proposed_clock_out: string | null;
  attendance_record_id: string | null;
  user_id: string | null;
  employee_name: string | null;
  employee_location: string | null;
}

/** True when approving this request should change an attendance record. */
export const isApplicable = (r: CorrectionRequest): boolean =>
  r.request_type === 'Attendance correction'
  && !!r.attendance_date
  && !!(r.proposed_clock_in || r.proposed_clock_out);

/**
 * Write the correction onto the record.
 *
 * Returns null when it worked and a sentence when it did not, so the caller can
 * refuse to mark the request Approved — a request that says Approved while the
 * record still says otherwise is worse than one that is plainly stuck.
 *
 * A time the employee did not give is left alone. Null means "this end was
 * already right", never "clear it": clearing a clock-out turns a finished day
 * into an unfinished one, which is the opposite of a correction.
 */
export async function applyCorrection(
  r: CorrectionRequest, remark?: string,
): Promise<string | null> {
  if (!isApplicable(r)) return null;

  const { data: st } = await supabase.from('settings').select('work_start_time').maybeSingle();
  const workStart = (st as { work_start_time?: string } | null)?.work_start_time ?? '09:00';
  const why = remark?.trim() || r.details;

  /* The record named on the request, if it is still there. A manager may have
     deleted the day in the meantime — that turns this into an insert rather
     than a failure. */
  type Target = { id: string; clock_in: string; justified: boolean | null };
  let target: Target | null = null;
  if (r.attendance_record_id) {
    const { data } = await supabase.from('attendance_records')
      .select('id, clock_in, justified').eq('id', r.attendance_record_id).maybeSingle();
    target = (data as unknown as Target) ?? null;
  }

  if (target) {
    const patch: Record<string, unknown> = { correction_reason: `[correction approved] ${why}` };
    if (r.proposed_clock_in) patch.clock_in = r.proposed_clock_in;
    if (r.proposed_clock_out) patch.clock_out = r.proposed_clock_out;
    const inAt = (patch.clock_in as string) ?? target.clock_in;
    // Lateness follows the corrected arrival — unless it was already excused,
    // which is a decision somebody made and not ours to undo.
    patch.is_late = !target.justified && lateClassOf(inAt, workStart) !== 'On time';
    const { error } = await supabase.from('attendance_records').update(patch).eq('id', target.id);
    return error ? error.message : null;
  }

  /* No record for that day — a shift nobody clocked in for, which is the
     commonest reason to ask. One is created, and that needs a start: if only a
     leaving time was given there is nothing to open the day with, so it is
     refused rather than invented. */
  if (!r.proposed_clock_in) {
    return 'There is no record for that day, so a start time is needed. Ask for the arrival time as well.';
  }
  if (!r.user_id) return 'This request has no linked login, so no attendance record can be created.';

  const { error } = await supabase.from('attendance_records').insert({
    user_id: r.user_id,
    employee_name: r.employee_name ?? r.requester,
    clock_in: r.proposed_clock_in,
    clock_out: r.proposed_clock_out ?? null,
    is_late: lateClassOf(r.proposed_clock_in, workStart) !== 'On time',
    location: r.employee_location,
    correction_reason: `[added from an approved correction] ${why}`,
  });
  return error ? error.message : null;
}
