import { useEffect, useMemo, useState } from 'react';
import { BellRing, Send, Check, Clock, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Spinner, Badge } from '../components/ui';

interface Cfg { id: number; working_start: number; working_end: number; quiet_enabled: boolean; bulk_summary_enabled: boolean; batch_seconds: number }
interface Setting { event_type: string; label: string; category: string; enabled: boolean; person_target: boolean; audience_roles: string[] | null; sort: number }
interface Notif { id: string; created_at: string; event_type: string; title: string; body: string; audience_roles: string[] | null; person_user_id: string | null; delivered_at: string | null; opened_at: string | null }

const ROLES = ['admin', 'manager', 'hr', 'operations', 'sales', 'marketing'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h >= 12 ? 'PM' : 'AM'}`;
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuwait' });

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export default function NotificationSettingsPage() {
  const { role } = useAuth();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [history, setHistory] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function load() {
    const [c, s, h] = await Promise.all([
      supabase.from('notification_config').select('*').eq('id', 1).single(),
      supabase.from('notification_settings').select('*').order('sort'),
      supabase.from('notifications').select('id, created_at, event_type, title, body, audience_roles, person_user_id, delivered_at, opened_at').order('created_at', { ascending: false }).limit(50),
    ]);
    setCfg(c.data as Cfg);
    setSettings((s.data as Setting[]) ?? []);
    setHistory((h.data as Notif[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveCfg(patch: Partial<Cfg>) {
    if (!cfg) return;
    const next = { ...cfg, ...patch };
    setCfg(next);
    await supabase.from('notification_config').update(patch).eq('id', 1);
  }
  async function saveSetting(ev: string, patch: Partial<Setting>) {
    setSettings((prev) => prev.map((s) => (s.event_type === ev ? { ...s, ...patch } : s)));
    await supabase.from('notification_settings').update(patch).eq('event_type', ev);
  }
  function toggleRole(s: Setting, r: string) {
    const cur = new Set(s.audience_roles ?? []);
    cur.has(r) ? cur.delete(r) : cur.add(r);
    saveSetting(s.event_type, { audience_roles: [...cur] });
  }

  async function sendTest() {
    setTesting(true); setMsg(null);
    const { data, error } = await supabase.functions.invoke('notify-test', { body: {} });
    setTesting(false);
    if (error) { setMsg('Could not send test — check your connection.'); return; }
    if ((data as any)?.error) { setMsg((data as any).error); return; }
    setMsg((data as any)?.sent > 0 ? 'Test notification sent to this account.' : 'No device is subscribed for your account yet — enable notifications in My Portal first.');
    setTimeout(load, 800);
  }

  const grouped = useMemo(() => {
    const g: Record<string, Setting[]> = {};
    for (const s of settings) (g[s.category] ??= []).push(s);
    return g;
  }, [settings]);

  if (role !== 'admin') return <div className="text-slate-500 py-16 text-center">Only an admin can manage notification settings.</div>;
  if (loading || !cfg) return <Spinner />;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><BellRing size={20} /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-tight">Notification Settings</h1>
          <p className="text-sm text-slate-500">Control what gets sent, to whom, and when.</p>
        </div>
        <button onClick={sendTest} disabled={testing}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60">
          <Send size={15} /> {testing ? 'Sending…' : 'Send test'}
        </button>
      </div>

      {msg && <div className="px-4 py-2.5 rounded-lg text-sm border bg-emerald-50 border-emerald-200 text-emerald-700">{msg}</div>}

      {/* global controls */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3"><Clock size={16} className="text-slate-500" /><h2 className="text-sm font-semibold text-slate-700">Quiet hours</h2></div>
          <label className="flex items-center gap-3 mb-3 text-sm text-slate-700">
            <Toggle on={cfg.quiet_enabled} onClick={() => saveCfg({ quiet_enabled: !cfg.quiet_enabled })} /> Hold notifications outside working hours
          </label>
          <div className={`flex items-center gap-2 text-sm ${cfg.quiet_enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            <span className="text-slate-500">Working hours</span>
            <select value={cfg.working_start} onChange={(e) => saveCfg({ working_start: Number(e.target.value) })} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
              {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
            <span className="text-slate-400">to</span>
            <select value={cfg.working_end} onChange={(e) => saveCfg({ working_end: Number(e.target.value) })} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white">
              {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-2">Kuwait time. Held notifications are delivered when working hours resume.</p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3"><Layers size={16} className="text-slate-500" /><h2 className="text-sm font-semibold text-slate-700">Bulk-sync summary</h2></div>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <Toggle on={cfg.bulk_summary_enabled} onClick={() => saveCfg({ bulk_summary_enabled: !cfg.bulk_summary_enabled })} /> Combine many PO changes into one summary
          </label>
          <p className="text-xs text-slate-400 mt-2">When off, each PO change sends its own notification.</p>
        </div>
      </section>

      {/* event types */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-700">Notification types</h2></div>
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat}>
            <div className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{cat}</div>
            <ul className="divide-y divide-slate-100">
              {list.map((s) => (
                <li key={s.event_type} className="px-5 py-3 flex flex-wrap items-center gap-3">
                  <Toggle on={s.enabled} onClick={() => saveSetting(s.event_type, { enabled: !s.enabled })} />
                  <span className={`text-sm font-medium ${s.enabled ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
                  <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                    {s.person_target ? (
                      <span className="text-xs text-slate-400">→ the employee / assignee</span>
                    ) : (
                      ROLES.map((r) => {
                        const on = (s.audience_roles ?? []).includes(r);
                        return (
                          <button key={r} onClick={() => toggleRole(s, r)} disabled={!s.enabled}
                            className={`px-2 py-0.5 rounded-full text-xs border capitalize disabled:opacity-40 ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}`}>
                            {r}
                          </button>
                        );
                      })
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* history */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-700">History</h2>
          <Badge className="bg-slate-100 text-slate-600 border-slate-200">latest {history.length}</Badge>
          <button onClick={load} className="ml-auto text-xs text-blue-600 hover:underline">Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Notification</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">To</th>
                <th className="text-center px-4 py-2">Sent</th>
                <th className="text-center px-4 py-2">Opened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No notifications yet.</td></tr>}
              {history.map((n) => (
                <tr key={n.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500">{fmt(n.created_at)}</td>
                  <td className="px-4 py-2"><div className="font-medium text-slate-800">{n.title}</div><div className="text-xs text-slate-500 max-w-md truncate">{n.body}</div></td>
                  <td className="px-4 py-2 hidden md:table-cell text-xs text-slate-500">{n.person_user_id ? 'Direct' : (n.audience_roles ?? []).join(', ') || '—'}</td>
                  <td className="px-4 py-2 text-center">{n.delivered_at ? <Check size={15} className="inline text-emerald-600" /> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-2 text-center">{n.opened_at ? <Check size={15} className="inline text-emerald-600" /> : <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
