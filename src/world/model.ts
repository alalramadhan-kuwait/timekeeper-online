import type { Mission, OpenPo, Snapshot, SupplierUnpaid } from './types';
import type { MallData, MallStaff } from './mall/data';
import { buildMall, type MallModel } from './mall/model';
import { MALL, WALK, toWorld } from './mall/layout';

/* Turns a snapshot into the things the scene draws. Pure and deterministic: the
   same snapshot always lays the World out the same way, and every object keeps
   the key of the record it stands for, so whatever is tapped leads back to it. */

export type Room = 'floor' | 'dock' | 'office';

export type BoxKind = 'wrapped' | 'sealed' | 'open';
export interface BoxModel {
  po: OpenPo; cell: [number, number]; kind: BoxKind; stack: number;
  progress: number | null;          // received / ordered for part-received POs
  alert: boolean;
}

export type RepMood = 'calm' | 'waiting' | 'review';
export interface RepModel { supplier: SupplierUnpaid; cell: [number, number]; mood: RepMood }

/* Staff by the work they do: which room they belong in and which set of pictures they use.
   The picture within the set (neutral, man, woman, woman with a hijab) is the look an owner
   chose for that person; until then it is the neutral figure. */
export type Family = 'sales' | 'manager' | 'ops' | 'office' | 'driver';
export interface PersonModel { person: MallStaff; room: Room; family: Family; key: string; home: [number, number] }

export interface WorldModel {
  mall: MallModel;
  boxes: BoxModel[];
  hiddenBoxes: number;              // open POs beyond the dock's slots (still in the list)
  reps: RepModel[];
  hiddenReps: number;
  staff: PersonModel[];                   // on duty now, verified by attendance
  owners: string[];
  board: { open: number; changed: number; reviewed: number; snoozed: number };
  issues: { unreliable: number; check: number };
  delivery: { seen: boolean; poNumber: string | null; at: string | null; basis: string | null; brand: string | null };
  topMission: Mission | null;
}

/* ── the map ─────────────────────────────────────────────────────────── */

export interface Rect { x0: number; y0: number; x1: number; y1: number }   // cells x0..x1-1, y0..y1-1

export const ROOMS: Record<Room, Rect> = {
  floor: { x0: MALL.x0, y0: MALL.y0, x1: MALL.x0 + MALL.w, y1: MALL.y0 + MALL.d },   // the Watch Mall
  dock: { x0: 15, y0: 0, x1: 26, y1: 11 },
  office: { x0: 0, y0: 13, x1: 11, y1: 21 },
};

/* Doorways between the rooms, two cells deep: the mall's walkway opens onto the dock. The
   office's old doorway into the boutique is closed: the owner steps between areas instead. */
export const CORRIDORS: Rect[] = [
  { x0: 13, y0: MALL.y0 + WALK.y0, x1: 15, y1: MALL.y0 + WALK.y1 },   // mall walkway ↔ dock
];

export const ROAD = { x0: 27, x1: 30, y0: Math.min(-9, MALL.y0 - 6), y1: 27 };
export const BOUNDS = { x0: Math.min(-30, MALL.x0 - 5), y0: Math.min(-9, MALL.y0 - 6), x1: 33, y1: 27 };

const BOX_SLOTS: [number, number][] = (() => {
  const s: [number, number][] = [];
  for (const y of [1, 3, 5, 7, 9]) for (const x of [17, 19, 21, 23]) s.push([x, y]);
  return s;
})();

const REP_SLOTS: [number, number][] = [[1, 19], [2, 19], [4, 19], [5, 19], [7, 19], [8, 19]];

/* Furniture that people walk around. */
export const FIXTURES = {
  desk: { cell: [4, 16] as [number, number], w: 2, d: 1 },
  staffDesks: [[1, 15], [8, 16]] as [number, number][],
  files: [0, 14] as [number, number],
  benches: [[1, 18], [4, 18], [7, 18]] as [number, number][],
  board: { x: 7, y: 13, len: 3 },
  plants: [[10, 20], [0, 20], [25, 10]] as [number, number][],
  van: { cell: [27, 3] as [number, number], w: 1, d: 2 },
  pallets: BOX_SLOTS,
};

export function blockedCells(m: WorldModel): Set<string> {
  const b = new Set<string>();
  const add = (x: number, y: number, w = 1, d = 1) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) b.add(`${x + i},${y + j}`);
  };
  m.boxes.forEach((x) => add(x.cell[0], x.cell[1]));
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

function placeFor(p: MallStaff): { room: Room; family: Family } {
  const role = (p.role ?? '').toLowerCase();
  const at = (p.duty.outlet ?? p.location ?? '').toLowerCase();
  if (role.includes('driver')) return { room: 'dock', family: 'driver' };
  if (at.includes('hq')) {
    if (role.includes('operation')) return { room: 'dock', family: 'ops' };
    return { room: 'office', family: 'office' };
  }
  if (role.includes('manager')) return { room: 'floor', family: 'manager' };
  return { room: 'floor', family: 'sales' };
}

/* The picture for a family and a look. The current staff pictures are the "man" look. */
const MAN: Record<Family, string> = {
  sales: 'char-staff-sales', manager: 'char-staff-manager', ops: 'char-staff-ops', office: 'char-staff-office', driver: 'char-driver',
};
export function lookKey(family: Family, look: MallStaff['look']): string {
  if (look === 'man') return MAN[family];
  return `char-${family}-${look === 'woman' ? 'w' : look === 'woman_hijab' ? 'wh' : 'n'}`;
}

const HOMES: Record<Room, [number, number][]> = {
  floor: ([[3, 0], [9, 1], [16, 0], [22, 1], [29, 0], [35, 1], [6, 1]] as [number, number][]).map(([x, y]) => toWorld(Math.round((x * MALL.w) / 38), y ? WALK.y1 - 1 : WALK.y0)),
  dock: [[18, 4], [22, 6], [20, 2], [24, 8]],
  office: [[2, 15], [9, 15], [7, 17], [3, 17]],
};

export function buildModel(s: Snapshot, mallData: MallData): WorldModel {
  const openMissions = s.missions.filter((m) => m.state === 'open' || m.state === 'changed_since_review');
  const missionPos = new Set(openMissions.map((m) => String(m.params.po_id ?? '')).filter(Boolean));

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
  // only people the attendance records show on duty right now are drawn
  const staff: PersonModel[] = mallData.staff.filter((p) => p.duty.state === 'on').map((person) => {
    const { room, family } = placeFor(person);
    const home = HOMES[room][used[room]++ % HOMES[room].length];
    return { person, room, family, key: lookKey(family, person.look), home };
  });

  const recent = s.receipts.log.recent[0];
  const seenToday = !!recent && Date.now() - new Date(recent.detected_at).getTime() < 36 * 3600 * 1000;

  const top = openMissions.find((m) => m.kind !== 'data_issue') ?? openMissions[0] ?? null;

  return {
    mall: buildMall(s, mallData),
    boxes, hiddenBoxes: Math.max(0, open.length - boxes.length),
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
      // the brand the delivery is for, when the PO says (open POs, or ones part-received)
      brand: recent ? (s.commitments.list.find((p) => p.po_number === recent.po_number)?.brand
        ?? s.receipts.partial.find((p) => p.po_number === recent.po_number)?.brand ?? null) : null,
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
