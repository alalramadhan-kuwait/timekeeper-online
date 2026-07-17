// Pulls @timekeeperkw performance + recent post insights into instagram_daily / instagram_media.
// Callers: pg_cron (x-sync-key) or admin/manager JWT (Sync now).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const GRAPH = "https://graph.facebook.com/v21.0";

interface Media { id: string; caption?: string; media_type?: string; permalink?: string; thumbnail_url?: string; media_url?: string; timestamp?: string; like_count?: number; comments_count?: number }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: auth } = await admin.from("instagram_auth").select("*").eq("id", 1).single();
  if (!auth) return json({ error: "Instagram not connected" }, 400);

  // authorize: shared key (cron) or admin/manager JWT
  const syncKey = req.headers.get("x-sync-key");
  let allowed = !!syncKey && syncKey === auth.sync_key;
  if (!allowed) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      const { data: u } = await admin.auth.getUser(jwt);
      if (u?.user) {
        const { data: p } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
        allowed = ["admin", "manager"].includes(p?.role ?? "");
      }
    }
  }
  if (!allowed) return json({ error: "Unauthorized" }, 401);
  if (!auth.ig_user_id || !auth.access_token) return json({ error: "Instagram not connected — complete the connect step" }, 400);

  const { data: logRow } = await admin.from("instagram_sync_log").insert({ status: "running" }).select("id").single();
  const fail = async (msg: string) => {
    await admin.from("instagram_sync_log").update({ status: "error", error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", logRow!.id);
    return json({ error: msg }, 500);
  };

  try {
    let token: string = auth.access_token;
    const igId: string = auth.ig_user_id;

    // refresh long-lived token if it expires within 7 days
    if (!auth.token_expires || new Date(auth.token_expires).getTime() < Date.now() + 7 * 86400_000) {
      const appId = Deno.env.get("IG_APP_ID"); const appSecret = Deno.env.get("IG_APP_SECRET");
      if (appId && appSecret) {
        const r = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(token)}`);
        const b = await r.json().catch(() => ({}));
        if (r.ok && b.access_token) {
          token = b.access_token;
          await admin.from("instagram_auth").update({
            access_token: token,
            token_expires: b.expires_in ? new Date(Date.now() + b.expires_in * 1000).toISOString() : new Date(Date.now() + 55 * 86400_000).toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", 1);
        }
      }
    }

    // account profile (followers, media_count)
    const profRes = await fetch(`${GRAPH}/${igId}?fields=followers_count,media_count,username&access_token=${encodeURIComponent(token)}`);
    const profBody = await profRes.json();
    if (!profRes.ok) return await fail(`Profile: ${profBody?.error?.message ?? profRes.status}`);
    const followers = profBody.followers_count ?? null;
    const mediaCount = profBody.media_count ?? null;

    // account day insights (reach, profile_views); impressions deprecated for some accounts → tolerate
    let reach: number | null = null, profileViews: number | null = null;
    const insRes = await fetch(`${GRAPH}/${igId}/insights?metric=reach,profile_views&period=day&access_token=${encodeURIComponent(token)}`);
    const insBody = await insRes.json();
    if (insRes.ok) {
      for (const m of insBody.data ?? []) {
        const val = m.values?.[m.values.length - 1]?.value ?? null;
        if (m.name === "reach") reach = val;
        if (m.name === "profile_views") profileViews = val;
      }
    }

    const snapshotDate = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Kuwait date
    await admin.from("instagram_daily").upsert({
      snapshot_date: snapshotDate, followers, reach, profile_views: profileViews, media_count: mediaCount,
      updated_at: new Date().toISOString(),
    });

    // recent media (cap 50 to respect rate limits)
    const medRes = await fetch(`${GRAPH}/${igId}/media?fields=caption,media_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=50&access_token=${encodeURIComponent(token)}`);
    const medBody = await medRes.json();
    let mediaSynced = 0;
    if (medRes.ok) {
      const items: Media[] = medBody.data ?? [];
      const syncedAt = new Date().toISOString();
      for (const m of items) {
        let mReach = 0, saved = 0, engagement = 0;
        const mi = await fetch(`${GRAPH}/${m.id}/insights?metric=reach,saved,total_interactions&access_token=${encodeURIComponent(token)}`);
        if (mi.ok) {
          const mb = await mi.json();
          for (const row of mb.data ?? []) {
            const v = row.values?.[0]?.value ?? 0;
            if (row.name === "reach") mReach = v;
            if (row.name === "saved") saved = v;
            if (row.name === "total_interactions") engagement = v;
          }
        } else if (mi.status === 429) { break; } // rate limited — stop paging insights
        await admin.from("instagram_media").upsert({
          media_id: m.id, caption: (m.caption ?? "").slice(0, 500), media_type: m.media_type ?? null,
          permalink: m.permalink ?? null, thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
          posted_at: m.timestamp ?? null, like_count: m.like_count ?? 0, comments_count: m.comments_count ?? 0,
          reach: mReach, saved, engagement: engagement || ((m.like_count ?? 0) + (m.comments_count ?? 0) + saved),
          synced_at: syncedAt,
        });
        mediaSynced++;
      }
    }

    await admin.from("instagram_sync_log").update({ status: "ok", finished_at: new Date().toISOString() }).eq("id", logRow!.id);
    return json({ ok: true, followers, reach, media_synced: mediaSynced });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
});
