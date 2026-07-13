/**
 * Work-hour rules: official 9:00–17:00 (Kuwait), 1-hour grace on arrival.
 *   ≤ 10:00 On time · 10:01–10:15 Minor late · 10:16–10:30 Late · after Serious late
 * Clock-out before 17:00 counts as early leave (unless approved).
 */
export type LateClass = 'On time' | 'Minor late' | 'Late' | 'Serious late';

function kuwaitMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  const [h, m] = parts.split(':').map(Number);
  return h * 60 + m;
}

export function lateClassOf(clockInIso: string, workStart = '09:00', graceMin = 60): LateClass {
  const [wh, wm] = workStart.split(':').map(Number);
  const mins = kuwaitMinutes(clockInIso) - (wh * 60 + wm + graceMin); // minutes past the grace deadline
  if (mins <= 0) return 'On time';
  if (mins <= 15) return 'Minor late';
  if (mins <= 30) return 'Late';
  return 'Serious late';
}

export function isEarlyLeave(clockOutIso: string | null, workEnd = '17:00'): boolean {
  if (!clockOutIso) return false;
  const [eh, em] = workEnd.split(':').map(Number);
  return kuwaitMinutes(clockOutIso) < eh * 60 + em;
}

export const LATE_STYLE: Record<LateClass, string> = {
  'On time': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Minor late': 'bg-amber-50 text-amber-600 border-amber-200',
  'Late': 'bg-amber-100 text-amber-700 border-amber-300',
  'Serious late': 'bg-rose-100 text-rose-700 border-rose-200',
};
