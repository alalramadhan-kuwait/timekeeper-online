import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Copy, ExternalLink, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Badge, Modal, Spinner } from '../components/ui';

/**
 * Client Ads — jobs companies pay Time Keeper for: sponsored posts and event
 * coverage on its Instagram accounts (27 Sep; replaces Paid Ads Tracker, which
 * was built around Meta campaigns that these jobs never are).
 *
 * The page answers two questions: what are we owed, and has each client had
 * proof of delivery. A job links to the Instagram post that delivered it, so
 * reach, views, saves and shares come from Instagram itself, and the report to
 * the client is one tap: copied ready to paste into WhatsApp, and marked sent.
 */

interface Job {
  id: string; ad_name: string; client_type: string | null; client_name: string | null; contract_ref: string | null;
  platform: string | null; owner: string | null; start_date: string | null; end_date: string | null;
  amount_charged: number | null; product_brand: string | null; status: string; payment_status: string | null;
  report_sent: boolean | null; report_sent_at: string | null; instagram_media_id: string | null; notes: string | null;
}
interface Post {
  media_id: string; username: string; caption: string | null; posted_at: string; permalink: string | null;
  reach: number | null; views: number | null; saved: number | null; shares: number | null;
  like_count: number | null; comments_count: number | null;
}

const STATUSES = ['Planned', 'Waiting content', 'Waiting approval', 'Active', 'Completed', 'Paused', 'Cancelled'];
const PAYMENTS = ['Unpaid', 'Partially paid', 'Paid', 'Not applicable'];
const PLATFORMS = ['Instagram', 'Meta', 'Google', 'TikTok', 'Snapchat', 'Other'];
const PAY_CHIP: Record<string, string> = {
  Paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Partially paid': 'bg-amber-100 text-amber-800 border-amber-200',
  Unpaid: 'bg-rose-100 text-rose-700 border-rose-200',
};

const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const num = (n: number) => Math.round(n).toLocaleString('en-GB');
const kd = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(Number(n)).toLocaleString('en-GB')} KD`);
const nf = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-GB'));
const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const owed = (j: Job) => j.status !== 'Cancelled' && Number(j.amount_charged) > 0 && ['Unpaid', 'Partially paid'].includes(j.payment_status ?? 'Unpaid');

type Stage = 'upcoming' | 'running' | 'done';
function stageOf(j: Job, now: string): Stage {
  if (['Completed', 'Cancelled'].includes(j.status) || (j.end_date && j.end_date < now)) return 'done';
  if (j.status === 'Active' || (j.start_date && j.start_date <= now)) return 'running';
  return 'upcoming';
}

/** What the client gets as proof of delivery, ready to paste. */
function reportText(j: Job, p: Post) {
  const lines = [
    `${j.client_name ? `${j.client_name} — ` : ''}${j.ad_name}`,
    `Posted on Instagram @${p.username}, ${day(p.posted_at)}`,
    p.permalink ?? '',
    '',
    p.reach != null ? `Reach: ${nf(p.reach)} accounts` : '',
    p.views != null ? `Views: ${nf(p.views)}` : '',
    `Likes: ${nf(p.like_count)} · Comments: ${nf(p.comments_count)}`,
    `Saves: ${nf(p.saved)} · Shares: ${nf(p.shares)}`,
    '',
    `Figures from Instagram, ${day(today())}.`,
  ];
  return lines.filter((l, i) => l !== '' || (i > 0 && lines[i - 1] !== '')).join('\n').trim();
}

export function ClientAdsPage() {
  const { role } = useAuth();
  const canWrite = ['admin', 'manager', 'marketing'].includes(role ?? '');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [chosen, setTab] = useState<Stage | null>(null);
  const [editing, setEditing] = useState<Partial<Job> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [j, p] = await Promise.all([
      supabase.from('paid_ads').select('*').order('start_date', { ascending: false, nullsFirst: false }),
      supabase.from('instagram_media')
        .select('media_id, username, caption, posted_at, permalink, reach, views, saved, shares, like_count, comments_count')
        .order('posted_at', { ascending: false }).limit(150),
    ]);
    const list = (j.data as Job[]) ?? [];
    let recent = (p.data as Post[]) ?? [];
    // A job may point at a post older than the recent list: fetch those too.
    const missing = list.map((x) => x.instagram_media_id).filter((id): id is string => !!id && !recent.some((r) => r.media_id === id));
    if (missing.length) {
      const { data } = await supabase.from('instagram_media')
        .select('media_id, username, caption, posted_at, permalink, reach, views, saved, shares, like_count, comments_count')
        .in('media_id', missing);
      recent = [...recent, ...((data as Post[]) ?? [])];
    }
    setJobs(list);
    setPosts(recent);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const now = today();
  const byStage = useMemo(() => {
    const g: Record<Stage, Job[]> = { upcoming: [], running: [], done: [] };
    for (const j of jobs) g[stageOf(j, now)].push(j);
    g.upcoming.sort((a, b) => (a.start_date ?? '9').localeCompare(b.start_date ?? '9'));
    return g;
  }, [jobs, now]);
  // Until someone picks a tab, open on the first with something in it, running first.
  const tab: Stage = chosen ?? (['running', 'upcoming', 'done'] as Stage[]).find((st) => byStage[st].length) ?? 'running';

  const year = now.slice(0, 4);
  const booked = jobs.filter((j) => j.status !== 'Cancelled' && (j.start_date ?? '').startsWith(year))
    .reduce((t, j) => t + Number(j.amount_charged ?? 0), 0);
  const unpaid = jobs.filter(owed).reduce((t, j) => t + Number(j.amount_charged ?? 0), 0);
  const reportsDue = jobs.filter((j) => j.status === 'Completed' && !j.report_sent).length;
  const postOf = (j: Job) => posts.find((p) => p.media_id === j.instagram_media_id) ?? null;

  async function copyReport(j: Job) {
    const p = postOf(j);
    if (!p) return;
    const text = reportText(j, p);
    try { await navigator.clipboard.writeText(text); }
    catch { window.prompt('Copy the report:', text); }
    if (canWrite && !j.report_sent) {
      await supabase.from('paid_ads').update({ report_sent: true, report_sent_at: new Date().toISOString() }).eq('id', j.id);
      void load();
    }
    setMsg(`Report for ${j.client_name ?? j.ad_name} copied — paste it into WhatsApp.`);
  }

  if (loading) return <Spinner />;

  return (
    <div className="max-w-4xl min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Client Ads</h1>
        {canWrite && (
          <button onClick={() => setEditing({ client_type: 'External company', platform: 'Instagram', status: 'Planned', payment_status: 'Unpaid' })}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700">
            <Plus size={15} /> New job
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Booked · KD" hint={`Booked for jobs starting in ${year}`} value={num(booked)} />
        <Tile label="Unpaid · KD" value={num(unpaid)} tone={unpaid > 0 ? 'text-rose-600' : undefined} />
        <Tile label="Reports due" value={String(reportsDue)} tone={reportsDue > 0 ? 'text-amber-600' : undefined} />
      </div>

      {msg && <p className="text-xs rounded-lg px-3 py-2 border border-emerald-200 bg-emerald-50 text-emerald-800">{msg}</p>}

      <div className="flex gap-1 border-b border-slate-200">
        {([['upcoming', 'Upcoming'], ['running', 'Running'], ['done', 'Done']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? 'border-slate-900 text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {l} <span className="tabular-nums text-slate-400">{byStage[k].length}</span>
          </button>
        ))}
      </div>

      {byStage[tab].length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Nothing here.</p> : (
        <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {byStage[tab].map((j) => {
            const p = postOf(j);
            return (
              <li key={j.id} className="p-3 sm:p-4">
                <button type="button" onClick={() => setEditing(j)} className="w-full text-left min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{j.client_name || 'No client named'}</p>
                      <p className="text-sm text-slate-600 truncate">{j.ad_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold tabular-nums text-slate-900">{kd(j.amount_charged)}</p>
                      {j.payment_status && j.payment_status !== 'Not applicable' && (
                        <Badge className={PAY_CHIP[j.payment_status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}>{j.payment_status}</Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {j.start_date ? day(j.start_date) : 'No date'}{j.end_date && j.end_date !== j.start_date ? ` – ${day(j.end_date)}` : ''}
                    {j.status !== 'Planned' && ` · ${j.status}`}
                    {p && <> · reach <b className="tabular-nums text-slate-700">{nf(p.reach)}</b> · views <b className="tabular-nums text-slate-700">{nf(p.views)}</b></>}
                  </p>
                </button>
                {tab === 'done' && j.status !== 'Cancelled' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {p ? (
                      <button onClick={() => void copyReport(j)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <Copy size={13} /> Copy report for client
                      </button>
                    ) : <span className="text-xs text-slate-400">Link the Instagram post to send a report.</span>}
                    {j.report_sent
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check size={13} /> Report sent{j.report_sent_at ? ` ${day(j.report_sent_at)}` : ''}</span>
                      : <span className="text-xs text-amber-700">Report not sent</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <JobForm job={editing} posts={posts} canWrite={canWrite}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
          onCopy={editing.id && postOf(editing as Job) ? () => void copyReport(editing as Job) : undefined} />
      )}
    </div>
  );
}

function Tile({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div title={hint} className="bg-white rounded-xl border border-slate-200 px-3 sm:px-4 py-3 min-w-0">
      <p className="text-xs text-slate-500 truncate">{label}</p>
      <p className={`text-base sm:text-xl font-bold tabular-nums truncate ${tone ?? 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

/* ── add / edit ────────────────────────────────────────────────────────── */

function JobForm({ job, posts, canWrite, onClose, onSaved, onCopy }: {
  job: Partial<Job>; posts: Post[]; canWrite: boolean; onClose: () => void; onSaved: () => void; onCopy?: () => void;
}) {
  const [f, setF] = useState<Partial<Job>>(job);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Job, v: unknown) => setF((x) => ({ ...x, [k]: v === '' ? null : v }));
  const linked = posts.find((p) => p.media_id === f.instagram_media_id) ?? null;

  async function save() {
    if (!f.ad_name?.trim()) { setErr('Say what the job is.'); return; }
    setSaving(true); setErr(null);
    const row = {
      ad_name: f.ad_name, client_type: f.client_type ?? 'External company', client_name: f.client_name ?? null,
      contract_ref: f.contract_ref ?? null, platform: f.platform ?? 'Instagram', owner: f.owner ?? null,
      start_date: f.start_date ?? null, end_date: f.end_date ?? null,
      amount_charged: f.amount_charged == null ? null : Number(f.amount_charged),
      product_brand: f.product_brand ?? null, status: f.status ?? 'Planned', payment_status: f.payment_status ?? 'Unpaid',
      report_sent: !!f.report_sent, instagram_media_id: f.instagram_media_id ?? null, notes: f.notes ?? null,
    };
    const { error } = f.id
      ? await supabase.from('paid_ads').update(row).eq('id', f.id)
      : await supabase.from('paid_ads').insert(row);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  async function remove() {
    if (!f.id || !window.confirm('Delete this job? This cannot be undone.')) return;
    const { error } = await supabase.from('paid_ads').delete().eq('id', f.id);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white disabled:bg-slate-50';
  const lbl = 'text-xs font-medium text-slate-600';
  return (
    <Modal title={f.id ? (f.client_name || f.ad_name || 'Job') : 'New client job'} onClose={onClose}>
      <fieldset disabled={!canWrite} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block"><span className={lbl}>Client</span>
            <input id="ca-client" className={input} value={f.client_name ?? ''} onChange={(e) => set('client_name', e.target.value)} placeholder="Tiffany & Co" /></label>
          <label className="block"><span className={lbl}>What</span>
            <input id="ca-what" className={input} value={f.ad_name ?? ''} onChange={(e) => set('ad_name', e.target.value)} placeholder="Opening event coverage" /></label>
          <label className="block"><span className={lbl}>Start</span>
            <input id="ca-start" type="date" className={input} value={f.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} /></label>
          <label className="block"><span className={lbl}>End</span>
            <input id="ca-end" type="date" className={input} value={f.end_date ?? ''} onChange={(e) => set('end_date', e.target.value)} /></label>
          <label className="block"><span className={lbl}>Amount charged (KD)</span>
            <input id="ca-amount" type="number" inputMode="decimal" className={input} value={f.amount_charged ?? ''} onChange={(e) => set('amount_charged', e.target.value)} /></label>
          <label className="block"><span className={lbl}>Payment</span>
            <select id="ca-pay" className={input} value={f.payment_status ?? 'Unpaid'} onChange={(e) => set('payment_status', e.target.value)}>
              {PAYMENTS.map((p) => <option key={p}>{p}</option>)}
            </select></label>
          <label className="block"><span className={lbl}>Status</span>
            <select id="ca-status" className={input} value={f.status ?? 'Planned'} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select></label>
          <label className="block"><span className={lbl}>Report sent to client</span>
            <select id="ca-report" className={input} value={f.report_sent ? 'yes' : 'no'} onChange={(e) => set('report_sent', e.target.value === 'yes')}>
              <option value="no">Not yet</option><option value="yes">Sent</option>
            </select></label>
          <label className="block sm:col-span-2"><span className={lbl}>Instagram post that delivered it</span>
            <select id="ca-post" className={input} value={f.instagram_media_id ?? ''} onChange={(e) => set('instagram_media_id', e.target.value)}>
              <option value="">Not linked yet</option>
              {posts.map((p) => (
                <option key={p.media_id} value={p.media_id}>
                  @{p.username} · {day(p.posted_at)} · {(p.caption ?? '').replace(/\s+/g, ' ').slice(0, 50)}
                </option>
              ))}
            </select></label>
        </div>

        {linked && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
            <div className="grid grid-cols-4 gap-2 text-center">
              {([['Reach', linked.reach], ['Views', linked.views], ['Saves', linked.saved], ['Shares', linked.shares]] as const).map(([l, v]) => (
                <div key={l}><p className="text-[11px] text-slate-500">{l}</p><p className="font-bold text-slate-900 tabular-nums">{nf(v)}</p></div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {linked.permalink && <a href={linked.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">Open the post <ExternalLink size={11} /></a>}
              {onCopy && <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 underline"><Copy size={11} /> Copy report for client</button>}
            </div>
          </div>
        )}

        <button type="button" onClick={() => setMore((m) => !m)} className="text-xs text-slate-500 underline">{more ? 'Fewer fields' : 'More fields'}</button>
        {more && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block"><span className={lbl}>Platform</span>
              <select id="ca-platform" className={input} value={f.platform ?? 'Instagram'} onChange={(e) => set('platform', e.target.value)}>
                {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select></label>
            <label className="block"><span className={lbl}>Brand promoted</span>
              <input id="ca-brand" className={input} value={f.product_brand ?? ''} onChange={(e) => set('product_brand', e.target.value)} /></label>
            <label className="block"><span className={lbl}>Contract reference</span>
              <input id="ca-contract" className={input} value={f.contract_ref ?? ''} onChange={(e) => set('contract_ref', e.target.value)} /></label>
            <label className="block"><span className={lbl}>Handled by</span>
              <input id="ca-owner" className={input} value={f.owner ?? ''} onChange={(e) => set('owner', e.target.value)} /></label>
            <label className="block sm:col-span-2"><span className={lbl}>Notes</span>
              <textarea id="ca-notes" rows={3} className={input} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
          </div>
        )}
      </fieldset>

      {err && <p className="mt-3 text-xs text-rose-700">{err}</p>}
      {canWrite && (
        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => void save()} disabled={saving}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700">Cancel</button>
          {f.id && <button onClick={() => void remove()} className="ml-auto text-xs text-rose-600 hover:underline">Delete</button>}
        </div>
      )}
    </Modal>
  );
}
