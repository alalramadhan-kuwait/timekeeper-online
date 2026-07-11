import { Fragment, useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Save, UserPlus, Mail, KeyRound, X, Pencil, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';

interface Brand { id: string; name: string; is_active: boolean }
interface TeamProfile { id: string; full_name: string; role: string; email?: string }

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
        Each employee signs in with their own account and sees only the sections for their role.
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
                <td className="px-2 py-2 text-xs text-slate-400 hidden lg:table-cell">{ROLE_HINTS[t.role] ?? ''}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {!protectedRow(t) && (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => startEdit(t)} className="text-slate-400 hover:text-blue-600" title="Edit name / username">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => { setPwFor(pwFor === t.id ? null : t.id); setEditFor(null); setPwValue(''); }}
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

  async function saveGeofence() {
    if (!settingsId) return;
    setGeofenceMsg(null);
    const { error } = await supabase.from('settings').update({
      geofence_lat: geofenceLat ? parseFloat(geofenceLat) : null,
      geofence_lng: geofenceLng ? parseFloat(geofenceLng) : null,
      geofence_radius_m: geofenceRadius ? parseInt(geofenceRadius) : 200,
      work_start_time: workStartTime || '09:00',
    }).eq('id', settingsId);
    if (error) setError(error.message);
    else setGeofenceMsg('Geofence saved');
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

        {isAdmin && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={15} className="text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">Geofence & Work Hours</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Staff can only clock in within this radius of the store. Find coordinates by right-clicking your store on{' '}
              <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Maps</a>.
            </p>
            {geofenceMsg && <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{geofenceMsg}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <label className="text-xs">
                <span className="block text-slate-500 mb-1">Latitude</span>
                <input
                  type="number"
                  step="any"
                  value={geofenceLat}
                  onChange={(e) => setGeofenceLat(e.target.value)}
                  placeholder="e.g. 29.3759"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="block text-slate-500 mb-1">Longitude</span>
                <input
                  type="number"
                  step="any"
                  value={geofenceLng}
                  onChange={(e) => setGeofenceLng(e.target.value)}
                  placeholder="e.g. 47.9774"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="block text-slate-500 mb-1">Radius (meters)</span>
                <input
                  type="number"
                  value={geofenceRadius}
                  onChange={(e) => setGeofenceRadius(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="block text-slate-500 mb-1">Work starts at</span>
                <input
                  type="time"
                  value={workStartTime}
                  onChange={(e) => setWorkStartTime(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm"
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveGeofence}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700"
              >
                <Save size={13} /> Save geofence
              </button>
              {geofenceLat && geofenceLng && (
                <a
                  href={`https://maps.google.com/?q=${geofenceLat},${geofenceLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                >
                  <MapPin size={12} /> View on map
                </a>
              )}
            </div>
          </div>
        )}

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
