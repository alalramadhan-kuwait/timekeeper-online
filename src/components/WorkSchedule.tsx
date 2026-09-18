/**
 * When somebody is expected to work — editable, at last.
 *
 * Working days and shift times used to be columns nobody could reach: setting
 * them meant somebody writing SQL, so in practice every employee carried the
 * same default week whatever they actually did. Since "missing check-in" is
 * decided against those days, a roster nobody could edit meant a flag nobody
 * could trust.
 *
 * Schedules are dated rather than overwritten. Moving somebody to afternoons
 * next month must not turn last month's on-time mornings into late arrivals, so
 * a change opens a new dated row and closes the old one. The splitting is done
 * by set_schedule() in one transaction — three writes from here could leave
 * somebody with no schedule at all halfway through.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal, Spinner, Badge } from './ui';
import {
  scheduleFromRow, describeDays, describeShift, KUWAIT_WEEK, WEEK_ORDER, WEEKDAY_SHORT,
  type Schedule, type ScheduleRow, type Weekday,
} from '../shared/schedule';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });

const dateWord = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const covers = (s: Schedule, date: string) =>
  date >= s.effectiveFrom && (s.effectiveTo === null || date <= s.effectiveTo);

/** Sat … Fri, tapped on and off. */
function DayPicker({ days, onChange }: { days: Weekday[]; onChange: (d: Weekday[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEK_ORDER.map((d) => {
        const on = days.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d].sort())}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              on
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
            }`}
          >
            {WEEKDAY_SHORT[d]}
          </button>
        );
      })}
    </div>
  );
}

export function WorkScheduleModal({
  employeeId, employeeName, onClose,
}: { employeeId: string; employeeName: string; onClose: () => void }) {
  const [rows, setRows] = useState<Schedule[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // the form
  const [days, setDays] = useState<Weekday[]>(KUWAIT_WEEK);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [from, setFrom] = useState(today());
  const [temporary, setTemporary] = useState(false);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('employee_schedules')
      .select('id, employee_id, effective_from, effective_to, working_days, shift_start, shift_end, grace_minutes, note')
      .eq('employee_id', employeeId)
      .order('effective_from', { ascending: false });
    if (error) { setErr(error.message); setRows([]); return; }
    const list = ((data ?? []) as ScheduleRow[]).map(scheduleFromRow);
    setRows(list);
    // Start from what they work now, so a small change is a small edit.
    const current = list.find((s) => covers(s, today())) ?? list[0];
    if (current) {
      setDays(current.workingDays);
      setStart(current.shiftStart?.slice(0, 5) ?? '');
      setEnd(current.shiftEnd?.slice(0, 5) ?? '');
    }
  }, [employeeId]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setErr(null);
    if (!days.length) { setErr('Pick at least one working day, or they are never expected in.'); return; }
    if (temporary && !until) { setErr('A temporary change needs a last day.'); return; }
    if (temporary && until < from) { setErr('The last day cannot come before the first.'); return; }
    if (end && start && end <= start) { setErr('The shift ends before it starts.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('set_schedule', {
      p_employee: employeeId,
      p_from: from,
      p_to: temporary ? until : null,
      p_days: days,
      p_start: start || null,
      p_end: end || null,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setNote('');
    setTemporary(false);
    setUntil('');
    await load();
  }

  const now = today();

  return (
    <Modal title={`Work schedule — ${employeeName}`} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-xs text-slate-500">
          Used to decide who was expected in. Changing it from a date leaves earlier days
          judged by the schedule they actually had.
        </p>

        {/* ── what they work ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div>
            <span className="block text-xs font-semibold text-slate-600 mb-1.5">Working days</span>
            <DayPicker days={days} onChange={setDays} />
            <p className="mt-1.5 text-[11px] text-slate-400">
              {days.length ? describeDays(days) : 'No working days — they will never be expected in'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              <span className="block font-semibold text-slate-600 mb-1">Starts at</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </label>
            <label className="text-xs">
              <span className="block font-semibold text-slate-600 mb-1">Ends at</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Leave the times blank to use the shop's opening time. Without a start time nobody
            can be called late.
          </p>
        </div>

        {/* ── when it applies ────────────────────────────────────────────── */}
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              <span className="block font-semibold text-slate-600 mb-1">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </label>
            {temporary && (
              <label className="text-xs">
                <span className="block font-semibold text-slate-600 mb-1">Until</span>
                <input type="date" value={until} min={from} onChange={(e) => setUntil(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              </label>
            )}
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={temporary} onChange={(e) => setTemporary(e.target.checked)}
              className="mt-0.5" />
            <span>
              Just for a while
              <span className="block text-[11px] text-slate-400">
                Their usual schedule comes back by itself the day after.
              </span>
            </span>
          </label>

          <label className="text-xs block">
            <span className="block font-semibold text-slate-600 mb-1">Why (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Covering Avenues while Ahmad is on leave"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </label>
        </div>

        {err && <p className="text-xs text-rose-600">{err}</p>}

        <button onClick={() => void save()} disabled={saving}
          className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : temporary ? 'Set for those dates' : 'Set from this date on'}
        </button>

        {/* ── what it has been ───────────────────────────────────────────── */}
        <div className="pt-3 border-t border-slate-100">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Schedule history</h4>
          {rows === null ? <Spinner /> : !rows.length ? (
            <p className="text-xs text-slate-400">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((s) => (
                <li key={s.id ?? s.effectiveFrom}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-medium text-slate-700 tabular-nums">
                    {dateWord(s.effectiveFrom)} – {s.effectiveTo ? dateWord(s.effectiveTo) : 'ongoing'}
                  </span>
                  {covers(s, now) && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Now</Badge>
                  )}
                  <span className="text-slate-500">{describeDays(s.workingDays)}</span>
                  <span className="text-slate-400">{describeShift(s, 'no set hours')}</span>
                  {s.note && <span className="w-full text-[11px] text-slate-400">{s.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
