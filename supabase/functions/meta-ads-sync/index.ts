// Paid ads figures from Meta, stored exactly as Meta reports them.
//
// The rule this function exists to keep: Meta is the source of truth. Every
// figure it returns is written down as the string Meta sent — not parsed to a
// number, not rounded, not converted between currencies, never recomputed.
// ctr, cpc and cpm are Meta's own fields; this function does not divide spend
// by clicks to get them. A period total is asked of Meta rather than summed
// from daily rows, because summing would be this app doing the arithmetic.
//
// Callers: pg_cron (x-sync-key) or an admin/manager/marketing JWT.
// Needs META_ADS_TOKEN (a System User token with ads_read) in Edge Function
// secrets. The ad account id lives in the meta_ads_config table, not here.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const GRAPH = "https://graph.facebook.com/v21.0";

// The figures we show. Asked for by name so Meta computes them, not us.
const INSIGHT_FIELDS = "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,account_currency";

async function graph(path: string, token: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new Error(`Meta ${path} -> ${res.status}: ${e.message ?? "unknown"}${e.code ? ` (code ${e.code})` : ""}`);
  }
  return body;
}

/** Every page of a Graph edge, following Meta's own cursors. */
async function graphAll(path: string, token: string, params: Record<string, string> = {}) {
  const out: Record<string, unknown>[] = [];
  let body = await graph(path, token, { ...params, limit: "100" });
  for (;;) {
    out.push(...(body.data ?? []));
    const next = body?.paging?.next;
    if (!next || out.length >= 2000) break;
    const res = await fetch(next);
    body = await res.json().catch(() => ({}));
    if (!res.ok) break;
  }
  return out;
}

/** Straight through: whatever Meta sent for this key, as the string it sent. */
const asText = (v: unknown): string | null =>
  v === undefined || v === null ? null : typeof v === "string" ? v : String(v);

function insightRow(campaignId: string, period: "lifetime" | "daily", r: Record<string, any>) {
  return {
    campaign_id: campaignId,
    period,
    date_start: r.date_start,
    date_stop: r.date_stop,
    spend: asText(r.spend),
    impressions: asText(r.impressions),
    reach: asText(r.reach),
    clicks: asText(r.clicks),
    ctr: asText(r.ctr),
    cpc: asText(r.cpc),
    cpm: asText(r.cpm),
    actions: r.actions ?? null,
    account_currency: asText(r.account_currency),
    raw: r,
    synced_at: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const token = Deno.env.get("META_ADS_TOKEN");
  if (!token) {
    /* Names only, never values. A missing secret is nearly always a typo in the
       name or a save against the wrong project, and guessing at that from the
       outside wastes a round trip each time. */
    let seen: string[] = [];
    try { seen = Object.keys(Deno.env.toObject()).filter((k) => /^META/i.test(k)); } catch { /* ignore */ }
    return json({
      error: "META_ADS_TOKEN is not set in Edge Function secrets.",
      meta_secret_names_visible: seen,
      hint: seen.length
        ? `Found ${seen.join(", ")} — the name must be exactly META_ADS_TOKEN.`
        : "No secret starting with META is visible to this function.",
    }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  /* The shared cron key lives in a table, not an env var — that is where every
     other sync in this project reads it from, and inventing a second place for
     it would mean two keys to rotate. */
  const { data: auth } = await admin.from("lightspeed_auth").select("sync_key").eq("id", 1).single();
  const syncKey = req.headers.get("x-sync-key");
  if (!(auth?.sync_key && syncKey && syncKey === auth.sync_key)) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
    if (!["admin", "manager", "marketing"].includes(prof?.role ?? "")) {
      return json({ error: "Admins, managers and marketing only" }, 403);
    }
  }

  let body: { mode?: string; days?: number } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const { data: cfg } = await admin.from("meta_ads_config").select("account_id").eq("id", 1).single();
  const raw = (cfg?.account_id ?? "").trim();
  if (!raw) return json({ error: "No ad account set in meta_ads_config." }, 400);
  const act = raw.startsWith("act_") ? raw : `act_${raw}`;

  try {
    const acc = await graph(act, token, { fields: "name,account_status,currency,timezone_name" });
    await admin.from("meta_ads_config").update({
      account_name: acc.name, currency: acc.currency, timezone_name: acc.timezone_name,
      last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", 1);

    if (body.mode === "probe") {
      return json({ ok: true, account: { id: act, name: acc.name, currency: acc.currency,
                                         timezone: acc.timezone_name, status: acc.account_status } });
    }

    // ── campaigns ──
    const campaigns = await graphAll(`${act}/campaigns`, token, {
      fields: "id,name,objective,status,effective_status,start_time,stop_time",
    });
    if (campaigns.length) {
      const { error } = await admin.from("meta_ad_campaigns").upsert(
        campaigns.map((c: any) => ({
          id: c.id, account_id: act, name: c.name ?? null, objective: c.objective ?? null,
          status: c.status ?? null, effective_status: c.effective_status ?? null,
          start_time: c.start_time ?? null, stop_time: c.stop_time ?? null,
          raw: c, synced_at: new Date().toISOString(),
        })), { onConflict: "id" });
      if (error) throw new Error(`campaigns: ${error.message}`);
    }

    /* Figures for every campaign at once.
       The obvious shape — ask Meta per campaign — is two calls each, and this
       account has 1,200 campaigns: 2,400 round trips that no single run will
       ever finish. The account-level insights edge returns one row per campaign
       for the same window, so the whole account costs a handful of paged calls.
       The numbers are identical; they are still Meta's own, just asked for in
       one question instead of two thousand. */
    const days = Math.min(Math.max(body.days ?? 30, 1), 90);
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const known = new Set(campaigns.map((c: any) => c.id));
    let lifetime = 0, daily = 0, orphaned = 0;

    const store = async (rows: any[], period: "lifetime" | "daily") => {
      // A campaign can appear in insights without appearing in the campaign
      // list (deleted since). Skip those rather than fail the whole batch on a
      // foreign key.
      const usable = rows.filter((r) => r.campaign_id && known.has(r.campaign_id));
      orphaned += rows.length - usable.length;
      for (let i = 0; i < usable.length; i += 500) {
        const chunk = usable.slice(i, i + 500).map((r) => insightRow(r.campaign_id, period, r));
        const { error } = await admin.from("meta_ad_insights").upsert(chunk,
          { onConflict: "campaign_id,period,date_start,date_stop" });
        if (error) throw new Error(`${period}: ${error.message}`);
      }
      return usable.length;
    };

    const lifeRows = await graphAll(`${act}/insights`, token, {
      level: "campaign", fields: `campaign_id,${INSIGHT_FIELDS}`,
      date_preset: "maximum", time_increment: "all_days",
    });
    lifetime = await store(lifeRows, "lifetime");

    const dayRows = await graphAll(`${act}/insights`, token, {
      level: "campaign", fields: `campaign_id,${INSIGHT_FIELDS}`,
      time_increment: "1", time_range: JSON.stringify({ since, until }),
    });
    daily = await store(dayRows, "daily");

    await admin.from("meta_ads_config").update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", 1);

    return json({
      ok: true,
      account: { id: act, name: acc.name, currency: acc.currency },
      campaigns: campaigns.length, lifetime_rows: lifetime, daily_rows: daily,
      skipped_unknown_campaign: orphaned,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("meta_ads_config").update({ last_error: msg }).eq("id", 1);
    return json({ error: msg }, 400);
  }
});
