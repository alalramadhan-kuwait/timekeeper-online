/**
 * The parts of the Today board (4.1.0): data only.
 *
 * Every card is a label in small capitals, then figures and marks. No
 * sentences, no questions: colour carries the meaning.
 *
 *   green  good (on pace, in, all in)
 *   red    bad (behind, late, overdue, did not load)
 *   amber  a warning (short, stuck with somebody else, missing data)
 *   blue   due later today
 *   teal   away (leave, work trip)
 *   grey   neutral, or unknown
 *
 * A card that did not load shows its label, a grey dash, "Didn't load" and a
 * Retry button: never a zero and never an all-clear. A card whose refresh
 * failed keeps its last figures with an amber "as of HH:mm" chip.
 */
import type { ReactNode } from 'react';
import { RotateCw } from 'lucide-react';

export type BoardTone = 'green' | 'red' | 'amber' | 'blue' | 'teal' | 'grey';

/** Pills and chips: soft background, dark text. */
export const PILL: Record<BoardTone, string> = {
  green: 'bg-[#dff5e8] text-[#0b5e36]',
  red: 'bg-[#fde8e6] text-[#b42318]',
  amber: 'bg-[#fff1d1] text-[#7a4b00]',
  blue: 'bg-[#e3ecfd] text-[#1d4fb0]',
  teal: 'bg-[#dcf3f1] text-[#0b6b63]',
  grey: 'bg-slate-100 text-slate-600',
};
/** Large figures. */
export const FIG: Record<BoardTone, string> = {
  green: 'text-[#0e8a4f]',
  red: 'text-[#d92d20]',
  amber: 'text-[#b26b00]',
  blue: 'text-[#2f6fdf]',
  teal: 'text-[#0f9488]',
  grey: 'text-slate-600',
};
/** Dots, bar fills and lines. */
export const HEX: Record<BoardTone, string> = {
  green: '#12a05c',
  red: '#d92d20',
  amber: '#f0a000',
  blue: '#2f6fdf',
  teal: '#0f9488',
  grey: '#94a3b8',
};

export function Pill({ tone, children, className = '' }: { tone: BoardTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-[13px] font-bold tabular-nums ${PILL[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** One card on the board: a label, something on the right, then the figures. */
export function BoardCard({ id, label, lead, right, children, busy = false }: {
  id: string; label: string; lead?: ReactNode; right?: ReactNode; children?: ReactNode; busy?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} aria-busy={busy || undefined} tabIndex={-1}
      style={{ scrollMarginTop: 'calc(var(--sa-t, 0px) + 76px)' }}
      className="rounded-[20px] border border-slate-200/80 bg-white px-4 pb-3 pt-3.5 shadow-sm focus:outline-none">
      <div className="flex min-h-[28px] items-center gap-2">
        {lead}
        <h2 id={`${id}-h`} className="text-[14px] font-bold uppercase tracking-[0.06em] text-slate-500">{label}</h2>
        {right && <div className="ml-auto flex items-center gap-1.5">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function RetryButton({ busy, onClick, small = false }: { busy: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-[#f3b7b1] bg-[#fdf2f1] font-bold text-[#b42318] hover:bg-[#fde8e6] disabled:cursor-wait disabled:opacity-60 ${small ? 'px-3 text-[14px]' : 'px-4 text-[15px]'}`}>
      <RotateCw size={16} strokeWidth={2.5} className={busy ? 'animate-spin' : ''} aria-hidden /> Retry
    </button>
  );
}

/** What a card shows when it could not load: unknown, never zero. */
export function Failed({ error, busy, onRetry, big = true }: { error: string | null; busy: boolean; onRetry: () => void; big?: boolean }) {
  return (
    <div role="alert" className="mt-2 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`font-extrabold leading-none text-slate-300 ${big ? 'text-[44px]' : 'text-[28px]'}`} aria-hidden>—</span>
        <span className="text-[15px] font-bold text-[#b42318]" title={error ?? undefined}>Didn&apos;t load</span>
      </div>
      <RetryButton busy={busy} onClick={onRetry} small={!big} />
    </div>
  );
}

/** The last figures that loaded, after a refresh failed: tap to try again. */
export function AsOf({ at, busy, onRetry, error }: { at: string; busy: boolean; onRetry: () => void; error: string | null }) {
  return (
    <button type="button" onClick={onRetry} disabled={busy} title={error ?? undefined}
      aria-label={`Showing figures as of ${at}; the refresh failed. Retry`}
      className="-my-2 inline-flex min-h-[44px] items-center disabled:cursor-wait">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] font-bold tabular-nums ${PILL.amber}`}>
        <RotateCw size={12} strokeWidth={2.5} className={busy ? 'animate-spin' : ''} aria-hidden /> as of {at}
      </span>
    </button>
  );
}

/** Loading: grey blocks where the figures will be. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-3 space-y-2.5" aria-hidden>
      <div className="h-10 w-1/3 animate-pulse rounded-lg bg-slate-200" />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${85 - i * 15}%` }} />)}
    </div>
  );
}
