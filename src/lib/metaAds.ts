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

/** What Meta reports for these campaigns, over their whole life. */
export async function loadMetaFigures(campaignIds: string[]): Promise<Map<string, MetaFigures>> {
  const ids = [...new Set(campaignIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const [{ data: ins }, { data: camps }] = await Promise.all([
    supabase.from('meta_ad_insights')
      .select('campaign_id, spend, impressions, reach, clicks, ctr, cpc, cpm, actions, account_currency, date_start, date_stop, synced_at')
      .eq('period', 'lifetime').in('campaign_id', ids),
    supabase.from('meta_ad_campaigns').select('id, name, objective, effective_status').in('id', ids),
  ]);
  const byId = new Map<string, any>((camps ?? []).map((c) => [c.id, c]));
  const out = new Map<string, MetaFigures>();
  for (const r of (ins ?? []) as any[]) {
    const c = byId.get(r.campaign_id) ?? {};
    out.set(r.campaign_id, {
      campaign_id: r.campaign_id,
      campaign_name: c.name ?? null, objective: c.objective ?? null,
      effective_status: c.effective_status ?? null,
      spend: r.spend, impressions: r.impressions, reach: r.reach, clicks: r.clicks,
      ctr: r.ctr, cpc: r.cpc, cpm: r.cpm, actions: r.actions,
      account_currency: r.account_currency,
      date_start: r.date_start, date_stop: r.date_stop, synced_at: r.synced_at,
    });
  }
  // A campaign with no delivery has no insight row at all; still name it.
  for (const id of ids) {
    if (out.has(id)) continue;
    const c = byId.get(id);
    if (!c) continue;
    out.set(id, {
      campaign_id: id, campaign_name: c.name ?? null, objective: c.objective ?? null,
      effective_status: c.effective_status ?? null,
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
