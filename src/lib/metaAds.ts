/**
 * Meta's own figures for a campaign, read back exactly as they were stored.
 *
 * Every value here is the string Meta sent. Nothing in this file parses a
 * figure into a number, rounds one, or converts a currency — the app's job is
 * to fetch and show, and Meta is the source of truth for what the numbers are.
 */
import { supabase } from './supabase';

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
  actions: { action_type: string; value: string }[] | null;
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
export async function loadMetaCampaignOptions(): Promise<MetaCampaignOption[]> {
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const [{ data: campaigns }, { data: recent }] = await Promise.all([
    supabase.from('meta_ad_campaigns').select('id, name, effective_status').order('name'),
    supabase.from('meta_ad_insights').select('campaign_id').eq('period', 'daily').gte('date_start', since),
  ]);
  const active = new Set((recent ?? []).map((r) => r.campaign_id as string));
  const rows = (campaigns ?? []) as { id: string; name: string | null; effective_status: string | null }[];

  const opt = (c: typeof rows[number], group: string): MetaCampaignOption => ({
    value: c.id,
    label: c.name?.trim() || `Campaign ${c.id}`,
    group,
  });
  return [
    ...rows.filter((c) => active.has(c.id)).map((c) => opt(c, 'Ran in the last 90 days')),
    ...rows.filter((c) => !active.has(c.id)).map((c) => opt(c, 'Everything else')),
  ];
}

/** How Meta's own status words read to a person. */
const STATUS_WORDS: Record<string, string> = {
  ACTIVE: 'Active', PAUSED: 'Paused', ARCHIVED: 'Archived', DELETED: 'Deleted',
  CAMPAIGN_PAUSED: 'Campaign paused', ADSET_PAUSED: 'Ad set paused', AD_PAUSED: 'Ad paused',
  DISAPPROVED: 'Disapproved by Meta', PENDING_REVIEW: 'Pending review',
  IN_PROCESS: 'In process', WITH_ISSUES: 'Has issues', PREAPPROVED: 'Pre-approved',
};
const statusWord = (s: string | null) =>
  !s ? 'Unknown' : STATUS_WORDS[s] ?? s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** What Meta reports for these campaigns, over their whole life. */
export async function loadMetaFigures(campaignIds: string[]): Promise<Map<string, MetaFigures>> {
  const ids = [...new Set(campaignIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const [{ data: ins }, { data: camps }, { data: cfg }] = await Promise.all([
    supabase.from('meta_ad_insights')
      .select('campaign_id, spend, impressions, reach, clicks, ctr, cpc, cpm, actions, account_currency, date_start, date_stop, synced_at')
      .eq('period', 'lifetime').in('campaign_id', ids),
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
      ctr: r.ctr, cpc: r.cpc, cpm: r.cpm, actions: r.actions,
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

export interface MetaSyncState {
  account_id: string | null;
  account_name: string | null;
  currency: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

/** How the last sync went, so the page can say whether the figures are current. */
export async function loadMetaSyncState(): Promise<MetaSyncState | null> {
  const { data } = await supabase
    .from('meta_ads_config')
    .select('account_id, account_name, currency, last_synced_at, last_error')
    .eq('id', 1).maybeSingle();
  return (data as MetaSyncState) ?? null;
}

/** True when this campaign has no stored figures — nothing has been synced for
 *  it yet, which is what happens to a campaign created since the last run. */
export async function hasNoFigures(campaignId: string): Promise<boolean> {
  if (!campaignId) return false;
  const { count } = await supabase
    .from('meta_ad_insights')
    .select('campaign_id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId).eq('period', 'lifetime');
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
