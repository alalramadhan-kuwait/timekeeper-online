/**
 * Work-hour wording, over the shared punctuality engine.
 *
 * The rules themselves — how late is late, what counts as leaving early, and
 * crucially *whose* hours a person is measured against — live in
 * src/shared/punctuality.ts, so the back office, the shop floor and the reports
 * all agree. This file is the back office's shorthand over it.
 *
 * Both functions take the shift they are judging against. They used to default
 * to the office's 09:00–17:00 for everybody, which scored an afternoon shop
 * shift as hours late every day somebody turned up on time.
 */
import { dayPunctuality, lateClassOf as classOf, type LateClass } from '../shared/punctuality';

export type { LateClass };

const kuwaitDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });

/** How late an arrival was, in words, against a shift start. */
export function lateClassOf(clockInIso: string, workStart = '09:00', graceMin = 60): LateClass {
  const d = dayPunctuality(
    { date: kuwaitDate(clockInIso), schedules: [], records: [{ clockIn: clockInIso, clockOut: null }] },
    { defaultStart: workStart, graceMinutes: graceMin },
  );
  return d.lateClass ?? classOf(0);
}

/** Did they leave before their shift ended? False when nobody has said when it ends. */
export function isEarlyLeave(clockOutIso: string | null, workEnd: string | null = '17:00'): boolean {
  if (!clockOutIso || !workEnd) return false;
  const d = dayPunctuality(
    { date: kuwaitDate(clockOutIso), schedules: [], records: [{ clockIn: clockOutIso, clockOut: clockOutIso }] },
    { defaultEnd: workEnd },
  );
  return (d.hoursEarly ?? 0) > 0;
}

export const LATE_STYLE: Record<LateClass, string> = {
  'On time': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Minor late': 'bg-amber-50 text-amber-600 border-amber-200',
  'Late': 'bg-amber-100 text-amber-700 border-amber-300',
  'Serious late': 'bg-rose-100 text-rose-700 border-rose-200',
};
