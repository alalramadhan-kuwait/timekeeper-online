// Instagram's own figures for all three accounts, from Instagram itself.
//
// Per account: yesterday's reach, profile views, accounts engaged, total
// interactions and website taps (instagram_daily, on yesterday's row), and the
// last 50 posts with reach, saves, shares, views, likes, comments, profile
// visits and follows (instagram_media). Figures are stored as Instagram sent
// them.
//
// It used to need somebody to paste a personal token into instagram-connect,
// which never happened, so it failed every morning with "not connected". It
// now uses META_ADS_TOKEN — the System User token the ads sync uses, which
// holds instagram_basic and instagram_manage_insights — and finds the
// accounts through the Facebook pages that token manages.
//
// Callers: pg_cron (x-sync-key, the key in instagram_auth) or an
// admin/manager/marketing JWT.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const GRAPH = "https://graph.facebook.com/v21.0";

async function graph(path: string, token: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw Object.assign(new Error(`${path}: ${e.message ?? res.status}`), { status: res.status, code: e.code });
  }
  return body;
}

/* Instagram refuses the whole request if one metric does not apply to the
   post (profile_visits and follows exist for feed posts, not reels; views is
   newer than some posts). So ask for the full set, then fall back. */
const POST_METRICS = [
  "reach,saved,shares,views,likes,comments,total_interactions,profile_visits,follows",
  "reach,saved,shares,views,likes,comments,total_interactions",
  "reach,saved,shares,likes,comments,total_interactions",
  "reach,saved,total_interactions",
];

async function postInsights(id: string, token: string): Promise<Record<string, number> | null> {
  for (const metric of POST_METRICS) {
    try {
      const body = await graph(`${id}/insights`, token, { metric });
      const out: Record<string, number> = {};
      for (const row of body.data ?? []) out[row.name] = Number(row.values?.[0]?.value ?? row.total_value?.value ?? 0);
      return out;
    } catch (e) {
      if ((e as { status?: number }).status === 429 || (e as { code?: number }).code === 4) throw e; // rate limited
    }
  }
  return null;
}

/** A Kuwait calendar date, `days` from today. */
const kuwaitDate = (days = 0) =>
  new Date(Date.now() + 3 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: auth } = await admin.from("instagram_auth").select("sync_key").eq("id", 1).maybeSingle();
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

  const { data: logRow } = await admin.from("instagram_sync_log").insert({ status: "running" }).select("id").single();
  const finish = async (status: string, error?: string) => {
    await admin.from("instagram_sync_log")
      .update({ status, error: error?.slice(0, 500) ?? null, finished_at: new Date().toISOString() })
      .eq("id", logRow!.id);
  };

  try {
    const pages = await graph("me/accounts", token, { fields: "name,instagram_business_account{id,username}", limit: "50" });
    const accounts = (pages.data ?? [])
      .map((p: any) => p.instagram_business_account)
      .filter((a: any) => a?.id);

    const since = Math.floor(new Date(`${kuwaitDate(-1)}T00:00:00+03:00`).getTime() / 1000);
    const until = since + 86400;
    const report: Record<string, unknown>[] = [];

    for (const acc of accounts) {
      const one: Record<string, unknown> = { username: acc.username };
      // Yesterday, on yesterday's row, beside the follower count the scraper
      // wrote for that day. Only these columns are written, so the scraper's
      // own figures are left as they are.
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
        one.day_error = e instanceof Error ? e.message : String(e);
      }

      const media = await graph(`${acc.id}/media`, token, {
        fields: "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
        limit: "50",
      });
      let posts = 0, withInsights = 0;
      for (const m of media.data ?? []) {
        let ins: Record<string, number> | null = null;
        try { ins = await postInsights(m.id, token); } catch { break; } // rate limited: keep what we have
        const { error } = await admin.from("instagram_media").upsert({
          media_id: m.id, username: acc.username,
          caption: (m.caption ?? "").slice(0, 500), media_type: m.media_type ?? null,
          media_product_type: m.media_product_type ?? null,
          permalink: m.permalink ?? null, thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
          posted_at: m.timestamp ?? null,
          like_count: m.like_count ?? 0, comments_count: m.comments_count ?? 0,
          reach: ins?.reach ?? null, saved: ins?.saved ?? null, shares: ins?.shares ?? null,
          views: ins?.views ?? null, total_interactions: ins?.total_interactions ?? null,
          profile_visits: ins?.profile_visits ?? null, follows: ins?.follows ?? null,
          engagement: ins?.total_interactions ?? ((m.like_count ?? 0) + (m.comments_count ?? 0)),
          insights: ins, synced_at: new Date().toISOString(),
        }, { onConflict: "media_id" });
        if (error) throw new Error(`instagram_media: ${error.message}`);
        posts++;
        if (ins) withInsights++;
      }
      one.posts = posts;
      one.posts_with_insights = withInsights;
      report.push(one);
    }

    await finish("ok");
    return json({ ok: true, accounts: report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish("error", msg);
    return json({ error: msg }, 500);
  }
});
