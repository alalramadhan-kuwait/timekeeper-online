import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, Star, Phone, MessageCircle, Pencil, Gift, ShoppingBag, Clock, Trash2, Plus, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Modal, Spinner, Badge, StatusBadge } from '../components/ui';
import { WhatsAppSheet } from '../components/WhatsAppSheet';
import { formatKD } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import {
  getCustomerList, getCustomerProfile, updateCustomerDetails, updateCustomerPhone, assignResponsible,
  addOccasion, removeOccasion, getRosterEmployees,
  type CustomerListRow, type CustomerProfile, type ProfileVisit, type ProfilePurchase, type ProfileHandoff,
} from '../lib/customers';
import { caseLabel } from '../shared/caseLabels';
import { displayPhone } from '../shared/phoneRules';
import type { TemplateKey } from '../shared/messageRules';

type SortKey = 'name' | 'visits' | 'purchasesKD' | 'openFollowups' | 'last';
type Filter = 'all' | 'followups' | 'occasions' | 'vip' | 'unassigned';

const caseTypeColors: Record<string, string> = {
  Sale: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Follow-up': 'bg-blue-100 text-blue-700 border-blue-200',
  'Lost Sale': 'bg-rose-100 text-rose-700 border-rose-200',
  'No Interaction': 'bg-slate-100 text-slate-500 border-slate-200',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string | null | undefined) => iso ? format(new Date(iso), 'd MMM yyyy') : '—';
const last = (r: CustomerListRow) => [r.lastVisit, r.lastPurchase].filter(Boolean).sort().pop() ?? '';
function daysUntil(month: number, dd: number): number {
  const now = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' }) + 'T00:00:00');
  let d = new Date(now.getFullYear(), month - 1, dd);
  if (d < now) d = new Date(now.getFullYear() + 1, month - 1, dd);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}
const when = (d: number) => d === 0 ? 'today' : d === 1 ? 'tomorrow' : d <= 30 ? `in ${d} days` : `in ${Math.round(d / 30)} months`;

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown size={12} className="inline ml-1 text-slate-300" />;
  return dir === 'asc' ? <ChevronUp size={12} className="inline ml-1 text-slate-600" /> : <ChevronDown size={12} className="inline ml-1 text-slate-600" />;
}

/**
 * CRM Customers.
 *
 * The same page the shop app shows, at a desk. Who is listed is decided by
 * the database (customer_list runs under the caller's rules): the owner sees
 * everyone, a manager the shops in their scope, a salesperson their own.
 * A customer is a record now, not a phone string gathered from visits, and
 * their Lightspeed purchases sit next to their visits on one timeline.
 */
export default function CrmPage() {
  const { role } = useAuth();
  const canAssign = role === 'admin' || role === 'manager';
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>(params.get('tab') === 'occasions' ? 'occasions' : 'all');
  const [sortKey, setSortKey] = useState<SortKey>('last');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const openId = params.get('customer');

  const load = useCallback(async () => {
    try { setRows(await getCustomerList()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load customers.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const p = rows.filter(r => {
      if (filter === 'followups' && r.openFollowups === 0) return false;
      if (filter === 'occasions' && (r.nextOccasionDays == null || r.nextOccasionDays > 30)) return false;
      if (filter === 'vip' && !r.isVip) return false;
      if (filter === 'unassigned' && r.responsibleEmployeeId) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.responsible ?? '').toLowerCase().includes(q)
        || (digits.length >= 3 && ((r.phoneE164 ?? '').includes(digits) || r.contact.replace(/\D/g, '').includes(digits)));
    });
    return p.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'visits') cmp = a.visits - b.visits;
      else if (sortKey === 'purchasesKD') cmp = a.purchasesKD - b.purchasesKD;
      else if (sortKey === 'openFollowups') cmp = a.openFollowups - b.openFollowups;
      else cmp = last(a).localeCompare(last(b));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, filter, sortKey, sortDir]);

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('customer', id); else next.delete('customer');
    setParams(next, { replace: !id });
  };

  const totals = useMemo(() => ({
    kd: rows.reduce((t, r) => t + r.purchasesKD, 0),
    followups: rows.reduce((t, r) => t + r.openFollowups, 0),
    soon: rows.filter(r => r.nextOccasionDays != null && r.nextOccasionDays <= 7).length,
  }), [rows]);

  if (loading) return <Spinner />;

  const SortTh = ({ label, col, className = '' }: { label: string; col: SortKey; className?: string }) => (
    <th className={`px-4 py-3 cursor-pointer select-none whitespace-nowrap hover:text-slate-700 ${className}`} onClick={() => toggleSort(col)}>
      {label}<SortIcon active={sortKey === col} dir={sortDir} />
    </th>
  );
  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'followups', label: 'Open follow-ups' }, { key: 'occasions', label: 'Occasions (30 days)' },
    { key: 'vip', label: 'VIP' }, ...(canAssign ? [{ key: 'unassigned' as Filter, label: 'No responsible salesperson' }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">CRM Customers</h1>
          <p className="text-sm text-slate-500">{rows.length.toLocaleString()} customers · {formatKD(totals.kd)} KD in Lightspeed · {totals.followups} open follow-ups · {totals.soon} occasions this week</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, number or salesperson"
            className="pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-72" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === c.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>{c.label}</button>
        ))}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200 text-left">
            <tr>
              <SortTh label="Customer" col="name" />
              <th className="px-4 py-3">Number</th>
              <SortTh label="Last seen" col="last" />
              <SortTh label="Visits" col="visits" className="text-right" />
              <SortTh label="Purchases" col="purchasesKD" className="text-right" />
              <SortTh label="Open" col="openFollowups" className="text-right" />
              <th className="px-4 py-3">Responsible</th>
              <th className="px-4 py-3">Coming up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, 300).map(r => (
              <tr key={r.id} onClick={() => open(r.id)} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  <span className="flex items-center gap-1.5">{r.isVip && <Star size={13} className="text-amber-500 fill-amber-400" />}{r.name}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{displayPhone(r.phoneE164) ?? r.contact}</td>
                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{day(last(r) || null)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.visits}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.purchases > 0 ? <>{r.purchases} · {formatKD(r.purchasesKD)} KD</> : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.openFollowups > 0 ? <Badge className="bg-amber-100 text-amber-700 border-amber-200">{r.openFollowups}</Badge> : '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.responsible ?? <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.nextOccasionDays != null && r.nextOccasionDays <= 30 ? `${r.nextOccasionLabel} ${when(r.nextOccasionDays)}` : ''}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Nobody matches.</td></tr>}
          </tbody>
        </table>
        {filtered.length > 300 && <p className="px-4 py-3 text-xs text-slate-400">Showing the first 300 of {filtered.length}. Search to narrow it down.</p>}
      </div>

      {openId && <CustomerModal id={openId} canAssign={canAssign} onClose={() => open(null)} onChanged={load} />}
    </div>
  );
}

type TimelineItem =
  | { kind: 'visit'; at: string; v: ProfileVisit }
  | { kind: 'purchase'; at: string; p: ProfilePurchase }
  | { kind: 'handoff'; at: string; h: ProfileHandoff };

function CustomerModal({ id, canAssign, onClose, onChanged }: { id: string; canAssign: boolean; onClose: () => void; onChanged: () => void }) {
  const [p, setP] = useState<CustomerProfile | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [wa, setWa] = useState<{ template: TemplateKey; caseId?: string; product?: string } | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'phone' | 'occasion' | 'assign'>('view');

  const load = useCallback(async () => {
    try { setP(await getCustomerProfile(id)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the customer.'); setP(null); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const timeline = useMemo<TimelineItem[]>(() => !p ? [] : [
    ...p.visits.map(v => ({ kind: 'visit' as const, at: v.at, v })),
    ...p.purchases.map(pu => ({ kind: 'purchase' as const, at: pu.at, p: pu })),
    ...p.handoffs.map(h => ({ kind: 'handoff' as const, at: h.at, h })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [p]);

  const c = p?.customer;
  const name = c ? (c.display_name?.trim() || c.contact) : 'Customer';
  const store = p?.visits.find(v => v.outlet)?.outlet ?? p?.purchases.find(x => x.outlet)?.outlet ?? null;
  const openFollowUps = p?.visits.filter(v => v.case_type === 'Follow-up' && v.status === 'Open') ?? [];
  const lastProduct = p?.visits.find(v => v.product)?.product ?? null;
  const spent = p?.purchases.reduce((t, x) => t + Number(x.total ?? 0), 0) ?? 0;

  return (
    <Modal title={name} onClose={onClose}>
      {p === undefined && <Spinner />}
      {p === null && <p className="text-sm text-slate-600">{err ?? 'This customer is not yours to see.'}</p>}
      {p && c && mode === 'view' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-[200px]">
              <p className="text-lg font-semibold text-slate-900 flex items-center gap-2">{c.is_vip && <Star size={16} className="text-amber-500 fill-amber-400" />}{name}</p>
              <p className="text-slate-600">{displayPhone(c.phone_e164) ?? c.contact}</p>
              <p className="text-xs text-slate-400 mt-1">
                {p.responsible ? <>Responsible: <span className="text-slate-600">{p.responsible}</span></> : 'No responsible salesperson'}
                {p.knownBy.length > 0 && <> · Known by {p.knownBy.map(k => k.name).filter(Boolean).join(', ')}</>}
                {' · '}Customer since {day(c.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWa({ template: openFollowUps.length ? 'interested_followup' : p.purchases.length ? 'post_sale_checkin' : 'general_followup', product: lastProduct ?? undefined, caseId: openFollowUps[0]?.id })}
                disabled={!c.phone_e164} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-40"><MessageCircle size={16} /> WhatsApp</button>
              <a href={c.phone_e164 ? `tel:${c.phone_e164}` : undefined} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium ${c.phone_e164 ? '' : 'opacity-40 pointer-events-none'}`}><Phone size={16} /> Call</a>
              <button onClick={() => setMode('edit')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium"><Pencil size={16} /> Edit</button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[['Visits', String(p.visits.length)], ['Purchases', String(p.purchases.filter(x => !x.is_return).length)], ['Spent', `${formatKD(spent)} KD`]].map(([l, v]) => (
              <div key={l} className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-lg font-bold text-slate-900">{v}</p><p className="text-xs text-slate-500">{l}</p></div>
            ))}
          </div>

          <section className="text-sm space-y-1.5">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800">Details</h3>
              {canAssign && <button onClick={() => setMode('assign')} className="text-xs font-medium text-blue-700">{p.responsible ? 'Change responsible' : 'Assign responsible'}</button>}</div>
            <Row label="Birthday" value={c.birthday ? `${day(c.birthday)} · ${when(daysUntil(Number(c.birthday.slice(5, 7)), Number(c.birthday.slice(8, 10))))}` : null} />
            <Row label="Anniversary" value={c.anniversary ? `${day(c.anniversary)} · ${when(daysUntil(Number(c.anniversary.slice(5, 7)), Number(c.anniversary.slice(8, 10))))}` : null} />
            <Row label="Email" value={c.email} /><Row label="Instagram" value={c.instagram} />
            <Row label="Likes" value={c.preferred_brands?.length ? c.preferred_brands.join(', ') : null} />
            <Row label="Notes" value={c.personal_notes} />
            {p.contactChanges.length > 0 && <p className="text-xs text-slate-400">Number changed {p.contactChanges.length}×, last {day(p.contactChanges[0].at)} from {p.contactChanges[0].from}.</p>}
          </section>

          <section className="text-sm">
            <div className="flex items-center justify-between mb-1"><h3 className="font-semibold text-slate-800">Occasions</h3>
              <button onClick={() => setMode('occasion')} className="flex items-center gap-1 text-xs font-medium text-blue-700"><Plus size={12} /> Add</button></div>
            {p.occasions.length === 0 ? <p className="text-slate-400">Birthday and anniversary live under Details. Anything else goes here.</p> : (
              <ul className="divide-y divide-slate-100">
                {p.occasions.map(o => (
                  <li key={o.id} className="flex items-center gap-3 py-1.5">
                    <Gift size={14} className="text-violet-500" />
                    <span className="flex-1">{o.label} <span className="text-slate-400">· {o.day} {MONTHS[o.month - 1]}{o.year ? ` ${o.year}` : ''}</span></span>
                    <span className="text-xs text-slate-500">{when(daysUntil(o.month, o.day))}</span>
                    <button onClick={async () => { try { await removeOccasion(o.id); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove it.'); } }} className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="text-sm">
            <h3 className="font-semibold text-slate-800 mb-1">History</h3>
            {timeline.length === 0 ? <p className="text-slate-400">No visits or purchases recorded yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {timeline.map((t, i) => (
                  <li key={i} className="py-2.5 flex gap-3">
                    <span className="mt-0.5 shrink-0">{t.kind === 'visit' ? <Clock size={14} className="text-slate-400" /> : t.kind === 'purchase' ? <ShoppingBag size={14} className="text-emerald-600" /> : <MessageCircle size={14} className="text-emerald-500" />}</span>
                    <div className="flex-1 min-w-0">
                      {t.kind === 'visit' && (<>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={caseTypeColors[t.v.case_type]}>{caseLabel(t.v.case_type)}</Badge>
                          {t.v.case_type === 'Follow-up' && <StatusBadge value={t.v.status} />}
                          <span className="text-xs text-slate-400">{format(new Date(t.v.at), 'd MMM yyyy · HH:mm')} · {t.v.staff}{t.v.outlet ? ` · ${t.v.outlet}` : ''}</span>
                        </div>
                        <p className="text-slate-800 mt-0.5">{[t.v.brand, t.v.product].filter(Boolean).join(' · ') || '—'}{t.v.amount_kd ? ` · ${formatKD(t.v.amount_kd)} KD` : ''}</p>
                        {t.v.lost_reason && <p className="text-xs text-rose-600">{t.v.lost_reason}</p>}
                        {t.v.notes && <p className="text-xs text-slate-500 italic">"{t.v.notes}"</p>}
                        {t.v.case_type === 'Follow-up' && t.v.status === 'Open' && c.phone_e164 && (
                          <button onClick={() => setWa({ template: 'interested_followup', caseId: t.v.id, product: t.v.product })} className="mt-1 text-xs font-medium text-emerald-700 flex items-center gap-1"><MessageCircle size={12} /> WhatsApp about this</button>
                        )}
                      </>)}
                      {t.kind === 'purchase' && (<>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={t.p.is_return ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}>{t.p.is_return ? 'Return' : 'Purchase'}</Badge>
                          <span className="text-xs text-slate-400">{format(new Date(t.p.at), 'd MMM yyyy · HH:mm')}{t.p.salesperson ? ` · ${t.p.salesperson}` : ''}{t.p.outlet ? ` · ${t.p.outlet}` : ''}{t.p.receipt ? ` · #${t.p.receipt}` : ''}</span>
                        </div>
                        <p className="text-slate-800 font-medium mt-0.5">{formatKD(Number(t.p.total))} KD</p>
                        {t.p.items?.map((it, j) => <p key={j} className="text-xs text-slate-500">{it.qty > 1 ? `${it.qty} × ` : ''}{[it.brand, it.name].filter(Boolean).join(' ') || it.sku || 'Item'}</p>)}
                      </>)}
                      {t.kind === 'handoff' && <p className="text-slate-600">WhatsApp opened{t.h.by ? ` by ${t.h.by}` : ''} · {t.h.template.replace(/_/g, ' ')} ({t.h.lang}) <span className="text-xs text-slate-400">· {format(new Date(t.h.at), 'd MMM yyyy · HH:mm')}</span></p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
      )}

      {p && c && mode === 'edit' && <EditDetails c={c} onCancel={() => setMode('view')} onPhone={() => setMode('phone')} onSaved={async () => { setMode('view'); await load(); onChanged(); }} />}
      {p && c && mode === 'phone' && <EditPhone c={c} onCancel={() => setMode('view')} onSaved={async () => { setMode('view'); await load(); onChanged(); }} />}
      {p && c && mode === 'occasion' && <AddOccasion customerId={c.id} onCancel={() => setMode('view')} onSaved={async () => { setMode('view'); await load(); onChanged(); }} />}
      {p && c && mode === 'assign' && <Assign c={c} current={p.responsible} onCancel={() => setMode('view')} onSaved={async () => { setMode('view'); await load(); onChanged(); }} />}

      {wa && c && <WhatsAppSheet target={{ customerId: c.id, name: c.display_name, phone: c.phone_e164 }} caseId={wa.caseId} product={wa.product} store={store} defaultTemplate={wa.template} onClose={() => setWa(null)} onOpened={load} />}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return <div className="flex gap-3"><span className="w-28 shrink-0 text-slate-500">{label}</span><span className="flex-1 text-slate-800 break-words">{value}</span></div>;
}
const input = 'mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block text-sm"><span className="text-xs font-medium text-slate-600">{label}</span>{children}</label>;
const Buttons = ({ onCancel, onSave, saving, label = 'Save', disabled = false }: { onCancel: () => void; onSave: () => void; saving: boolean; label?: string; disabled?: boolean }) => (
  <div className="flex justify-end gap-2 pt-2">
    <button onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-700">Cancel</button>
    <button onClick={onSave} disabled={saving || disabled} className="px-4 py-2 rounded-lg text-sm bg-slate-900 text-white font-medium disabled:opacity-40">{saving ? 'Saving…' : label}</button>
  </div>
);

function EditDetails({ c, onCancel, onSaved, onPhone }: { c: CustomerProfile['customer']; onCancel: () => void; onSaved: () => void; onPhone: () => void }) {
  const [f, setF] = useState({ displayName: c.display_name ?? '', email: c.email ?? '', birthday: c.birthday ?? '', anniversary: c.anniversary ?? '', personalNotes: c.personal_notes ?? '', isVip: !!c.is_vip, instagram: c.instagram ?? '', preferredBrands: (c.preferred_brands ?? []).join(', ') });
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('');
  async function save() {
    setSaving(true); setErr('');
    try { await updateCustomerDetails(c.id, { ...f, birthday: f.birthday || null, anniversary: f.anniversary || null, preferredBrands: f.preferredBrands.split(',').map(s => s.trim()).filter(Boolean) }); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-800">Customer details</h3>
      <Field label="Name"><input value={f.displayName} onChange={e => setF({ ...f, displayName: e.target.value })} className={input} /></Field>
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 text-sm"><span>Number: <span className="font-medium">{displayPhone(c.phone_e164) ?? c.contact}</span></span><button type="button" onClick={onPhone} className="text-xs font-medium text-blue-700">Change</button></div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Birthday"><input type="date" value={f.birthday} onChange={e => setF({ ...f, birthday: e.target.value })} className={input} /></Field>
        <Field label="Anniversary"><input type="date" value={f.anniversary} onChange={e => setF({ ...f, anniversary: e.target.value })} className={input} /></Field>
      </div>
      <Field label="Email"><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className={input} /></Field>
      <Field label="Instagram"><input value={f.instagram} onChange={e => setF({ ...f, instagram: e.target.value })} className={input} /></Field>
      <Field label="Likes (brands, comma-separated)"><input value={f.preferredBrands} onChange={e => setF({ ...f, preferredBrands: e.target.value })} className={input} /></Field>
      <Field label="Notes"><textarea value={f.personalNotes} onChange={e => setF({ ...f, personalNotes: e.target.value })} rows={3} className={`${input} resize-none`} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isVip} onChange={e => setF({ ...f, isVip: e.target.checked })} /> VIP customer</label>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <Buttons onCancel={onCancel} onSave={() => void save()} saving={saving} />
    </div>
  );
}

function EditPhone({ c, onCancel, onSaved }: { c: CustomerProfile['customer']; onCancel: () => void; onSaved: () => void }) {
  const [contact, setContact] = useState(c.contact); const [saving, setSaving] = useState(false); const [err, setErr] = useState('');
  async function save() {
    setSaving(true); setErr('');
    try { await updateCustomerPhone(c.id, contact); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not change the number.'); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-800">Change the number</h3>
      <p className="text-sm text-slate-600">Their visits and history move with the number. A number Lightspeed holds must be corrected in Lightspeed; a number another customer already has is refused. Every change is recorded.</p>
      <Field label="New number"><input type="tel" value={contact} onChange={e => { setContact(e.target.value); setErr(''); }} className={input} /></Field>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <Buttons onCancel={onCancel} onSave={() => void save()} saving={saving} label="Change" disabled={contact.trim() === c.contact} />
    </div>
  );
}

function AddOccasion({ customerId, onCancel, onSaved }: { customerId: string; onCancel: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(''); const [date, setDate] = useState(''); const [knownYear, setKnownYear] = useState(false);
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('');
  async function save() {
    if (!label.trim() || !date) { setErr('Give it a name and a date.'); return; }
    setSaving(true); setErr('');
    try { const [y, m, d] = date.split('-').map(Number); await addOccasion(customerId, label, m, d, knownYear ? y : null); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not add it.'); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-800">Add an occasion</h3>
      <Field label="What is it?"><input value={label} onChange={e => setLabel(e.target.value)} className={input} placeholder="e.g. Daughter's birthday" /></Field>
      <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={knownYear} onChange={e => setKnownYear(e.target.checked)} /> The year matters</label>
      <p className="text-xs text-slate-400">A reminder goes to the responsible salesperson a week before and on the day.</p>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <Buttons onCancel={onCancel} onSave={() => void save()} saving={saving} label="Add" />
    </div>
  );
}

function Assign({ c, current, onCancel, onSaved }: { c: CustomerProfile['customer']; current: string | null; onCancel: () => void; onSaved: () => void }) {
  const [roster, setRoster] = useState<Map<string, string>>(new Map()); const [pick, setPick] = useState(current ?? '');
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { void getRosterEmployees().then(setRoster).catch(() => setRoster(new Map())); }, []);
  async function save() {
    setSaving(true); setErr('');
    try { await assignResponsible(c.id, pick ? (roster.get(pick) ?? null) : null); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not assign.'); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-800">Responsible salesperson</h3>
      <p className="text-sm text-slate-600">Gets this customer's reminders and may see and message them whoever served them last. Can be changed or removed at any time.</p>
      <select value={pick} onChange={e => setPick(e.target.value)} className={input}>
        <option value="">— Nobody —</option>
        {Array.from(roster.keys()).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <Buttons onCancel={onCancel} onSave={() => void save()} saving={saving} />
    </div>
  );
}
