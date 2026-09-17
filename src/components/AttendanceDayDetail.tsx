import { useCallback, useEffect, useState } from 'react';
import { Check, Plus, X, Loader2 } from 'lucide-react';
import { Badge, Spinner } from './ui';
import { isEarlyLeave, lateClassOf } from '../lib/lateness';
import {
  loadDay, saveCorrection, addRecord, deleteRecord,
  kuwaitHM, fmtTime, hoursOf, type AttendanceRecord,
} from '../lib/attendanceEdits';

/**
 * One person's attendance on one day, with everything a manager can do to it.
 *
 * The same component behind the List view's pencil and the calendar's squares.
 * It was only ever the List's inline edit row, which is why a red square on the
 * calendar — the exact thing somebody wants to click — did nothing at all.
 *
 * It fetches the day itself rather than taking a slice of whatever the caller
 * happens to be holding. That is deliberate: the calendar keeps one record per
 * cell, so a split shift would have shown half a day's hours here, and after a
 * correction the caller's copy is stale by definition.
 */
export function AttendanceDayDetail({ employee, date, workStart, note, onChanged }: {
  employee: { full_name: string; user_id: string | null; location: string | null };
  date: string;
  workStart: string;
  /** Why the day looks the way it does when there is no record — approved
   *  leave, a day off — so an empty panel is never just empty. */
  note?: string;
  /** Fired after any write, so the view that opened this refreshes. */
  onChanged: () => void;
}) {
  const [recs, setRecs] = useState<AttendanceRecord[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [eIn, setEIn] = useState(''); const [eOut, setEOut] = useState('');
  const [eReason, setEReason] = useState(''); const [eJustified, setEJustified] = useState(false);

  const [adding, setAdding] = useState(false);
  const [aIn, setAIn] = useState('09:00'); const [aOut, setAOut] = useState('');
  const [aReason, setAReason] = useState('');

  const refresh = useCallback(async () => {
    if (!employee.user_id) { setRecs([]); return; }
    setRecs(await loadDay(employee.user_id, date));
  }, [employee.user_id, date]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* Every write ends the same way: reload this panel, then tell whoever opened
     it. Without the second half a correction made from the calendar would leave
     the square its old colour. */
  async function run(key: string, op: () => Promise<string | null>) {
    setBusy(key); setErr(null);
    const problem = await op();
    setBusy(null);
    if (problem) { setErr(problem); return; }
    setEditId(null); setAdding(false); setAReason('');
    await refresh();
    onChanged();
  }

  function startEdit(r: AttendanceRecord) {
    setEditId(editId === r.id ? null : r.id);
    setAdding(false);
    setEIn(kuwaitHM(r.clock_in));
    setEOut(r.clock_out ? kuwaitHM(r.clock_out) : '');
    setEReason(r.correction_reason ?? '');
    setEJustified(r.justified);
  }

  async function remove(r: AttendanceRecord) {
    const reason = window.prompt(`Mark ${employee.full_name} absent by deleting this record?\nEnter the reason (required):`);
    if (!reason?.trim()) return;
    await run(`del-${r.id}`, () => deleteRecord(r, reason));
  }

  const input = 'px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white';
  const dayLabel = new Date(`${date}T12:00:00+03:00`)
    .toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' });

  if (recs === null) return <div className="py-6"><Spinner /></div>;

  const totalHours = recs.reduce((t, r) => t + (r.clock_out ? hoursOf(r.clock_in, r.clock_out) : 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <p className="text-sm font-semibold text-slate-800">{employee.full_name}</p>
          <p className="text-xs text-slate-400">{dayLabel}</p>
        </div>
        {recs.length > 0 && (
          <p className="text-xs text-slate-500">
            {recs.length} shift{recs.length === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold tabular-nums text-slate-700">{totalHours.toFixed(1)}h</span>
          </p>
        )}
      </div>

      {err && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</p>}

      {!employee.user_id && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          No linked account, so this person cannot clock in and nothing can be recorded for them.
          Link one in HR → Employees.
        </p>
      )}

      {!recs.length && employee.user_id && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {note ?? 'Nothing recorded for this day.'}
        </p>
      )}

      {recs.map((r) => {
        const late = lateClassOf(r.clock_in, workStart);
        return (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="tabular-nums font-medium text-slate-800">{fmtTime(r.clock_in)}</span>
              <span className="text-slate-300">→</span>
              <span className="tabular-nums font-medium text-slate-800">
                {r.clock_out ? fmtTime(r.clock_out) : <span className="text-slate-400 font-normal">still open</span>}
              </span>
              {r.clock_out && (
                <span className="text-xs text-slate-400 tabular-nums">{hoursOf(r.clock_in, r.clock_out).toFixed(1)}h</span>
              )}
              {r.justified
                ? <Badge className="bg-slate-100 text-slate-600 border-slate-200">Late — excused</Badge>
                : late !== 'On time' && <Badge className="bg-amber-100 text-amber-700 border-amber-200">{late}</Badge>}
              {r.clock_out && isEarlyLeave(r.clock_out) && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200">Left early</Badge>
              )}
              <span className="text-xs text-slate-400">{r.location ?? 'No location'}</span>
              <span className="ml-auto flex items-center gap-2">
                <button onClick={() => startEdit(r)}
                  className={`text-xs font-medium ${editId === r.id ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}>
                  {editId === r.id ? 'Cancel' : 'Correct'}
                </button>
                <button onClick={() => remove(r)} disabled={busy === `del-${r.id}`}
                  className="text-slate-400 hover:text-rose-600 disabled:opacity-50" title="Delete (mark absent)">
                  <X size={15} />
                </button>
              </span>
            </div>

            {r.correction_reason && (
              <p className="mt-1 text-[11px] text-blue-600">Corrected: {r.correction_reason}</p>
            )}

            {editId === r.id && (
              <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-end gap-2">
                <label className="text-xs"><span className="block text-slate-500 mb-1">Clock in</span>
                  <input type="time" value={eIn} onChange={(e) => setEIn(e.target.value)} className={input} /></label>
                <label className="text-xs"><span className="block text-slate-500 mb-1">Clock out</span>
                  <input type="time" value={eOut} onChange={(e) => setEOut(e.target.value)} className={input} /></label>
                <label className="text-xs flex-1 min-w-[12rem]"><span className="block text-slate-500 mb-1">Correction reason (required)</span>
                  <input value={eReason} onChange={(e) => setEReason(e.target.value)}
                    placeholder="Why is this being corrected?" className={`${input} w-full`} /></label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-2">
                  <input type="checkbox" checked={eJustified} onChange={(e) => setEJustified(e.target.checked)} className="h-3.5 w-3.5" />
                  Justified late
                </label>
                <button
                  onClick={() => run(`save-${r.id}`, () => saveCorrection(r,
                    { clockIn: eIn, clockOut: eOut, reason: eReason, justified: eJustified }, workStart))}
                  disabled={busy === `save-${r.id}`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-60">
                  {busy === `save-${r.id}` ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save correction
                </button>
              </div>
            )}
          </div>
        );
      })}

      {employee.user_id && (adding ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 flex flex-wrap items-end gap-2">
          <label className="text-xs"><span className="block text-slate-500 mb-1">Clock in</span>
            <input type="time" value={aIn} onChange={(e) => setAIn(e.target.value)} className={input} /></label>
          <label className="text-xs"><span className="block text-slate-500 mb-1">Clock out</span>
            <input type="time" value={aOut} onChange={(e) => setAOut(e.target.value)} className={input} /></label>
          <label className="text-xs flex-1 min-w-[12rem]"><span className="block text-slate-500 mb-1">Reason (required)</span>
            <input value={aReason} onChange={(e) => setAReason(e.target.value)}
              placeholder="e.g. forgot phone" className={`${input} w-full`} /></label>
          <button
            onClick={() => run('add', () => addRecord({
              userId: employee.user_id as string, employeeName: employee.full_name,
              location: employee.location, date, clockIn: aIn, clockOut: aOut, reason: aReason,
            }, workStart))}
            disabled={busy === 'add'}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-60">
            {busy === 'add' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Add record
          </button>
          <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-slate-600 pb-1.5"><X size={15} /></button>
        </div>
      ) : (
        <button onClick={() => { setAdding(true); setEditId(null); }}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline">
          <Plus size={13} /> {recs.length ? 'Add another shift' : 'Add a record for this day'}
        </button>
      ))}

      <p className="text-[10px] text-slate-400">
        Old and new values are recorded automatically in the History Log.
      </p>
    </div>
  );
}
