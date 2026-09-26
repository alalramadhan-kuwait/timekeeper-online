/**
 * Meta's own figures for a campaign, read back exactly as they were stored.
 *
 * Every value here is the string Meta sent. Nothing in this file parses a
 * figure into a number, rounds one, or converts a currency — the app's job is
 * to fetch and show, and Meta is the source of truth for what the numbers are.
 */
import { supabase } from './supabase';
import { loadCampaignTags } from './metaBrands';

type MetaActionList = { action_type: string; value: string }[] | null;

/** One set of all-time totals per campaign, from meta_insight_totals. They
 *  used to come from meta_ad_insights, where the sync added a fresh copy of
 *  every campaign each day and a reader could pick up any of them. */
const TOTALS_COLUMNS =
  'campaign_id, spend, impressions, reach, frequency, clicks, ctr, cpc, cpm, actions, action_values, purchase_roas, cost_per_action_type, account_currency, date_start, date_stop, synced_at';

export interface MetaCampaignOption { value: string; label: string; group?: string }

export interface MetaFigures {
  campaign_id: string;
  campaign_name: string | null;
  objective: string | null;
  effective_status: string | null;
  spend: string | null;
  impressions: string | null;
  reach: string | null;
  clicks: string | null;
  ctr: string | null;
  cpc: string | null;
  cpm: string | null;
  frequency?: string | null;
  actions: { action_type: string; value: string }[] | null;
  /** The money behind each action, in the account currency — purchase value. */
  action_values?: MetaActionList;
  /** Meta's own return on ad spend for purchases. */
  purchase_roas?: MetaActionList;
  /** Meta's own cost per result, by action type — cost per purchase. */
  cost_per_action_type?: MetaActionList;
  account_currency: string | null;
  date_start: string | null;
  date_stop: string | null;
  synced_at: string | null;
  /** Whether this link still points at something Meta will talk about.
   *  'live'    — Meta returned it on the last successful sync and it is running
   *  'stopped' — Meta returned it, but it is paused/archived/not delivering
   *  'missing' — Meta did not return it at all: deleted, or moved out of reach
   */
  link_state: 'live' | 'stopped' | 'missing';
  status_label: string;
}

/**
 * Campaigns for the picker: the ones that ran recently first, then the rest.
 *
 * The account carries 1,200 campaigns and most last ran years ago. Sorting the
 * live ones to the top is the difference between one tap and a hunt, and the
 * search box still reaches every one of them.
 */
export async function loadMetaCampaignOptions(current?: string): Promise<MetaCampaignOption[]> {
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const [{ data: campaigns }, { data: recent }, spending] = await Promise.all([
    supabase.from('meta_ad_campaigns').select('id, name, effective_status').order('name'),
    supabase.from('meta_ad_insights').select('campaign_id').eq('period', 'daily').gte('date_start', since),
    loadSpendingCampaignIds(),
  ]);
  const active = new Set((recent ?? []).map((r) => r.campaign_id as string));
  const all = (campaigns ?? []) as { id: string; name: string | null; effective_status: string | null }[];

  /* Only campaigns that have spent are offered. The one exception is the
     campaign this row is ALREADY linked to: excluding it would leave the
     picker showing nothing selected, and saving the row would then quietly
     drop a link somebody made on purpose. It is kept, and labelled. */
  const rows = all.filter((c) => spending.has(c.id) || (current && c.id === current));

  const opt = (c: typeof rows[number], group: string): MetaCampaignOption => ({
    value: c.id,
    label: c.name?.trim() || `Campaign ${c.id}`,
    group,
  });
  const linkedButUnlisted = current && !spending.has(current)
    ? rows.filter((c) => c.id === current).map((c) => opt(c, 'Linked already · no spend on Meta'))
    : [];
  const offered = rows.filter((c) => spending.has(c.id));
  return [
    ...linkedButUnlisted,
    ...offered.filter((c) => active.has(c.id)).map((c) => opt(c, 'Spent in the last 90 days')),
    ...offered.filter((c) => !active.has(c.id)).map((c) => opt(c, 'Spent earlier')),
  ];
}

/** How Meta's own status words read to a person. */
const STATUS_WORDS: Record<string, string> = {
  ACTIVE: 'Active', PAUSED: 'Paused', ARCHIVED: 'Archived', DELETED: 'Deleted',
  CAMPAIGN_PAUSED: 'Campaign paused', ADSET_PAUSED: 'Ad set paused', AD_PAUSED: 'Ad paused',
  DISAPPROVED: 'Disapproved by Meta', PENDING_REVIEW: 'Pending review',
  IN_PROCESS: 'In process', WITH_ISSUES: 'Has issues', PREAPPROVED: 'Pre-approved',
};
export const statusWord = (s: string | null) =>
  !s ? 'Unknown' : STATUS_WORDS[s] ?? s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** What Meta reports for these campaigns, over their whole life. */
export async function loadMetaFigures(campaignIds: string[]): Promise<Map<string, MetaFigures>> {
  const ids = [...new Set(campaignIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const [{ data: ins }, { data: camps }, { data: cfg }] = await Promise.all([
    supabase.from('meta_insight_totals')
      .select(TOTALS_COLUMNS)
      .eq('level', 'campaign').in('campaign_id', ids),
    supabase.from('meta_ad_campaigns').select('id, name, objective, effective_status, synced_at').in('id', ids),
    supabase.from('meta_ads_config').select('last_synced_at').eq('id', 1).maybeSingle(),
  ]);

  /* A campaign row is only touched when Meta returns it, so its synced_at is
     also "last seen". Anything older than the last successful run was not in
     Meta's answer — deleted, or moved somewhere this token cannot see. The few
     minutes of slack cover a run that spans the clock tick. */
  const lastOk = (cfg as { last_synced_at?: string } | null)?.last_synced_at;
  const cutoff = lastOk ? new Date(lastOk).getTime() - 5 * 60_000 : null;
  const seenRecently = (seen: string | null | undefined) =>
    !cutoff ? true : !!seen && new Date(seen).getTime() >= cutoff;
  const byId = new Map<string, any>((camps ?? []).map((c) => [c.id, c]));
  const stateOf = (c: any): Pick<MetaFigures, 'link_state' | 'status_label'> => {
    if (!c) return { link_state: 'missing', status_label: 'Not found on Meta' };
    if (!seenRecently(c.synced_at)) return { link_state: 'missing', status_label: 'No longer returned by Meta' };
    if ((c.effective_status ?? '') === 'ACTIVE') return { link_state: 'live', status_label: 'Active' };
    return { link_state: 'stopped', status_label: statusWord(c.effective_status) };
  };
  const out = new Map<string, MetaFigures>();
  for (const r of (ins ?? []) as any[]) {
    const c = byId.get(r.campaign_id) ?? null;
    out.set(r.campaign_id, {
      ...stateOf(c),
      campaign_id: r.campaign_id,
      campaign_name: c?.name ?? null, objective: c?.objective ?? null,
      effective_status: c?.effective_status ?? null,
      spend: r.spend, impressions: r.impressions, reach: r.reach, clicks: r.clicks,
      ctr: r.ctr, cpc: r.cpc, cpm: r.cpm, actions: r.actions, frequency: r.frequency,
      action_values: r.action_values, purchase_roas: r.purchase_roas, cost_per_action_type: r.cost_per_action_type,
      account_currency: r.account_currency,
      date_start: r.date_start, date_stop: r.date_stop, synced_at: r.synced_at,
    });
  }
  // A campaign with no delivery has no insight row at all; still name it.
  /* A linked id with no insight row still needs an answer. Either it has never
     delivered, or the campaign is gone entirely — and those read very
     differently to whoever linked it, so both get said out loud. */
  for (const id of ids) {
    if (out.has(id)) continue;
    const c = byId.get(id) ?? null;
    out.set(id, {
      ...stateOf(c),
      campaign_id: id, campaign_name: c?.name ?? null, objective: c?.objective ?? null,
      effective_status: c?.effective_status ?? null,
      spend: null, impressions: null, reach: null, clicks: null, ctr: null, cpc: null, cpm: null,
      actions: null, account_currency: null, date_start: null, date_stop: null, synced_at: null,
    });
  }
  return out;
}

/**
 * The "Results" line, chosen the way Ads Manager chooses it.
 *
 * Meta has no single Results field: it returns every action type and the
 * reporting UI shows the one matching the campaign's objective. This picks the
 * same one. It is a lookup, not a calculation — the value is Meta's, untouched.
 */
const RESULT_FOR_OBJECTIVE: Record<string, string[]> = {
  OUTCOME_SALES:        ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'],
  OUTCOME_LEADS:        ['lead', 'onsite_conversion.lead_grouped'],
  OUTCOME_TRAFFIC:      ['link_click'],
  OUTCOME_ENGAGEMENT:   ['post_engagement', 'onsite_conversion.messaging_conversation_started_7d'],
  OUTCOME_AWARENESS:    ['reach'],
  OUTCOME_APP_PROMOTION:['mobile_app_install', 'app_install'],
  LINK_CLICKS:          ['link_click'],
  CONVERSIONS:          ['purchase', 'offsite_conversion.fb_pixel_purchase'],
  APP_INSTALLS:         ['mobile_app_install', 'app_install'],
  LEAD_GENERATION:      ['lead'],
  MESSAGES:             ['onsite_conversion.messaging_conversation_started_7d'],
  POST_ENGAGEMENT:      ['post_engagement'],
};

export function resultFor(f: MetaFigures): { label: string; value: string } | null {
  if (!f.actions?.length) return null;
  const wanted = RESULT_FOR_OBJECTIVE[f.objective ?? ''] ?? [];
  for (const type of wanted) {
    const hit = f.actions.find((a) => a.action_type === type);
    if (hit) return { label: prettyAction(type), value: hit.value };
  }
  return null;
}

export const prettyAction = (t: string) => {
  const tail = t.split('.').pop() ?? t;
  const named: Record<string, string> = {
    purchase: 'Purchases', omni_purchase: 'Purchases', fb_pixel_purchase: 'Purchases',
    link_click: 'Link clicks', lead: 'Leads', lead_grouped: 'Leads',
    post_engagement: 'Post engagement', mobile_app_install: 'App installs',
    app_install: 'App installs', reach: 'Reach',
    messaging_conversation_started_7d: 'Conversations started',
  };
  return named[tail] ?? tail.replace(/_/g, ' ');
};

/* ── the money: Meta's own purchase figures ─────────────────────────────── */

/* Meta reports the same purchase under several action types (pixel, on-site,
   "omni" across both). omni_purchase is the one Ads Manager shows; the others
   are fallbacks for older campaigns that only carry the pixel type. */
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

const pick = (list: MetaActionList | undefined): string | null => {
  if (!list?.length) return null;
  for (const t of PURCHASE_TYPES) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return hit.value;
  }
  return null;
};

/** Purchases, purchase value, return on ad spend and cost per purchase — each
 *  looked up in what Meta sent, never worked out here. null means Meta did
 *  not report it (no purchases, or not tracked). */
export function purchaseFigures(f: Pick<MetaFigures, 'actions' | 'action_values' | 'purchase_roas' | 'cost_per_action_type'>) {
  return {
    purchases: pick(f.actions),
    value: pick(f.action_values),
    roas: pick(f.purchase_roas),
    cpa: pick(f.cost_per_action_type),
  };
}

export interface MetaSyncState {
  account_id: string | null;
  account_name: string | null;
  currency: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  /** KD for one USD, set by an owner in Settings. Display only — see kd(). */
  kwd_per_usd: number | null;
  rate_updated_at: string | null;
  /** Where the rate came from; rate_auto false means an owner pinned it. */
  rate_source?: string | null;
  rate_auto?: boolean | null;
  /** Meta reports every "day" in this time zone, not Kuwait's. */
  timezone_name?: string | null;
  /** The daily pixel check: are purchases arriving, and with what. */
  tracking?: TrackingCheck | null;
  tracking_checked_at?: string | null;
}

export interface TrackingPixel {
  id: string;
  name: string;
  last_fired_time: string | null;
  events_7d: Record<string, number>;
  purchase_sources?: Record<string, number>;
  purchase_keys?: Record<string, number>;
  purchase_fields?: Record<string, number>;
  add_to_cart_sources?: Record<string, number>;
  add_to_cart_keys?: Record<string, number>;
}
export interface TrackingCheck { checked_at: string; pixels: TrackingPixel[] }

/** How the last sync went, so the page can say whether the figures are current. */
export async function loadMetaSyncState(): Promise<MetaSyncState | null> {
  const { data } = await supabase
    .from('meta_ads_config')
    .select('account_id, account_name, currency, last_synced_at, last_error, kwd_per_usd, rate_updated_at, rate_source, rate_auto, timezone_name, tracking, tracking_checked_at')
    .eq('id', 1).maybeSingle();
  return (data as MetaSyncState) ?? null;
}

/** True when this campaign has no stored figures — nothing has been synced for
 *  it yet, which is what happens to a campaign created since the last run. */
export async function hasNoFigures(campaignId: string): Promise<boolean> {
  if (!campaignId) return false;
  const { count } = await supabase
    .from('meta_insight_totals')
    .select('campaign_id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).eq('level', 'campaign');
  return (count ?? 0) === 0;
}

/** Date and time as a person reads them, for "last synced". Formatting a
 *  timestamp is not touching a figure — no Meta metric passes through here. */
export const whenSynced = (iso: string | null | undefined) =>
  !iso ? 'never' : new Date(iso).toLocaleString('en-GB',
    { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Hours since a timestamp — used only to colour a freshness pill, never to
 *  alter a figure. */
export const staleHours = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

/**
 * Every campaign on the account, with the figures Meta reports for it.
 *
 * Shaped for the Campaigns page, which lists Meta's own records rather than
 * ours. Same rule as everywhere else: the figures are the strings Meta sent.
 */
export async function loadAllCampaignsWithFigures(): Promise<Record<string, any>[]> {
  const [{ data: camps }, { data: cfg }] = await Promise.all([
    supabase.from('meta_ad_campaigns')
      .select('id, name, objective, effective_status, start_time, stop_time, synced_at')
      .order('name'),
    supabase.from('meta_ads_config').select('last_synced_at').eq('id', 1).maybeSingle(),
  ]);
  const rows = (camps ?? []) as any[];
  if (!rows.length) return [];

  // Insights come back in pages like any other table; ask for all of them.
  const ins: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('meta_insight_totals')
      .select(TOTALS_COLUMNS)
      .eq('level', 'campaign').range(from, from + 999);
    ins.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const byCampaign = new Map(ins.map((r) => [r.campaign_id, r]));

  const lastOk = (cfg as { last_synced_at?: string } | null)?.last_synced_at;
  const cutoff = lastOk ? new Date(lastOk).getTime() - 5 * 60_000 : null;

  return rows.map((c) => {
    const i = byCampaign.get(c.id) ?? {};
    const seen = !cutoff ? true : !!c.synced_at && new Date(c.synced_at).getTime() >= cutoff;
    const figures: MetaFigures = {
      link_state: !seen ? 'missing' : c.effective_status === 'ACTIVE' ? 'live' : 'stopped',
      status_label: !seen ? 'No longer returned by Meta' : statusWord(c.effective_status),
      campaign_id: c.id, campaign_name: c.name ?? null, objective: c.objective ?? null,
      effective_status: c.effective_status ?? null,
      spend: i.spend ?? null, impressions: i.impressions ?? null, reach: i.reach ?? null,
      clicks: i.clicks ?? null, ctr: i.ctr ?? null, cpc: i.cpc ?? null, cpm: i.cpm ?? null,
      actions: i.actions ?? null, account_currency: i.account_currency ?? null,
      frequency: i.frequency ?? null, action_values: i.action_values ?? null,
      purchase_roas: i.purchase_roas ?? null, cost_per_action_type: i.cost_per_action_type ?? null,
      date_start: i.date_start ?? null, date_stop: i.date_stop ?? null,
      synced_at: i.synced_at ?? c.synced_at ?? null,
    };
    return { ...c, __meta: figures, __result: resultFor(figures) };
  });
}


/**
 * Campaigns that have ever spent anything, by id.
 *
 * A campaign that never spent is noise on every screen — 939 of the 1,200 on
 * this account. They stay synced and stored; they are simply not offered.
 * Spend is read here to decide what to LIST, which is a selection test: no
 * figure shown anywhere is computed, rounded or converted by it.
 */
export async function loadSpendingCampaignIds(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('meta_insight_totals')
      .select('campaign_id, spend').eq('level', 'campaign').range(from, from + 999);
    for (const r of data ?? []) {
      if (Number(r.spend ?? 0) > 0) out.add(r.campaign_id as string);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

/* 'untagged' is the same universe as 'all', kept back to the campaigns nobody
   has named a brand for and ordered by spend. It exists because tagging is not
   a 357-campaign job: about sixty campaigns carry ninety per cent of the money
   here, and doing those first is the difference between an afternoon and a
   week. */
export type CampaignScope = 'recent' | 'all' | 'untagged';

/**
 * Campaigns for the Campaigns page.
 *
 * The account carries 1,200 campaigns and Meta reports nearly all of them as
 * ACTIVE or PAUSED however long ago they last ran, so status cannot separate
 * the live board from the archive — only delivery can. The default is the 40
 * that actually ran in the last 90 days; 'all' is there when someone needs the
 * history.
 *
 * A search always reaches every campaign regardless of scope: the point of
 * searching is to find the old one that is not on the default list.
 */
export async function loadCampaignPage(
  opts: { scope: CampaignScope; search?: string },
): Promise<Record<string, any>[]> {
  const term = (opts.search ?? '').trim();
  const [{ data: cfg }, spending] = await Promise.all([
    supabase.from('meta_ads_config').select('last_synced_at').eq('id', 1).maybeSingle(),
    loadSpendingCampaignIds(),
  ]);
  if (!spending.size) return [];

  let ids: string[] | null = null;
  if (!term && opts.scope === 'recent') {
    /* Spent something in the last 90 days — not merely "has a row". Meta writes
       a daily row for a campaign that was live but spent nothing, and those are
       exactly the ones nobody wants on the board.
       Reading spend to decide whether a campaign is listed is a selection test,
       not arithmetic on a figure: no displayed number is touched by it, and a
       campaign kept by this test still shows Meta's own string untouched. */
    const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    const spent = new Set<string>();
    // Paged: a busy quarter can carry more daily rows than one request returns.
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('meta_ad_insights')
        .select('campaign_id, spend').eq('period', 'daily')
        .gte('date_start', since).range(from, from + 999);
      for (const r of data ?? []) {
        if (Number(r.spend ?? 0) > 0) spent.add(r.campaign_id as string);
      }
      if (!data || data.length < 1000) break;
    }
    ids = [...spent].filter((id) => spending.has(id));
    if (!ids.length) return [];
  } else {
    /* Both the archive and a search stay inside the same universe: a campaign
       that never spent is not offered anywhere, however it is reached. */
    ids = [...spending];
  }

  let q = supabase.from('meta_ad_campaigns')
    .select('id, name, objective, effective_status, start_time, stop_time, synced_at');
  // Postgrest has a ceiling on how long an `in` list may be; 357 is well under
  // it, and the archive is capped below anyway.
  if (ids) q = q.in('id', ids.slice(0, 1000));
  if (term) {
    // Name or Meta campaign id — an id is what someone pastes from Ads Manager.
    const safe = term.replace(/[%,()]/g, ' ');
    q = q.or(`name.ilike.%${safe}%,id.ilike.%${safe}%`);
  }
  /* The ceiling matches the id list above, so the figures totalled at the top
     of the page always cover every campaign the page is describing. A lower
     cap here would quietly turn those totals into a partial sum. */
  const { data: camps } = await q.order('name').limit(1000);
  const rows = (camps ?? []) as any[];
  if (!rows.length) return [];

  const [{ data: ins }, tags] = await Promise.all([
    supabase.from('meta_insight_totals')
      .select(TOTALS_COLUMNS)
      .eq('level', 'campaign').in('campaign_id', rows.map((c) => c.id)),
    // What a person has said the campaign was for. Loaded here rather than in
    // the page so the brand figures and the list can never disagree.
    loadCampaignTags(rows.map((c) => c.id as string)),
  ]);
  const byCampaign = new Map((ins ?? []).map((r) => [r.campaign_id, r]));

  const lastOk = (cfg as { last_synced_at?: string } | null)?.last_synced_at;
  const cutoff = lastOk ? new Date(lastOk).getTime() - 5 * 60_000 : null;

  const out = rows.map((c) => {
    const i: any = byCampaign.get(c.id) ?? {};
    const seen = !cutoff ? true : !!c.synced_at && new Date(c.synced_at).getTime() >= cutoff;
    const figures: MetaFigures = {
      link_state: !seen ? 'missing' : c.effective_status === 'ACTIVE' ? 'live' : 'stopped',
      status_label: !seen ? 'No longer returned by Meta' : statusWord(c.effective_status),
      campaign_id: c.id, campaign_name: c.name ?? null, objective: c.objective ?? null,
      effective_status: c.effective_status ?? null,
      spend: i.spend ?? null, impressions: i.impressions ?? null, reach: i.reach ?? null,
      clicks: i.clicks ?? null, ctr: i.ctr ?? null, cpc: i.cpc ?? null, cpm: i.cpm ?? null,
      actions: i.actions ?? null, account_currency: i.account_currency ?? null,
      frequency: i.frequency ?? null, action_values: i.action_values ?? null,
      purchase_roas: i.purchase_roas ?? null, cost_per_action_type: i.cost_per_action_type ?? null,
      date_start: i.date_start ?? null, date_stop: i.date_stop ?? null,
      synced_at: i.synced_at ?? c.synced_at ?? null,
    };
    return { ...c, __meta: figures, __result: resultFor(figures), __tag: tags.get(c.id) ?? null };
  });

  return opts.scope === 'untagged' && !term ? out.filter((r) => !r.__tag) : out;
}

/** How many campaigns are offered at all — those that have ever spent. The
 *  "of N" line should count what someone could reach, not the 1,200 records
 *  behind it. */
export async function countAvailableCampaigns(): Promise<number> {
  return (await loadSpendingCampaignIds()).size;
}


/* ── showing Meta's money in KD ──────────────────────────────────────────── */

/**
 * The rate an owner set, carried to wherever a figure is displayed.
 *
 * Nothing stored is ever converted. Meta bills this account in USD and its
 * figures stay USD strings in the database and on the campaign sheet; this
 * turns one into KD at the moment it is drawn, and every place that does so
 * says the rate out loud. `null` means no rate is set, and then Meta's own
 * currency is shown rather than a number nobody can trace.
 */
export interface DisplayRate {
  kwdPerUsd: number | null;
  updatedAt: string | null;
}

export const rateFrom = (s: MetaSyncState | null | undefined): DisplayRate => ({
  kwdPerUsd: s?.kwd_per_usd ?? null,
  updatedAt: s?.rate_updated_at ?? null,
});

/** The code a figure is shown under, given the account's currency and the rate. */
export const displayCode = (accountCurrency: string | null | undefined, rate: DisplayRate): string =>
  convertible(accountCurrency, rate) ? 'KD' : (accountCurrency || 'USD');

/* Only USD is converted. If the ad account is ever moved to KD, Meta's own
   figures are already in KD and multiplying them again would be a silent
   three-fold error on every screen. */
const convertible = (accountCurrency: string | null | undefined, rate: DisplayRate) =>
  !!rate.kwdPerUsd && rate.kwdPerUsd > 0 && (accountCurrency ?? 'USD').toUpperCase() === 'USD';

/** A USD amount as the page shows it. Returns the number unchanged when there
 *  is no rate, so a missing rate degrades to Meta's own figure rather than to
 *  zero. */
export const inDisplayCurrency = (
  usd: number, accountCurrency: string | null | undefined, rate: DisplayRate,
): number => (convertible(accountCurrency, rate) ? usd * (rate.kwdPerUsd as number) : usd);

/** KD is quoted to three decimals in Kuwait; spend totals read better whole.
 *  Small amounts keep their fils so a 0.4 KD campaign does not read as zero. */
export const money = (n: number, code: string): string =>
  n === 0 || Math.abs(n) >= 100
    ? n.toLocaleString('en-GB', { maximumFractionDigits: 0 })
    : n.toLocaleString('en-GB', { minimumFractionDigits: code === 'KD' ? 3 : 2, maximumFractionDigits: code === 'KD' ? 3 : 2 });

/** "0.3065 KD per USD", for the line that has to sit next to a converted
 *  figure so nobody mistakes it for something Meta said. */
export const rateNote = (rate: DisplayRate): string | null =>
  rate.kwdPerUsd ? `converted at ${rate.kwdPerUsd} KD per USD` : null;
