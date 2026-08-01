// Daily snapshot of our public Instagram accounts via the Apify Instagram Profile
// Scraper (no Instagram login needed). Stores followers + last-post date per account
// into instagram_daily, keyed by (snapshot_date, username).
// Callers: pg_cron (x-sync-key) or admin/manager JWT ("Refresh now").
// Needs the APIFY_TOKEN secret set in Supabase Edge Function secrets.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

// The public accounts to track. Add handles here to track more.
const ACCOUNTS = ["timekeeperkw", "timegallerykw", "timekeeperkwshop"];
const APIFY = "https://api.apify.com/v2";
const ACTOR = "apify~instagram-profile-scraper";

interface IgPost {
  shortCode?: string; timestamp?: string; isPinned?: boolean; type?: string;
  likesCount?: number; commentsCount?: number; videoViewCount?: number | null;
  caption?: string; hashtags?: string[]; url?: string;
}
interface IgProfile {
  username?: string; followersCount?: number; followsCount?: number;
  postsCount?: number; latestPosts?: IgPost[];
}

async function apify(method: string, path: string, token: string, body?: unknown) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${APIFY}${path}${sep}token=${token}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Apify ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

/** Kuwait calendar date (UTC+3) for the snapshot key. */
function kuwaitToday(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // auth: shared sync key (cron) or an admin/manager JWT
  const { data: auth } = await admin.from("lightspeed_auth").select("sync_key").eq("id", 1).single();
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

  // token: prefer the APIFY_TOKEN secret; fall back to the service-role-only apify_config table
  let token = Deno.env.get("APIFY_TOKEN") ?? "";
  if (!token) {
    const { data: cfg } = await admin.from("apify_config").select("token").eq("id", 1).single();
    token = cfg?.token ?? "";
  }
  if (!token) return json({ error: "No Apify token (set APIFY_TOKEN secret or apify_config.token)" }, 400);

  const { data: logRow } = await admin.from("instagram_sync_log").insert({ status: "running" }).select("id").single();
  const finish = async (status: string, error: string | null) => {
    await admin.from("instagram_sync_log")
      .update({ status, error, finished_at: new Date().toISOString() }).eq("id", logRow!.id);
  };

  try {
    // 1. start the run (async — run-sync can outlive the connection for many profiles)
    const run = (await apify("POST", `/acts/${ACTOR}/runs`, token, { usernames: ACCOUNTS })).data;
    const runId = run.id as string;
    const datasetId = run.defaultDatasetId as string;

    // 2. poll until it finishes, within the edge function's ~150s budget
    const deadline = Date.now() + 120_000;
    let status = run.status as string;
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      if (Date.now() > deadline) throw new Error(`Apify run ${runId} still ${status} after 120s`);
      await new Promise((r) => setTimeout(r, 5000));
      status = (await apify("GET", `/actor-runs/${runId}`, token)).data.status;
    }
    if (status !== "SUCCEEDED") throw new Error(`Apify run ${runId} ended ${status}`);

    // 3. read the profiles and upsert one row per account
    const items = (await apify("GET", `/datasets/${datasetId}/items`, token)) as IgProfile[];
    const today = kuwaitToday();
    const nowIso = new Date().toISOString();
    let saved = 0, postsSaved = 0;
    const summary: Record<string, unknown>[] = [];
    const postRows: Record<string, unknown>[] = [];

    for (const p of items) {
      const username = (p.username ?? "").toLowerCase();
      if (!username) continue;
      // Newest post = the highest timestamp. Instagram floats PINNED posts to the top,
      // so never trust the first item — max() over all posts is the true last-post date.
      const posts = p.latestPosts ?? [];
      const newest = posts.reduce<string | null>((max, post) => {
        const t = post.timestamp ?? "";
        return t && (!max || t > max) ? t : max;
      }, null);

      const row = {
        snapshot_date: today,
        username,
        followers: p.followersCount ?? null,
        follows_count: p.followsCount ?? null,
        media_count: p.postsCount ?? null,
        last_post_date: newest ? newest.slice(0, 10) : null,
        updated_at: nowIso,
        // reach / impressions / profile_views are private analytics the scraper can't see
      };
      const { error } = await admin.from("instagram_daily").upsert(row, { onConflict: "snapshot_date,username" });
      if (error) throw new Error(`Upsert ${username}: ${error.message}`);
      saved++;
      summary.push({ username, followers: row.followers, last_post_date: row.last_post_date });

      // per-post engagement — accumulates history as the last ~12 posts refresh daily
      for (const post of posts) {
        if (!post.shortCode) continue;
        postRows.push({
          shortcode: post.shortCode,
          username,
          posted_at: post.timestamp ?? null,
          type: post.type ?? null,
          likes: post.likesCount ?? null,
          comments: post.commentsCount ?? null,
          video_views: post.videoViewCount ?? null,
          caption: (post.caption ?? "").slice(0, 2000) || null,
          hashtags: post.hashtags ?? null,
          url: post.url ?? null,
          synced_at: nowIso,
        });
      }
    }

    // upsert on shortcode so engagement counts refresh in place, not duplicate
    for (let k = 0; k < postRows.length; k += 200) {
      const { error } = await admin.from("instagram_posts").upsert(postRows.slice(k, k + 200), { onConflict: "shortcode" });
      if (error) throw new Error(`Upsert posts: ${error.message}`);
    }
    postsSaved = postRows.length;

    await finish("ok", saved === ACCOUNTS.length ? null : `only ${saved}/${ACCOUNTS.length} accounts returned`);
    return json({ ok: true, accounts: saved, posts: postsSaved, snapshot_date: today, profiles: summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish("error", msg.slice(0, 450));
    return json({ error: msg }, 500);
  }
});
