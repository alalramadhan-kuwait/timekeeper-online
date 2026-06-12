import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, Spinner, StatusBadge } from './ui';
import { useAuth } from '../context/AuthContext';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';

export type SelectOption = string | { value: string; label: string };

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: SelectOption[];
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  /** convert form value -> db value on save (e.g. comma list -> text[]) */
  parse?: (v: any) => any;
  /** convert db value -> form value when editing */
  display?: (v: any) => any;
}

export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: Record<string, any>) => React.ReactNode;
}

export interface CrudConfig {
  table: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  statusField?: string;
  statusOptions?: string[];
  /** statuses considered "open" — used for default filter */
  searchKeys?: string[];
  orderBy?: { column: string; ascending?: boolean };
  canWrite: (role: string | null) => boolean;
  stampCreatedBy?: boolean;
  /** final adjustment of the payload before insert/update */
  beforeSave?: (payload: Record<string, any>) => Record<string, any>;
  /** called after any successful insert/update/delete */
  onChanged?: () => void;
}

export function CrudModule({ config }: { config: CrudConfig }) {
  const { role, user } = useAuth();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [error, setError] = useState<string | null>(null);

  const writable = config.canWrite(role);

  async function load() {
    setLoading(true);
    const order = config.orderBy ?? { column: 'created_at', ascending: false };
    const { data, error } = await supabase
      .from(config.table)
      .select('*')
      .order(order.column, { ascending: order.ascending ?? false });
    if (error) setError(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [config.table]);

  const filtered = useMemo(() => {
    let r = rows;
    if (config.statusField && statusFilter !== 'All') {
      r = r.filter((row) => row[config.statusField!] === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const keys = config.searchKeys ?? config.columns.map((c) => c.key);
      r = r.filter((row) => keys.some((k) => String(row[k] ?? '').toLowerCase().includes(q)));
    }
    return r;
  }, [rows, search, statusFilter, config]);

  async function save(form: Record<string, any>) {
    setError(null);
    let payload: Record<string, any> = {};
    for (const f of config.fields) {
      let v = form[f.key];
      if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
      if (v === '') v = null;
      payload[f.key] = f.parse ? f.parse(v) : v;
    }
    if (config.beforeSave) payload = config.beforeSave(payload);
    if (editing) {
      const { error } = await supabase.from(config.table).update(payload).eq('id', editing.id);
      if (error) { setError(error.message); return; }
    } else {
      if (config.stampCreatedBy !== false && user) payload.created_by = user.id;
      const { error } = await supabase.from(config.table).insert(payload);
      if (error) { setError(error.message); return; }
    }
    setShowForm(false);
    setEditing(null);
    load();
    config.onChanged?.();
  }

  async function remove(row: Record<string, any>) {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    const { error } = await supabase.from(config.table).delete().eq('id', row.id);
    if (error) setError(error.message);
    else { load(); config.onChanged?.(); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{config.title}</h1>
          {config.description && <p className="text-sm text-slate-500">{config.description}</p>}
        </div>
        {writable && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700"
          >
            <Plus size={16} /> Add
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white w-56"
          />
        </div>
        {config.statusField && config.statusOptions && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option>All</option>
            {config.statusOptions.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        <div className="ml-auto text-sm text-slate-500 self-center">{filtered.length} records</div>
      </div>

      {error && <div className="mb-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                {config.columns.map((c) => <th key={c.key} className="px-4 py-3 whitespace-nowrap">{c.label}</th>)}
                {writable && <th className="px-4 py-3 w-20" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={config.columns.length + 1} className="px-4 py-8 text-center text-slate-400">No records</td></tr>
              )}
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {config.columns.map((c) => (
                    <td key={c.key} className="px-4 py-2.5 whitespace-nowrap">
                      {c.render ? c.render(row) : (
                        c.key === config.statusField || c.key === 'priority'
                          ? <StatusBadge value={String(row[c.key] ?? '')} />
                          : <span>{row[c.key] ?? '—'}</span>
                      )}
                    </td>
                  ))}
                  {writable && (
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setEditing(row); setShowForm(true); }} className="text-slate-400 hover:text-blue-600" aria-label="Edit"><Pencil size={15} /></button>
                        <button onClick={() => remove(row)} className="text-slate-400 hover:text-red-600" aria-label="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <RecordForm
          config={config}
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={save}
        />
      )}
    </div>
  );
}

function RecordForm({ config, initial, onCancel, onSave }: {
  config: CrudConfig;
  initial: Record<string, any> | null;
  onCancel: () => void;
  onSave: (form: Record<string, any>) => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(() => {
    const f: Record<string, any> = {};
    for (const fd of config.fields) {
      let v = initial?.[fd.key];
      if (v != null && fd.display) v = fd.display(v);
      f[fd.key] = v ?? fd.defaultValue ?? (fd.type === 'checkbox' ? false : '');
    }
    return f;
  });

  function set(key: string, value: unknown) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <Modal title={initial ? `Edit — ${config.title}` : `New — ${config.title}`} onClose={onCancel}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {config.fields.map((f) => (
          <label key={f.key} className={`text-sm ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
            <span className="block text-slate-600 mb-1">{f.label}{f.required && ' *'}</span>
            {f.type === 'select' ? (
              <select
                value={form[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                required={f.required}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {!f.required && <option value="">—</option>}
                {f.options?.map((o) =>
                  typeof o === 'string'
                    ? <option key={o} value={o}>{o}</option>
                    : <option key={o.value} value={o.value}>{o.label}</option>,
                )}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                value={form[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            ) : f.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={!!form[f.key]}
                onChange={(e) => set(f.key, e.target.checked)}
                className="h-5 w-5 mt-1"
              />
            ) : (
              <input
                type={f.type}
                step={f.type === 'number' ? 'any' : undefined}
                value={form[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                required={f.required}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            )}
          </label>
        ))}
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700">Save</button>
        </div>
      </form>
    </Modal>
  );
}
