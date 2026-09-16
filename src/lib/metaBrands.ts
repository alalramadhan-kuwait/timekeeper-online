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
export function summarise(rows: Record<string, any>[]): CampaignSummary {
  const byBrand = new Map<string, BrandRow>();
  let spend = 0, impressions = 0, clicks = 0, purchases = 0, purchasingCampaigns = 0;
  let earliest: string | null = null, latest: string | null = null;
  let currency = 'USD';

  for (const r of rows) {
    const m = r.__meta ?? {};
    const s = num(m.spend);
    const p = purchasesOf(m.actions);
    spend += s;
    impressions += num(m.impressions);
    clicks += num(m.clicks);
    purchases += p;
    if (p > 0) purchasingCampaigns += 1;
    if (m.account_currency) currency = m.account_currency;
    if (m.date_start && (!earliest || m.date_start < earliest)) earliest = m.date_start;
    if (m.date_stop && (!latest || m.date_stop > latest)) latest = m.date_stop;

    const { brand, kind } = brandOf(r.name);
    const row = byBrand.get(brand) ?? { brand, kind, campaigns: 0, spend: 0, purchases: 0, share: 0 };
    row.campaigns += 1;
    row.spend += s;
    row.purchases += p;
    byBrand.set(brand, row);
  }

  const brands = [...byBrand.values()].sort((a, b) => b.spend - a.spend);
  for (const b of brands) b.share = spend > 0 ? (b.spend / spend) * 100 : 0;

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
  };
}
