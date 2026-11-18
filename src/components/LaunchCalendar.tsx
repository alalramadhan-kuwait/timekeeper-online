/**
 * Limited projects on a calendar, by launch date.
 *
 * A month grid (Kuwait week, Saturday first) with each project's photo on the
 * day it launches, the month's launches listed underneath, the next launches
 * whatever month they fall in, and the projects that have no date yet — so a
 * project without a date is visible here too rather than silently missing.
 *
 * Tapping a project opens it in the list's own editor (?focus=<id>), so there
 * is one place a project is edited.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, StatusBadge } from './ui';
import { todayKuwait } from '../shared/kuwaitTime';

export interface LaunchProject {
  id: string;
  project_name: string | null;
  brand: string | null;
  status: string | null;
  launch_date: string | null;
  photo_url: string | null;
  our_allocation: number | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const ym = (d: string) => d.slice(0, 7);
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const dayLabel = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd]} ${day} ${MONTHS[m - 1].slice(0, 3)}${y !== Number(todayKuwait().slice(0, 4)) ? ` ${y}` : ''}`;
};

/** The days of a month laid out in Saturday-first weeks; null pads the edges. */
function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 1) % 7; // Saturday = 0
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function Thumb({ p, size = 'h-10 w-10' }: { p: LaunchProject; size?: string }) {
  return p.photo_url
    ? <img src={p.photo_url} alt="" className={`${size} shrink-0 rounded-lg object-cover border border-slate-200`} />
    : <span aria-hidden className={`${size} shrink-0 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] font-semibold text-slate-400`}>
        {(p.project_name ?? '?').slice(0, 2).toUpperCase()}
      </span>;
}

export default function LaunchCalendar({ onOpen, showClosed }: {
  onOpen: (p: LaunchProject) => void;
  /** Completed and cancelled projects are left off unless asked for, as in the list. */
  showClosed: boolean;
}) {
  const [rows, setRows] = useState<LaunchProject[] | null>(null);
  const today = todayKuwait();
  const [month, setMonth] = useState(ym(today));

  useEffect(() => {
    supabase.from('limited_projects')
      .select('id, project_name, brand, status, launch_date, photo_url, our_allocation')
      .then(({ data }) => setRows((data as LaunchProject[]) ?? []));
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((p) =>
    showClosed || !['Completed', 'Cancelled'].includes(p.status ?? '')), [rows, showClosed]);
  const dated = useMemo(() => shown.filter((p) => p.launch_date)
    .sort((a, b) => a.launch_date!.localeCompare(b.launch_date!)), [shown]);
  const undated = useMemo(() => shown.filter((p) => !p.launch_date)
    .sort((a, b) => (a.project_name ?? '').localeCompare(b.project_name ?? '')), [shown]);

  const byDay = useMemo(() => {
    const m = new Map<string, LaunchProject[]>();
    for (const p of dated) m.set(p.launch_date!, [...(m.get(p.launch_date!) ?? []), p]);
    return m;
  }, [dated]);
  const thisMonth = dated.filter((p) => ym(p.launch_date!) === month);
  const next = dated.filter((p) => p.launch_date! >= today && ym(p.launch_date!) !== month).slice(0, 5);
  /* Which months have something, so the arrows can say where the next one is. */
  const before = dated.filter((p) => ym(p.launch_date!) < month).length;
  const after = dated.filter((p) => ym(p.launch_date!) > month).length;

  if (!rows) return <Spinner />;

  const row = (p: LaunchProject) => (
    <li key={p.id}>
      <button type="button" onClick={() => onOpen(p)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50">
        <Thumb p={p} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900 truncate">{p.project_name ?? 'Untitled'}</span>
          <span className="block text-xs text-slate-500 truncate">
            {p.brand ?? '—'}{p.launch_date ? ` · ${dayLabel(p.launch_date)}` : ''}{p.our_allocation ? ` · ${p.our_allocation} pcs` : ''}
          </span>
        </span>
        {p.status && <StatusBadge value={p.status} />}
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}
            className="h-10 w-10 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 relative">
            <ChevronLeft size={18} />
            {before > 0 && <span aria-hidden className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </button>
          <h2 className="flex-1 text-center text-base font-semibold text-slate-900">{monthTitle(month)}</h2>
          <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}
            className="h-10 w-10 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 relative">
            <ChevronRight size={18} />
            {after > 0 && <span aria-hidden className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </button>
        </div>
        {month !== ym(today) && (
          <div className="px-3 pt-2 text-center">
            <button type="button" onClick={() => setMonth(ym(today))} className="text-xs font-medium text-blue-700 hover:underline">Back to this month</button>
          </div>
        )}
        <div className="grid grid-cols-7 gap-px px-2 pt-2 text-center text-[11px] font-medium text-slate-500">
          {DAYS.map((d) => <div key={d} className={d === 'Fri' ? 'text-slate-400' : ''}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 p-2">
          {monthGrid(month).map((d, i) => {
            if (!d) return <div key={`x${i}`} />;
            const items = byDay.get(d) ?? [];
            const isToday = d === today;
            return (
              <div key={d}
                className={`min-h-[54px] rounded-lg border p-1 flex flex-col items-center gap-0.5
                  ${items.length ? 'border-amber-300 bg-amber-50' : 'border-slate-100'}
                  ${isToday ? 'ring-2 ring-slate-900' : ''}`}>
                <span className={`text-[11px] tabular-nums ${isToday ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{Number(d.slice(8))}</span>
                {items.slice(0, 1).map((p) => (
                  <button key={p.id} type="button" onClick={() => onOpen(p)} aria-label={`${p.project_name}, launches ${dayLabel(d)}`}
                    className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                    <Thumb p={p} size="h-7 w-7" />
                  </button>
                ))}
                {items.length > 1 && <span className="text-[10px] font-semibold text-amber-800">+{items.length - 1}</span>}
              </div>
            );
          })}
        </div>
        <div className="border-t border-slate-100">
          {thisMonth.length === 0
            ? <p className="px-4 py-4 text-sm text-slate-400">No launches in {monthTitle(month)}.</p>
            : <ul className="divide-y divide-slate-100">{thisMonth.map(row)}</ul>}
        </div>
      </section>

      {next.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h3 className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Coming up</h3>
          <ul className="divide-y divide-slate-100">{next.map(row)}</ul>
        </section>
      )}

      {undated.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">No launch date yet · {undated.length}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tap one to give it a date and it moves onto the calendar.</p>
          </div>
          <ul className="divide-y divide-slate-100">{undated.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
