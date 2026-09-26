import { useEffect, useMemo, useState } from 'react';
import { Instagram, RefreshCw, Heart, MessageCircle, Users, UserPlus, TrendingUp, Eye, Bookmark, Send, MousePointerClick } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';

// Two sources. Instagram itself (instagram-sync, through the business's Meta
// token): reach, saves, shares and views per post, and each day's reach,
// profile visits and website taps. The public scraper (instagram-apify-sync):
// followers over time, and likes and comments for older posts.
const ACCOUNTS = ['timekeeperkw', 'timegallerykw', 'timekeeperkwshop'];

interface DailyRow { snapshot_date: string; username: string; followers: number | null; follows_count: number | null; media_count: number | null; last_post_date: string | null }
interface InsightRow { snapshot_date: string; reach: number | null; profile_views: number | null; accounts_engaged: number | null; website_clicks: number | null }
interface MediaRow { media_id: string; posted_at: string | null; media_type: string | null; media_product_type: string | null; caption: string | null; permalink: string | null; like_count: number | null; comments_count: number | null; reach: number | null; saved: number | null; shares: number | null; views: number | null; total_interactions: number | null; profile_visits: number | null; follows: number | null }
interface PostRow { shortcode: string; username: string; posted_at: string | null; type: string | null; likes: number | null; comments: number | null; caption: string | null; url: string | null }

const nf = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));
const typeLabel = (t: string | null) => (t === 'Sidecar' ? 'Carousel' : t === 'Video' ? 'Reel' : t ?? 'Post');

export default function InstagramPage() {
  const { role } = useAuth();
  const canSync = ['admin', 'manager', 'marketing'].includes(role ?? '');
  const [account, setAccount] = useState(ACCOUNTS[0]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sort, setSort] = useState<'engagement' | 'likes' | 'comments' | 'posted_at'>('engagement');
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [insight, setInsight] = useState<InsightRow[]>([]);
  const [mSort, setMSort] = useState<'reach' | 'saved' | 'shares' | 'posted_at'>('reach');

  async function load() {
    setLoading(true);
    const [d, p, m, ins] = await Promise.all([
      supabase.from('instagram_daily').select('snapshot_date, username, followers, follows_count, media_count, last_post_date')
        .eq('username', account).order('snapshot_date').limit(365),
      supabase.from('instagram_posts').select('shortcode, username, posted_at, type, likes, comments, caption, url')
        .eq('username', account).order('posted_at', { ascending: false }).limit(60),
      supabase.from('instagram_media')
        .select('media_id, posted_at, media_type, media_product_type, caption, permalink, like_count, comments_count, reach, saved, shares, views, total_interactions, profile_visits, follows')
        .eq('username', account).order('posted_at', { ascending: false }).limit(50),
      supabase.from('instagram_daily').select('snapshot_date, reach, profile_views, accounts_engaged, website_clicks')
        .eq('username', account).not('reach', 'is', null).order('snapshot_date', { ascending: false }).limit(30),
    ]);
    setMedia((m.data as MediaRow[]) ?? []);
    setInsight((ins.data as InsightRow[]) ?? []);
    setDaily((d.data as DailyRow[]) ?? []);
    setPosts((p.data as PostRow[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [account]);

  async function syncNow() {
    setSyncing(true); setMsg(null);
    // Instagram's own figures first; the scraper's followers after.
    await supabase.functions.invoke('instagram-sync', { body: {} });
    const { data, error } = await supabase.functions.invoke('instagram-apify-sync', { body: {} });
    if (error || (data as any)?.error) {
      // invoke() masks the real reason — dig it out of the response body
      let detail = (data as any)?.error ?? error?.message;
      try { detail = (await (error as any)?.context?.clone().json())?.error ?? detail; } catch { /* keep */ }
      setMsg(`Sync failed: ${detail}`);
    } else {
      setMsg(`Synced ✓ ${data?.accounts ?? 0} accounts · ${data?.posts ?? 0} posts`);
    }
    setSyncing(false);
    load();
  }

  const latest = daily[daily.length - 1];
  const prev30 = daily.find((d) => d.snapshot_date <= new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)) ?? daily[0];
  const followerDelta = latest?.followers != null && prev30?.followers != null ? latest.followers - prev30.followers : null;

  const engOf = (m: PostRow) => Number(m.likes ?? 0) + Number(m.comments ?? 0);
  const avgEng = useMemo(() => {
    if (posts.length === 0) return null;
    const recent = posts.slice(0, 12);
    return Math.round(recent.reduce((s, m) => s + engOf(m), 0) / recent.length);
  }, [posts]);
  const engRate = avgEng != null && latest?.followers ? (avgEng / latest.followers) * 100 : null;

  const sortedPosts = useMemo(() => {
    const arr = [...posts];
    arr.sort((a, b) => sort === 'posted_at'
      ? (b.posted_at ?? '').localeCompare(a.posted_at ?? '')
      : sort === 'likes' ? Number(b.likes ?? 0) - Number(a.likes ?? 0)
      : sort === 'comments' ? Number(b.comments ?? 0) - Number(a.comments ?? 0)
      : engOf(b) - engOf(a));
    return arr;
  }, [posts, sort]);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Instagram size={20} /> Instagram Performance</h1>
          <p className="text-sm text-slate-500">
            @{account} · Auto-synced every morning.{latest && <> Latest: {latest.snapshot_date}.</>}
          </p>
        </div>
        <div className="flex gap-2">
          <select value={account} onChange={(e) => setAccount(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
            {ACCOUNTS.map((a) => <option key={a} value={a}>@{a}</option>)}
          </select>
          {canSync && (
            <button onClick={syncNow} disabled={syncing}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-60">
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`mb-3 px-4 py-2 rounded-lg text-sm border ${msg.includes('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg}</div>
      )}

      {insight[0] && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Kpi icon={<Eye size={13} />} label="Reach" value={nf(insight[0].reach)} sub={`accounts reached · ${insight[0].snapshot_date}`} />
          <Kpi icon={<Users size={13} />} label="Profile visits" value={nf(insight[0].profile_views)} sub={insight[0].snapshot_date} />
          <Kpi icon={<Heart size={13} />} label="Accounts engaged" value={nf(insight[0].accounts_engaged)} sub={insight[0].snapshot_date} />
          <Kpi icon={<MousePointerClick size={13} />} label="Website taps" value={nf(insight[0].website_clicks)} sub={insight[0].snapshot_date} />
        </div>
      )}
      <p className="text-xs text-slate-400 mb-4">
        Reach, visits, saves, shares and views are Instagram’s own figures. Followers and older
        likes come from the public scraper. Instagram counts its day in Pacific time.
      </p>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5"><Users size={13} /> Followers</div>
          <p className="text-xl font-bold text-slate-800">{nf(latest?.followers)}</p>
          {followerDelta != null && <p className={`text-xs font-medium ${followerDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{followerDelta >= 0 ? '▲' : '▼'} {nf(Math.abs(followerDelta))} / 30d</p>}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5"><UserPlus size={13} /> Following</div>
          <p className="text-xl font-bold text-slate-800">{nf(latest?.follows_count)}</p>
          <p className="text-xs text-slate-400">{nf(latest?.media_count)} posts</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5"><Heart size={13} /> Avg engagement / post</div>
          <p className="text-xl font-bold text-emerald-600">{nf(avgEng)}</p>
          <p className="text-xs text-slate-400">likes + comments, last 12</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5"><TrendingUp size={13} /> Engagement rate</div>
          <p className="text-xl font-bold text-slate-800">{engRate != null ? `${engRate.toFixed(2)}%` : '—'}</p>
          <p className="text-xs text-slate-400">of followers</p>
        </div>
      </div>

      {/* Follower growth chart (this account only) */}
      {(() => {
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

      {/* What each post did, by Instagram's own count */}
      {media.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700">Post performance</h3>
            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
              {([['reach', 'Reach'], ['saved', 'Saves'], ['shares', 'Shares'], ['posted_at', 'Newest']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setMSort(k)}
                  className={`px-2.5 py-1 ${mSort === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Post</th>
                  <th className="text-right px-3 py-2 font-semibold">Reach</th>
                  <th className="text-right px-3 py-2 font-semibold">Views</th>
                  <th className="text-right px-3 py-2 font-semibold">Saves</th>
                  <th className="text-right px-3 py-2 font-semibold">Shares</th>
                  <th className="text-right px-3 py-2 font-semibold">Likes</th>
                  <th className="text-right px-3 py-2 font-semibold">Profile visits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...media].sort((a, b) => mSort === 'posted_at'
                  ? (b.posted_at ?? '').localeCompare(a.posted_at ?? '')
                  : Number(b[mSort] ?? -1) - Number(a[mSort] ?? -1)).slice(0, 20).map((m) => (
                  <tr key={m.media_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 max-w-[340px]">
                      <a href={m.permalink ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                          {m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post'}
                          {m.posted_at && <> · {m.posted_at.slice(0, 10)}</>}
                        </span>
                        <span className="block text-xs text-slate-600 truncate">{m.caption?.replace(/\s+/g, ' ').trim() || '(no caption)'}</span>
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{nf(m.reach)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{nf(m.views)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600"><span className="inline-flex items-center gap-1"><Bookmark size={11} />{nf(m.saved)}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600"><span className="inline-flex items-center gap-1"><Send size={11} />{nf(m.shares)}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{nf(m.like_count)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{nf(m.profile_visits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Top posts */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">Likes and comments (public count)</h3>
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs">
          {([['engagement', 'Engagement'], ['likes', 'Likes'], ['comments', 'Comments'], ['posted_at', 'Newest']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`px-2.5 py-1 ${sort === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
          ))}
        </div>
      </div>
      {posts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-slate-400 text-sm">No posts synced yet — press Sync now.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedPosts.slice(0, 12).map((m) => (
            <a key={m.shortcode} href={m.url ?? '#'} target="_blank" rel="noopener noreferrer"
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 hover:border-slate-400 transition-colors">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">{typeLabel(m.type)}</span>
                {m.posted_at && <span className="text-[10px] text-slate-400">· {m.posted_at.slice(0, 10)}</span>}
              </div>
              <p className="text-xs text-slate-600 line-clamp-2 mb-1.5">{m.caption?.replace(/\s+/g, ' ').trim() || '(no caption)'}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                <span className="flex items-center gap-0.5"><Heart size={11} /> {nf(m.likes)}</span>
                <span className="flex items-center gap-0.5"><MessageCircle size={11} /> {nf(m.comments)}</span>
                <span className="text-slate-400">= {nf(engOf(m))} eng</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">{icon} {label}</div>
      <p className="text-xl font-bold text-slate-800 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
