/**
 * Clock-ins nobody closed, one card per person.
 *
 * The morning alert used to say "12 clock-ins never closed" and a list of names,
 * which tells you there is a problem and nothing you need to fix it: which days,
 * what time they came in, where. This page is where the alert lands. Each card
 * is complete on its own — a screenshot of it, or the WhatsApp message under it,
 * is everything the person needs to ask for the right correction.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, LogOut, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { normalizePhone } from '../shared/phoneRules';
import { whatsappLink } from '../shared/messageRules';
import { outletName, outletNameAr, resolveOutlet } from '../shared/outlets';
import { closeShift, hoursOf, kuwaitDate, kuwaitISO } from '../lib/attendanceEdits';
import { useLive } from '../shared/live';

/** Same line the database draws (attendance_abandon_hours): a shift still open after this is forgotten, not running. */
const ABANDON_HOURS = 16;

interface OpenRec { id: string; user_id: string | null; employee_name: string; clock_in: string; location: string | null }
interface Emp { user_id: string | null; full_name: string; name_ar: string | null; phone: string | null }
interface Person { key: string; name: string; nameAr: string | null; phone: string | null; recs: OpenRec[] }

const KW = { timeZone: 'Asia/Kuwait' } as const;
const dayEn = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { ...KW, weekday: 'short', day: 'numeric', month: 'short' });
const dayAr = (iso: string) => new Date(iso).toLocaleDateString('ar-KW-u-nu-latn', { ...KW, weekday: 'long', day: 'numeric', month: 'long' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { ...KW, hour: '2-digit', minute: '2-digit', hour12: false });
const daysAgo = (iso: string) => Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** What to send. Arabic when the record has an Arabic name, which is how the other staff messages decide. */
export function openShiftMessage(p: Person): string {
  if (p.nameAr) {
    const lines = p.recs.map((r) => `• ${dayAr(r.clock_in)}: دخول ${time(r.clock_in)}${r.location ? ` (${outletNameAr(r.location)})` : ''}`);
    return [
      `مرحبا ${p.nameAr}،`,
      p.recs.length === 1 ? 'لم يُسجَّل خروجك في هذا اليوم:' : 'لم يُسجَّل خروجك في هذه الأيام:',
      ...lines,
      '',
      'افتح التطبيق ← My Portal ← Ask for a correction، واختر اليوم واكتب وقت خروجك، حتى تُحسب ساعاتك.',
      'شكراً',
    ].join('\n');
  }
  const lines = p.recs.map((r) => `• ${dayEn(r.clock_in)}: in at ${time(r.clock_in)}${r.location ? ` (${outletName(r.location)})` : ''}`);
  return [
    `Hi ${p.name.split(' ')[0]},`,
    p.recs.length === 1 ? 'Your clock-out was not recorded on this day:' : 'Your clock-out was not recorded on these days:',
    ...lines,
    '',
    'Please open the app → My Portal → Ask for a correction, pick the day and enter the time you left, so your hours count.',
    'Thank you',
  ].join('\n');
}

export default function OpenShiftsPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /* closing time per outlet code, the default leaving time offered */
  const [closes, setCloses] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const cutoff = new Date(Date.now() - ABANDON_HOURS * 3_600_000).toISOString();
    const [{ data: recs, error }, { data: emps }, { data: outs }] = await Promise.all([
      supabase.from('attendance_records').select('id, user_id, employee_name, clock_in, location')
        .is('clock_out', null).lt('clock_in', cutoff).order('clock_in', { ascending: true }),
      supabase.from('employees').select('user_id, full_name, name_ar, phone'),
      supabase.from('outlets').select('code, closes_at'),
    ]);
    setCloses(Object.fromEntries(((outs ?? []) as { code: string; closes_at: string | null }[])
      .filter((o) => o.closes_at).map((o) => [o.code, (o.closes_at as string).slice(0, 5)])));
    if (error) { setErr(error.message); setPeople([]); return; }
    const byUser = new Map(((emps ?? []) as Emp[]).filter((e) => e.user_id).map((e) => [e.user_id as string, e]));
    const groups = new Map<string, Person>();
    for (const r of (recs ?? []) as OpenRec[]) {
      const key = r.user_id ?? r.employee_name;
      const e = r.user_id ? byUser.get(r.user_id) : undefined;
      const p = groups.get(key) ?? { key, name: e?.full_name ?? r.employee_name, nameAr: e?.name_ar ?? null, phone: e?.phone ?? null, recs: [] };
      p.recs.push(r);
      groups.set(key, p);
    }
    // most open days first: that is who to chase first
    setPeople([...groups.values()].sort((a, b) => b.recs.length - a.recs.length || a.name.localeCompare(b.name)));
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLive('open-shifts', [{ table: 'attendance_records' }], load);

  const total = useMemo(() => (people ?? []).reduce((n, p) => n + p.recs.length, 0), [people]);

  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard refused */ }
  }

  if (!people) return <Spinner />;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Clock-ins not closed</h1>
        <p className="text-sm text-slate-500">
          {total === 0
            ? 'Everyone has clocked out. Nothing to chase.'
            : `${total} shift${total === 1 ? '' : 's'} with no clock-out, ${people.length} ${people.length === 1 ? 'person' : 'people'}. Until each is corrected, those days count no hours.`}
        </p>
      </div>
      {err && <div className="px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      {people.map((p) => {
        const msg = openShiftMessage(p);
        const wa = whatsappLink(normalizePhone(p.phone), msg);
        return (
          <section key={p.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="flex items-baseline justify-between gap-3 px-4 pt-4">
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900">{p.name}</h2>
                {p.nameAr && <p className="text-sm text-slate-500" dir="auto">{p.nameAr}</p>}
              </div>
              <span className="shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200">
                {p.recs.length} not closed
              </span>
            </header>
            <ul className="px-4 py-3 divide-y divide-slate-100">
              {p.recs.map((r) => (
                <CloseRow key={r.id} r={r} defaultOut={closes[resolveOutlet(r.location) ?? ''] ?? ''} onClosed={load} />
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 px-4 pb-4">
              {wa ? (
                <a href={wa} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                  <MessageCircle size={15} /> Send on WhatsApp
                </a>
              ) : (
                <span className="inline-flex items-center px-3 py-2 rounded-lg bg-slate-50 text-slate-500 text-xs border border-slate-200">
                  No phone number on file (HR → Employees)
                </span>
              )}
              <button type="button" onClick={() => void copy(p.key, msg)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">
                {copied === p.key ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy message</>}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * One open day. Tap Close, pick the time they left (the outlet's closing time
 * is offered), and it is closed here, without going to Attendance.
 */
function CloseRow({ r, defaultOut, onClosed }: { r: OpenRec; defaultOut: string; onClosed: () => void }) {
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState(defaultOut);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const h = /^\d{2}:\d{2}$/.test(out) ? hoursOf(r.clock_in, kuwaitISO(kuwaitDate(r.clock_in), out)) : null;

  async function save() {
    setBusy(true); setMsg(null);
    const e = await closeShift(r, out, 'clock-out was missing');
    setBusy(false);
    if (e) { setMsg(e); return; }
    onClosed();
  }

  return (
    <li className="py-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="whitespace-nowrap text-slate-900 font-medium">{dayEn(r.clock_in)}</div>
          <div className="truncate text-xs text-slate-500">{r.location ? outletName(r.location).replace(/^Time Keeper - /, '') : 'Place not recorded'}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="whitespace-nowrap text-slate-700 tabular-nums">In {time(r.clock_in)}</div>
            <div className="whitespace-nowrap text-xs text-rose-600 tabular-nums">{daysAgo(r.clock_in)}d open</div>
          </div>
          {!open && (
            <button type="button" onClick={() => { setOut(defaultOut); setOpen(true); }}
              className="min-h-[44px] inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              <LogOut size={15} /> Close
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
          <label className="text-xs font-semibold text-slate-600" htmlFor={`out-${r.id}`}>Out at</label>
          <input id={`out-${r.id}`} type="time" value={out} onChange={(e) => setOut(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-2 text-base tabular-nums" />
          <span className="text-sm font-semibold tabular-nums text-slate-700">{h !== null ? `${h.toFixed(1)} h` : '—'}</span>
          <button type="button" disabled={busy || h === null} onClick={() => void save()}
            className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => { setOpen(false); setMsg(null); }}
            className="min-h-[44px] rounded-lg px-3 text-sm text-slate-600 hover:bg-white">Cancel</button>
          {msg && <div className="w-full text-xs font-semibold text-rose-700">{msg}</div>}
        </div>
      )}
    </li>
  );
}
