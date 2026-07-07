import { useEffect, useMemo, useState } from 'react';
import { History, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Badge, Spinner } from '../components/ui';

interface AuditRow {
  id: number;
  table_name: string;
  record_id: string | null;
  action: string;
  changed_by: string | null;
  changed_at: string;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
}

const TABLE_LABELS: Record<string, string> = {
  purchase_orders: 'Supplier Payments', consignments: 'Consignments', limited_projects: 'Limited Projects',
  waiting_list: 'Demand List', pre_orders: 'Pre-Orders', employees: 'Employees', leave_records: 'Leave',
  company_documents: 'Company Documents', customers: 'Customers', settings: 'Settings',
};

const ACTION_STYLE: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  UPDATE: 'bg-blue-100 text-blue-700 border-blue-200',
  DELETE: 'bg-rose-100 text-rose-700 border-rose-200',
};

const IGNORE_KEYS = new Set(['updated_at', 'created_at', 'synced_at', 'created_by', 'id']);

function diffOf(row: AuditRow): { key: string; from: string; to: string }[] {
  if (row.action !== 'UPDATE' || !row.old_data || !row.new_data) return [];
  const out: { key: string; from: string; to: string }[] = [];
  for (const k of Object.keys(row.new_data)) {
    if (IGNORE_KEYS.has(k)) continue;
    const a = JSON.stringify(row.old_data[k] ?? null);
    const b = JSON.stringify(row.new_data[k] ?? null);
    if (a !== b) out.push({ key: k, from: fmt(row.old_data[k]), to: fmt(row.new_data[k]) });
  }
  return out;
}

function fmt(v: any): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Best-effort human label for the record */
function recordLabel(row: AuditRow): string {
  const d = row.new_data ?? row.old_data ?? {};
  return d.po_number ?? d.project_name ?? d.full_name ?? d.customer_name ?? d.consignee_name
    ?? d.employee_name ?? d.document_name ?? d.display_name ?? d.brand ?? row.record_id?.slice(0, 8) ?? '—';
}

export default function HistoryLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState('All');
  const [actionFilter, setActionFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: log }, { data: profs }] = await Promise.all([
        supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(500),
        supabase.from('profiles').select('id, full_name'),
      ]);
      setRows((log ?? []) as AuditRow[]);
      setNames(new Map(((profs ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])));
      setLoading(false);
    })();
  }, []);

  const tables = useMemo(() => [...new Set(rows.map((r) => r.table_name))].sort(), [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (tableFilter !== 'All') r = r.filter((x) => x.table_name === tableFilter);
    if (actionFilter !== 'All') r = r.filter((x) => x.action === actionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        recordLabel(x).toLowerCase().includes(q) ||
        (names.get(x.changed_by ?? '') ?? '').toLowerCase().includes(q) ||
        JSON.stringify(x.new_data ?? x.old_data ?? {}).toLowerCase().includes(q));
    }
    return sortAsc ? [...r].reverse() : r;
  }, [rows, tableFilter, actionFilter, search, names, sortAsc]);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><History size={20} /> History Log</h1>
        <p className="text-sm text-slate-500">
          Every change to the important records — what changed, who changed it, when, and the old vs new values. Last 500 actions.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search record, user, value…"
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white w-56" />
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option>All</option>
          {tables.map((t) => <option key={t} value={t}>{TABLE_LABELS[t] ?? t}</option>)}
        </select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white">
          <option>All</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </select>
        <button onClick={() => setSortAsc((v) => !v)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white text-slate-600 hover:bg-slate-50">
          {sortAsc ? <><ChevronUp size={13} /> Oldest first</> : <><ChevronDown size={13} /> Newest first</>}
        </button>
        <div className="ml-auto text-sm text-slate-500 self-center">{filtered.length} actions</div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {filtered.length === 0 && <div className="px-4 py-8 text-center text-slate-400 text-sm">No history yet</div>}
        {filtered.map((r) => {
          const diff = diffOf(r);
          const isOpen = expanded === r.id;
          return (
            <div key={r.id}>
              <button onClick={() => setExpanded(isOpen ? null : r.id)}
                className={`w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-sm ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                <Badge className={ACTION_STYLE[r.action] ?? 'bg-slate-100 text-slate-600'}>
                  {r.action === 'INSERT' ? 'Created' : r.action === 'UPDATE' ? 'Updated' : 'Deleted'}
                </Badge>
                <span className="text-xs text-slate-400 shrink-0">{TABLE_LABELS[r.table_name] ?? r.table_name}</span>
                <span className="font-medium text-slate-700 truncate flex-1 min-w-24">{recordLabel(r)}</span>
                {r.action === 'UPDATE' && diff.length > 0 && (
                  <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-56">
                    {diff.slice(0, 2).map((d) => d.key.replace(/_/g, ' ')).join(', ')}{diff.length > 2 ? ` +${diff.length - 2}` : ''}
                  </span>
                )}
                <span className="text-xs text-violet-600 shrink-0">{names.get(r.changed_by ?? '') ?? 'System'}</span>
                <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">
                  {new Date(r.changed_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuwait', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-3 pt-1 bg-slate-50 border-t border-slate-100 text-xs">
                  {r.action === 'UPDATE' && diff.length > 0 ? (
                    <table className="w-full">
                      <tbody>
                        {diff.map((d) => (
                          <tr key={d.key} className="border-b border-slate-100 last:border-0">
                            <td className="py-1 pr-3 text-slate-500 capitalize whitespace-nowrap align-top">{d.key.replace(/_/g, ' ')}</td>
                            <td className="py-1 pr-2 text-rose-600 line-through break-all">{d.from}</td>
                            <td className="py-1 text-emerald-700 break-all">→ {d.to}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : r.action === 'DELETE' ? (
                    <p className="text-slate-500 break-all">Deleted record: {JSON.stringify(r.old_data)}</p>
                  ) : (
                    <p className="text-slate-500">New record created{r.action === 'UPDATE' ? ' (no visible field changes)' : ''}.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
