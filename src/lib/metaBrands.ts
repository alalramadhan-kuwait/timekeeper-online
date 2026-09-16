/**
 * Which brand a Meta campaign was for, read off its name.
 *
 * Meta does not know our brands. It knows campaigns, and a campaign's only
 * link back to a brand is whatever whoever created it typed in the name. So
 * this file reads names, and it is honest about how far that gets: on this
 * account it identifies a brand for about a quarter of the spend.
 *
 * The rest is not a failure of the matching. Most of it is deliberate:
 * $88k of the $150k lifetime spend is on campaigns for the SHOP — retargeting,
 * the catalogue as a whole, the app, straps, seasonal sales. Those have no
 * brand and never did. The remainder is boosted Instagram posts, whose Meta
 * name is the post's own caption, truncated by Meta mid-word:
 * "…هذا إصدار خاص للكويت من دبليو ام…" is cut two letters before the brand.
 * Nothing can recover a brand from that, and guessing at one would put a
 * number next to a brand's name that nobody could defend.
 *
 * So there are three answers, not two: a brand, "Whole shop", or "Unknown".
 * Collapsing the first two would blame the naming for money that was never
 * meant to belong to a brand.
 *
 * None of this is the first answer any more. A brand STATED by a person, in
 * `meta_campaign_brands`, always wins; what follows is only what happens when
 * nobody has said. That order matters both ways: it means the page works from
 * the first day without anyone tagging anything, and it means a tag is never
 * argued with by a regex.
 */

/** A brand and the spellings it appears under, English and Arabic.
 *
 *  The Arabic entries are transliterations taken from campaigns already on the
 *  account — وست اند, ويست إند and وست إند are all West End — not translations
 *  invented here. Where a name is truncated before the brand is complete the
 *  shortest surviving prefix is matched, which is why 'دبليو ام' is listed for
 *  WMT: Meta cut 'دبليو ام تي' short and that prefix has no other meaning in
 *  this account.
 *
 *  Patterns are matched case-insensitively and, for Latin text, only on word
 *  boundaries — without that, 'Ais' would match inside a dozen other words. */
const BRAND_PATTERNS: [RegExp, string][] = [
  [/citizen|سيتيزن/i, 'Citizen'],
  [/\bnuun\b/i, 'Nuun'],
  [/west ?end|وست|ويست/i, 'West End'],
  [/\bwmt\b|دبليو ?ام|دبليو ?إم/i, 'WMT Watches'],
  [/g-?shock/i, 'G-Shock'],
  [/\bwolf\b/i, 'Wolf'],
  [/gerald charles/i, 'Gerald Charles'],
  [/dennison|دينسون/i, 'Dennison'],
  [/\bbaltic\b|بالتيك/i, 'Baltic'],
  [/\bwarden\b/i, 'Warden'],
  [/luminox/i, 'Luminox'],
  [/behrens/i, 'Behrens Original'],
  [/raketa|راكيتا/i, 'Raketa'],
  [/nivada|نيفادا/i, 'Nivada Grenchen'],
  [/unimatic|يونيماتيك/i, 'Unimatic'],
  [/lebois/i, 'Lebois & Co'],
  [/\bdvo\b|دفو/i, 'Dvo'],
  [/\bswatch\b/i, 'Swatch'],
  [/victorinox/i, 'Victorinox'],
  [/sevenfriday/i, 'SevenFriday'],
  [/louis erard/i, 'Louis Erard'],
  [/atelier wen/i, 'Atelier Wen'],
  [/\banoma\b|انوما|أنوما/i, 'Anoma'],
  [/\bairain\b/i, 'Airain'],
  [/forstner/i, 'Forstner'],
  [/venezianico/i, 'Venezianico'],
  [/kollokium/i, 'Kollokium'],
  [/exaequo/i, 'Exaequo'],
  [/\bhoffman\b/i, 'Hoffman'],
  [/deluges/i, 'Deluges'],
  [/timethis/i, 'Timethis'],
  [/\bbwatch\b/i, 'Bwatch'],
];

/* Campaigns that are for the shop rather than for anything in it. The big one
   is 'CPN - YOKO x Time Keeper' with no brand after it — YOKO is the agency
   that ran it, not a brand, and at $28.5k it is the single largest campaign on
   the account. Reading YOKO as a brand would have put the agency at the top of
   every chart here. */
const SHOP_WIDE =
  /retarget|watch brands|straps|collections|new watches|app install|profile visits|time gallery|new (shop|store) post|\bsale\b|podcast|celebrity reel|ever green|purchases -|yoko x time keeper/i;

export const WHOLE_SHOP = 'Whole shop';
export const SEVERAL_BRANDS = 'Several brands';
export const UNKNOWN_BRAND = 'Unknown';

export type BrandKind = 'brand' | 'shop' | 'unknown';

/** The brand a campaign name names, if it names one at all. */
export function brandOf(name: string | null | undefined): { brand: string; kind: BrandKind } {
  const n = (name ?? '').trim();
  if (!n) return { brand: UNKNOWN_BRAND, kind: 'unknown' };

  const found = new Set<string>();
  for (const [re, brand] of BRAND_PATTERNS) if (re.test(n)) found.add(brand);
  if (found.size === 1) return { brand: [...found][0], kind: 'brand' };
  /* Two brands in one name is a comparison post or a multi-brand push. It is
     not one brand's spend and must not be filed under whichever matched first. */
  if (found.size > 1) return { brand: SEVERAL_BRANDS, kind: 'shop' };

  if (SHOP_WIDE.test(n)) return { brand: WHOLE_SHOP, kind: 'shop' };
  return { brand: UNKNOWN_BRAND, kind: 'unknown' };
}

export interface BrandRow {
  brand: string;
  kind: BrandKind;
  campaigns: number;
  spend: number;
  purchases: number;
  /** Share of the spend on screen, 0–100. */
  share: number;
  /** How much of this row's spend comes from campaigns somebody tagged, rather
   *  than from reading a name. A row at 100% is as good as the data gets. */
  storedSpend: number;
  /** For the "Several brands" row: which brands those campaigns covered. */
  alsoCovers: string[];
}

export interface CampaignSummary {
  campaigns: number;
  currency: string;
  /** Totals of the figures Meta reported for the campaigns on screen. These are
   *  sums of Meta's own numbers — no Meta metric is recomputed to produce them,
   *  and no ratio is averaged. */
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  /** How many of the campaigns reported a purchase at all — without it the
   *  purchase total reads as though every campaign were selling. */
  purchasingCampaigns: number;
  earliest: string | null;
  latest: string | null;
  brands: BrandRow[];
  /** Spend that belongs to a named brand, and the share of the total it is. */
  brandSpend: number;
  brandShare: number;
  topBySpend: BrandRow | null;
  topByPurchases: BrandRow | null;
  /** How much of the spend has a brand somebody stated, rather than one read
   *  off a name. The two are not equally good, so the page shows the balance
   *  instead of implying the whole split is equally trustworthy. */
  storedSpend: number;
  storedShare: number;
}

/* Meta's figures arrive as strings and are shown as strings. Here they are read
   as numbers for one purpose only — adding them up for a total the page was
   asked to show. Nothing read here is written back or displayed in place of
   Meta's own string. */
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Ads Manager's "Purchases": web and app, counted once. */
const purchasesOf = (actions: { action_type: string; value: string }[] | null | undefined): number =>
  num(actions?.find((a) => a.action_type === 'omni_purchase')?.value);

/**
 * The totals and the brand split for the campaigns currently listed.
 *
 * Deliberately computed from the rows on screen rather than from a separate
 * query, so the figures at the top always add up to the rows underneath them —
 * including when a search has narrowed the list.
 */
/**
 * @param rate  How to show money. Meta's stored figures are never touched: the
 *   conversion happens here, on the way to the screen, and the currency code
 *   returned alongside says which one came out.
 */
export function summarise(rows: Record<string, any>[], rate: DisplayRate = { kwdPerUsd: null, updatedAt: null }): CampaignSummary {
  const byBrand = new Map<string, BrandRow>();
  let spend = 0, impressions = 0, clicks = 0, purchases = 0, purchasingCampaigns = 0;
  let storedSpend = 0;
  let earliest: string | null = null, latest: string | null = null;
  let currency = displayCode('USD', rate);

  for (const r of rows) {
    const m = r.__meta ?? {};
    const s = inDisplayCurrency(num(m.spend), m.account_currency, rate);
    const p = purchasesOf(m.actions);
    spend += s;
    impressions += num(m.impressions);
    clicks += num(m.clicks);
    purchases += p;
    if (p > 0) purchasingCampaigns += 1;
    if (m.account_currency) currency = displayCode(m.account_currency, rate);
    if (m.date_start && (!earliest || m.date_start < earliest)) earliest = m.date_start;
    if (m.date_stop && (!latest || m.date_stop > latest)) latest = m.date_stop;

    const a = attribute(r.name, r.__tag as StoredTag | null | undefined);
    if (a.source === 'stored') storedSpend += s;

    const row = byBrand.get(a.bucket)
      ?? { brand: a.bucket, kind: a.kind, campaigns: 0, spend: 0, purchases: 0, share: 0, storedSpend: 0, alsoCovers: [] };
    row.campaigns += 1;
    row.spend += s;
    row.purchases += p;
    if (a.source === 'stored') row.storedSpend += s;
    if (a.bucket === SEVERAL_BRANDS) {
      for (const n of a.brands) if (!row.alsoCovers.includes(n)) row.alsoCovers.push(n);
    }
    byBrand.set(a.bucket, row);
  }

  const brands = [...byBrand.values()].sort((a, b) => b.spend - a.spend);
  for (const b of brands) { b.share = spend > 0 ? (b.spend / spend) * 100 : 0; b.alsoCovers.sort(); }

  const named = brands.filter((b) => b.kind === 'brand');
  const brandSpend = named.reduce((t, b) => t + b.spend, 0);

  return {
    campaigns: rows.length,
    currency, spend, impressions, clicks, purchases, purchasingCampaigns,
    earliest, latest, brands,
    brandSpend,
    brandShare: spend > 0 ? (brandSpend / spend) * 100 : 0,
    topBySpend: named[0] ?? null,
    topByPurchases: [...named].sort((a, b) => b.purchases - a.purchases)[0] ?? null,
    storedSpend,
    storedShare: spend > 0 ? (storedSpend / spend) * 100 : 0,
  };
}


/* ── what somebody actually said ────────────────────────────────────────── */

import { supabase } from './supabase';
import { inDisplayCurrency, displayCode, type DisplayRate } from './metaAds';

export interface Brand { id: string; name: string }

/** The brand decision stored against a campaign. `kind` 'brand' carries one or
 *  more brands; the other two carry none and mean it. */
export interface StoredTag {
  kind: 'brand' | 'whole_shop' | 'unknown';
  brandIds: string[];
  brandNames: string[];
  setAt: string | null;
  setBy: string | null;
}

/** The brands the shop carries, for the picker. Active ones first — an
 *  inactive brand is kept because old campaigns still point at it. */
export async function loadBrands(): Promise<Brand[]> {
  const { data } = await supabase
    .from('brands').select('id, name, is_active')
    .order('is_active', { ascending: false }).order('name');
  return ((data ?? []) as any[]).map((b) => ({ id: b.id, name: b.name }));
}

/** What has been said about these campaigns. Absent from the map = nobody has
 *  said anything, which is not the same as "no brand". */
export async function loadCampaignTags(campaignIds: string[]): Promise<Map<string, StoredTag>> {
  const ids = [...new Set(campaignIds.filter(Boolean))];
  const out = new Map<string, StoredTag>();
  if (!ids.length) return out;

  // Chunked: a campaign can carry several rows, and the archive is 357 wide.
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from('meta_campaign_brands')
      .select('campaign_id, brand_id, kind, set_at, set_by, brands(name)')
      .in('campaign_id', ids.slice(i, i + 200));
    rows.push(...((data ?? []) as any[]));
  }

  for (const r of rows) {
    const t: StoredTag = out.get(r.campaign_id) ?? {
      kind: r.kind, brandIds: [], brandNames: [], setAt: null, setBy: null,
    };
    t.kind = r.kind;
    if (r.brand_id) {
      t.brandIds.push(r.brand_id);
      const name = (r as any).brands?.name;
      if (name) t.brandNames.push(name);
    }
    // Several rows, one decision: the most recent edit dates the whole set.
    if (!t.setAt || (r.set_at && r.set_at > t.setAt)) { t.setAt = r.set_at; t.setBy = r.set_by; }
    out.set(r.campaign_id, t);
  }
  for (const t of out.values()) t.brandNames.sort();
  return out;
}

/**
 * Replace what is stored for one campaign.
 *
 * Written as a clear-then-insert rather than a merge because the picker edits a
 * whole decision, not one row of it: removing a brand has to remove its row,
 * and switching from two brands to "whole shop" has to remove both. The delete
 * comes first for the same reason the database refuses the combination — a
 * campaign holding both brands and "no brand" would make the spend split add up
 * to more than the spend.
 *
 * `null` means "unsay it": the campaign goes back to being read from its name.
 */
export async function saveCampaignTag(
  campaignId: string,
  tag: { kind: StoredTag['kind']; brandIds: string[] } | null,
  setBy: string | null,
): Promise<void> {
  const del = await supabase.from('meta_campaign_brands').delete().eq('campaign_id', campaignId);
  if (del.error) throw del.error;
  if (!tag) return;

  const rows: Record<string, unknown>[] = tag.kind === 'brand'
    ? [...new Set(tag.brandIds)].map((brand_id) => ({ campaign_id: campaignId, brand_id, kind: 'brand', set_by: setBy }))
    : [{ campaign_id: campaignId, brand_id: null, kind: tag.kind, set_by: setBy }];
  if (!rows.length) return;

  const ins = await supabase.from('meta_campaign_brands').insert(rows as any);
  if (ins.error) throw ins.error;
}

export interface Attribution {
  /** The row this campaign is counted under in the chart. */
  bucket: string;
  kind: BrandKind;
  /** The brands involved — one entry for a single brand, several for a campaign
   *  that genuinely covered more than one. */
  brands: string[];
  source: 'stored' | 'name';
}

/**
 * Where a campaign's spend is counted, stored answer first.
 *
 * A campaign covering several brands is counted under "Several brands" rather
 * than under each of them. Counting it in full under both would make the bars
 * add up to more than the spend, and splitting it evenly would invent a number
 * nobody knows — Meta reports one figure for the campaign, not a figure per
 * brand in it. The brands are named on the row and in the campaign's own sheet,
 * so nothing is lost; it is simply not claimed to be divisible.
 */
export function attribute(name: string | null | undefined, stored?: StoredTag | null): Attribution {
  if (stored) {
    if (stored.kind === 'whole_shop') return { bucket: WHOLE_SHOP, kind: 'shop', brands: [], source: 'stored' };
    if (stored.kind === 'unknown') return { bucket: UNKNOWN_BRAND, kind: 'unknown', brands: [], source: 'stored' };
    const names = stored.brandNames;
    if (names.length === 1) return { bucket: names[0], kind: 'brand', brands: names, source: 'stored' };
    if (names.length > 1) return { bucket: SEVERAL_BRANDS, kind: 'shop', brands: names, source: 'stored' };
  }
  const { brand, kind } = brandOf(name);
  return { bucket: brand, kind, brands: kind === 'brand' ? [brand] : [], source: 'name' };
}

/** When a brand was last stated, as a person reads it. */
export const whenTagged = (iso: string | null | undefined) =>
  !iso ? '' : new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
