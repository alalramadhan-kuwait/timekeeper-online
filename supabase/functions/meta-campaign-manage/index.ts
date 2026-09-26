// Campaign proposals, from an owner's decision to Meta and back.
//
// The only code in this project that changes anything on the ad account.
// Its rules, which the growth skill states and this enforces:
//
//   - Nothing is built without an owner's approval (role admin).
//   - Everything is built PAUSED: campaign, ad set and ad.
//   - Nothing spends until an owner presses Activate, as a separate step.
//   - A budget change is an owner's decision too.
//   - Pausing is allowed to owners, managers and marketing — stopping spend
//     never needs a second opinion.
//   - Every step is written to ad_proposal_events, with who did it.
//
// Actions (POST body `action`, with `id` = the proposal):
//   check    — Meta checks the campaign, ad set and creative without
//              creating anything (validate_only). Anyone who may propose.
//   approve  — owner: build it on Meta, paused.
//   reject   — owner: no, with a note.
//   activate — owner: switch campaign, ad set and ad on; the run's end date
//              is counted from now.
//   pause    — owner, manager or marketing: switch it off.
//   budget   — owner: new daily budget in KD.
//
// Needs META_ADS_TOKEN (a System User token with ads_management).
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

/* v23: the creative's Instagram account is instagram_user_id here;
   v21's instagram_actor_id refused this account's Instagram ids. */
const GRAPH = "https://graph.facebook.com/v23.0";

class MetaError extends Error {}

async function graphGet(path: string, token: string, params: Record<string, string> = {}) {
  const res = await fetch(`${GRAPH}/${path}?${new URLSearchParams({ ...params, access_token: token })}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MetaError(body?.error?.error_user_msg ?? body?.error?.message ?? `Meta ${res.status}`);
  return body;
}

async function graphPost(path: string, token: string, params: Record<string, unknown>) {
  const form = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(`${GRAPH}/${path}`, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new MetaError(`${e.error_user_title ? e.error_user_title + ": " : ""}${e.error_user_msg ?? e.message ?? `Meta ${res.status}`}`);
  }
  return body;
}

/* ── what the proposal becomes on Meta ─────────────────────────────────── */

type Proposal = Record<string, any>;

const OBJECTIVE_WORD: Record<string, string> = {
  OUTCOME_SALES: "SALES", MESSAGES: "MESSAGES", OUTCOME_TRAFFIC: "TRAFFIC",
  OUTCOME_ENGAGEMENT: "ENGAGEMENT", OUTCOME_AWARENESS: "AWARENESS",
};

/** The skill's naming convention: TK | SALES | KW | BRAND | PRODUCT | SEP26 */
function campaignName(p: Proposal) {
  const month = new Date().toLocaleString("en-GB", { month: "short", timeZone: "Asia/Kuwait" }).toUpperCase();
  const yy = new Date().toLocaleString("en-GB", { year: "2-digit", timeZone: "Asia/Kuwait" });
  return ["TK", OBJECTIVE_WORD[p.objective] ?? p.objective, (p.countries ?? ["KW"]).join("+"),
    p.brand || null, p.product, `${month}${yy}`].filter(Boolean).join(" | ").slice(0, 400);
}

/** Meta's campaign objective. WhatsApp conversations are an engagement
 *  campaign whose ad set sends people to WhatsApp. */
const metaObjective = (o: string) => (o === "MESSAGES" ? "OUTCOME_ENGAGEMENT" : o);

interface Context {
  rate: number;          // KD per USD
  pixelId: string | null;
  pageId: string;
  igUserId: string;
}

function adSetParams(p: Proposal, ctx: Context, campaignId: string) {
  // Daily budget in the account's minor unit (US cents), from the KD the
  // owner approved at today's rate.
  const dailyBudget = Math.max(100, Math.round((Number(p.daily_budget_kd) / ctx.rate) * 100));
  const targeting = {
    geo_locations: { countries: p.countries?.length ? p.countries : ["KW"] },
    age_min: p.age_min, age_max: p.age_max,
    // 0 = hold to the age range the owner approved rather than let Meta widen it.
    targeting_automation: { advantage_audience: 0 },
  };
  const base = {
    name: `${p.audience.slice(0, 60)} | ${(p.countries ?? ["KW"]).join("+")} | ${p.age_min}-${p.age_max}`,
    campaign_id: campaignId, status: "PAUSED", billing_event: "IMPRESSIONS",
    daily_budget: String(dailyBudget), bid_strategy: "LOWEST_COST_WITHOUT_CAP", targeting,
  };
  switch (p.objective) {
    case "OUTCOME_SALES":
      if (!ctx.pixelId) throw new MetaError("No pixel is receiving purchases, so a sales campaign has nothing to optimise for.");
      return { ...base, optimization_goal: "OFFSITE_CONVERSIONS", destination_type: "WEBSITE",
               promoted_object: { pixel_id: ctx.pixelId, custom_event_type: "PURCHASE" } };
    case "OUTCOME_TRAFFIC":
      return { ...base, optimization_goal: "LANDING_PAGE_VIEWS", destination_type: "WEBSITE" };
    case "OUTCOME_ENGAGEMENT":
      return { ...base, optimization_goal: "POST_ENGAGEMENT", destination_type: "ON_POST" };
    case "OUTCOME_AWARENESS":
      return { ...base, optimization_goal: "REACH" };
    case "MESSAGES":
      return { ...base, optimization_goal: "CONVERSATIONS", destination_type: "WHATSAPP",
               promoted_object: { page_id: ctx.pageId } };
  }
  throw new MetaError(`Unknown objective ${p.objective}`);
}

function creativeParams(p: Proposal, ctx: Context) {
  if (!p.instagram_media_id) throw new MetaError("Choose the Instagram post the ad should use.");
  const link = p.landing_url || "https://time-keeper.com";
  const cta =
    p.objective === "OUTCOME_SALES" ? { type: "SHOP_NOW", value: { link } }
    : p.objective === "OUTCOME_TRAFFIC" ? { type: "LEARN_MORE", value: { link } }
    : p.objective === "MESSAGES" ? { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP", link: "https://api.whatsapp.com/send" } }
    : undefined;
  // The existing Instagram post, run as the ad — how this account has always
  // advertised, so likes and comments stay on the one post.
  return {
    name: `TK | ${p.instagram_account ?? "ig"} | ${p.instagram_media_id}`,
    object_id: ctx.pageId,
    instagram_user_id: ctx.igUserId,
    source_instagram_media_id: p.instagram_media_id,
    ...(cta ? { call_to_action: cta } : {}),
  };
}

/** The page, Instagram account, pixel and rate a proposal needs. */
async function context(admin: SupabaseClient, token: string, p: Proposal): Promise<Context> {
  const { data: cfg } = await admin.from("meta_ads_config").select("kwd_per_usd, tracking").eq("id", 1).single();
  const rate = Number(cfg?.kwd_per_usd);
  if (!(rate > 0)) throw new MetaError("No KD rate is set, so the budget cannot be turned into USD.");
  // The pixel that receives the website's purchases, from the daily check.
  const pixels: any[] = cfg?.tracking?.pixels ?? [];
  const pixel = [...pixels].sort((a, b) => (b.events_7d?.Purchase ?? 0) - (a.events_7d?.Purchase ?? 0))[0];
  const pages = await graphGet("me/accounts", token, { fields: "id,name,instagram_business_account{id,username}", limit: "50" });
  const want = (p.instagram_account ?? "timekeeperkw").toLowerCase();
  const page = (pages.data ?? []).find((x: any) => x.instagram_business_account?.username?.toLowerCase() === want);
  if (!page) throw new MetaError(`No Facebook page is linked to @${want}.`);
  return { rate, pixelId: pixel?.events_7d?.Purchase ? pixel.id : null, pageId: page.id, igUserId: page.instagram_business_account.id };
}

async function account(admin: SupabaseClient) {
  const { data } = await admin.from("meta_ads_config").select("account_id").eq("id", 1).single();
  const raw = String(data?.account_id ?? "").trim();
  if (!raw) throw new MetaError("No ad account set in meta_ads_config.");
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

/* ── the handler ──────────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = Deno.env.get("META_ADS_TOKEN");
  if (!token) return json({ error: "META_ADS_TOKEN is not set in Edge Function secrets." }, 500);

  let body: { action?: string; id?: string; note?: string; daily_budget_kd?: number } = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }

  /* The scheduler's key may run "check" and nothing else: it asks Meta to
     validate without creating anything, which is how this was tested and how
     a nightly check could run. Every other action needs a signed-in person. */
  const { data: keyRow } = await admin.from("lightspeed_auth").select("sync_key").eq("id", 1).single();
  const system = body.action === "check" && !!keyRow?.sync_key && req.headers.get("x-sync-key") === keyRow.sync_key;
  let userId: string | null = null, role = "";
  if (!system) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Sign in first." }, 401);
    userId = u.user.id;
    const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).single();
    role = prof?.role ?? "";
  }
  const owner = role === "admin";
  const team = system || ["admin", "manager", "marketing"].includes(role);
  if (!team) return json({ error: "Owners, managers and marketing only." }, 403);
  const { data: p } = await admin.from("ad_proposals").select("*").eq("id", body.id ?? "").maybeSingle();
  if (!p) return json({ error: "Proposal not found." }, 404);

  const log = (action: string, detail: unknown = null) =>
    admin.from("ad_proposal_events").insert({ proposal_id: p.id, by_user: userId, action, detail });
  const update = (patch: Record<string, unknown>) =>
    admin.from("ad_proposals").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", p.id);

  try {
    const act = await account(admin);

    switch (body.action) {
      case "check": {
        // Each part checked on its own so one refusal does not hide the rest.
        const ctx = await context(admin, token, p);
        const V = { execution_options: ["validate_only"] };
        const step = async (fn: () => Promise<unknown>) => {
          try { await fn(); return "ok"; } catch (e) { return e instanceof Error ? e.message : String(e); }
        };
        const campaign = await step(() => graphPost(`${act}/campaigns`, token, {
          name: campaignName(p), objective: metaObjective(p.objective), status: "PAUSED",
          special_ad_categories: [], buying_type: "AUCTION",
          // The approved budget stays on the one ad set; Meta may not move it.
          is_adset_budget_sharing_enabled: false, ...V,
        }));
        // An ad set can only be checked against a campaign that exists. A
        // recent one of the same objective serves — one without a budget of
        // its own, like the campaign an approval would build — and nothing is
        // made.
        const { data: recent } = await admin.from("meta_ad_campaigns").select("id")
          .eq("objective", metaObjective(p.objective)).order("start_time", { ascending: false }).limit(15);
        let sibling: string | null = null;
        for (const c of recent ?? []) {
          const b = await graphGet(c.id, token, { fields: "daily_budget,lifetime_budget" }).catch(() => null);
          if (b && !Number(b.daily_budget) && !Number(b.lifetime_budget)) { sibling = c.id; break; }
        }
        const adset = sibling
          ? await step(() => graphPost(`${act}/adsets`, token, { ...adSetParams(p, ctx, sibling!), ...V }))
          : "not checked: no recent campaign of this objective without its own budget to check it against";
        const creative = await step(() => graphPost(`${act}/adcreatives`, token, { ...creativeParams(p, ctx), ...V }));
        const ok = campaign === "ok" && adset === "ok" && creative === "ok";
        await log(ok ? "checked" : "check_failed", { campaign, adset, creative });
        return json(ok ? { ok, campaign, adset, creative }
                       : { error: [campaign, adset, creative].filter((x) => x !== "ok").join(" · "), campaign, adset, creative }, ok ? 200 : 422);
      }

      case "approve": {
        if (!owner) return json({ error: "Only an owner can approve." }, 403);
        if (p.status !== "proposed" && p.status !== "failed") return json({ error: `This proposal is ${p.status}.` }, 409);
        await update({ status: "approved", decided_by: userId, decided_at: new Date().toISOString(), decision_note: body.note ?? null, meta_error: null });
        await log("approved", { note: body.note ?? null });

        const ctx = await context(admin, token, p);
        const made: Record<string, string> = {};
        try {
          const camp = await graphPost(`${act}/campaigns`, token, {
            name: campaignName(p), objective: metaObjective(p.objective), status: "PAUSED",
            special_ad_categories: [], buying_type: "AUCTION",
            // The approved budget stays on the one ad set; Meta may not move it.
            is_adset_budget_sharing_enabled: false,
          });
          made.campaign = camp.id;
          const set = await graphPost(`${act}/adsets`, token, adSetParams(p, ctx, camp.id));
          made.adset = set.id;
          const creative = await graphPost(`${act}/adcreatives`, token, creativeParams(p, ctx));
          const ad = await graphPost(`${act}/ads`, token, {
            name: `IG post | ${p.instagram_media_id}`, adset_id: set.id, status: "PAUSED",
            creative: { creative_id: creative.id },
          });
          made.ad = ad.id;
        } catch (e) {
          // Nothing half-built is left behind: a campaign Meta accepted
          // before a later step failed is deleted again.
          if (made.campaign) await graphPost(made.campaign, token, { status: "DELETED" }).catch(() => {});
          throw e;
        }
        await update({ status: "created", meta_campaign_id: made.campaign, meta_adset_id: made.adset, meta_ad_id: made.ad });
        await log("created_paused", made);
        return json({ ok: true, ...made });
      }

      case "reject": {
        if (!owner) return json({ error: "Only an owner can reject." }, 403);
        if (p.status !== "proposed" && p.status !== "failed") return json({ error: `This proposal is ${p.status}.` }, 409);
        await update({ status: "rejected", decided_by: userId, decided_at: new Date().toISOString(), decision_note: body.note ?? null });
        await log("rejected", { note: body.note ?? null });
        return json({ ok: true });
      }

      case "activate": {
        if (!owner) return json({ error: "Only an owner can switch a campaign on." }, 403);
        if (!p.meta_campaign_id || !["created", "paused"].includes(p.status)) return json({ error: `This proposal is ${p.status}.` }, 409);
        // The run is counted from the day it goes live, not the day it was built.
        const end = new Date(Date.now() + Number(p.days) * 86400_000).toISOString();
        await graphPost(p.meta_adset_id, token, { status: "ACTIVE", end_time: end });
        await graphPost(p.meta_ad_id, token, { status: "ACTIVE" });
        await graphPost(p.meta_campaign_id, token, { status: "ACTIVE" });
        await update({ status: "active", activated_by: userId, activated_at: new Date().toISOString() });
        await log("activated", { ends: end });
        return json({ ok: true, ends: end });
      }

      case "pause": {
        if (!p.meta_campaign_id) return json({ error: "Nothing on Meta to pause." }, 409);
        await graphPost(p.meta_campaign_id, token, { status: "PAUSED" });
        await update({ status: "paused" });
        await log("paused");
        return json({ ok: true });
      }

      case "budget": {
        if (!owner) return json({ error: "Only an owner can change a budget." }, 403);
        const kd = Number(body.daily_budget_kd);
        if (!(kd > 0)) return json({ error: "Enter a daily budget in KD." }, 400);
        if (!p.meta_adset_id) return json({ error: "Nothing on Meta yet." }, 409);
        const ctx = await context(admin, token, p);
        const cents = Math.max(100, Math.round((kd / ctx.rate) * 100));
        await graphPost(p.meta_adset_id, token, { daily_budget: String(cents) });
        await update({ daily_budget_kd: kd });
        await log("budget_changed", { from_kd: p.daily_budget_kd, to_kd: kd, usd_cents: cents });
        return json({ ok: true, usd_cents: cents });
      }
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (body.action === "approve") {
      await update({ status: "failed", meta_error: msg });
      await log("meta_refused", { error: msg });
    } else {
      await log(`${body.action}_failed`, { error: msg });
    }
    return json({ error: msg }, e instanceof MetaError ? 422 : 500);
  }
});
