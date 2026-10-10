import type { ClassFigures, Mission, OpenPo, Ownership, Snapshot, StockClass } from '../types';
import type { MallData, MallPlace, MallStaff, MallSuggestion } from './data';
import { SECTIONS, SLOT_GEO, kioskCell, sectionOfLocalX, type SlotGeo } from './layout';

/* One brand as the mall shows it: every ownership of its stock added together. Figures are
   the World's own (world_snapshot's floor shelves, open POs and missions) and world_mall's
   units sold; nothing is recalculated here except sums. */

export interface MallBrand {
  brand: string;
  units: number; products: number; cost: number; retail: number; onOrder: number; tiedUp: number;
  classes: Partial<Record<StockClass, ClassFigures>>;
  ownership: Partial<Record<Ownership, { units: number; cost: number }>>;
  mainOwnership: Ownership;
  openPos: OpenPo[];
  missions: Mission[];
  soldYesterday: number;
  sold30: number;
  featured: boolean;
  colour: string | null;
  place: MallPlace | null;
  inStock: boolean;
  dusty: boolean; sparkle: boolean; isNew: boolean;
}

export interface MallSpot {
  brand: MallBrand;
  slot: SlotGeo;
  position: number;
  cell: [number, number];       // mall cells: the kiosk's cell, or the boutique's board corner
}

export interface MallModel {
  brands: MallBrand[];                       // every brand: in stock, or holding a place
  byName: Map<string, MallBrand>;
  spots: MallSpot[];                         // brands with a place, where they stand
  unplaced: MallBrand[];                     // waiting for a place (still searchable)
  suggestions: MallSuggestion[];
  staff: MallStaff[];
  soldDay: string;
  shoppers: number[];                        // illustrative shoppers per section
  threshold: number;
  data: MallData;
}

const ORDER: Ownership[] = ['owned', 'consignment', 'pre_owned', 'unknown'];

export function buildMall(s: Snapshot, m: MallData): MallModel {
  const featured = new Set(m.featured.map((f) => f.brand));
  const places = new Map(m.places.map((p) => [p.brand, p]));
  const live = new Set(['open', 'changed_since_review']);
  const brands = new Map<string, MallBrand>();
  const get = (name: string): MallBrand => {
    let b = brands.get(name);
    if (!b) {
      b = {
        brand: name, units: 0, products: 0, cost: 0, retail: 0, onOrder: 0, tiedUp: 0, classes: {}, ownership: {},
        mainOwnership: 'unknown', openPos: [], missions: [],
        soldYesterday: m.sold.by_brand[name] ?? 0, sold30: m.sold.days_30_by_brand[name] ?? 0,
        featured: featured.has(name), colour: m.settings.boutique_colours[name] ?? null,
        place: places.get(name) ?? null, inStock: false, dusty: false, sparkle: false, isNew: false,
      };
      brands.set(name, b);
    }
    return b;
  };
  for (const sh of s.floor.shelves) {
    const b = get(sh.brand);
    b.units += sh.units; b.products += sh.products; b.cost += sh.cost_value; b.retail += sh.retail_value;
    b.onOrder += sh.on_order_units; b.tiedUp += sh.tied_up_cost; b.inStock = b.inStock || sh.units > 0;
    const o = (b.ownership[sh.ownership] ??= { units: 0, cost: 0 });
    o.units += sh.units; o.cost += sh.cost_value;
    for (const [c, f] of Object.entries(sh.classes) as [StockClass, ClassFigures][]) {
      const t = (b.classes[c] ??= { products: 0, units: 0, cost_value: 0 });
      t.products += f.products; t.units += f.units; t.cost_value += f.cost_value;
    }
  }
  for (const p of m.places) get(p.brand);
  for (const po of s.commitments.list) if (po.brand && brands.has(po.brand)) brands.get(po.brand)!.openPos.push(po);
  for (const mi of s.missions) {
    const name = String(mi.params.brand ?? '');
    if (live.has(mi.state) && brands.has(name)) brands.get(name)!.missions.push(mi);
  }
  for (const b of brands.values()) {
    b.mainOwnership = ORDER.reduce((a, o) => ((b.ownership[o]?.cost ?? 0) > (b.ownership[a]?.cost ?? -1) ? o : a), 'unknown' as Ownership);
    const dead = b.classes.dead?.cost_value ?? 0;
    b.dusty = b.cost > 0 && dead / b.cost >= 0.5;
    b.sparkle = (b.classes.fast?.units ?? 0) > 0 && !b.dusty;
    b.isNew = (b.classes.new?.products ?? 0) > 0;
  }

  const list = [...brands.values()].sort((a, b) => b.cost - a.cost || a.brand.localeCompare(b.brand));
  const spots: MallSpot[] = [];
  const unplaced: MallBrand[] = [];
  for (const b of list) {
    const geo = b.place ? SLOT_GEO[b.place.slot] : undefined;
    if (!b.place || !geo) { if (b.inStock) unplaced.push(b); continue; }
    const cell: [number, number] = geo.kind === 'boutique'
      ? [geo.x + 2, geo.side === 'n' ? geo.y + 3 : geo.y + 3]
      : kioskCell(geo, b.place.position);
    spots.push({ brand: b, slot: geo, position: b.place.position, cell });
  }

  // shoppers are illustrative: about six in the whole mall, shared out by the last 30 days' units sold
  const perSection = [0, 0, 0];
  for (const sp of spots) perSection[sp.slot.section] += Math.max(0, sp.brand.sold30);
  const total = perSection.reduce((a, b) => a + b, 0);
  const shoppers = perSection.map((n) => (total > 0 && n > 0 ? Math.max(1, Math.round((n / total) * 6)) : 0));

  return {
    brands: list, byName: brands, spots, unplaced, suggestions: m.suggestions, staff: m.staff,
    soldDay: m.sold.day, shoppers, threshold: m.settings.boutique_threshold_kd, data: m,
  };
}

export const placeLabel = (sp: MallSpot | undefined | null): string => {
  if (!sp) return 'Needs a place';
  const sec = SECTIONS[sp.slot.section].name;
  if (sp.slot.kind === 'boutique') return `${sec} · boutique`;
  return `${sec} · ${displayName(sp.slot.slot)}, kiosk ${sp.position + 1}`;
};

/* Display areas are numbered in walking order: 1 and 2 on the Grand Gallery's islands … */
const DISPLAY_ORDER = ['GG-I1', 'GG-I2', 'CA-I1', 'CA-S2', 'CA-S3', 'DC-N1', 'DC-N2', 'DC-N3', 'DC-N4', 'DC-S1', 'DC-S2', 'DC-S3', 'DC-S4', 'CA-I2', 'DC-I1', 'DC-I2'];
export const displayName = (slot: string) => {
  const i = DISPLAY_ORDER.indexOf(slot);
  return i < 0 ? slot : `Display ${i + 1}`;
};

export const sectionOfCell = (lx: number) => sectionOfLocalX(lx);
