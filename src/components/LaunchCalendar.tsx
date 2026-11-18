/**
 * Limited projects on a calendar, by launch date.
 *
 * A year at a glance: twelve months, each holding the projects that launch in
 * it with their photo and day. A month only ever has one or two, so a month
 * grid was mostly empty squares. Projects with no date yet are listed below, so
 * a project without a date is visible here too rather than silently missing.
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

const dayLabel = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd]} ${day} ${MONTHS[m - 1].slice(0, 3)}${y !== Number(todayKuwait().slice(0, 4)) ? ` ${y}` : ''}`;
};

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
  const [year, setYear] = useState(Number(today.slice(0, 4)));

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

  const yearOf = (p: LaunchProject) => Number(p.launch_date!.slice(0, 4));
  const inYear = dated.filter((p) => yearOf(p) === year);
  const byMonth = MONTHS.map((_, i) => inYear.filter((p) => Number(p.launch_date!.slice(5, 7)) === i + 1));
  /* Whether other years hold anything, so the arrows can say so. */
  const before = dated.filter((p) => yearOf(p) < year).length;
  const after = dated.filter((p) => yearOf(p) > year).length;
  const thisMonth = today.slice(0, 7);

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
          <button type="button" aria-label="Previous year" onClick={() => setYear(year - 1)}
            className="h-10 w-10 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 relative">
            <ChevronLeft size={18} />
            {before > 0 && <span aria-hidden className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </button>
          <div className="flex-1 text-center">
            <h2 className="text-base font-semibold text-slate-900 tabular-nums">{year}</h2>
            <p className="text-xs text-slate-500">{inYear.length} {inYear.length === 1 ? 'launch' : 'launches'}</p>
          </div>
          <button type="button" aria-label="Next year" onClick={() => setYear(year + 1)}
            className="h-10 w-10 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 relative">
            <ChevronRight size={18} />
            {after > 0 && <span aria-hidden className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 p-2">
          {MONTHS.map((name, i) => {
            const items = byMonth[i];
            const key = `${year}-${String(i + 1).padStart(2, '0')}`;
            const isNow = key === thisMonth;
            const past = key < thisMonth;
            return (
              <div key={key}
                className={`rounded-xl border p-2 flex flex-col gap-1.5 min-h-[76px]
                  ${items.length ? 'border-amber-300 bg-amber-50/60' : 'border-slate-100'}
                  ${isNow ? 'ring-2 ring-slate-900' : ''}`}>
                <div className="flex items-baseline justify-between">
                  <span className={`text-sm font-semibold ${past && !items.length ? 'text-slate-400' : 'text-slate-800'}`}>{name.slice(0, 3)}</span>
                  {items.length > 0 && <span className="text-[11px] font-semibold text-amber-800">{items.length}</span>}
                </div>
                {items.map((p) => (
                  <button key={p.id} type="button" onClick={() => onOpen(p)}
                    className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 p-1.5 text-left hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                    <Thumb p={p} size="h-9 w-9" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-900 leading-tight line-clamp-2">{p.project_name ?? 'Untitled'}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{Number(p.launch_date!.slice(8))} {name.slice(0, 3)} · {p.brand ?? '—'}</span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>

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
