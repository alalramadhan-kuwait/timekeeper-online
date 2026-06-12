import { differenceInCalendarDays, parseISO } from 'date-fns';

export type ExpiryTier = 'overdue' | 'd7' | 'd30' | 'd60' | 'ok';

export function daysUntil(dateStr: string): number {
  return differenceInCalendarDays(parseISO(dateStr), new Date());
}

/** Reminder tiers per spec: 60 / 30 / 7 days before expiry, plus overdue. */
export function expiryTier(dateStr: string | null | undefined): ExpiryTier {
  if (!dateStr) return 'ok';
  const d = daysUntil(dateStr);
  if (d < 0) return 'overdue';
  if (d <= 7) return 'd7';
  if (d <= 30) return 'd30';
  if (d <= 60) return 'd60';
  return 'ok';
}

export const tierLabel: Record<ExpiryTier, string> = {
  overdue: 'Overdue',
  d7: '≤ 7 days',
  d30: '≤ 30 days',
  d60: '≤ 60 days',
  ok: 'OK',
};

export const tierClass: Record<ExpiryTier, string> = {
  overdue: 'bg-red-100 text-red-700 border-red-200',
  d7: 'bg-orange-100 text-orange-700 border-orange-200',
  d30: 'bg-amber-100 text-amber-700 border-amber-200',
  d60: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
