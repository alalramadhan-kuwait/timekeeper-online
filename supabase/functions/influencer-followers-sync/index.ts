// Refreshes influencer follower counts via the Apify Instagram Profile Scraper.
// Body: { influencer_id?: string } — one influencer, or all of them (weekly cron).
// Updates influencers.followers + followers_updated and records a dated snapshot
// (influencer_follower_snapshots) so the growth graph and 30/90-day deltas build.
// Auth: x-sync-key (cron) or admin/manager/marketing JWT. Token from apify_config/APIFY_TOKEN.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const APIFY = "https://api.apify.com/v2";
const ACTOR = "apify~instagram-profile-scraper";

/** Extract a bare Instagram username from @name / a profile URL / a plain handle. */
function igUsername(handle: string | null): string | null {
  if (!handle) return null;
  let h = handle.trim();
  const m = h.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) h = m[1];
  h = h.replace(/^@/, "").replace(/\/+$/, "").trim().toLowerCase();
  return h || null;
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

const kuwaitToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

  let token = Deno.env.get("APIFY_TOKEN") ?? "";
  if (!token) {
    const { data: cfg } = await admin.from("apify_config").select("token").eq("id", 1).single();
    token = cfg?.token ?? "";
  }
  if (!token) return json({ error: "No Apify token" }, 400);

  let influencerId: string | null = null;
  try { influencerId = (await req.json())?.influencer_id ?? null; } catch { /* no body = all */ }

  try {
    // which influencers to refresh
    let q = admin.from("influencers").select("id, handle").not("handle", "is", null);
    if (influencerId) q = q.eq("id", influencerId);
    const { data: rows } = await q;
    const targets = (rows ?? [])
      .map((r) => ({ id: r.id as string, username: igUsername(r.handle as string) }))
      .filter((r) => r.username);
    if (targets.length === 0) return json({ error: "No Instagram handle to look up" }, 400);

    const usernames = [...new Set(targets.map((t) => t.username!))];

    // run the scraper (async start-poll-fetch, within the ~150s budget)
    const run = (await apify("POST", `/acts/${ACTOR}/runs`, token, { usernames })).data;
    const runId = run.id as string, datasetId = run.defaultDatasetId as string;
    const deadline = Date.now() + 125_000;
    let status = run.status as string;
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      if (Date.now() > deadline) throw new Error(`Apify run ${runId} still ${status} after 125s`);
      await new Promise((r) => setTimeout(r, 5000));
      status = (await apify("GET", `/actor-runs/${runId}`, token)).data.status;
    }
    if (status !== "SUCCEEDED") throw new Error(`Apify run ${runId} ended ${status}`);

    const items = (await apify("GET", `/datasets/${datasetId}/items`, token)) as { username?: string; followersCount?: number }[];
    const byUser = new Map<string, number>();
    for (const p of items) if (p.username && p.followersCount != null) byUser.set(p.username.toLowerCase(), Number(p.followersCount));

    const today = kuwaitToday();
    const nowIso = new Date().toISOString();
    let updated = 0;
    const results: Record<string, unknown>[] = [];

    for (const t of targets) {
      const followers = byUser.get(t.username!);
      if (followers == null) { results.push({ username: t.username, ok: false }); continue; }
      await admin.from("influencers").update({ followers, followers_updated: today, updated_at: nowIso }).eq("id", t.id);
      await admin.from("influencer_follower_snapshots")
        .upsert({ influencer_id: t.id, snapshot_date: today, followers }, { onConflict: "influencer_id,snapshot_date" });
      updated++;
      results.push({ username: t.username, followers });
    }

    return json({ ok: true, requested: targets.length, updated, snapshot_date: today, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
