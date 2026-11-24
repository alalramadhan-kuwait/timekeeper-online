/**
 * Getting back to Today from a page Today opened.
 *
 * Every link on Today carries `state={FROM_TODAY}`. A page opened that way can
 * offer "Today" as a back button that really goes back — history.back(), so
 * Layout restores Today's scroll position (see useScrollMemory) and an open
 * branch sheet comes back with it. A page reached any other way (a shared link,
 * the menu, a notification) has no Today entry behind it, so the same button
 * goes to Today instead of leaving the app.
 *
 * <ContextBar> is the one line a filtered destination shows at its top: what
 * it was opened on ("Avenues · today"), the way back, and "Show all", which
 * clears the filter the link set.
 */
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';

export const FROM_TODAY = { from: 'today' } as const;

/** Whether this page was opened by a link on Today (and Back will return there). */
export function useCameFromToday(): boolean {
  const location = useLocation();
  const st = location.state as { from?: string } | null;
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  return st?.from === 'today' && idx > 0;
}

/** Back to Today: history.back() when Today is the entry behind, otherwise a fresh Today. */
export function useBackToToday(): () => void {
  const navigate = useNavigate();
  const came = useCameFromToday();
  return () => (came ? navigate(-1) : navigate('/'));
}

export function BackToToday({ className = '' }: { className?: string }) {
  const back = useBackToToday();
  return (
    <button type="button" onClick={back}
      className={`-ml-2 inline-flex min-h-[44px] items-center gap-0.5 rounded-lg pl-1 pr-2.5 text-[14px] font-semibold text-slate-700 hover:bg-slate-100 ${className}`}>
      <ChevronLeft className="h-5 w-5" aria-hidden /> Today
    </button>
  );
}

/** The filter a link opened this page on, with Back to Today and Show all. */
export function ContextBar({ children, onClear, clearLabel = 'Show all' }: {
  children: ReactNode;
  onClear: () => void;
  clearLabel?: string;
}) {
  const came = useCameFromToday();
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-slate-300 bg-white px-3 py-1 shadow-sm">
      {came && <BackToToday />}
      {/* on a phone the filter gets its own line under the two buttons */}
      <p className="order-last min-w-0 basis-full pb-2 text-[14px] leading-5 text-slate-900 sm:order-none sm:flex-1 sm:basis-auto sm:py-2">{children}</p>
      <button type="button" onClick={onClear}
        className="ml-auto inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 text-[14px] font-semibold text-slate-700 hover:bg-slate-100 sm:ml-0">
        <X className="h-4 w-4" aria-hidden /> {clearLabel}
      </button>
    </div>
  );
}
