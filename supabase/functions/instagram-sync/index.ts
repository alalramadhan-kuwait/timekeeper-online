// Instagram's own figures for every account the Meta token manages, from Instagram itself.
//
// What it keeps (all read-only towards Instagram):
//   instagram_media            one row per post: the latest figures, the full caption, carousel size, and for
//                              Reels the watch time (ig_reels_avg_watch_time, ig_reels_video_view_total_time).
//   instagram_media_snapshots  a row each time a post is read, so a post's growth can be followed hour by hour
//                              (how fast it took off, what it had at 48 hours and at 7 days).
//   instagram_daily            yesterday's account figures (reach, profile views, accounts engaged, interactions,
//                              website taps), on yesterday's row beside the follower count the scraper writes.
//   instagram_audience         yesterday's reach and views split by follower / non-follower and by format, when
//                              the followers are online, and who they are (age, gender, city, country).
//
// Modes (POST body `mode`):
//   (none) / "daily"  everything above, the last 50 posts per account. The 08:15 Kuwait cron.
//   "fresh"           only posts at the ages the reports read: under 26 hours (the early read), 40-62 hours (the
//                     48-hour report) and 148-202 hours (the 7-day report). Every 3 hours. Pages back 8.5 days.
//   "backfill"        every Reel the account still has (or `kinds`: ["REELS", "FEED"]), for the watch time and
//                     skip rate the older posts were read without. Writes posts, not snapshots. Run by hand.
//   "probe"           reads one recent Reel and one carousel and the account extras and returns what Instagram
//                     answered, writing nothing. For checking which metrics the token gets.
//
// Instagram refuses a whole insights request when one metric does not apply to the post (follows and
// profile_visits are for feed posts; watch time is for Reels; some metrics are newer than old posts). Each
// request starts from the full list for the post's kind, and a metric Instagram names as unsupported is left
// out for the rest of the run, so one bad metric never costs the others.
//
// It uses META_ADS_TOKEN, the System User token the ads sync uses (instagram_basic, instagram_manage_insights),
// and finds the accounts through the Facebook pages that token manages.
//
// Each run writes instagram_sync_log.report: per account, how many posts were read, whether Instagram rate-limited
// it, and any error; one account failing never stops the others, and status is "partial" when any did.
// A failed read never wipes a post's earlier figures (the ig_keep_metrics trigger), and a second read of the same
// post within 45 minutes adds no snapshot (ig_snapshot_once).
//
// Callers: pg_cron (x-sync-key, the key in instagram_auth) or an admin/manager/marketing JWT.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

let GRAPH = "https://graph.facebook.com/v21.0";   // probe may try another version
type Json = Record<string, any>;

async function graph(path: string, token: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw Object.assign(new Error(`${path}: ${e.message ?? res.status}`), { status: res.status, code: e.code, raw: e.message ?? "" });
  }
  return body;
}
const rateLimited = (e: unknown) => {
  const x = e as { status?: number; code?: number };
  return x.status === 429 || x.code === 4 || x.code === 17 || x.code === 32 || x.code === 613;
};

// The full list per kind. profile_visits and follows exist for feed posts; watch time for Reels.
const BASE_METRICS: Record<string, string[]> = {
  REELS: ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions",
    "ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reposts", "profile_visits", "follows"],
  FEED: ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions", "profile_visits", "follows", "reposts"],
};
const METRICS: Record<string, string[]> = { ...BASE_METRICS };
const kindOf = (m: Json) => (m.media_product_type === "REELS" ? "REELS" : "FEED");

/** Insights for one post. Metrics Instagram names as unsupported are dropped for the run (`dropped`). */
async function postInsights(m: Json, token: string, dropped: Record<string, Set<string>>, log?: string[]) {
  const kind = kindOf(m);
  let list = METRICS[kind].filter((x) => !dropped[kind].has(x));
  for (let attempt = 0; attempt < 6 && list.length; attempt++) {
    try {
      const body = await graph(`${m.id}/insights`, token, { metric: list.join(",") });
      const out: Record<string, number> = {};
      for (const row of body.data ?? []) out[row.name] = Number(row.values?.[0]?.value ?? row.total_value?.value ?? 0);
      return out;
    } catch (e) {
      if (rateLimited(e)) throw e;
      const msg = String((e as { raw?: string }).raw ?? (e as Error).message);
      log?.push(`${kind} [${list.join(",")}]: ${msg}`);
      const allowed = msg.match(/must be one of the following values:(.*)/i);
      let bad: string[];
      if (allowed) {
        const ok = new Set(allowed[1].toLowerCase().split(/[^a-z_]+/).filter(Boolean));
        bad = list.filter((x) => !ok.has(x));
      } else {
        bad = list.filter((x) => new RegExp(`(^|[^a-z_])${x}([^a-z_]|$)`).test(msg));
      }
      // nothing named: this post has no insights at all (too old, too few viewers)
      if (!bad.length) return null;
      // a metric refused for one post is refused for its kind only when the message says so in general
      if (allowed || /does not support|not supported|is not available|deprecated/i.test(msg)) bad.forEach((x) => dropped[kind].add(x));
      list = list.filter((x) => !bad.includes(x));
    }
  }
  return null;
}

/** A Kuwait calendar date, `days` from today. */
const kuwaitDate = (days = 0) =>
  new Date(Date.now() + 3 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);

const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count,is_shared_to_feed,children{id}";

function mediaRow(acc: Json, m: Json, ins: Record<string, number> | null) {
  return {
    media_id: m.id, username: acc.username,
    caption: (m.caption ?? "").slice(0, 2200), media_type: m.media_type ?? null,
    media_product_type: m.media_product_type ?? null,
    permalink: m.permalink ?? null, thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
    posted_at: m.timestamp ?? null,
    like_count: m.like_count ?? 0, comments_count: m.comments_count ?? 0,
    children_count: m.children?.data?.length ?? null, is_shared_to_feed: m.is_shared_to_feed ?? null,
    reach: ins?.reach ?? null, saved: ins?.saved ?? null, shares: ins?.shares ?? null,
    views: ins?.views ?? null, total_interactions: ins?.total_interactions ?? null,
    profile_visits: ins?.profile_visits ?? null, follows: ins?.follows ?? null, reposts: ins?.reposts ?? null,
    avg_watch_time_ms: ins?.ig_reels_avg_watch_time ?? null, total_watch_time_ms: ins?.ig_reels_video_view_total_time ?? null,
    engagement: ins?.total_interactions ?? ((m.like_count ?? 0) + (m.comments_count ?? 0)),
    insights: ins, synced_at: ins ? new Date().toISOString() : undefined,   // a failed read keeps the time of the last good one
  };
}

function snapshotRow(acc: Json, m: Json, ins: Record<string, number>, mode: string) {
  const posted = Date.parse(m.timestamp ?? "");
  return {
    media_id: m.id, username: acc.username, mode,
    age_hours: Number.isFinite(posted) ? Math.round((Date.now() - posted) / 36e3) / 100 : null,
    views: ins.views ?? null, reach: ins.reach ?? null, likes: ins.likes ?? m.like_count ?? null,
    comments: ins.comments ?? m.comments_count ?? null, saved: ins.saved ?? null, shares: ins.shares ?? null,
    total_interactions: ins.total_interactions ?? null, profile_visits: ins.profile_visits ?? null,
    follows: ins.follows ?? null, reposts: ins.reposts ?? null,
    avg_watch_time_ms: ins.ig_reels_avg_watch_time ?? null, total_watch_time_ms: ins.ig_reels_video_view_total_time ?? null,
    metrics: ins,
  };
}

/** The account extras: yesterday by follower type and by format, when followers are online, who they are. */
async function audience(acc: Json, token: string, since: number, until: number) {
  const day = { period: "day", metric_type: "total_value", since: String(since), until: String(until) };
  const asks: [string, Record<string, string>][] = [
    ["follow_type", { metric: "reach,views", breakdown: "follow_type", ...day }],
    ["media_product_type", { metric: "reach,views,total_interactions", breakdown: "media_product_type", ...day }],
    ["online_followers", { metric: "online_followers", period: "lifetime", since: String(since), until: String(until) }],
    ["followers_age", { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown: "age" }],
    ["followers_gender", { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown: "gender" }],
    ["followers_city", { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown: "city" }],
    ["followers_country", { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown: "country" }],
  ];
  const out: Record<string, unknown> = {}, errors: Record<string, string> = {};
  for (const [kind, params] of asks) {
    try { out[kind] = (await graph(`${acc.id}/insights`, token, params)).data ?? []; }
    catch (e) { if (rateLimited(e)) throw e; errors[kind] = (e as Error).message.slice(0, 300); }
  }
  return { out, errors };
}

async function readAccount(admin: SupabaseClient, acc: Json, token: string, mode: string, dropped: Record<string, Set<string>>, opts: Json = {}) {
  const one: Json = { username: acc.username };
  const since = Math.floor(new Date(`${kuwaitDate(-1)}T00:00:00+03:00`).getTime() / 1000);
  const until = since + 86400;

  if (mode === "daily") {
    // Yesterday, on yesterday's row, beside the follower count the scraper wrote for that day. Only these
    // columns are written, so the scraper's own figures are left as they are.
    try {
      const body = await graph(`${acc.id}/insights`, token, {
        metric: "reach,profile_views,accounts_engaged,total_interactions,website_clicks",
        period: "day", metric_type: "total_value", since: String(since), until: String(until),
      });
      const v: Record<string, number> = {};
      for (const m of body.data ?? []) v[m.name] = Number(m.total_value?.value ?? m.values?.[0]?.value ?? 0);
      await admin.from("instagram_daily").upsert({
        snapshot_date: kuwaitDate(-1), username: acc.username,
        reach: v.reach ?? null, profile_views: v.profile_views ?? null,
        accounts_engaged: v.accounts_engaged ?? null, total_interactions: v.total_interactions ?? null,
        website_clicks: v.website_clicks ?? null, updated_at: new Date().toISOString(),
      }, { onConflict: "snapshot_date,username" });
      one.day = v;
    } catch (e) {
      if (rateLimited(e)) throw e;
      one.day_error = (e as Error).message;
    }
    const a = await audience(acc, token, since, until);
    const rows = Object.entries(a.out).map(([kind, data]) => ({ username: acc.username, snapshot_date: kuwaitDate(-1), kind, data }));
    if (rows.length) {
      const { error } = await admin.from("instagram_audience").upsert(rows, { onConflict: "username,snapshot_date,kind" });
      if (error) one.audience_error = error.message;
    }
    one.audience = Object.keys(a.out);
    if (Object.keys(a.errors).length) one.audience_missing = a.errors;
  }

  // daily: the newest 50. fresh: back 8.5 days, keeping the ages the reports read. backfill: everything, by kind.
  const all: Json[] = [];
  const cutoff = Date.now() - 8.5 * 86400_000;
  let page: Json = await graph(`${acc.id}/media`, token, { fields: MEDIA_FIELDS, limit: "50" });
  for (let n = 0; ; n++) {
    all.push(...(page.data ?? []));
    const oldest = Date.parse(all[all.length - 1]?.timestamp ?? "");
    const more = page.paging?.cursors?.after && page.paging?.next;
    if (mode === "daily" || !more || n >= (mode === "backfill" ? 20 : 4) || (mode === "fresh" && oldest < cutoff)) break;
    page = await graph(`${acc.id}/media`, token, { fields: MEDIA_FIELDS, limit: "50", after: page.paging.cursors.after });
  }
  const kinds: string[] = Array.isArray(opts.kinds) && opts.kinds.length ? opts.kinds : ["REELS"];
  const ageH = (m: Json) => (Date.now() - Date.parse(m.timestamp ?? "")) / 3600_000;
  const list = mode === "fresh" ? all.filter((m) => { const h = ageH(m); return h < 26 || (h >= 40 && h <= 62) || (h >= 148 && h <= 202); })
    : mode === "backfill" ? all.filter((m) => kinds.includes(kindOf(m)))
    : all.slice(0, 50);
  one.listed = all.length;
  let posts = 0, withInsights = 0, watch = 0;
  const snaps: Json[] = [];
  for (const m of list) {
    let ins: Record<string, number> | null = null;
    try { ins = await postInsights(m, token, dropped); } catch { one.rate_limited = true; break; } // keep what we have
    const { error } = await admin.from("instagram_media").upsert(mediaRow(acc, m, ins), { onConflict: "media_id" });
    if (error) throw new Error(`instagram_media: ${error.message}`);
    posts++;
    if (ins) { withInsights++; if (mode !== "backfill") snaps.push(snapshotRow(acc, m, ins, mode)); if (ins.ig_reels_avg_watch_time != null) watch++; }
  }
  if (snaps.length) {
    const { error } = await admin.from("instagram_media_snapshots").insert(snaps);
    if (error) throw new Error(`instagram_media_snapshots: ${error.message}`);
  }
  Object.assign(one, { posts, posts_with_insights: withInsights, reels_with_watch_time: watch });
  return one;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  GRAPH = "https://graph.facebook.com/v21.0";   // every request starts on the default version
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: auth } = await admin.from("instagram_auth").select("sync_key, graph_version, extra_metrics").eq("id", 1).maybeSingle();
  // The Graph API version and any newer metrics to ask for are settings (instagram_auth), so trying a new
  // Instagram metric needs no new deploy: a metric Instagram refuses is simply left out of the run.
  if (typeof auth?.graph_version === "string" && /^v[0-9]+[.]0$/.test(auth.graph_version)) GRAPH = `https://graph.facebook.com/${auth.graph_version}`;
  const extra = (auth?.extra_metrics ?? {}) as Record<string, string[]>;
  for (const kind of ["REELS", "FEED"]) METRICS[kind] = [...new Set([...BASE_METRICS[kind], ...(Array.isArray(extra[kind]) ? extra[kind] : [])])];
  const syncKey = req.headers.get("x-sync-key");
  let allowed = !!syncKey && !!auth?.sync_key && syncKey === auth.sync_key;
  if (!allowed) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      const { data: u } = await admin.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
        allowed = ["admin", "manager", "marketing"].includes(p?.role ?? "");
      }
    }
  }
  if (!allowed) return json({ error: "Unauthorized" }, 401);

  const token = Deno.env.get("META_ADS_TOKEN");
  if (!token) return json({ error: "META_ADS_TOKEN is not set in Edge Function secrets." }, 400);

  let body: Json = {};
  try { body = await req.json(); } catch { /* no body */ }
  const mode = ["fresh", "probe", "backfill"].includes(body.mode) ? body.mode : "daily";

  const pages = await graph("me/accounts", token, { fields: "name,instagram_business_account{id,username}", limit: "50" });
  const accounts = (pages.data ?? []).map((p: Json) => p.instagram_business_account).filter((a: Json) => a?.id);

  if (mode === "probe") {
    if (typeof body.version === "string" && /^v[0-9]+[.]0$/.test(body.version)) GRAPH = `https://graph.facebook.com/${body.version}`;
    // One Reel and one carousel from the first account (or the one asked for), every metric tried, nothing written.
    const acc = accounts.find((a: Json) => a.username === body.username) ?? accounts[0];
    const media = await graph(`${acc.id}/media`, token, { fields: MEDIA_FIELDS, limit: "40" });
    const reel = (media.data ?? []).find((m: Json) => m.media_product_type === "REELS");
    const carousel = (media.data ?? []).find((m: Json) => m.media_type === "CAROUSEL_ALBUM");
    const dropped = { REELS: new Set<string>(), FEED: new Set<string>() };
    const out: Json = { username: acc.username, accounts: accounts.map((a: Json) => a.username) };
    for (const [name, m] of [["reel", reel], ["carousel", carousel]] as [string, Json][]) {
      if (!m) continue;
      const log: string[] = [];
      out[name] = { id: m.id, posted: m.timestamp, children: m.children?.data?.length ?? null, insights: await postInsights(m, token, dropped, log), refused: log };
    }
    out.dropped = { REELS: [...dropped.REELS], FEED: [...dropped.FEED] };
    // single metrics to try on the Reel, each on its own, with Instagram's answer (for finding new metric names)
    if (reel && Array.isArray(body.try)) {
      out.tried = {};
      for (const metric of body.try.slice(0, 8)) {
        try { out.tried[metric] = (await graph(`${reel.id}/insights`, token, { metric })).data; }
        catch (e) { out.tried[metric] = (e as Error).message.slice(0, 600); }
      }
    }
    const since = Math.floor(new Date(`${kuwaitDate(-1)}T00:00:00+03:00`).getTime() / 1000);
    const a = await audience(acc, token, since, since + 86400);
    out.audience = Object.fromEntries(Object.entries(a.out).map(([k, v]) => [k, JSON.stringify(v).slice(0, 400)]));
    out.audience_missing = a.errors;
    return json(out);
  }

  const { data: logRow } = await admin.from("instagram_sync_log").insert({ status: "running" }).select("id").single();
  const finish = async (status: string, error?: string, report?: Json) => {
    await admin.from("instagram_sync_log")
      .update({ status, error: error?.slice(0, 500) ?? null, finished_at: new Date().toISOString(), report: report ?? null })
      .eq("id", logRow!.id);
  };
  const dropped = { REELS: new Set<string>(), FEED: new Set<string>() };
  const report: Json[] = [];
  const only = typeof body.username === "string" ? body.username : null;
  for (const acc of accounts) {
    if (only && acc.username !== only) continue;
    // one account failing (rate limit, a Graph error) is reported and the next account still runs
    try { report.push(await readAccount(admin, acc, token, mode, dropped, { kinds: body.kinds })); }
    catch (e) { report.push({ username: acc.username, error: (e instanceof Error ? e.message : String(e)).slice(0, 300), rate_limited: rateLimited(e) || undefined }); }
  }
  const bad = report.filter((r) => r.error || r.rate_limited);
  const summary = { mode, accounts: report, metrics_left_out: { REELS: [...dropped.REELS], FEED: [...dropped.FEED] } };
  await finish(bad.length === report.length && report.length ? "error" : bad.length ? "partial" : "ok",
    bad.map((r) => `${r.username}: ${r.error ?? "rate limited"}`).join("; ") || undefined, summary);
  return json({ ok: bad.length < report.length, ...summary }, bad.length === report.length && report.length ? 502 : 200);
});
