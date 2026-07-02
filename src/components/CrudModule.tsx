import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, ImageOff, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, Spinner, StatusBadge } from './ui';
import { useAuth } from '../context/AuthContext';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'combobox' | 'textarea' | 'checkbox' | 'image';

export type SelectOption = string | { value: string; label: string };

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: SelectOption[];
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  bucket?: string;
  parse?: (v: any) => any;
  display?: (v: any) => any;
}

export interface ColumnDef {
  key: string;
  label: string;
  sortable?: boolean;
  /** For computed columns (no matching field in the row) — returns the value to sort by */
  sortValue?: (row: Record<string, any>) => any;
  render?: (row: Record<string, any>) => React.ReactNode;
}

export interface ExtraFilter {
  key: string;
  label: string;
  options?: string[]; // if omitted, derived from loaded rows
}

export interface CrudConfig {
  table: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  statusField?: string;
  statusOptions?: string[];
  searchKeys?: string[];
  orderBy?: { column: string; ascending?: boolean };
  canWrite: (role: string | null) => boolean;
  stampCreatedBy?: boolean;
  beforeSave?: (payload: Record<string, any>) => Record<string, any>;
  onChanged?: () => void;
  filter?: (row: Record<string, any>) => boolean;
  toolbarExtra?: React.ReactNode;
  rowClickToEdit?: boolean;
  extraFilters?: ExtraFilter[];
}

export function CrudModule({ config }: { config: CrudConfig }) {
  const { role, user } = useAuth();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [extraFilterValues, setExtraFilterValues] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
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

  // Derive combobox options from loaded rows
  const comboboxOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of config.fields) {
      if (f.type === 'combobox') {
        const vals = [...new Set(rows.map((r) => String(r[f.key] ?? '')).filter(Boolean))].sort();
        map[f.key] = vals;
      }
    }
    return map;
  }, [rows, config.fields]);

  // Derive extra filter options from loaded rows
  const extraFilterOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const ef of config.extraFilters ?? []) {
      if (ef.options) { map[ef.key] = ef.options; continue; }
      map[ef.key] = [...new Set(rows.map((r) => String(r[ef.key] ?? '')).filter(Boolean))].sort();
    }
    return map;
  }, [rows, config.extraFilters]);

  function handleSort(key: string) {
    if (sortCol === key) {
      if (sortAsc) { setSortAsc(false); }
      else { setSortCol(null); setSortAsc(true); }
    } else {
      setSortCol(key);
      setSortAsc(true);
    }
  }

  const filtered = useMemo(() => {
    let r = rows;
    if (config.filter) r = r.filter(config.filter);
    if (config.statusField && statusFilter !== 'All') {
      r = r.filter((row) => row[config.statusField!] === statusFilter);
    }
    for (const [k, v] of Object.entries(extraFilterValues)) {
      if (v && v !== 'All') r = r.filter((row) => String(row[k] ?? '') === v);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const keys = config.searchKeys ?? config.columns.map((c) => c.key);
      r = r.filter((row) => keys.some((k) => String(row[k] ?? '').toLowerCase().includes(q)));
    }
    if (sortCol) {
      const colDef = config.columns.find((c) => c.key === sortCol);
      const getVal = (row: Record<string, any>) => colDef?.sortValue ? colDef.sortValue(row) : row[sortCol];
      r = [...r].sort((a, b) => {
        const av = getVal(a) ?? '';
        const bv = getVal(b) ?? '';
        const an = Number(av), bn = Number(bv);
        const cmp = av !== '' && bv !== '' && !isNaN(an) && !isNaN(bn)
          ? an - bn
          : String(av).localeCompare(String(bv));
        return sortAsc ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, search, statusFilter, extraFilterValues, sortCol, sortAsc, config]);

  async function save(form: Record<string, any>) {
    setError(null);
    let payload: Record<string, any> = {};
    for (const f of config.fields) {
      let v = form[f.key];
      if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
      if (f.type !== 'image' && v === '') v = null;
      if (f.type === 'image' && v === '') v = null;
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
        {(config.extraFilters ?? []).map((ef) => (
          <select
            key={ef.key}
            value={extraFilterValues[ef.key] ?? 'All'}
            onChange={(e) => setExtraFilterValues((p) => ({ ...p, [ef.key]: e.target.value }))}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="All">All {ef.label}s</option>
            {(extraFilterOptions[ef.key] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {config.toolbarExtra}
        <div className="ml-auto text-sm text-slate-500 self-center">{filtered.length} records</div>
      </div>

      {error && <div className="mb-3 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                {config.columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-3 whitespace-nowrap select-none ${c.sortable ? 'cursor-pointer hover:text-slate-800' : ''}`}
                    onClick={c.sortable ? () => handleSort(c.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {c.sortable && (
                        sortCol === c.key
                          ? sortAsc ? <ChevronUp size={12} className="text-slate-700" /> : <ChevronDown size={12} className="text-slate-700" />
                          : <ChevronsUpDown size={12} className="text-slate-300" />
                      )}
                    </span>
                  </th>
                ))}
                {writable && <th className="px-4 py-3 w-20" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={config.columns.length + 1} className="px-4 py-8 text-center text-slate-400">No records</td></tr>
              )}
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${config.rowClickToEdit && writable ? 'cursor-pointer' : ''}`}
                  onClick={config.rowClickToEdit && writable ? () => { setEditing(row); setShowForm(true); } : undefined}
                >
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
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
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
          comboboxOptions={comboboxOptions}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={save}
        />
      )}
    </div>
  );
}

function RecordForm({ config, initial, comboboxOptions, onCancel, onSave }: {
  config: CrudConfig;
  initial: Record<string, any> | null;
  comboboxOptions: Record<string, string[]>;
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
  const [uploading, setUploading] = useState<string | null>(null);

  function set(key: string, value: unknown) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleImageUpload(f: FieldDef, file: File) {
    if (!f.bucket) return;
    setUploading(f.key);
    const path = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data, error } = await supabase.storage.from(f.bucket).upload(path, file, { upsert: true });
    if (!error && data) {
      const { data: urlData } = supabase.storage.from(f.bucket).getPublicUrl(data.path);
      set(f.key, urlData.publicUrl);
    }
    setUploading(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <Modal title={initial ? `Edit — ${config.title}` : `New — ${config.title}`} onClose={onCancel}>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {config.fields.map((f) => (
          <label
            key={f.key}
            className={`text-sm ${f.type === 'textarea' || f.type === 'image' ? 'sm:col-span-2' : ''}`}
          >
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
            ) : f.type === 'combobox' ? (
              <>
                <input
                  list={`dl-${f.key}`}
                  value={form[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                  required={f.required}
                  placeholder={f.placeholder ?? 'Type or select…'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                />
                <datalist id={`dl-${f.key}`}>
                  {comboboxOptions[f.key]
                    ? comboboxOptions[f.key].map((o) => <option key={o} value={o} />)
                    : (f.options ?? []).map((o) => {
                        const v = typeof o === 'string' ? o : o.value;
                        return <option key={v} value={v} />;
                      })
                  }
                </datalist>
              </>
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
            ) : f.type === 'image' ? (
              <div className="flex flex-col gap-2">
                {form[f.key] ? (
                  <div className="relative w-fit">
                    <img src={form[f.key]} alt="Project" className="h-40 rounded-lg object-contain border border-slate-200 bg-slate-50" />
                    <button
                      type="button"
                      onClick={() => set(f.key, '')}
                      className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow text-red-500 hover:text-red-700"
                      title="Remove photo"
                    >
                      <ImageOff size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="h-24 w-40 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">
                    No photo
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(f, file);
                    }}
                    className="text-sm text-slate-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                  />
                  {uploading === f.key && <span className="text-xs text-slate-400">Uploading…</span>}
                </div>
              </div>
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
          <button type="submit" disabled={!!uploading} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
            {uploading ? 'Uploading…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
