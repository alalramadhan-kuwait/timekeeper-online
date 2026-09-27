import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Check, X, Play, Pause, Wallet, ShieldCheck, ExternalLink, History } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Badge, Modal, Spinner } from '../components/ui';

/**
 * Campaign Proposals — how a campaign gets onto Meta.
 *
 * Every proposal says what the growth skill asks before money moves: the
 * product, the objective, the audience, the creative, the budget, why, and how
 * success will be judged. An owner approves or rejects it. Approval builds it
 * on Meta PAUSED; nothing spends until an owner switches it on, as a separate
 * step, and a budget change is an owner's call too. Pausing is open to the
 * whole team — stopping spend never waits for a second opinion.
 *
 * Everything that touches Meta goes through the meta-campaign-manage function,
 * which checks the role again on the server; the buttons here only decide what
 * is offered.
 */

interface Proposal {
  id: string; created_at: string; created_by: string | null; status: string;
  product: string; brand: string | null; landing_url: string | null; objective: string;
  audience: string; countries: string[]; age_min: number; age_max: number;
  creative: string; instagram_account: string | null; instagram_media_id: string | null;
  daily_budget_kd: number; days: number; reason: string; success_kpi: string; kpi_target: string | null;
  decided_by: string | null; decided_at: string | null; decision_note: string | null;
  meta_campaign_id: string | null; meta_error: string | null; activated_at: string | null;
}
interface MediaOption { media_id: string; username: string; caption: string | null; posted_at: string | null; reach: number | null; permalink: string | null }
interface Event { proposal_id: string; at: string; action: string; detail: Record<string, unknown> | null }

const OBJECTIVES: Record<string, { label: string; hint: string }> = {
  OUTCOME_SALES: { label: 'Website sales', hint: 'Buy on the website' },
  MESSAGES: { label: 'WhatsApp conversations', hint: 'Pieces people ask about first' },
  OUTCOME_TRAFFIC: { label: 'Website visits', hint: 'When sales can’t be tracked' },
  OUTCOME_ENGAGEMENT: { label: 'Post engagement', hint: 'Launch buzz, not sales' },
  OUTCOME_AWARENESS: { label: 'Reach / awareness', hint: 'Brand only' },
};
const KPIS = ['Purchases', 'Cost per purchase', 'Return on spend', 'WhatsApp conversations', 'Cost per conversation', 'Landing page views', 'Reach'];
const COUNTRIES: [string, string][] = [['KW', 'Kuwait'], ['SA', 'Saudi'], ['AE', 'UAE'], ['QA', 'Qatar'], ['BH', 'Bahrain'], ['OM', 'Oman']];
const ACCOUNTS = ['timekeeperkw', 'timekeeperkwshop', 'timegallerykw'];

const STATUS: Record<string, { label: string; cls: string }> = {
  proposed: { label: 'Waiting for an owner', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: 'Building on Meta…', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  created: { label: 'On Meta · paused', cls: 'bg-slate-900 text-white border-slate-900' },
  active: { label: 'Live · spending', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  paused: { label: 'Paused', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  failed: { label: 'Meta refused it', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  rejected: { label: 'Rejected', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-slate-100 text-slate-400 border-slate-200' },
};

const EVENT_WORDS: Record<string, string> = {
  checked: 'Meta checked it — no problems', check_failed: 'Meta’s check found a problem',
  approved: 'Approved', created_paused: 'Built on Meta, paused', meta_refused: 'Meta refused it',
  rejected: 'Rejected', activated: 'Switched on', paused: 'Paused', budget_changed: 'Budget changed',
  withdrawn: 'Withdrawn', post_changed: 'Post changed',
  half_built_removed: 'Unfinished build removed from Meta', half_built_left: 'Unfinished build left on Meta — check Ads Manager',
};

/** A build that has sat at "approved" for 5 minutes died partway; it may be tried again. */
const stalled = (p: { status: string; updated_at?: string | null }) =>
  p.status === 'approved' && !!p.updated_at && Date.now() - Date.parse(p.updated_at) > 5 * 60_000;

/** invoke() hides the function's own message behind a generic one. */
async function manage(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string } & Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('meta-campaign-manage', { body });
  if (!error) return data;
  try { return { error: (await (error as any)?.context?.clone().json())?.error ?? error.message }; }
  catch { return { error: error.message }; }
}

/** The Proposals tab of Ads. `embedded` leaves the title to the Ads page. */
export function CampaignProposalsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { role, user } = useAuth();
  const owner = role === 'admin';
  const [rows, setRows] = useState<Proposal[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [media, setMedia] = useState<MediaOption[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; bad?: boolean } | null>(null);
  const [params] = useSearchParams();
  const focus = params.get('focus');

  const load = useCallback(async () => {
    const [p, e, m, c] = await Promise.all([
      supabase.from('ad_proposals').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('ad_proposal_events').select('proposal_id, at, action, detail').order('at'),
      supabase.from('instagram_media').select('media_id, username, caption, posted_at, reach, permalink')
        .order('posted_at', { ascending: false }).limit(90),
      supabase.from('meta_ads_config').select('kwd_per_usd').eq('id', 1).maybeSingle(),
    ]);
    setRows((p.data as Proposal[]) ?? []);
    setEvents((e.data as Event[]) ?? []);
    setMedia((m.data as MediaOption[]) ?? []);
    setRate(c.data?.kwd_per_usd ? Number(c.data.kwd_per_usd) : null);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(p: Proposal, action: string, extra: Record<string, unknown> = {}, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(`${p.id}:${action}`); setMsg(null);
    const r = await manage({ action, id: p.id, ...extra });
    setBusy(null);
    const notes = Array.isArray(r.notes) ? (r.notes as string[]) : [];
    setMsg({ id: p.id, text: r.error ?? [DONE[action] ?? 'Done', ...notes].join(' '), bad: !!r.error });
    void load();
  }

  function withdraw(p: Proposal) {
    void act(p, 'withdraw', {}, 'Withdraw this proposal?');
  }

  const groups = useMemo(() => ([
    { title: 'Waiting for a decision', short: 'Waiting', rows: rows.filter((r) => ['proposed', 'failed', 'approved'].includes(r.status)) },
    { title: 'On Meta', short: 'On Meta', rows: rows.filter((r) => ['created', 'active', 'paused'].includes(r.status)) },
    { title: 'Decided', short: 'Decided', rows: rows.filter((r) => ['rejected', 'withdrawn'].includes(r.status)) },
  ]), [rows]);

  if (loading) return <Spinner />;

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          {!embedded && <h1 className="text-xl font-bold text-slate-900">Campaign Proposals</h1>}
          {/* Where things stand, as counts; each group is listed below. */}
          <p className="flex flex-wrap gap-2 text-xs">
            {groups.map((g) => (
              <span key={g.title} className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600">
                {g.short} <b className="tabular-nums text-slate-900">{g.rows.length}</b>
              </span>
            ))}
          </p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700">
          <Plus size={15} /> New proposal
        </button>
      </div>

      {groups.map((g) => g.rows.length > 0 && (
        <section key={g.title} className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{g.title}</h2>
          <div className="space-y-3">
            {g.rows.map((p) => (
              <ProposalCard key={p.id} p={p} owner={owner} mine={p.created_by === user?.id} rate={rate}
                media={media.find((m) => m.media_id === p.instagram_media_id) ?? null}
                events={events.filter((e) => e.proposal_id === p.id)}
                focused={focus === p.id} busy={busy} msg={msg?.id === p.id ? msg : null}
                onAct={act} onWithdraw={withdraw} />
            ))}
          </div>
        </section>
      ))}
      {!rows.length && (
        <div className="mt-10 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No proposals yet. The first one starts with <b>New proposal</b>.
        </div>
      )}

      {creating && <ProposalForm media={media} rate={rate} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />}
    </div>
  );
}

const DONE: Record<string, string> = {
  check: 'Meta accepts it. Nothing was left on Meta.',
  approve: 'Built on Meta, paused.',
  reject: 'Rejected.', activate: 'Switched on — spending now.', pause: 'Paused.', budget: 'Budget changed on Meta.',
  withdraw: 'Withdrawn.',
};

function ProposalCard({ p, owner, mine, rate, media, events, focused, busy, msg, onAct, onWithdraw }: {
  p: Proposal; owner: boolean; mine: boolean; rate: number | null; media: MediaOption | null; events: Event[];
  focused: boolean; busy: string | null; msg: { text: string; bad?: boolean } | null;
  onAct: (p: Proposal, action: string, extra?: Record<string, unknown>, confirmText?: string) => void;
  onWithdraw: (p: Proposal) => void;
}) {
  const [history, setHistory] = useState(false);
  const [more, setMore] = useState(false);
  const st = STATUS[p.status] ?? { label: p.status, cls: '' };
  const total = Number(p.daily_budget_kd) * p.days;
  const usd = rate ? Number(p.daily_budget_kd) / rate : null;
  const is = (a: string) => busy === `${p.id}:${a}`;
  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50';

  return (
    <article className={`bg-white rounded-xl border p-4 ${focused ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold text-slate-900">{p.product}</p>
        <Badge className={st.cls}>{st.label}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {OBJECTIVES[p.objective]?.label ?? p.objective} · <b className="tabular-nums">{Number(p.daily_budget_kd).toLocaleString('en-GB')} KD</b>/day × {p.days} days
        = <b className="tabular-nums">{total.toLocaleString('en-GB')} KD</b>
      </p>
      {p.kpi_target && <p className="text-xs text-slate-500">Target: {p.kpi_target.replace(/\s*\(.*\)$/, '')}</p>}

      {more && (
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
          <Field label="Audience">{p.audience} · {p.countries.join(', ')} · {p.age_min}–{p.age_max}</Field>
          <Field label="Budget in USD">{usd ? `≈ ${usd.toFixed(2)} USD/day` : '—'}</Field>
          <Field label="Creative">
            {p.creative}
            {media && (
              <a href={media.permalink ?? '#'} target="_blank" rel="noopener noreferrer" className="block text-xs text-slate-500 hover:text-slate-800 truncate">
                Open the post <ExternalLink size={10} className="inline" />
              </a>
            )}
          </Field>
          <Field label="Success measure">{p.success_kpi}{p.kpi_target && <> — {p.kpi_target}</>}</Field>
          <div className="sm:col-span-2"><Field label="Why">{p.reason}</Field></div>
          {p.decision_note && <div className="sm:col-span-2"><Field label="Owner’s note">{p.decision_note}</Field></div>}
          {p.meta_campaign_id && (
            <div className="sm:col-span-2"><Field label="Meta campaign">
              <Link to={`/ads?q=${encodeURIComponent(p.meta_campaign_id)}`} className="underline text-slate-700 hover:text-slate-900">Open its figures</Link>
            </Field></div>
          )}
        </dl>
      )}

      {p.meta_error && <MetaRefusal text={p.meta_error} raw={more} />}
      {msg && !msg.bad && <p className="mt-3 text-xs rounded-lg px-3 py-2 border border-emerald-200 bg-emerald-50 text-emerald-800">{msg.text}</p>}
      {msg?.bad && msg.text !== p.meta_error && <MetaRefusal text={msg.text} raw={more} />}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {(['proposed', 'failed'].includes(p.status) || stalled(p)) && (
          <button onClick={() => onAct(p, 'check')} disabled={!!busy} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            <ShieldCheck size={13} /> {is('check') ? 'Asking Meta…' : 'Ask Meta to check'}
          </button>
        )}
        {owner && (['proposed', 'failed'].includes(p.status) || stalled(p)) && <>
          <button onClick={() => {
            if (!window.confirm('Approve and build on Meta?\n\nIt will be created PAUSED. Nothing spends until an owner switches it on.')) return;
            onAct(p, 'approve', { note: window.prompt('A note with the approval (optional)') || undefined });
          }}
            disabled={!!busy} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>
            <Check size={13} /> {is('approve') ? 'Building…' : 'Approve — build paused'}
          </button>
          <button onClick={() => { const note = window.prompt('Why not? (the proposer sees this)'); if (note !== null) onAct(p, 'reject', { note }); }}
            disabled={!!busy} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            <X size={13} /> Reject
          </button>
        </>}
        {mine && p.status === 'proposed' && (
          <button onClick={() => onWithdraw(p)} className={`${btn} text-slate-500 hover:text-slate-800`}>Withdraw</button>
        )}
        {owner && ['created', 'paused'].includes(p.status) && (
          <button onClick={() => onAct(p, 'activate', {},
            `Switch this campaign on?\n\nIt starts spending ${p.daily_budget_kd} KD a day for ${p.days} days (${total} KD) from now.`)}
            disabled={!!busy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            <Play size={13} /> {is('activate') ? 'Switching on…' : 'Switch on — start spending'}
          </button>
        )}
        {p.status === 'active' && (
          <button onClick={() => onAct(p, 'pause')} disabled={!!busy} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            <Pause size={13} /> {is('pause') ? 'Pausing…' : 'Pause'}
          </button>
        )}
        {owner && ['created', 'active', 'paused'].includes(p.status) && (
          <button onClick={() => {
            const v = window.prompt(`New daily budget in KD (now ${p.daily_budget_kd})`);
            if (v && Number(v) > 0) onAct(p, 'budget', { daily_budget_kd: Number(v) }, `Change the daily budget to ${Number(v)} KD?`);
          }} disabled={!!busy} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            <Wallet size={13} /> Change budget
          </button>
        )}
        <button onClick={() => setMore((m) => !m)} className={`${btn} ml-auto text-slate-400 hover:text-slate-700`}>
          {more ? 'Less' : 'Details'}
        </button>
        {events.length > 0 && (
          <button onClick={() => setHistory((h) => !h)} className={`${btn} text-slate-400 hover:text-slate-700`}>
            <History size={13} /> {history ? 'Hide' : 'History'}
          </button>
        )}
      </div>
      {history && (
        <ol className="mt-3 border-t border-slate-100 pt-3 space-y-1 text-xs text-slate-500">
          {events.map((e, i) => (
            <li key={i}>
              <span className="tabular-nums text-slate-400">{new Date(e.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>{' '}
              {EVENT_WORDS[e.action] ?? e.action}
              {typeof e.detail?.error === 'string' && <> — {e.detail.error}</>}
              {typeof e.detail?.to_kd === 'number' && <> — {String(e.detail.from_kd)} → {String(e.detail.to_kd)} KD/day</>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/** Meta's refusals that need an owner, not a retry, said in plain words. */
const FIXES: [RegExp, string][] = [
  // Test mode lets this app advertise only a post that is already on the
  // Facebook page, and only to promote the post itself: Meta refuses the
  // website or message button a sales or WhatsApp ad needs (tested 26 Sep).
  [/development mode|external website URL|incompatible with the objective|not on the Facebook page/i,
    'Meta app is in test mode. Boost this post from the Instagram app for now.'],
  [/not linked to a WhatsApp/i, 'Link a WhatsApp Business number to this Facebook page first.'],
];

/** The fix in one line; Meta's own words only under Details. */
function MetaRefusal({ text, raw }: { text: string; raw: boolean }) {
  const fixes = FIXES.filter(([re]) => re.test(text)).map(([, fix]) => fix);
  return (
    <div className="mt-3 text-xs rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2 space-y-1">
      {fixes.map((f) => <p key={f} className="font-semibold">{f}</p>)}
      {(raw || !fixes.length) && <p className={fixes.length ? 'opacity-70' : ''}>Meta said: {text}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-slate-700">{children}</dd>
    </div>
  );
}

/* ── the proposal form ───────────────────────────────────────────────────── */

function ProposalForm({ media, rate, onClose, onSaved }: {
  media: MediaOption[]; rate: number | null; onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [f, setF] = useState({
    product: '', brand: '', landing_url: '', objective: 'OUTCOME_SALES', audience: 'Kuwait broad',
    countries: ['KW'], age_min: 25, age_max: 55, creative: '', instagram_account: 'timekeeperkw',
    instagram_media_id: '', daily_budget_kd: '', days: 7, reason: '', success_kpi: 'Purchases', kpi_target: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const posts = media.filter((m) => m.username === f.instagram_account).slice(0, 30);
  const budget = Number(f.daily_budget_kd);

  async function save() {
    const missing = [
      !f.product && 'product', !f.audience && 'audience', !f.instagram_media_id && 'the Instagram post',
      !(budget > 0) && 'a daily budget', !f.reason && 'why', !f.success_kpi && 'the success measure',
    ].filter(Boolean);
    if (missing.length) { setErr(`Add ${missing.join(', ')}.`); return; }
    setSaving(true);
    const chosen = posts.find((m) => m.media_id === f.instagram_media_id);
    const { error } = await supabase.from('ad_proposals').insert({
      ...f, created_by: user?.id, daily_budget_kd: budget, days: Number(f.days),
      age_min: Number(f.age_min), age_max: Number(f.age_max),
      brand: f.brand || null, landing_url: f.landing_url || null, kpi_target: f.kpi_target || null,
      creative: f.creative || (chosen ? `Instagram post: ${chosen.caption?.replace(/\s+/g, ' ').slice(0, 60) ?? chosen.media_id}` : 'Instagram post'),
    });
    setSaving(false);
    if (error) setErr(error.message); else onSaved();
  }

  const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white';
  const lbl = 'block text-xs font-medium text-slate-600 mb-1';
  return (
    <Modal title="New campaign proposal" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label><span className={lbl}>Product</span><input id="p-product" className={input} value={f.product} onChange={(e) => set('product', e.target.value)} placeholder="Nivada Depthmaster" /></label>
          <label><span className={lbl}>Brand</span><input id="p-brand" className={input} value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Nivada" /></label>
        </div>
        <label className="block"><span className={lbl}>Objective</span>
          <select id="p-objective" className={input} value={f.objective} onChange={(e) => set('objective', e.target.value)}>
            {Object.entries(OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.hint}</option>)}
          </select>
        </label>
        {['OUTCOME_SALES', 'OUTCOME_TRAFFIC'].includes(f.objective) && (
          <label className="block"><span className={lbl}>Product link</span>
            <input id="p-url" className={input} value={f.landing_url} onChange={(e) => set('landing_url', e.target.value)} placeholder="https://time-keeper.com/products/…" /></label>
        )}
        <label className="block"><span className={lbl}>Audience</span>
          <input id="p-audience" className={input} value={f.audience} onChange={(e) => set('audience', e.target.value)} /></label>
        <div className="flex flex-wrap gap-1.5">
          {COUNTRIES.map(([code, name]) => {
            const on = f.countries.includes(code);
            return (
              <button key={code} type="button" onClick={() => set('countries', on ? f.countries.filter((c) => c !== code) : [...f.countries, code])}
                className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}>{name}</button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={lbl}>Age from</span><input id="p-agemin" type="number" min={18} max={65} className={input} value={f.age_min} onChange={(e) => set('age_min', e.target.value)} /></label>
          <label><span className={lbl}>Age to</span><input id="p-agemax" type="number" min={18} max={65} className={input} value={f.age_max} onChange={(e) => set('age_max', e.target.value)} /></label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label><span className={lbl}>Account</span>
            <select id="p-account" className={input} value={f.instagram_account} onChange={(e) => { set('instagram_account', e.target.value); set('instagram_media_id', ''); }}>
              {ACCOUNTS.map((a) => <option key={a} value={a}>@{a}</option>)}
            </select>
          </label>
          <label className="col-span-2"><span className={lbl}>Instagram post</span>
            <select id="p-media" className={input} value={f.instagram_media_id} onChange={(e) => set('instagram_media_id', e.target.value)}>
              <option value="">Choose a post…</option>
              {posts.map((m) => (
                <option key={m.media_id} value={m.media_id}>
                  {m.posted_at?.slice(0, 10)} · reach {m.reach?.toLocaleString('en-GB') ?? '—'} · {m.caption?.replace(/\s+/g, ' ').slice(0, 50) ?? ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block"><span className={lbl}>Creative angle (optional)</span>
          <input id="p-creative" className={input} value={f.creative} onChange={(e) => set('creative', e.target.value)} placeholder="Dial close-up, price/value hook" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={lbl}>Daily budget (KD)</span>
            <input id="p-budget" type="number" min={1} step="0.5" className={input} value={f.daily_budget_kd} onChange={(e) => set('daily_budget_kd', e.target.value)} />
            {budget > 0 && rate && <span className="text-[11px] text-slate-400">≈ {(budget / rate).toFixed(2)} USD/day · {(budget * Number(f.days)).toLocaleString('en-GB')} KD over the run</span>}
          </label>
          <label><span className={lbl}>Days</span><input id="p-days" type="number" min={1} max={90} className={input} value={f.days} onChange={(e) => set('days', e.target.value)} /></label>
        </div>
        <label className="block"><span className={lbl}>Why this product, this way</span>
          <textarea id="p-reason" rows={3} className={input} value={f.reason} onChange={(e) => set('reason', e.target.value)}
            placeholder="Slow stock with margin to spare; the post already reached 40k organically…" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={lbl}>Success measure</span>
            <select id="p-kpi" className={input} value={f.success_kpi} onChange={(e) => set('success_kpi', e.target.value)}>
              {KPIS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label><span className={lbl}>Target</span><input id="p-target" className={input} value={f.kpi_target} onChange={(e) => set('kpi_target', e.target.value)} placeholder="≤ 25 KD per purchase" /></label>
        </div>
        {err && <p className="text-xs text-rose-700">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
            {saving ? 'Sending…' : 'Send to owners'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
