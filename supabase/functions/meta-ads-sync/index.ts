// Paid ads figures from Meta, stored exactly as Meta reports them.
//
// The rule this function exists to keep: Meta is the source of truth. Every
// figure it returns is written down as the string Meta sent — not parsed to a
// number, not rounded, not converted between currencies, never recomputed.
// ctr, cpc, cpm, purchase_roas and cost_per_action_type are Meta's own fields;
// this function does not divide one figure by another to get them. A period
// total is asked of Meta rather than summed from daily rows, because summing
// would be this app doing the arithmetic.
//
// Modes (POST body `mode`):
//   (none)     campaigns, their totals and daily figures, the KD rate, and the
//              purchase-tracking check. The 05:30 cron.
//   "detail"   ad sets, with totals and daily figures. The 05:40 cron.
//   "ads"      ads and their creatives. The 05:50 cron.
//   "ad_figures" totals and daily figures for every ad. The 05:55 cron.
//              Each part runs on its own so no run nears the function's
//              resource limit (combined runs hit it twice on 26 Sep).
//   "probe"    the account's name, currency and time zone.
//   "diagnose" what the token may do and what the pixels have been receiving.
//
// Callers: pg_cron (x-sync-key) or an admin/manager/marketing JWT.
// Needs META_ADS_TOKEN (a System User token) in Edge Function secrets. The ad
// account id lives in the meta_ads_config table, not here.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

const GRAPH = "https://graph.facebook.com/v21.0";

/* The figures we keep. Asked for by name so Meta computes them, not us.
   action_values carries the money behind each action (purchase value);
   purchase_roas and cost_per_action_type are Meta's own ratios. */
const INSIGHT_FIELDS =
  "spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas,cost_per_action_type,account_currency";

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

/** Each page of a Graph edge handed over as it arrives, so a large answer is
 *  never held in memory whole. Returns how many rows there were. */
async function graphEach(path: string, token: string, params: Record<string, string>,
  onPage: (rows: any[]) => Promise<void>) {
  let n = 0;
  let body = await graph(path, token, { ...params, limit: "100" });
  for (;;) {
    const rows = body.data ?? [];
    n += rows.length;
    if (rows.length) await onPage(rows);
    const next = body?.paging?.next;
    if (!next) break;
    const res = await fetch(next);
    body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Meta page -> ${res.status}: ${body?.error?.message ?? "unknown"}`);
  }
  return n;
}

/** Every page of a Graph edge, following Meta's own cursors. */
async function graphAll(path: string, token: string, params: Record<string, string> = {}) {
  const out: Record<string, unknown>[] = [];
  let body = await graph(path, token, { ...params, limit: "100" });
  for (;;) {
    out.push(...(body.data ?? []));
    const next = body?.paging?.next;
    if (!next || out.length >= 5000) break;
    const res = await fetch(next);
    body = await res.json().catch(() => ({}));
    if (!res.ok) break;
  }
  return out;
}

/**
 * An insights question asked as a report job rather than a live request.
 *
 * Three years of every campaign with purchase values attached is more than
 * Meta will answer inline — it replies "An unknown error occurred (code 1)".
 * Meta's own answer for large reports is to queue them: post the question,
 * wait for the job, then page through the result. Same figures, Meta's own.
 */
async function insightsJob(act: string, token: string, params: Record<string, string>): Promise<string> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${act}/insights`, { method: "POST", body: qs });
  const body = await res.json().catch(() => ({}));
  const runId = body?.report_run_id;
  if (!res.ok || !runId) {
    const e = body?.error ?? {};
    throw new Error(`Meta insights job -> ${res.status}: ${e.message ?? "no report id"}`);
  }
  const deadline = Date.now() + 100_000;
  for (;;) {
    const job = await graph(runId, token, { fields: "async_status,async_percent_completion" });
    if (job.async_status === "Job Completed") break;
    if (job.async_status === "Job Failed" || job.async_status === "Job Skipped") {
      throw new Error(`Meta insights job ${job.async_status.toLowerCase()}`);
    }
    if (Date.now() > deadline) throw new Error(`Meta insights job still running at ${job.async_percent_completion}%`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  return runId as string;
}

/** Straight through: whatever Meta sent for this key, as the string it sent. */
const asText = (v: unknown): string | null =>
  v === undefined || v === null ? null : typeof v === "string" ? v : String(v);

/** The figure columns every insight table shares, as Meta sent them. The
 *  full row is kept as `raw` for campaigns only: at ad level it doubles the
 *  memory a run needs, and every figure in it already has a column. */
const figures = (r: Record<string, any>, keepRaw = true) => ({
  spend: asText(r.spend),
  impressions: asText(r.impressions),
  reach: asText(r.reach),
  frequency: asText(r.frequency),
  clicks: asText(r.clicks),
  ctr: asText(r.ctr),
  cpc: asText(r.cpc),
  cpm: asText(r.cpm),
  actions: r.actions ?? null,
  action_values: r.action_values ?? null,
  purchase_roas: r.purchase_roas ?? null,
  cost_per_action_type: r.cost_per_action_type ?? null,
  account_currency: asText(r.account_currency),
  raw: keepRaw ? r : null,
  synced_at: new Date().toISOString(),
});

type Level = "campaign" | "adset" | "ad";
const idOf = (level: Level, r: Record<string, any>): string | undefined =>
  level === "campaign" ? r.campaign_id : level === "adset" ? r.adset_id : r.ad_id;

async function upsertChunks(admin: SupabaseClient, table: string, rows: unknown[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/**
 * All-time totals and per-day figures for one level, for every object at once.
 *
 * The account-level insights edge returns one row per object for the same
 * window, so the whole account costs a handful of paged calls rather than two
 * per campaign (1,200 campaigns would be 2,400 round trips).
 *
 * Totals are keyed by (level, object) alone. They used to be keyed by Meta's
 * date window too, and the "maximum" window moves every day, so every sync
 * added another copy of every campaign.
 */
async function syncLevel(
  admin: SupabaseClient, act: string, token: string, level: Level,
  since: string, until: string, knownCampaigns: Set<string>,
) {
  const idField = level === "campaign" ? "campaign_id" : level === "adset" ? "campaign_id,adset_id" : "campaign_id,adset_id,ad_id";
  const keep = (r: any) => !!idOf(level, r) && knownCampaigns.has(r.campaign_id);
  const raw = level === "campaign";
  let totals = 0, daily = 0;

  const lifeRun = await insightsJob(act, token, {
    level, fields: `${idField},${INSIGHT_FIELDS}`, date_preset: "maximum", time_increment: "all_days",
  });
  await graphEach(`${lifeRun}/insights`, token, {}, async (rows) => {
    const usable = rows.filter(keep);
    totals += usable.length;
    await upsertChunks(admin, "meta_insight_totals", usable.map((r: any) => ({
      level, object_id: idOf(level, r), campaign_id: r.campaign_id,
      date_start: r.date_start, date_stop: r.date_stop, ...figures(r, raw),
    })), "level,object_id");
  });

  const dayRun = await insightsJob(act, token, {
    level, fields: `${idField},${INSIGHT_FIELDS}`, time_increment: "1", time_range: JSON.stringify({ since, until }),
  });
  await graphEach(`${dayRun}/insights`, token, {}, async (rows) => {
    const usable = rows.filter(keep);
    daily += usable.length;
    await upsertChunks(admin, "meta_insight_daily", usable.map((r: any) => ({
      level, object_id: idOf(level, r), campaign_id: r.campaign_id, day: r.date_start, ...figures(r, raw),
    })), "level,object_id,day");
    // The campaign page still reads its daily rows from meta_ad_insights.
    if (level === "campaign") {
      await upsertChunks(admin, "meta_ad_insights", usable.map((r: any) => ({
        campaign_id: r.campaign_id, period: "daily", date_start: r.date_start, date_stop: r.date_stop, ...figures(r),
      })), "campaign_id,period,date_start,date_stop");
    }
  });
  return { totals, daily };
}

/** A Graph call whose failure is an answer, not a stop: diagnosis wants to
 *  know what the token cannot see as much as what it can. */
async function attempt<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try { return await fn(); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/** One pixel stat, summed across Meta's hourly buckets. */
async function pixelTotals(pixel: string, token: string, aggregation: string, fromUnix: number, event?: string) {
  const buckets = await graphAll(`${pixel}/stats`, token, {
    aggregation, start_time: String(fromUnix), end_time: String(Math.floor(Date.now() / 1000)),
    ...(event ? { event } : {}),
  });
  const tot: Record<string, number> = {};
  for (const b of buckets as any[]) for (const d of b.data ?? []) tot[d.value] = (tot[d.value] ?? 0) + Number(d.count ?? 0);
  return tot;
}

/**
 * Are purchases reaching the pixel, and can Meta tie them to an ad?
 *
 * Written after purchases vanished from the campaign figures around 10 Aug
 * while the website kept selling. The Shopify pixel was receiving them, with
 * value and currency, and every sales ad set was optimising for Purchase on
 * that pixel. What differs is how purchases arrive: two in three only from
 * Shopify's server, against about half of add-to-carts, so fewer carry the
 * browser signals Meta uses to tie a purchase to the ad someone saw. Meta's own
 * dataset-quality answer (match quality per event, and which identifiers each
 * event carries) is asked for too, because the match-key breakdown does not
 * list the browser identifiers at all.
 */
async function trackingCheck(act: string, token: string) {
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const pixels = await graphAll(`${act}/adspixels`, token, { fields: "id,name,last_fired_time" });
  const live = (pixels as any[]).filter((p) =>
    p.last_fired_time && Date.now() - new Date(p.last_fired_time).getTime() < 3 * 86400_000);
  const out = [];
  for (const p of live) {
    const events = await pixelTotals(p.id, token, "event", weekAgo);
    const one: Record<string, unknown> = { id: p.id, name: p.name, last_fired_time: p.last_fired_time, events_7d: events };
    if (events.Purchase) {
      one.purchase_sources = await pixelTotals(p.id, token, "event_source", weekAgo, "Purchase");
      one.purchase_keys = await pixelTotals(p.id, token, "match_keys", weekAgo, "Purchase");
      one.purchase_fields = await pixelTotals(p.id, token, "custom_data_field", weekAgo, "Purchase");
    }
    if (events.AddToCart) {
      one.add_to_cart_sources = await pixelTotals(p.id, token, "event_source", weekAgo, "AddToCart");
      one.add_to_cart_keys = await pixelTotals(p.id, token, "match_keys", weekAgo, "AddToCart");
    }
    one.quality = await attempt(() => datasetQuality(p.id, token));
    out.push(one);
  }
  return { checked_at: new Date().toISOString(), pixels: out };
}

/**
 * Meta's Dataset Quality answer for one pixel: per web event, the match
 * quality score and how often each identifier (email, phone, fbc, fbp …) is
 * present. Kept as Meta sends it.
 */
async function datasetQuality(pixel: string, token: string) {
  const body = await graph("dataset_quality", token, {
    dataset_id: pixel,
    fields: "web{event_name,event_match_quality{composite_score,match_key_feedback{identifier,coverage{percentage}}},acr{percentage},event_coverage{percentage}}",
  });
  return body?.web ?? body;
}

/** Everything diagnosis wants, read-only. See trackingCheck for the story. */
async function diagnose(act: string, token: string) {
  const out: Record<string, unknown> = {};
  out.token = await attempt(() => graph("me", token, { fields: "id,name" }));
  out.permissions = await attempt(async () =>
    ((await graph("me/permissions", token)).data ?? []).filter((p: any) => p.status === "granted").map((p: any) => p.permission));
  out.pixels = await attempt(() => graphAll(`${act}/adspixels`, token, {
    fields: "id,name,creation_time,last_fired_time,is_unavailable,first_party_cookie_status,enable_automatic_matching,data_use_setting",
  }));
  out.tracking = await attempt(() => trackingCheck(act, token));
  const monthAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
  out.match_keys_30d = await attempt(async () => {
    const pixels = await graphAll(`${act}/adspixels`, token, { fields: "id,last_fired_time" });
    const res: Record<string, unknown> = {};
    for (const p of pixels as any[]) {
      if (!p.last_fired_time || Date.now() - new Date(p.last_fired_time).getTime() > 3 * 86400_000) continue;
      const per: Record<string, unknown> = {};
      for (const ev of ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]) {
        per[ev] = { keys: await pixelTotals(p.id, token, "match_keys", monthAgo, ev),
                    sources: await pixelTotals(p.id, token, "event_source", monthAgo, ev) };
      }
      res[p.id] = per;
    }
    return res;
  });
  out.checks = await attempt(async () => {
    const pixels = await graphAll(`${act}/adspixels`, token, { fields: "id,last_fired_time" });
    const res: Record<string, unknown> = {};
    for (const p of pixels as any[]) {
      if (!p.last_fired_time || Date.now() - new Date(p.last_fired_time).getTime() > 3 * 86400_000) continue;
      res[p.id] = await attempt(async () => (await graph(`${p.id}/da_checks`, token, {
        fields: "key,title,description,result,user_message,action_uri",
      })).data);
    }
    return res;
  });
  out.instagram_accounts = await attempt(() => graphAll(`${act}/instagram_accounts`, token, { fields: "id,username" }));
  out.pages = await attempt(() => graphAll("me/accounts", token, { fields: "id,name,instagram_business_account{id,username}" }));
  return out;
}

/**
 * KD per USD, for display only. Stored figures stay in Meta's USD.
 * An owner can pin a rate by hand in Settings (rate_auto = false); otherwise
 * the day's published rate replaces yesterday's.
 */
async function refreshRate(admin: SupabaseClient) {
  const { data: cfg } = await admin.from("meta_ads_config").select("rate_auto").eq("id", 1).single();
  if (cfg && cfg.rate_auto === false) return { skipped: "pinned by an owner" };
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  const body = await res.json().catch(() => ({}));
  const kwd = Number(body?.rates?.KWD);
  if (!res.ok || body?.result !== "success" || !(kwd > 0.2 && kwd < 0.4)) {
    return { error: `rate not updated (${res.status})` };
  }
  await admin.from("meta_ads_config").update({
    kwd_per_usd: Number(kwd.toFixed(5)),
    rate_updated_at: new Date().toISOString(),
    rate_source: `open.er-api.com, published ${body.time_last_update_utc ?? "today"}`,
  }).eq("id", 1);
  return { kwd_per_usd: kwd };
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
    if (body.mode === "diagnose") return json(await diagnose(act, token));

    const days = Math.min(Math.max(body.days ?? 30, 1), 90);
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);

    if (body.mode === "detail" || body.mode === "ads") {
      const { data: known } = await admin.from("meta_ad_campaigns").select("id");
      const knownCampaigns = new Set((known ?? []).map((c: any) => c.id as string));

      if (body.mode === "detail") {
        const setCount = await graphEach(`${act}/adsets`, token, {
          fields: "id,campaign_id,name,status,effective_status,optimization_goal,destination_type,promoted_object,attribution_spec,daily_budget,lifetime_budget,targeting,created_time,start_time,end_time",
        }, async (rows) => {
          await upsertChunks(admin, "meta_ad_sets", rows.filter((s: any) => knownCampaigns.has(s.campaign_id)).map((s: any) => ({
            id: s.id, campaign_id: s.campaign_id, name: s.name ?? null, status: s.status ?? null,
            effective_status: s.effective_status ?? null, optimization_goal: s.optimization_goal ?? null,
            destination_type: s.destination_type ?? null, promoted_object: s.promoted_object ?? null,
            attribution_spec: s.attribution_spec ?? null, daily_budget: asText(s.daily_budget),
            lifetime_budget: asText(s.lifetime_budget), targeting: s.targeting ?? null,
            created_time: s.created_time ?? null, start_time: s.start_time ?? null, end_time: s.end_time ?? null,
            raw: null, synced_at: new Date().toISOString(),
          })), "id");
        });
        const done = await syncLevel(admin, act, token, "adset", since, until, knownCampaigns);
        return json({ ok: true, mode: "detail", ad_sets: setCount, adset_figures: done });
      }

      const adCount = await graphEach(`${act}/ads`, token, {
        fields: "id,adset_id,campaign_id,name,status,effective_status,created_time,tracking_specs," +
          "creative{id,name,title,body,thumbnail_url,image_url,object_type,call_to_action_type,instagram_permalink_url,effective_instagram_media_id,effective_object_story_id}",
      }, async (rows) => {
        await upsertChunks(admin, "meta_ads", rows.filter((a: any) => knownCampaigns.has(a.campaign_id)).map((a: any) => {
          const pixels = new Set<string>();
          for (const t of a.tracking_specs ?? []) for (const p of t.fb_pixel ?? []) pixels.add(String(p));
          return {
            id: a.id, adset_id: a.adset_id ?? null, campaign_id: a.campaign_id, name: a.name ?? null,
            status: a.status ?? null, effective_status: a.effective_status ?? null,
            creative_id: a.creative?.id ?? null, creative: a.creative ?? null,
            tracking_pixels: [...pixels], created_time: a.created_time ?? null,
            raw: null, synced_at: new Date().toISOString(),
          };
        }), "id");
      });

      return json({ ok: true, mode: "ads", ads: adCount });
    }

    if (body.mode === "ad_figures") {
      const { data: known } = await admin.from("meta_ad_campaigns").select("id");
      const knownCampaigns = new Set((known ?? []).map((c: any) => c.id as string));
      const done = await syncLevel(admin, act, token, "ad", since, until, knownCampaigns);
      return json({ ok: true, mode: "ad_figures", ad_figures: done });
    }

    // ── campaigns ──
    const campaigns = await graphAll(`${act}/campaigns`, token, {
      fields: "id,name,objective,status,effective_status,start_time,stop_time",
    });
    await upsertChunks(admin, "meta_ad_campaigns", campaigns.map((c: any) => ({
      id: c.id, account_id: act, name: c.name ?? null, objective: c.objective ?? null,
      status: c.status ?? null, effective_status: c.effective_status ?? null,
      start_time: c.start_time ?? null, stop_time: c.stop_time ?? null,
      raw: c, synced_at: new Date().toISOString(),
    })), "id");
    const knownCampaigns = new Set(campaigns.map((c: any) => c.id as string));
    const campaignFigures = await syncLevel(admin, act, token, "campaign", since, until, knownCampaigns);

    // Neither of these may fail the sync: the figures above are what matter.
    const rate = await attempt(() => refreshRate(admin));
    const tracking = await attempt(() => trackingCheck(act, token));
    if (!("error" in (tracking as object))) {
      await admin.from("meta_ads_config").update({ tracking, tracking_checked_at: new Date().toISOString() }).eq("id", 1);
    }

    await admin.from("meta_ads_config").update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", 1);

    return json({
      ok: true,
      account: { id: act, name: acc.name, currency: acc.currency },
      campaigns: campaigns.length, campaign_figures: campaignFigures, rate,
      tracking_checked: !("error" in (tracking as object)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("meta_ads_config").update({ last_error: msg }).eq("id", 1);
    return json({ error: msg }, 400);
  }
});
