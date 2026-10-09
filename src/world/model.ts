import type { Mission, OpenPo, Shelf, Snapshot, StaffMember, SupplierUnpaid } from './types';

/* Turns a snapshot into the things the scene draws. Pure and deterministic: the
   same snapshot always lays the World out the same way, and every object keeps
   the key of the record it stands for, so whatever is tapped leads back to it. */

export type Room = 'floor' | 'dock' | 'office';

export interface CaseModel {
  id: string;                       // brand|ownership
  shelf: Shelf;
  cell: [number, number];
  watches: number;                  // 0-6 drawn in the case
  dusty: boolean;                   // dead stock dominates (capital tied up, not a loss)
  sparkle: boolean;                 // fast sellers present
  isNew: boolean;
  onOrder: boolean;
  alert: boolean;                   // an open mission concerns this brand
}

export interface CabinetModel { index: number; cell: [number, number]; wall: 'l' | 'r'; shelves: Shelf[] }

export type BoxKind = 'wrapped' | 'sealed' | 'open';
export interface BoxModel {
  po: OpenPo; cell: [number, number]; kind: BoxKind; stack: number;
  progress: number | null;          // received / ordered for part-received POs
  alert: boolean;
}

export type RepMood = 'calm' | 'waiting' | 'review';
export interface RepModel { supplier: SupplierUnpaid; cell: [number, number]; mood: RepMood }

export type Look = 'sales' | 'manager' | 'ops' | 'office';
export interface PersonModel { person: StaffMember; room: Room; look: Look; home: [number, number] }

export interface WorldModel {
  cases: CaseModel[];
  cabinets: CabinetModel[];
  boxes: BoxModel[];
  hiddenBoxes: number;              // open POs beyond the dock's slots (still in the list)
  reps: RepModel[];
  hiddenReps: number;
  staff: PersonModel[];
  owners: string[];
  board: { open: number; changed: number; reviewed: number; snoozed: number };
  issues: { unreliable: number; check: number };
  delivery: { seen: boolean; poNumber: string | null; at: string | null; basis: string | null };
  topMission: Mission | null;
}

/* ── the map ─────────────────────────────────────────────────────────── */

export interface Rect { x0: number; y0: number; x1: number; y1: number }   // cells x0..x1-1, y0..y1-1

export const ROOMS: Record<Room, Rect> = {
  floor: { x0: 0, y0: 0, x1: 13, y1: 11 },
  dock: { x0: 15, y0: 0, x1: 26, y1: 11 },
  office: { x0: 0, y0: 13, x1: 11, y1: 21 },
};

/* Doorways between the rooms, two cells deep. */
export const CORRIDORS: Rect[] = [
  { x0: 13, y0: 4, x1: 15, y1: 7 },   // floor ↔ dock
  { x0: 4, y0: 11, x1: 7, y1: 13 },   // floor ↔ office
];

export const ROAD = { x0: 27, x1: 30, y0: -9, y1: 27 };
export const BOUNDS = { x0: -5, y0: -9, x1: 33, y1: 27 };

/* Feature cases, a walkway apart so each brand's label sits clear of its neighbours;
   the most valuable brands take the middle of the shop. */
const CASE_SLOTS: [number, number][] = [
  [5, 5], [8, 5], [5, 2], [8, 2], [2, 5], [11, 5], [2, 2], [11, 2], [5, 8], [8, 8],
];

const CABINET_SLOTS: { cell: [number, number]; wall: 'l' | 'r' }[] = [
  { cell: [0, 2], wall: 'l' }, { cell: [0, 4], wall: 'l' }, { cell: [0, 6], wall: 'l' }, { cell: [0, 8], wall: 'l' },
  { cell: [2, 0], wall: 'r' }, { cell: [4, 0], wall: 'r' }, { cell: [10, 0], wall: 'r' }, { cell: [12, 0], wall: 'r' },
];

const BOX_SLOTS: [number, number][] = (() => {
  const s: [number, number][] = [];
  for (const y of [1, 3, 5, 7, 9]) for (const x of [17, 19, 21, 23]) s.push([x, y]);
  return s;
})();

const REP_SLOTS: [number, number][] = [[1, 19], [2, 19], [4, 19], [5, 19], [7, 19], [8, 19]];

/* Furniture that people walk around. */
export const FIXTURES = {
  counter: { cell: [10, 9] as [number, number], w: 2, d: 1 },
  rug: { cell: [1, 8] as [number, number], w: 3, d: 3 },
  desk: { cell: [4, 16] as [number, number], w: 2, d: 1 },
  staffDesks: [[1, 15], [8, 16]] as [number, number][],
  files: [0, 14] as [number, number],
  benches: [[1, 18], [4, 18], [7, 18]] as [number, number][],
  board: { x: 7, y: 13, len: 3 },
  plants: [[12, 10], [0, 10], [10, 20], [0, 20], [25, 10]] as [number, number][],
  van: { cell: [27, 3] as [number, number], w: 1, d: 2 },
  pallets: BOX_SLOTS,
};

export function blockedCells(m: WorldModel): Set<string> {
  const b = new Set<string>();
  const add = (x: number, y: number, w = 1, d = 1) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) b.add(`${x + i},${y + j}`);
  };
  m.cases.forEach((c) => add(c.cell[0], c.cell[1]));
  m.cabinets.forEach((c) => add(c.cell[0], c.cell[1]));
  m.boxes.forEach((x) => add(x.cell[0], x.cell[1]));
  add(FIXTURES.counter.cell[0], FIXTURES.counter.cell[1], FIXTURES.counter.w, FIXTURES.counter.d);
  add(FIXTURES.desk.cell[0], FIXTURES.desk.cell[1], FIXTURES.desk.w, FIXTURES.desk.d);
  FIXTURES.staffDesks.forEach(([x, y]) => add(x, y));
  add(FIXTURES.files[0], FIXTURES.files[1]);
  FIXTURES.benches.forEach(([x, y]) => add(x, y, 2, 1));
  FIXTURES.plants.forEach(([x, y]) => add(x, y));
  return b;
}

export function walkable(x: number, y: number): boolean {
  const inside = (r: Rect) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
  return inside(ROOMS.floor) || inside(ROOMS.dock) || inside(ROOMS.office) || CORRIDORS.some(inside);
}

export function roomOf(x: number, y: number): Room | null {
  for (const r of Object.keys(ROOMS) as Room[]) {
    const R = ROOMS[r];
    if (x >= R.x0 && x < R.x1 && y >= R.y0 && y < R.y1) return r;
  }
  return null;
}

/* ── from the snapshot ───────────────────────────────────────────────── */

const share = (s: Shelf, c: 'dead' | 'fast' | 'new', by: 'cost_value' | 'units' = 'cost_value') =>
  (s.classes[c]?.[by] ?? 0) / Math.max(s[by === 'cost_value' ? 'cost_value' : 'units'], 1e-9);

function watchesFor(units: number) {
  if (units <= 0) return 0;
  if (units <= 2) return 2;
  if (units <= 6) return 3;
  if (units <= 15) return 4;
  if (units <= 40) return 5;
  return 6;
}

function lookFor(p: StaffMember): { room: Room; look: Look } {
  const role = (p.role ?? '').toLowerCase();
  const loc = (p.location ?? '').toLowerCase();
  if (loc.includes('hq')) {
    if (role.includes('operation')) return { room: 'dock', look: 'ops' };
    return { room: 'office', look: 'office' };
  }
  if (role.includes('manager')) return { room: 'floor', look: 'manager' };
  return { room: 'floor', look: 'sales' };
}

const HOMES: Record<Room, [number, number][]> = {
  floor: [[4, 1], [9, 4], [3, 7], [7, 7], [11, 7], [6, 10], [9, 1]],
  dock: [[18, 4], [22, 6], [20, 2], [24, 8]],
  office: [[2, 15], [9, 15], [7, 17], [3, 17]],
};

export function buildModel(s: Snapshot): WorldModel {
  const openMissions = s.missions.filter((m) => m.state === 'open' || m.state === 'changed_since_review');
  const missionBrands = new Set(openMissions
    .filter((m) => m.kind === 'reorder' || m.kind === 'clear_dead')
    .map((m) => String(m.params.brand ?? '')));
  const missionPos = new Set(openMissions.map((m) => String(m.params.po_id ?? '')).filter(Boolean));

  const shelves = [...s.floor.shelves].sort((a, b) => a.brand_rank - b.brand_rank || a.ownership.localeCompare(b.ownership));
  const featured = shelves.filter((x) => x.featured).slice(0, CASE_SLOTS.length);
  const featuredIds = new Set(featured.map((x) => `${x.brand}|${x.ownership}`));
  const rest = shelves.filter((x) => !featuredIds.has(`${x.brand}|${x.ownership}`));

  const cases: CaseModel[] = featured.map((shelf, i) => ({
    id: `${shelf.brand}|${shelf.ownership}`,
    shelf,
    cell: CASE_SLOTS[i],
    watches: watchesFor(shelf.units),
    dusty: share(shelf, 'dead') >= 0.5,
    sparkle: (shelf.classes.fast?.units ?? 0) > 0 && share(shelf, 'dead') < 0.5,
    isNew: (shelf.classes.new?.products ?? 0) > 0,
    onOrder: shelf.on_order_units > 0,
    alert: shelf.ownership === 'owned' && missionBrands.has(shelf.brand),
  }));

  const per = Math.ceil(rest.length / CABINET_SLOTS.length) || 1;
  const cabinets: CabinetModel[] = CABINET_SLOTS.map((slot, index) => ({
    index, cell: slot.cell, wall: slot.wall, shelves: rest.slice(index * per, index * per + per),
  })).filter((c) => c.shelves.length > 0);

  const partial = new Map(s.receipts.partial.map((p) => [p.po_id, p]));
  const open = [...s.commitments.list].sort((a, b) => a.created_date.localeCompare(b.created_date) || a.po_number.localeCompare(b.po_number));
  const boxes: BoxModel[] = open.slice(0, BOX_SLOTS.length).map((po, i) => {
    const p = partial.get(po.po_id);
    const kind: BoxKind = po.status === 'Pending Approval' ? 'wrapped' : po.status === 'Partially Received' ? 'open' : 'sealed';
    return {
      po, cell: BOX_SLOTS[i], kind,
      stack: po.outstanding_units >= 20 ? 3 : po.outstanding_units >= 5 ? 2 : 1,
      progress: p && p.ordered_qty > 0 ? p.received_qty / p.ordered_qty : null,
      alert: missionPos.has(po.po_id),
    };
  });

  const suppliers = [...s.payments.by_supplier].sort((a, b) => b.recorded_unpaid - a.recorded_unpaid);
  const reps: RepModel[] = suppliers.slice(0, REP_SLOTS.length).map((supplier, i) => ({
    supplier, cell: REP_SLOTS[i],
    mood: supplier.review_count > 0 || supplier.oldest_days > 45 ? 'review' : supplier.oldest_days >= 30 ? 'waiting' : 'calm',
  }));

  const used: Record<Room, number> = { floor: 0, dock: 0, office: 0 };
  const staff: PersonModel[] = s.people.staff.map((person) => {
    const { room, look } = lookFor(person);
    const home = HOMES[room][used[room]++ % HOMES[room].length];
    return { person, room, look, home };
  });

  const recent = s.receipts.log.recent[0];
  const seenToday = !!recent && Date.now() - new Date(recent.detected_at).getTime() < 36 * 3600 * 1000;

  const top = openMissions.find((m) => m.kind !== 'data_issue') ?? openMissions[0] ?? null;

  return {
    cases, cabinets, boxes, hiddenBoxes: Math.max(0, open.length - boxes.length),
    reps, hiddenReps: Math.max(0, suppliers.length - reps.length),
    staff,
    owners: s.people.owners.map((o) => o.name),
    board: {
      open: s.missions.filter((m) => m.state === 'open').length,
      changed: s.missions.filter((m) => m.state === 'changed_since_review').length,
      reviewed: s.missions.filter((m) => m.state === 'reviewed').length,
      snoozed: s.missions.filter((m) => m.state === 'snoozed').length,
    },
    issues: {
      unreliable: s.data_issues.filter((d) => d.severity === 'unreliable').reduce((n, d) => n + d.records, 0),
      check: s.data_issues.filter((d) => d.severity === 'check').reduce((n, d) => n + d.records, 0),
    },
    delivery: {
      seen: seenToday,
      poNumber: recent?.po_number ?? null,
      at: recent?.at ?? null,
      basis: recent?.timestamp_basis ?? null,
    },
    topMission: top,
  };
}

/* ── words for the screen ────────────────────────────────────────────── */

export function missionTitle(m: Mission): string {
  const p = m.params;
  switch (m.kind) {
    case 'reorder': return `Reorder ${p.brand}: ${p.products} product${p.products === 1 ? '' : 's'}`;
    case 'clear_dead': return `Clear slow ${p.brand} stock`;
    case 'supplier_talk': return `Talk to ${p.supplier}`;
    case 'chase_partial': return `Chase the rest of ${p.po_number}`;
    case 'approval_waiting': return `${p.po_number} is waiting for approval`;
    case 'review_unpaid': return `Review the unpaid balance on ${p.po_number}`;
    case 'data_issue': return `Check record ${p.ref_label}`;
  }
}

export const KIND_LABEL: Record<Mission['kind'], string> = {
  reorder: 'Reorder', clear_dead: 'Clear dead stock', supplier_talk: 'Talk to a supplier',
  chase_partial: 'Chase a partial delivery', approval_waiting: 'Waiting for approval',
  review_unpaid: 'Review an old unpaid balance', data_issue: 'Check a record',
};

export const OWNERSHIP_LABEL: Record<string, string> = {
  owned: 'Our stock', consignment: 'Consignment', pre_owned: 'Pre-owned', unknown: 'Ownership not set',
};
