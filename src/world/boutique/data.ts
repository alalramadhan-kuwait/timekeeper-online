import { supabase } from '../../lib/supabase';
import type { Ownership, StockClass } from '../types';

/* A boutique's watches, as the owner-only world_boutique() returns them (the draft in
   supabase/drafts/world_4_boutique_pilot.sql). Every figure is the Stock Analyst's or the order
   ledger's own; nothing here is recalculated, only sorted, filtered and worded. */

/* The boutiques that can be entered. The pilot is one boutique; emptying this list puts the
   World back exactly as it was. */
export const PILOT_BOUTIQUES = ['Dennison'];
export const canEnter = (brand: string) => PILOT_BOUTIQUES.includes(brand);

export interface OpenPoLine {
  po_id: string; po_number: string; status: string; supplier: string | null;
  ordered: number; received: number; outstanding: number;
  created_date: string | null; due_lightspeed: string | null; expected_owners: string | null;
}

export type ImageSource = 'lightspeed' | 'lightspeed_variant' | 'website_ref' | 'website_title' | 'owner_upload';
export interface WatchImage { thumb: string; view: string; source: ImageSource }

export interface Watch {
  product_id: string; name: string; brand: string; product_type: string; ownership: Ownership;
  variant_parent_id: string | null;
  on_hand: number; negative_units: number | null; by_outlet: Record<string, number> | null;
  cost: number | null; price: number | null;
  u30: number; u90: number; u180: number; u365: number; rev90: number | null;
  first_sale: string | null; last_sale: string | null;
  pace: number | null; cover_months: number | null; sell_through: number | null; shelf_days: number | null;
  class: StockClass | 'not_stocked' | 'unclassified'; class_basis: string;
  on_order: number; open_pos: OpenPoLine[];
  image: WatchImage | null;
}

export interface BoutiqueData {
  brand: string; generated_at: string; stock_synced_at: string | null; sales_through: string;
  products: Watch[];
}

export interface Discovery {
  id: string; product_id: string; brand: string | null; name: string; note: string | null;
  by: string; at: string; then: Watch & { taken_at: string }; now: Watch | null;
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/* numeric columns arrive as strings from some paths; make every figure a number once, here */
function clean(w: Watch): Watch {
  return {
    ...w,
    on_hand: Number(w.on_hand) || 0, negative_units: num(w.negative_units), cost: num(w.cost), price: num(w.price),
    u30: Number(w.u30) || 0, u90: Number(w.u90) || 0, u180: Number(w.u180) || 0, u365: Number(w.u365) || 0, rev90: num(w.rev90),
    pace: num(w.pace), cover_months: num(w.cover_months), sell_through: num(w.sell_through), shelf_days: num(w.shelf_days),
    on_order: Number(w.on_order) || 0,
    open_pos: (w.open_pos ?? []).map((p) => ({ ...p, ordered: Number(p.ordered) || 0, received: Number(p.received) || 0, outstanding: Number(p.outstanding) || 0 })),
  };
}

export async function loadBoutique(brand: string): Promise<BoutiqueData> {
  const d = await call<BoutiqueData>('world_boutique', { p_brand: brand });
  return { ...d, products: (d.products ?? []).map(clean) };
}

export const loadDesk = () => call<Discovery[]>('world_discoveries').then((list) => (list ?? []).map((d) => ({
  ...d, then: clean(d.then) as Discovery['then'], now: d.now ? clean(d.now) : null,
})));
export const saveDiscovery = (productId: string, note: string | null) =>
  call<{ ok: boolean; id: string }>('world_discovery_save', { p_product_id: productId, p_note: note });
export const archiveDiscovery = (id: string) => call<{ ok: boolean }>('world_discovery_archive', { p_id: id });

/* ── what a watch is doing, in the boutique's terms ───────────────────── */

export type Shelf = 'in_stock' | 'sold_out' | 'on_order';
export const shelfOf = (w: Watch): Shelf => (w.on_hand > 0 ? 'in_stock' : w.on_order > 0 ? 'on_order' : 'sold_out');

/* The optional discovery filters: the analyst's classes, and what is missing from the shelves. */
export type Lens = 'all' | 'fast' | 'healthy' | 'new' | 'slow' | 'dead' | 'sold_out' | 'on_order';
export const LENSES: { key: Lens; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fast', label: 'Fast' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'new', label: 'New' },
  { key: 'slow', label: 'Slow' },
  { key: 'dead', label: 'Dead' },
  { key: 'sold_out', label: 'Sold Out' },
  { key: 'on_order', label: 'On Order' },
];
export function matches(w: Watch, lens: Lens): boolean {
  switch (lens) {
    case 'all': return true;
    case 'sold_out': return w.on_hand <= 0;
    case 'on_order': return w.open_pos.some((p) => p.outstanding > 0);
    default: return w.on_hand > 0 && w.class === lens;
  }
}

export type SortKey = 'sold90' | 'stock' | 'unsold' | 'name';
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'sold90', label: 'Sales movement' },
  { key: 'stock', label: 'Highest stock' },
  { key: 'unsold', label: 'Longest unsold' },
  { key: 'name', label: 'Name' },
];
const lastSaleTime = (w: Watch) => (w.last_sale ? Date.parse(w.last_sale) : -Infinity);
export function sortWatches(list: Watch[], key: SortKey): Watch[] {
  const by = [...list];
  if (key === 'sold90') by.sort((a, b) => b.u90 - a.u90 || b.u365 - a.u365 || a.name.localeCompare(b.name));
  if (key === 'stock') by.sort((a, b) => b.on_hand - a.on_hand || a.name.localeCompare(b.name));
  // in stock first, the oldest last sale (or none) first
  if (key === 'unsold') by.sort((a, b) => Number(b.on_hand > 0) - Number(a.on_hand > 0) || lastSaleTime(a) - lastSaleTime(b) || a.name.localeCompare(b.name));
  if (key === 'name') by.sort((a, b) => a.name.localeCompare(b.name));
  return by;
}

/* The watches in the glass cases: the best sellers of the last 90 days that are on the shelf now
   and have a verified photo. A plain rule, so the cases change as the sales do and no one picks. */
export const CASE_COUNT = 6;
export function curated(list: Watch[], n = CASE_COUNT): Watch[] {
  return list.filter((w) => w.on_hand > 0 && w.image)
    .sort((a, b) => b.u90 - a.u90 || b.u365 - a.u365 || a.name.localeCompare(b.name))
    .slice(0, n);
}

export const CLASS_WORD: Record<string, string> = {
  fast: 'Fast', healthy: 'Healthy', new: 'New', slow: 'Slow', dead: 'Dead',
  not_stocked: 'Sold out', unclassified: 'Not classed yet',
};
export const CLASS_COLOUR: Record<string, string> = {
  fast: '#3f8f5a', healthy: '#5b9bd5', new: '#7b61c9', slow: '#d9a441', dead: '#8f8a80', not_stocked: '#ffffff', unclassified: '#c7c2b8',
};

/* Where a picture came from, in words; Lightspeed's own is the plain case and carries no badge. */
export const SOURCE_BADGE: Record<ImageSource, string | null> = {
  lightspeed: null, lightspeed_variant: null, owner_upload: 'Uploaded', website_ref: 'Website', website_title: 'Website',
};

/* The name to show: Lightspeed's, with a variant's own name when it says more. */
export const tidyName = (s: string) => s.replace(/\s{2,}/g, ' ').replace(/\s+-\s+/g, ' – ').trim();
