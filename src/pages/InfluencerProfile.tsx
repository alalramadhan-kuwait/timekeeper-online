import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Instagram, ExternalLink, Pencil, X, Star, Users, Handshake, Wallet, Gift, TrendingUp, Calendar, RefreshCw } from 'lucide-react';
import { CrudModule, CrudConfig } from '../components/CrudModule';
import { Badge, Spinner } from '../components/ui';
import { formatKD } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { INFLUENCER_OPTS as O, cleanHandle } from './modules';

const marketingRoles = (r: string | null) => ['admin', 'manager', 'marketing'].includes(r ?? '');
const kd = (v: number | null | undefined) => (v == null ? '—' : `${formatKD(Number(v))} KD`);
const num = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
const igUrl = (h: string | null) => {
  if (!h) return null;
  const t = h.trim();
  return /^https?:\/\//i.test(t) ? t : `https://www.instagram.com/${t.replace(/^@/, '')}`;
};

const COLLAB_TYPES = ['Paid', 'Gift', 'Affiliate', 'Event'];
const REL_STATUS_COLOR: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Prospect: 'bg-sky-100 text-sky-700 border-sky-200',
  Paused: 'bg-amber-100 text-amber-700 border-amber-200',
  Inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};

interface Influencer {
  id: string; name: string; handle: string | null; platform: string | null; tier: string | null;
  country: string | null; followers: number | null; followers_updated: string | null;
  contact: string | null; photo_url: string | null; status: string | null; rating: number | null; notes: string | null;
}
interface Snapshot { snapshot_date: string; followers: number | null }
interface Agg { count: number; paid: number; gift: number; revenue: number; last: string | null }

function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">{icon} {label}</div>
      <p className={`text-xl font-bold ${accent ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function InfluencerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canEdit = marketingRoles(role);

  const [inf, setInf] = useState<Influencer | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [agg, setAgg] = useState<Agg>({ count: 0, paid: 0, gift: 0, revenue: 0, last: null });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Influencer>>({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadAgg = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('influencer_collaborations')
      .select('amount_paid, gift_value, attributed_revenue, agreed_date, posted_date').eq('influencer_id', id);
    const rows = data ?? [];
    setAgg({
      count: rows.length,
      paid: rows.reduce((s, r) => s + Number(r.amount_paid ?? 0), 0),
      gift: rows.reduce((s, r) => s + Number(r.gift_value ?? 0), 0),
      revenue: rows.reduce((s, r) => s + Number(r.attributed_revenue ?? 0), 0),
      last: rows.reduce<string | null>((mx, r) => {
        const d = r.posted_date ?? r.agreed_date;
        return d && (!mx || d > mx) ? d : mx;
      }, null),
    });
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [i, s] = await Promise.all([
      supabase.from('influencers').select('*').eq('id', id).single(),
      supabase.from('influencer_follower_snapshots').select('snapshot_date, followers').eq('influencer_id', id).order('snapshot_date'),
    ]);
    setInf((i.data as Influencer) ?? null);
    setSnaps((s.data as Snapshot[]) ?? []);
    await loadAgg();
    setLoading(false);
  }, [id, loadAgg]);

  useEffect(() => { load(); }, [load]);

  // follower growth over N days from the snapshot history
  const growth = (days: number): number | null => {
    if (!inf?.followers || snaps.length < 2) return null;
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const base = [...snaps].reverse().find((x) => x.snapshot_date <= cutoff);
    if (!base?.followers) return null;
    return Number(inf.followers) - Number(base.followers);
  };
  const g30 = growth(30), g90 = growth(90);
  const roi = agg.paid + agg.gift > 0 ? agg.revenue / (agg.paid + agg.gift) : null;

  async function refreshFollowers() {
    setRefreshing(true); setMsg(null);
    const { data, error } = await supabase.functions.invoke('influencer-followers-sync', { body: { influencer_id: id } });
    if (error || (data as any)?.error) {
      let detail = (data as any)?.error ?? error?.message;
      try { detail = (await (error as any)?.context?.clone().json())?.error ?? detail; } catch { /* keep */ }
      setMsg(`Refresh failed: ${detail}`);
    } else if (data?.updated) {
      setMsg('Followers refreshed ✓');
    } else {
      setMsg('Couldn’t fetch followers — the account may be private or the handle is wrong.');
    }
    setRefreshing(false);
    load();
  }

  function startEdit() {
    if (!inf) return;
    setForm({ ...inf });
    setEditing(true);
    setMsg(null);
  }

  async function saveProfile() {
    if (!inf) return;
    setSaving(true);
    const patch: Record<string, unknown> = {
      name: form.name, handle: cleanHandle(form.handle), platform: form.platform || null, tier: form.tier || null,
      country: form.country || null, contact: form.contact || null, photo_url: form.photo_url || null,
      status: form.status || 'Active', rating: form.rating != null && String(form.rating) !== '' ? Number(form.rating) : null,
      notes: form.notes || null, updated_at: new Date().toISOString(),
    };
    const newFollowers = form.followers != null && String(form.followers) !== '' ? Number(form.followers) : null;
    const followersChanged = newFollowers !== (inf.followers ?? null);
    if (followersChanged) {
      const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Kuwait day
      patch.followers = newFollowers;
      patch.followers_updated = today;
      // record a snapshot so the growth graph builds
      if (newFollowers != null) await supabase.from('influencer_follower_snapshots')
        .upsert({ influencer_id: id, snapshot_date: today, followers: newFollowers }, { onConflict: 'influencer_id,snapshot_date' });
    }
    const { error } = await supabase.from('influencers').update(patch).eq('id', id);
    setSaving(false);
    if (error) { setMsg(`Save failed: ${error.message}`); return; }
    setEditing(false);
    load();
  }

  // Collaborations sub-table (edit in a modal — the profile itself stays a full page)
  const collabConfig = useMemo<CrudConfig>(() => ({
    table: 'influencer_collaborations',
    title: 'Collaborations & Ads',
    description: 'Every collaboration with this influencer. Click a row to edit it.',
    canWrite: marketingRoles,
    statusField: 'status',
    statusOptions: O.INF_STATUSES,
    searchKeys: ['campaign', 'product_brand', 'product', 'owner'],
    orderBy: { column: 'agreed_date', ascending: false },
    filter: (r) => r.influencer_id === id,
    beforeSave: (p) => ({ ...p, influencer_id: id }),
    onChanged: loadAgg,
    rowClickToEdit: true,
    extraFilters: [
      { key: 'collab_type', label: 'Type', options: COLLAB_TYPES },
      { key: 'payment_status', label: 'Payment', options: O.INF_PAYMENT },
      { key: 'status', label: 'Status', options: O.INF_STATUSES },
    ],
    fields: [
      { key: 'agreed_date', label: 'Date agreed', type: 'date' },
      { key: 'campaign', label: 'Campaign / occasion', type: 'combobox' },
      { key: 'product_brand', label: 'Brand promoted', type: 'combobox' },
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'collab_type', label: 'Type', type: 'select', options: COLLAB_TYPES, defaultValue: 'Paid' },
      { key: 'platform', label: 'Platform', type: 'select', options: O.INF_PLATFORMS, defaultValue: 'Instagram' },
      { key: 'coverage_type', label: 'Coverage', type: 'select', options: O.INF_COVERAGE },
      { key: 'deliverables', label: 'Agreed deliverables', type: 'text', placeholder: 'e.g. 2 stories + 1 reel' },
      { key: 'posted_date', label: 'Posted date', type: 'date' },
      { key: 'post_url', label: 'Post link', type: 'text', placeholder: 'https://…' },
      { key: 'fee', label: 'Cost / fee (KD)', type: 'number', defaultValue: 0 },
      { key: 'amount_paid', label: 'Amount paid (KD)', type: 'number', defaultValue: 0 },
      { key: 'gift_value', label: 'Gift value (KD)', type: 'number', defaultValue: 0 },
      { key: 'attributed_revenue', label: 'Attributed revenue (KD)', type: 'number', defaultValue: 0 },
      { key: 'payment_method', label: 'Payment method', type: 'select', options: ['Bank transfer', 'Cash', 'Cheque', 'Gift / product', 'Credit card'] },
      { key: 'payment_status', label: 'Payment status', type: 'select', options: O.INF_PAYMENT, defaultValue: 'Unpaid' },
      { key: 'status', label: 'Status', type: 'select', options: O.INF_STATUSES, defaultValue: 'Negotiating', required: true },
      { key: 'content_received', label: 'Content received', type: 'checkbox' },
      { key: 'reach', label: 'Reach', type: 'number' },
      { key: 'likes', label: 'Likes', type: 'number' },
      { key: 'comments', label: 'Comments', type: 'number' },
      { key: 'saves', label: 'Saves', type: 'number' },
      { key: 'story_views', label: 'Story views', type: 'number' },
      { key: 'link_clicks', label: 'Link clicks', type: 'number' },
      { key: 'leads_generated', label: 'Leads generated', type: 'number' },
      { key: 'sales_linked', label: 'Sales linked (reference)', type: 'text' },
      { key: 'owner', label: 'Relationship owner', type: 'combobox' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'agreed_date', label: 'Date', sortable: true, render: (r) => <span className="whitespace-nowrap">{r.agreed_date ?? '—'}</span> },
      { key: 'campaign', label: 'Campaign', sortable: true, render: (r) => r.campaign ?? '—' },
      { key: 'product_brand', label: 'Brand', sortable: true, hideBelow: 'md' },
      { key: 'product', label: 'Product', hideBelow: 'lg' },
      { key: 'collab_type', label: 'Type', sortable: true, render: (r) => {
        const cls = r.collab_type === 'Gift' ? 'bg-violet-100 text-violet-700 border-violet-200'
          : r.collab_type === 'Affiliate' ? 'bg-sky-100 text-sky-700 border-sky-200'
          : r.collab_type === 'Event' ? 'bg-amber-100 text-amber-700 border-amber-200'
          : 'bg-slate-100 text-slate-600 border-slate-200';
        return <Badge className={cls}>{r.collab_type ?? 'Paid'}</Badge>;
      } },
      { key: 'platform', label: 'Platform', sortable: true, hideBelow: 'lg' },
      { key: 'fee', label: 'Cost', sortable: true, render: (r) => <span className="whitespace-nowrap">{kd(r.fee)}</span> },
      { key: 'status', label: 'Status', sortable: true },
      { key: 'posted_date', label: 'Posted', sortable: true, hideBelow: 'lg', render: (r) => r.posted_date ?? '—' },
      { key: 'performance', label: 'Performance', hideBelow: 'xl', render: (r) => {
        const eng = (Number(r.likes ?? 0) + Number(r.comments ?? 0)) || null;
        if (r.reach) return <span className="whitespace-nowrap">{num(r.reach)} reach</span>;
        if (eng) return <span className="whitespace-nowrap">{num(eng)} eng</span>;
        return <span className="text-slate-300 text-xs">—</span>;
      } },
    ],
  }), [id, loadAgg]);

  if (loading) return <Spinner />;
  if (!inf) return (
    <div className="text-center py-16">
      <p className="text-slate-500 mb-3">Influencer not found.</p>
      <Link to="/influencers" className="text-blue-600 hover:underline">← Back to Influencer Tracker</Link>
    </div>
  );

  const ig = igUrl(inf.handle);

  return (
    <div className="space-y-6">
      {/* Back */}
      <button onClick={() => navigate('/influencers')} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft size={16} /> Influencers
      </button>

      {msg && <div className={`px-4 py-2 rounded-lg text-sm border ${msg.includes('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg}</div>}

      {/* 1. Profile header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        {!editing ? (
          <div className="flex flex-wrap items-start gap-4">
            {inf.photo_url
              ? <img src={inf.photo_url} alt="" className="w-20 h-20 rounded-full object-cover border border-slate-200 shrink-0" />
              : <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-2xl font-bold text-slate-400 shrink-0">{inf.name.slice(0, 1).toUpperCase()}</div>}
            <div className="flex-1 min-w-[12rem]">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{inf.name}</h1>
                <Badge className={REL_STATUS_COLOR[inf.status ?? 'Active'] ?? REL_STATUS_COLOR.Inactive}>{inf.status ?? 'Active'}</Badge>
                {inf.rating != null && (
                  <span className="flex items-center gap-0.5 text-amber-500 text-sm">
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} className={i < Number(inf.rating) ? 'fill-amber-400' : 'text-slate-200'} />)}
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {inf.handle && <span>@{inf.handle}</span>}
                {inf.platform && <span>· {inf.platform}</span>}
                {inf.country && <span>· {inf.country}</span>}
                {inf.tier && <span>· {inf.tier}</span>}
              </div>
              <div className="text-sm text-slate-600 mt-2 flex flex-wrap items-center gap-x-6 gap-y-1">
                <span><b className="text-slate-900">{num(inf.followers)}</b> followers
                  {g30 != null && <span className={`ml-1 text-xs ${g30 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{g30 >= 0 ? '▲' : '▼'} {num(Math.abs(g30))} / 30d</span>}
                </span>
                {inf.followers_updated && <span className="text-xs text-slate-400">updated {inf.followers_updated}</span>}
                {inf.contact && <span className="text-slate-500">✆ {inf.contact}</span>}
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {ig && <a href={ig} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-90"><Instagram size={15} /> Open Instagram <ExternalLink size={12} /></a>}
              {canEdit && inf.handle && <button onClick={refreshFollowers} disabled={refreshing} className="flex items-center gap-1.5 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Fetching…' : 'Refresh followers'}</button>}
              {canEdit && <button onClick={startEdit} className="flex items-center gap-1.5 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50"><Pencil size={14} /> Edit profile</button>}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800">Edit profile</h2>
              <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                ['name', 'Name', 'text'], ['handle', 'Instagram handle (@)', 'text'],
                ['platform', 'Platform', O.INF_PLATFORMS], ['tier', 'Tier', O.INF_TIERS],
                ['country', 'Country', O.INF_COUNTRIES], ['status', 'Relationship status', O.INF_REL_STATUS],
                ['followers', 'Current followers', 'number'], ['rating', 'Rating (1–5)', 'number'],
                ['contact', 'Contact details', 'text'], ['photo_url', 'Profile photo URL', 'text'],
              ] as const).map(([key, label, t]) => (
                <label key={key} className="text-xs">
                  <span className="block text-slate-500 mb-1">{label}</span>
                  {Array.isArray(t) ? (
                    <select value={(form as any)[key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm">
                      <option value="">—</option>
                      {t.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={t} value={(form as any)[key] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
                  )}
                </label>
              ))}
              <label className="text-xs sm:col-span-2 lg:col-span-3">
                <span className="block text-slate-500 mb-1">Internal notes</span>
                <textarea rows={2} value={form.notes ?? ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
              </label>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={saveProfile} disabled={saving} className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save profile'}</button>
              <button onClick={() => setEditing(false)} className="px-4 py-1.5 rounded-lg border border-slate-300 text-sm">Cancel</button>
            </div>
            <p className="text-xs text-slate-400 mt-2">Changing followers records a dated snapshot so the growth graph builds over time.</p>
          </div>
        )}
      </div>

      {/* 2. Performance summary */}
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Performance summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi icon={<Handshake size={13} />} label="Collaborations" value={String(agg.count)} />
          <Kpi icon={<Wallet size={13} />} label="Total paid" value={kd(agg.paid)} accent="text-slate-800" />
          <Kpi icon={<Gift size={13} />} label="Gift value" value={kd(agg.gift)} accent="text-violet-600" />
          <Kpi icon={<TrendingUp size={13} />} label="Attributed revenue" value={kd(agg.revenue)} accent="text-emerald-600" />
          <Kpi icon={<Calendar size={13} />} label="Last collaboration" value={agg.last ?? '—'} />
          <Kpi icon={<TrendingUp size={13} />} label="ROI" value={roi != null ? `${roi.toFixed(1)}×` : '—'} accent={roi != null && roi >= 1 ? 'text-emerald-600' : 'text-slate-800'} sub={roi == null ? 'add revenue to see' : 'revenue ÷ spend'} />
        </div>
      </div>

      {/* 3. Follower growth */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Users size={14} /> Follower growth</h3>
          <div className="text-xs text-slate-500 flex gap-3">
            <span>30d: <b className={g30 != null && g30 >= 0 ? 'text-emerald-600' : g30 != null ? 'text-rose-600' : 'text-slate-400'}>{g30 != null ? `${g30 >= 0 ? '+' : ''}${num(g30)}` : '—'}</b></span>
            <span>90d: <b className={g90 != null && g90 >= 0 ? 'text-emerald-600' : g90 != null ? 'text-rose-600' : 'text-slate-400'}>{g90 != null ? `${g90 >= 0 ? '+' : ''}${num(g90)}` : '—'}</b></span>
          </div>
        </div>
        {(() => {
          const pts = snaps.filter((s) => s.followers != null);
          if (pts.length < 2) return <p className="text-xs text-slate-400 py-6 text-center">Not enough history yet — update followers over time (or add weekly snapshots) and the line will build.</p>;
          const W = Math.max(pts.length * 40, 320), H = 120, padT = 10, padB = 20;
          const vals = pts.map((s) => Number(s.followers));
          const min = Math.min(...vals), max = Math.max(...vals, min + 1);
          const x = (i: number) => (i / (pts.length - 1)) * (W - 12) + 6;
          const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
          const line = pts.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(Number(s.followers)).toFixed(1)}`).join(' ');
          return (
            <div className="overflow-x-auto">
              <svg width={W} height={H} className="min-w-full">
                <path d={line} fill="none" stroke="#c026d3" strokeWidth="2" />
                {pts.map((s, i) => (
                  <g key={s.snapshot_date}>
                    <circle cx={x(i)} cy={y(Number(s.followers))} r="2.5" fill="#c026d3" />
                    <title>{s.snapshot_date}: {num(s.followers)} followers</title>
                    {(i === 0 || i === pts.length - 1) && <text x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : 'end'} fontSize="9" fill="#94a3b8">{s.snapshot_date.slice(5)}</text>}
                  </g>
                ))}
              </svg>
            </div>
          );
        })()}
      </div>

      {/* 4. Collaborations / Ads */}
      <CrudModule config={collabConfig} />

      {/* 5. Notes / Relationship */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Notes / Relationship</h3>
        <p className="text-sm text-slate-600 whitespace-pre-wrap">{inf.notes || <span className="text-slate-400">No internal notes yet — use “Edit profile” to add relationship notes and a performance rating.</span>}</p>
      </div>
    </div>
  );
}
