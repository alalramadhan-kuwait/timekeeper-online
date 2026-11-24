/**
 * The building blocks of the Today page: one card (icon tile, title with a
 * status chip, one meta line, an optional link on the right, 16px padding)
 * used by Sales, Needs you and Staffing, and the chips, dots and pace bars
 * inside them.
 *
 * One colour rule for all of them:
 *   green  on or ahead of target
 *   amber  needs attention soon
 *   red    overdue, or failing now
 *   grey   neutral, no target, or unknown
 * Grey text is slate-600, never lighter, because it carries information; and
 * nothing is smaller than 12px.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { FROM_TODAY } from './FromToday';

export type Tone = 'green' | 'amber' | 'red' | 'grey';

export const TONE: Record<Tone, { text: string; bar: string; soft: string; dot: string; border: string }> = {
  green: { text: 'text-emerald-700', bar: 'bg-emerald-600', soft: 'bg-emerald-50', dot: 'bg-emerald-600', border: 'border-emerald-200' },
  amber: { text: 'text-amber-700', bar: 'bg-amber-500', soft: 'bg-amber-50', dot: 'bg-amber-500', border: 'border-amber-200' },
  red: { text: 'text-rose-700', bar: 'bg-rose-600', soft: 'bg-rose-50', dot: 'bg-rose-600', border: 'border-rose-200' },
  grey: { text: 'text-slate-600', bar: 'bg-slate-500', soft: 'bg-slate-50', dot: 'bg-slate-400', border: 'border-slate-200' },
};

export function Chip({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[12px] font-semibold tabular-nums ${t.soft} ${t.text} ${t.border} ${className}`}>
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${TONE[tone].dot}`} />;
}

/** Progress against a target, with a mark where it should be by now. */
export function PaceBar({ pct, pace, tone, thick = false, label }: {
  pct: number; pace: number | null; tone: Tone; thick?: boolean; label?: string;
}) {
  return (
    <div role="img" aria-label={label ?? `${Math.round(pct)}%${pace !== null ? ` against ${Math.round(pace)}% of the month gone` : ''}`}
      className={`relative w-full rounded-full bg-slate-200 ${thick ? 'h-3' : 'h-1.5'}`}>
      <div className={`h-full rounded-full ${TONE[tone].bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      {pace !== null && (
        <div className={`absolute w-[2px] rounded bg-slate-900 ${thick ? '-top-1.5 h-6' : '-top-1 h-3.5'}`}
          style={{ left: `calc(${Math.min(100, pace)}% - 1px)` }} />
      )}
    </div>
  );
}

/** The one card. */
export function TodayCard({ id, icon, title, chip, meta, link, flash, children, className = '' }: {
  id: string;
  icon: ReactNode;
  title: string;
  chip?: ReactNode;
  meta?: ReactNode;
  link?: { label: string; to: string };
  /** Outlined for a moment after a headline sentence jumped here. */
  flash?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} tabIndex={-1} style={{ scrollMarginTop: 'calc(var(--sa-t, 0px) + 76px)' }}
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow focus:outline-none ${flash ? 'border-slate-900 ring-2 ring-slate-900/15' : 'border-slate-200'} ${className}`}>
      <header className="flex items-start gap-3">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700" aria-hidden>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={`${id}-h`} className="text-[17px] font-semibold leading-6 text-slate-900">{title}</h2>
            {chip}
          </div>
          {meta && <p className="text-[13px] leading-[18px] text-slate-600">{meta}</p>}
        </div>
        {link && (
          <Link to={link.to} state={FROM_TODAY} className="-mr-2 -mt-1 inline-flex min-h-[44px] shrink-0 items-center rounded-lg pl-2 pr-1 text-[13px] font-semibold text-slate-700 hover:bg-slate-100">
            {link.label}<ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A small heading inside a card, with a rule above it. */
export function SubHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-600">{children}</h3>
      {right}
    </div>
  );
}
