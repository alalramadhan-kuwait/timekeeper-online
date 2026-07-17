import { useEffect, useMemo, useState } from 'react';
import { Instagram, RefreshCw, PlugZap, Heart, MessageCircle, Bookmark, TrendingUp, Users, Pencil, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';

interface DailyRow { snapshot_date: string; followers: number | null; reach: number | null; profile_views: number | null; media_count: number | null }
interface MediaRow { media_id: string; caption: string | null; media_type: string | null; permalink: string | null; thumbnail_url: string | null; posted_at: string | null; like_count: number; comments_count: number; reach: number; saved: number; engagement: number }

const nf = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));

export default function InstagramPage() {
  const { role } = useAuth();
  const canSync = ['admin', 'manager'].includes(role ?? '');
  const canEdit = ['admin', 'manager', 'marketing'].includes(role ?? '');
  const todayKw = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const [showManual, setShowManual] = useState(false);
  const [mDate, setMDate] = useState(todayKw);
  const [mFollowers, setMFollowers] = useState('');
  const [mReach, setMReach] = useState('');
  const [mViews, setMViews] = useState('');

  async function saveManual() {
    const patch: Record<string, unknown> = { snapshot_date: mDate, updated_at: new Date().toISOString() };
    if (mFollowers) patch.followers = parseInt(mFollowers);
    if (mReach) patch.reach = parseInt(mReach);
    if (mViews) patch.profile_views = parseInt(mViews);
    const { error } = await supabase.from('instagram_daily').upsert(patch);
    if (error) { setMsg(`Save failed: ${error.message}`); return; }
    setMsg('Numbers saved ✓');
    setShowManual(false); setMFollowers(''); setMReach(''); setMViews('');
    load();
  }
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [sort, setSort] = useState<'reach' | 'engagement' | 'saved' | 'posted_at'>('reach');

  async function load() {
    setLoading(true);
    const [d, m, a] = await Promise.all([
      supabase.from('instagram_daily').select('*').order('snapshot_date').limit(365),
      supabase.from('instagram_media').select('*').limit(60),
      supabase.from('instagram_auth').select('username').maybeSingle(),
    ]);
    setDaily((d.data as DailyRow[]) ?? []);
    setMedia((m.data as MediaRow[]) ?? []);
    setUsername(a.data?.username ?? null);
    setConnected(!!a.data?.username || ((d.data ?? []).length > 0));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function connect() {
    if (!token.trim()) { setMsg('Paste your long-lived access token'); return; }
    setSyncing(true); setMsg(null);
    const { data, error } = await supabase.functions.invoke('instagram-connect', { body: { token: token.trim() } });
    if (error || data?.error) { setMsg(`Connect failed: ${data?.error ?? error?.message}`); setSyncing(false); return; }
    setMsg(`Connected @${data.username}. Running first sync…`);
    setToken('');
    await syncNow();
  }

  async function syncNow() {
    setSyncing(true); setMsg((m) => m ?? null);
    const { data, error } = await supabase.functions.invoke('instagram-sync', { body: {} });
    if (error || data?.error) setMsg(`Sync failed: ${data?.error ?? error?.message}`);
    else setMsg(`Synced ✓ ${nf(data?.followers)} followers · ${data?.media_synced ?? 0} posts`);
    setSyncing(false);
    load();
  }

  const latest = daily[daily.length - 1];
  const prev30 = daily.find((d) => d.snapshot_date <= new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)) ?? daily[0];
  const followerDelta = latest?.followers != null && prev30?.followers != null ? latest.followers - prev30.followers : null;
  // engagement rate = avg per-post interactions / followers
  const engRate = useMemo(() => {
    if (!latest?.followers || media.length === 0) return null;
    const recent = media.slice(0, 12);
    const avg = recent.reduce((s, m) => s + (m.engagement || m.like_count + m.comments_count + m.saved), 0) / recent.length;
    return (avg / latest.followers) * 100;
  }, [media, latest]);

  const sortedMedia = useMemo(() => {
    const arr = [...media];
    arr.sort((a, b) => sort === 'posted_at'
      ? (b.posted_at ?? '').localeCompare(a.posted_at ?? '')
      : (Number(b[sort]) - Number(a[sort])));
    return arr;
  }, [media, sort]);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Instagram size={20} /> Instagram Performance</h1>
          <p className="text-sm text-slate-500">
            {username ? <>@{username} · </> : ''}Auto-synced every morning.{latest && <> Latest: {latest.snapshot_date}.</>}
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button onClick={() => { setShowManual((v) => !v); setMDate(todayKw); }}
              className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50">
              <Pencil size={15} /> Log numbers
            </button>
          )}
          {canSync && connected && (
            <button onClick={syncNow} disabled={syncing}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
      </div>

      {showManual && (
        <div className="mb-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4 max-w-2xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">Log numbers manually</h3>
            <button onClick={() => setShowManual(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <p className="text-xs text-slate-400 mb-3">Copy these from the Instagram app → Professional dashboard / Insights. Leave a field blank to keep its current value.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <label className="text-xs"><span className="block text-slate-500 mb-1">Date</span>
              <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm" /></label>
            <label className="text-xs"><span className="block text-slate-500 mb-1">Followers</span>
              <input type="number" value={mFollowers} onChange={(e) => setMFollowers(e.target.value)} placeholder="e.g. 262100" className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm" /></label>
            <label className="text-xs"><span className="block text-slate-500 mb-1">Reach (7/30d)</span>
              <input type="number" value={mReach} onChange={(e) => setMReach(e.target.value)} placeholder="e.g. 48900" className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm" /></label>
            <label className="text-xs"><span className="block text-slate-500 mb-1">Profile views</span>
              <input type="number" value={mViews} onChange={(e) => setMViews(e.target.value)} placeholder="e.g. 3200" className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm" /></label>
          </div>
          <button onClick={saveManual} className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700">Save</button>
        </div>
      )}

      {msg && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm border ${msg.includes('✓') || msg.startsWith('Connected') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg}</div>
      )}

      {!connected ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-2xl">
          <div className="flex items-center gap-2 mb-3"><PlugZap size={18} className="text-amber-500" /><h2 className="font-bold text-slate-800">Connect Instagram (one-time)</h2></div>
          <ol className="list-decimal ml-5 space-y-2 text-sm text-slate-600 mb-4">
            <li>Make sure <b>@timekeeperkw</b> is a <b>Business/Creator</b> account linked to a Facebook Page.</li>
            <li>At <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">developers.facebook.com</a>, create an app, add <b>Instagram Graph API</b>, and add <code>IG_APP_ID</code> + <code>IG_APP_SECRET</code> to Supabase Edge Function Secrets.</li>
            <li>Generate a token with scopes: <code>instagram_basic</code>, <code>instagram_manage_insights</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>.</li>
            <li>Paste the token here and press Connect:</li>
          </ol>
          <div className="flex gap-2">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Long-lived access token"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            <button onClick={connect} disabled={syncing || !canSync}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
              {syncing ? 'Working…' : 'Connect'}
            </button>
          </div>
          {!canSync && <p className="text-xs text-slate-400 mt-2">Only an admin or manager can connect the account.</p>}
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5"><Users size={13} /> Followers</div>
              <p className="text-xl font-bold text-slate-800">{nf(latest?.followers)}</p>
              {followerDelta != null && <p className={`text-xs font-medium ${followerDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{followerDelta >= 0 ? '▲' : '▼'} {nf(Math.abs(followerDelta))} / 30d</p>}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5"><TrendingUp size={13} /> Reach (day)</div>
              <p className="text-xl font-bold text-slate-800">{nf(latest?.reach)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">Profile views</div>
              <p className="text-xl font-bold text-slate-800">{nf(latest?.profile_views)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5"><Heart size={13} /> Engagement rate</div>
              <p className="text-xl font-bold text-emerald-600">{engRate != null ? `${engRate.toFixed(1)}%` : '—'}</p>
              <p className="text-xs text-slate-400">avg last 12 posts</p>
            </div>
          </div>

          {/* Follower growth chart */}
          {daily.length > 0 && (() => {
            const pts = daily.filter((d) => d.followers != null);
            if (pts.length === 0) return null;
            const W = Math.max(pts.length * 40, 320), H = 130, padT = 12, padB = 22;
            const vals = pts.map((d) => Number(d.followers));
            const min = Math.min(...vals), max = Math.max(...vals, min + 1);
            const x = (i: number) => pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * (W - 12) + 6;
            const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
            const line = pts.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(Number(d.followers)).toFixed(1)}`).join(' ');
            return (
              <div className="mb-5 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Follower growth</h3>
                <div className="overflow-x-auto">
                  <svg width={W} height={H} className="min-w-full">
                    <path d={line} fill="none" stroke="#c026d3" strokeWidth="2" />
                    {pts.map((d, i) => (
                      <g key={d.snapshot_date}>
                        <circle cx={x(i)} cy={y(Number(d.followers))} r="2.5" fill="#c026d3" />
                        <title>{d.snapshot_date}: {nf(d.followers)} followers</title>
                        {(i === 0 || i === pts.length - 1) && <text x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : 'end'} fontSize="9" fill="#94a3b8">{d.snapshot_date.slice(5)}</text>}
                      </g>
                    ))}
                  </svg>
                </div>
                {pts.length === 1 && <p className="text-xs text-slate-400 mt-1">One data point so far — the growth line builds as the daily sync runs.</p>}
              </div>
            );
          })()}

          {/* Top posts */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">Top posts</h3>
            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
              {([['reach', 'Reach'], ['engagement', 'Engagement'], ['saved', 'Saves'], ['posted_at', 'Newest']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setSort(k)}
                  className={`px-2.5 py-1 ${sort === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
              ))}
            </div>
          </div>
          {media.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-slate-400 text-sm">No posts synced yet — press Sync now.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedMedia.slice(0, 12).map((m) => (
                <a key={m.media_id} href={m.permalink ?? '#'} target="_blank" rel="noopener noreferrer"
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:border-slate-400 transition-colors flex">
                  {m.thumbnail_url
                    ? <img src={m.thumbnail_url} alt="" className="w-24 h-24 object-cover shrink-0" />
                    : <div className="w-24 h-24 bg-slate-100 shrink-0" />}
                  <div className="p-2.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">{m.media_type}</span>
                      {m.posted_at && <span className="text-[10px] text-slate-400">· {m.posted_at.slice(0, 10)}</span>}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 mb-1.5">{m.caption || '(no caption)'}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span className="flex items-center gap-0.5"><TrendingUp size={11} /> {nf(m.reach)}</span>
                      <span className="flex items-center gap-0.5"><Heart size={11} /> {nf(m.like_count)}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle size={11} /> {nf(m.comments_count)}</span>
                      <span className="flex items-center gap-0.5"><Bookmark size={11} /> {nf(m.saved)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
