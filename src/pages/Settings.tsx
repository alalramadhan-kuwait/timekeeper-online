import { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';

interface Brand { id: string; name: string; is_active: boolean }

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
