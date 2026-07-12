import { Fragment, useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Save, UserPlus, Mail, KeyRound, X, Pencil, Check, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { PAGES } from '../components/Layout';

interface Brand { id: string; name: string; is_active: boolean }
interface TeamProfile { id: string; full_name: string; role: string; email?: string; page_access?: string[] | null }

/** Show "ahmad" for ahmad@time-keeper.com, otherwise the full email. */
const usernameOf = (email?: string) =>
  email ? (email.toLowerCase().endsWith('@time-keeper.com') ? email.split('@')[0] : email) : '—';

const ROLES = ['admin', 'manager', 'sales', 'operations', 'staff', 'hr', 'viewer'];
const ROLE_HINTS: Record<string, string> = {
  admin: 'Full access + settings & users',
  manager: 'Full access',
  sales: 'CRM, follow-ups, VIP, demand list',
  operations: 'Supplier payments, consignments, limited projects, stock',
  staff: 'Sales + purchasing view (legacy)',
  hr: 'Employees, leave, company documents',
  viewer: 'Read-only',
};

/** Admin & manager: team members and role-based access (managers cannot touch admin accounts) */
function TeamAccess() {
  const { user, role } = useAuth();
  const isManager = role === 'manager';
  const assignableRoles = isManager ? ROLES.filter((r) => r !== 'admin') : ROLES;
  const [team, setTeam] = useState<TeamProfile[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('sales');
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [editFor, setEditFor] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [accessFor, setAccessFor] = useState<string | null>(null);
  const [accessSel, setAccessSel] = useState<Set<string>>(new Set());
  const [accessCustom, setAccessCustom] = useState(false);
  // managers may not modify admin accounts; nobody may modify their own via this panel
  const protectedRow = (t: TeamProfile) => isManager && t.role === 'admin';
  const lockedRow = (t: TeamProfile) => t.id === user?.id || protectedRow(t);

  async function load() {
    // the edge function returns login emails; fall back to profiles if it's unavailable
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'list' } });
    setBusy(false);
    if (!error && data?.team) {
      setTeam((data.team as TeamProfile[]).sort((a, b) => a.full_name.localeCompare(b.full_name)));
    } else {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      setTeam((profs ?? []) as TeamProfile[]);
    }
  }
  useEffect(() => { load(); }, []);

  async function call(body: Record<string, unknown>) {
    setBusy(true); setMsg(null); setErr(null);
    const { data, error } = await supabase.functions.invoke('admin-users', { body });
    setBusy(false);
    if (error) {
      // surface the function's real error message, not the generic wrapper
      let detail = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const parsed = await ctx.clone().json();
          if (parsed?.error) detail = parsed.error;
        }
      } catch { /* keep wrapper message */ }
      setErr(detail);
      return false;
    }
    if (data?.error) { setErr(data.error); return false; }
    return true;
  }

  function startEdit(t: TeamProfile) {
    setEditFor(editFor === t.id ? null : t.id);
    setPwFor(null);
    setEditName(t.full_name);
    setEditUsername(usernameOf(t.email));
  }

  async function saveEdit(t: TeamProfile) {
    const body: Record<string, unknown> = { action: 'update', user_id: t.id, full_name: editName.trim() || t.full_name };
    const typed = editUsername.trim();
    const current = usernameOf(t.email);
    if (typed && typed !== current) {
      body.email = typed.includes('@') ? typed : `${typed.toLowerCase()}@time-keeper.com`;
    }
    if (await call(body)) {
      setMsg('Account updated');
      setEditFor(null);
      load();
    }
  }

  function startAccess(t: TeamProfile) {
    const open = accessFor === t.id ? null : t.id;
    setAccessFor(open);
    setPwFor(null); setEditFor(null);
    if (open) {
      const custom = Array.isArray(t.page_access) && t.page_access.length > 0;
      setAccessCustom(custom);
      setAccessSel(new Set(custom ? t.page_access! : PAGES.map((p) => p.to)));
    }
  }

  function toggleAccess(to: string) {
    setAccessSel((prev) => {
      const next = new Set(prev);
      if (next.has(to)) next.delete(to); else next.add(to);
      return next;
    });
  }

  async function saveAccess(t: TeamProfile) {
    // custom off = reset to role defaults (null); custom on = explicit allow-list
    const page_access = accessCustom ? [...accessSel] : null;
    if (await call({ action: 'set_access', user_id: t.id, page_access })) {
      setMsg(accessCustom ? `Custom access saved for ${t.full_name}` : `${t.full_name} reset to role defaults`);
      setAccessFor(null);
      load();
    }
  }

  async function deleteUser(t: TeamProfile) {
    if (!window.confirm(`Delete the account for ${t.full_name} (${usernameOf(t.email)})? They will no longer be able to sign in. This cannot be undone.`)) return;
    if (await call({ action: 'delete', user_id: t.id })) {
      setMsg(`Account for ${t.full_name} deleted`);
      load();
    }
  }

  async function createUser() {
    if (!newEmail || !newPassword) { setErr('Username and password are required'); return; }
    // simple usernames become name@time-keeper.com behind the scenes
    const email = newEmail.includes('@') ? newEmail.trim() : `${newEmail.trim().toLowerCase()}@time-keeper.com`;
    if (await call({ action: 'create', email, password: newPassword, full_name: newName || newEmail, role: newRole })) {
      setMsg(`Account created — they sign in with "${newEmail.includes('@') ? newEmail : newEmail.trim().toLowerCase()}" and the password you set`);
      setNewEmail(''); setNewName(''); setNewPassword('');
      load();
    }
  }

  async function setRole(id: string, role: string) {
    if (await call({ action: 'set_role', user_id: id, role })) {
      setMsg('Role updated');
      load();
    }
  }

  async function resetPassword() {
    if (!pwFor) return;
    if (pwValue.length < 6) { setErr('Password must be at least 6 characters'); return; }
    if (await call({ action: 'set_password', user_id: pwFor, password: pwValue })) {
      setMsg('Password changed — share it with the employee securely');
      setPwFor(null); setPwValue('');
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus size={15} className="text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">Team & Access</h2>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Each employee signs in with their own account. Pick a role for quick defaults, or use the sliders
        (<SlidersHorizontal size={11} className="inline" />) to tick exactly which pages that person can open.
      </p>
      {msg && <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{msg}</div>}
      {err && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Username</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2 hidden lg:table-cell">Access</th>
              <th className="px-2 py-2 w-px whitespace-nowrap text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {team.map((t) => (
              <Fragment key={t.id}>
              <tr className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-2 font-medium text-slate-700 whitespace-nowrap">
                  {t.full_name}{t.id === user?.id && <span className="text-xs text-slate-400"> (you)</span>}
                </td>
                <td className="px-2 py-2 text-slate-500 whitespace-nowrap font-mono text-xs">{usernameOf(t.email)}</td>
                <td className="px-2 py-2">
                  <select
                    value={t.role}
                    disabled={busy || lockedRow(t)}
                    onChange={(e) => setRole(t.id, e.target.value)}
                    title={protectedRow(t) ? 'Only admins can change admin accounts' : undefined}
                    className="px-2 py-1 rounded-lg border border-slate-300 text-xs bg-white capitalize disabled:opacity-50"
                  >
                    {(t.role === 'admin' ? ROLES : assignableRoles).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2 text-xs hidden lg:table-cell">
                  {Array.isArray(t.page_access) && t.page_access.length > 0
                    ? <span className="text-violet-600 font-medium">Custom · {t.page_access.length} pages</span>
                    : <span className="text-slate-400">{ROLE_HINTS[t.role] ?? ''}</span>}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {!protectedRow(t) && (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startAccess(t)} className={`hover:text-violet-600 ${accessFor === t.id ? 'text-violet-600' : 'text-slate-400'}`} title="Customize page access">
                        <SlidersHorizontal size={14} />
                      </button>
                      <button onClick={() => startEdit(t)} className="text-slate-400 hover:text-blue-600" title="Edit name / username">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => { setPwFor(pwFor === t.id ? null : t.id); setEditFor(null); setAccessFor(null); setPwValue(''); }}
                        className="text-slate-400 hover:text-blue-600" title="Change password">
                        <KeyRound size={14} />
                      </button>
                      {t.id !== user?.id && (
                        <button onClick={() => deleteUser(t)} className="text-slate-400 hover:text-red-600" title="Delete account">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
              {editFor === t.id && (
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td colSpan={5} className="px-2 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Edit:</span>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm w-40" />
                      <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} placeholder="Username"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm w-40" />
                      <button onClick={() => saveEdit(t)} disabled={busy}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium disabled:opacity-60">
                        <Check size={12} /> {busy ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditFor(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              )}
              {accessFor === t.id && (
                <tr className="border-b border-slate-100 bg-violet-50/40">
                  <td colSpan={5} className="px-3 py-3">
                    <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
                      <input type="checkbox" checked={accessCustom} onChange={(e) => setAccessCustom(e.target.checked)} className="h-4 w-4" />
                      <span className="font-medium text-slate-700">Custom page access for {t.full_name}</span>
                      <span className="text-xs text-slate-400">(off = use the {t.role} role defaults)</span>
                    </label>
                    {accessCustom && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 mb-3 pl-1">
                        {PAGES.map((p) => (
                          <label key={p.to} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={accessSel.has(p.to)} onChange={() => toggleAccess(p.to)} className="h-3.5 w-3.5" />
                            {p.label}
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveAccess(t)} disabled={busy}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium disabled:opacity-60">
                        <Check size={12} /> {busy ? 'Saving…' : 'Save access'}
                      </button>
                      <span className="text-xs text-slate-400">Dashboard is always visible; Settings stays admin/manager only.</span>
                      <button onClick={() => setAccessFor(null)} className="text-slate-400 hover:text-slate-600 ml-auto"><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              )}
              {pwFor === t.id && (
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td colSpan={5} className="px-2 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">New password for <b>{t.full_name}</b>:</span>
                      <input
                        value={pwValue}
                        onChange={(e) => setPwValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && resetPassword()}
                        placeholder="At least 6 characters"
                        type="text"
                        autoFocus
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm w-56"
                      />
                      <button onClick={resetPassword} disabled={busy}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium disabled:opacity-60">
                        <KeyRound size={12} /> {busy ? 'Saving…' : 'Set password'}
                      </button>
                      <button onClick={() => { setPwFor(null); setPwValue(''); }} className="text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Add employee account</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name"
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
        <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Username (e.g. ahmad) or email" type="text"
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
        <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Temporary password (6+ chars)" type="text"
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
        <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white capitalize">
          {assignableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-400 mb-2">{ROLE_HINTS[newRole]}</p>
      <button onClick={createUser} disabled={busy}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
        <UserPlus size={13} /> {busy ? 'Working…' : 'Create account'}
      </button>
    </div>
  );
}

/** Admin-only: daily briefing recipients + test */
function DailyBriefing() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('settings').select('id, briefing_emails').single().then(({ data }) => {
      if (data) {
        setSettingsId(data.id);
        setEmails((data.briefing_emails as string[]) ?? []);
      }
    });
  }, []);

  async function saveEmails(list: string[]) {
    setEmails(list);
    setSaveMsg(null);
    if (!settingsId) return;
    const { error } = await supabase.from('settings').update({ briefing_emails: list }).eq('id', settingsId);
    setSaveMsg(error ? `Save failed: ${error.message}` : 'Recipients saved');
  }

  function addEmail() {
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setSaveMsg('Not a valid email address'); return; }
    if (emails.includes(v)) { setDraft(''); return; }
    saveEmails([...emails, v]);
    setDraft('');
  }

  async function sendTest() {
    setSending(true); setResult(null);
    const { data, error } = await supabase.functions.invoke('daily-briefing', { body: {} });
    setSending(false);
    if (error) setResult(`Failed: ${error.message}`);
    else if (data?.error) setResult(`Failed: ${data.error}`);
    else setResult(`Sent ✓ to ${(data?.sent_to ?? []).join(', ')}`);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={15} className="text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">Daily Briefing Email</h2>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Sent automatically every morning at 8:30 (Kuwait): yesterday's sales, overdue follow-ups, supplier balance,
        stock value, not-moving stock, low stock and pending leave. Sending requires the <code>RESEND_API_KEY</code>{' '}
        secret in Supabase (free key at resend.com).
      </p>

      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Recipients</h3>
      <div className="flex flex-wrap gap-2 mb-2">
        {emails.map((e) => (
          <span key={e} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-sm">
            {e}
            <button onClick={() => saveEmails(emails.filter((x) => x !== e))} className="text-slate-400 hover:text-red-600" title={`Remove ${e}`}>
              <Trash2 size={12} />
            </button>
          </span>
        ))}
        {emails.length === 0 && <span className="text-sm text-slate-400">No recipients yet — add at least one email.</span>}
      </div>
      <div className="flex gap-2 max-w-md mb-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEmail()}
          placeholder="name@example.com"
          type="email"
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm flex-1"
        />
        <button onClick={addEmail} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm"><Plus size={14} /> Add</button>
      </div>
      {saveMsg && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-sm border ${saveMsg === 'Recipients saved' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {saveMsg}
        </div>
      )}

      {result && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-sm border ${result.startsWith('Sent') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {result}
        </div>
      )}
      <button onClick={sendTest} disabled={sending}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
        <Mail size={13} /> {sending ? 'Sending…' : 'Send test briefing now'}
      </button>
    </div>
  );
}

/** Editable string-list card backed by an array column on settings. */
function ListEditor({ title, hint, items, onChange, disabled }: {
  title: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft('');
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {hint && <p className="text-xs text-slate-400 mb-3">{hint}</p>}
      <div className="flex flex-wrap gap-2 mb-3">
        {items.map((item) => (
          <span key={item} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-sm">
            {item}
            {!disabled && (
              <button onClick={() => onChange(items.filter((x) => x !== item))} className="text-slate-400 hover:text-red-600" title={`Remove ${item}`}>
                <Trash2 size={12} />
              </button>
            )}
          </span>
        ))}
        {items.length === 0 && <span className="text-sm text-slate-400">Empty</span>}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add…"
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm flex-1"
          />
          <button onClick={add} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm"><Plus size={14} /> Add</button>
        </div>
      )}
    </div>
  );
}

interface GeofenceRow { id: string; name: string; lat: number; lng: number; radius_m: number; active: boolean }

/** Admin: manage one geofence per location (HQ, Avenues, Time Gallery…). */
function Geofences({ workStartTime, setWorkStartTime, onSaveHours, savedMsg }: {
  workStartTime: string;
  setWorkStartTime: (v: string) => void;
  onSaveHours: () => void;
  savedMsg: string | null;
}) {
  const [fences, setFences] = useState<GeofenceRow[]>([]);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('200');
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('geofences').select('*').order('name');
    setFences((data as GeofenceRow[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim() || !lat || !lng) { setMsg('Name, latitude and longitude are required'); return; }
    const { error } = await supabase.from('geofences').insert({
      name: name.trim(), lat: parseFloat(lat), lng: parseFloat(lng), radius_m: radius ? parseInt(radius) : 200,
    });
    if (error) { setMsg(error.message); return; }
    setName(''); setLat(''); setLng(''); setRadius('200'); setMsg('Location added');
    load();
  }

  async function toggle(f: GeofenceRow) {
    await supabase.from('geofences').update({ active: !f.active }).eq('id', f.id);
    load();
  }

  async function remove(f: GeofenceRow) {
    if (!window.confirm(`Delete the "${f.name}" geofence? Staff there won't be able to clock in.`)) return;
    await supabase.from('geofences').delete().eq('id', f.id);
    load();
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2">
      <div className="flex items-center gap-2 mb-1">
        <MapPin size={15} className="text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">Attendance Locations (Geofences)</h2>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        One geofence per site — HQ, Avenues, Time Gallery. Staff can clock in when within any active location's radius.
        Get coordinates by right-clicking the site on{' '}
        <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Maps</a>.
      </p>
      {msg && <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{msg}</div>}

      <div className="overflow-x-auto mb-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-2 py-2">Location</th>
              <th className="px-2 py-2">Latitude</th>
              <th className="px-2 py-2">Longitude</th>
              <th className="px-2 py-2 text-right">Radius</th>
              <th className="px-2 py-2">Active</th>
              <th className="px-2 py-2 w-px" />
            </tr>
          </thead>
          <tbody>
            {fences.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-slate-400">No locations yet — add one below.</td></tr>}
            {fences.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-2 font-medium text-slate-700 whitespace-nowrap">{f.name}</td>
                <td className="px-2 py-2 text-slate-500 tabular-nums">{f.lat}</td>
                <td className="px-2 py-2 text-slate-500 tabular-nums">{f.lng}</td>
                <td className="px-2 py-2 text-right tabular-nums">{f.radius_m}m</td>
                <td className="px-2 py-2">
                  <button onClick={() => toggle(f)}>
                    <Badge className={f.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}>
                      {f.active ? 'Active' : 'Off'}
                    </Badge>
                  </button>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <a href={`https://maps.google.com/?q=${f.lat},${f.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 mr-2" title="View on map"><MapPin size={13} className="inline" /></a>
                  <button onClick={() => remove(f)} className="text-slate-400 hover:text-red-600" title="Delete"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Add location</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Avenues)" className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
        <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
        <input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
        <input type="number" value={radius} onChange={(e) => setRadius(e.target.value)} placeholder="Radius (m)" className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
      </div>
      <button onClick={add} className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 mb-4"><Plus size={14} /> Add location</button>

      <div className="border-t border-slate-100 pt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="block text-slate-500 mb-1">Work starts at (for late flagging)</span>
          <input type="time" value={workStartTime} onChange={(e) => setWorkStartTime(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
        </label>
        <button onClick={onSaveHours} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700"><Save size={13} /> Save work hours</button>
        {savedMsg && <span className="text-xs text-emerald-600">{savedMsg}</span>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const canBrands = ['admin', 'manager'].includes(role ?? '');

  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<string[]>([]);
  const [staffRoster, setStaffRoster] = useState<string[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [newBrand, setNewBrand] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Geofence state
  const [geofenceLat, setGeofenceLat] = useState('');
  const [geofenceLng, setGeofenceLng] = useState('');
  const [geofenceRadius, setGeofenceRadius] = useState('200');
  const [workStartTime, setWorkStartTime] = useState('09:00');
  const [geofenceMsg, setGeofenceMsg] = useState<string | null>(null);

  async function load() {
    const [s, b] = await Promise.all([
      supabase.from('settings').select('id, outlets, staff_roster, geofence_lat, geofence_lng, geofence_radius_m, work_start_time').single(),
      supabase.from('brands').select('id, name, is_active').order('sort_order').order('name'),
    ]);
    if (s.data) {
      setSettingsId(s.data.id);
      setOutlets((s.data.outlets as string[]) ?? []);
      setStaffRoster((s.data.staff_roster as string[]) ?? []);
      setGeofenceLat(s.data.geofence_lat?.toString() ?? '');
      setGeofenceLng(s.data.geofence_lng?.toString() ?? '');
      setGeofenceRadius(s.data.geofence_radius_m?.toString() ?? '200');
      setWorkStartTime(s.data.work_start_time ?? '09:00');
    }
    setBrands((b.data as Brand[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveSettings(fields: { outlets?: string[]; staff_roster?: string[] }) {
    if (!settingsId) return;
    setError(null); setMsg(null);
    const { error } = await supabase.from('settings').update(fields).eq('id', settingsId);
    if (error) setError(error.message);
    else setMsg('Saved');
  }

  async function addBrand() {
    const name = newBrand.trim();
    if (!name) return;
    setError(null); setMsg(null);
    const { error } = await supabase.from('brands').insert({ name });
    if (error) { setError(error.message); return; }
    setNewBrand('');
    setMsg('Brand added');
    load();
  }

  // work-start-time is global; the geofence locations live in their own table (managed in <Geofences/>)
  async function saveGeofence() {
    if (!settingsId) return;
    setGeofenceMsg(null);
    void geofenceLat; void geofenceLng; void geofenceRadius; // retained for legacy settings compatibility
    const { error } = await supabase.from('settings').update({
      work_start_time: workStartTime || '09:00',
    }).eq('id', settingsId);
    if (error) setError(error.message);
    else setGeofenceMsg('Work hours saved');
  }

  async function toggleBrand(b: Brand) {
    setError(null); setMsg(null);
    const { error } = await supabase.from('brands').update({ is_active: !b.is_active }).eq('id', b.id);
    if (error) setError(error.message);
    else load();
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Shared lists used by both Timekeeper Online and the store CRM.
          {!isAdmin && ' Outlets and staff roster are admin-only.'}
        </p>
      </div>

      {msg && <div className="mb-3 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{msg}</div>}
      {error && <div className="mb-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ListEditor
          title="Store outlets"
          hint="Used in sales entry and the outlet filter (e.g. Avenues, TimeGallery, WhatsApp)."
          items={outlets}
          disabled={!isAdmin}
          onChange={(v) => { setOutlets(v); saveSettings({ outlets: v }); }}
        />
        <ListEditor
          title="Staff roster"
          hint="Names available in the store CRM staff dropdown."
          items={staffRoster}
          disabled={!isAdmin}
          onChange={(v) => { setStaffRoster(v); saveSettings({ staff_roster: v }); }}
        />

        {['admin', 'manager'].includes(role ?? '') && <TeamAccess />}
        {isAdmin && <DailyBriefing />}

        {isAdmin && <Geofences workStartTime={workStartTime} setWorkStartTime={setWorkStartTime} onSaveHours={saveGeofence} savedMsg={geofenceMsg} />}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700">Brands</h2>
          <p className="text-xs text-slate-400 mb-3">Click a brand to activate / deactivate it.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => canBrands && toggleBrand(b)}
                disabled={!canBrands}
                title={b.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
              >
                <Badge className={b.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200 line-through'}>
                  {b.name}
                </Badge>
              </button>
            ))}
          </div>
          {canBrands && (
            <div className="flex gap-2 max-w-md">
              <input
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addBrand()}
                placeholder="New brand name…"
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm flex-1"
              />
              <button onClick={addBrand} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm"><Plus size={14} /> Add</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
