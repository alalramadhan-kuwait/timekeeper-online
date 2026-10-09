/* The shape of what the World's database functions return (migration
   20261009124541_time_keeper_world). Field names are the database's own. */

export type Ownership = 'owned' | 'consignment' | 'pre_owned' | 'unknown';
export type StockClass = 'dead' | 'slow' | 'new' | 'healthy' | 'fast';

export interface ClassFigures { products: number; units: number; cost_value: number }

export interface Shelf {
  brand: string;
  ownership: Ownership;
  brand_rank: number;
  featured: boolean;
  products: number;
  units: number;
  cost_value: number;
  retail_value: number;
  on_order_units: number;
  tied_up_cost: number;
  median_shelf_days_est: number | null;
  classes: Partial<Record<StockClass, ClassFigures>>;
}

export interface UnpaidPo {
  po_id: string; po_number: string; supplier: string; status: string; payment_status: string | null;
  created_date: string; age_days: number; recorded_unpaid: number;
  goods_received: number; goods_not_received: number; split_basis: 'confirmed' | 'estimate';
  review: boolean; invoice_received: boolean | null;
}

export interface SupplierUnpaid {
  supplier_key: string; supplier: string; pos: number; recorded_unpaid: number;
  goods_received: number; goods_not_received: number; estimated_portion: number;
  oldest_days: number; review_count: number;
}

export interface OpenPo {
  po_id: string; po_number: string; supplier: string; brand: string | null; status: string;
  created_date: string; age_days: number; total_cost: number | null;
  outstanding_units: number; outstanding_value: number;
}

export interface PartialPo {
  po_id: string; po_number: string; supplier: string; brand: string | null;
  ordered_qty: number; received_qty: number; lines: number; lines_short: number; age_days: number;
}

export interface ReceiptEvent {
  po_id: string; po_number: string | null; event: string;
  old_status: string | null; new_status: string | null;
  old_received: number | null; new_received: number | null;
  at: string; detected_at: string; timestamp_basis: 'source' | 'first_detected'; actor: string;
}

export interface DataIssue {
  code: string; severity: 'unreliable' | 'check' | 'info'; rule: string; exclusion: string; records: number;
  items: { ref_type: string; ref_id: string; ref_label: string; detail: Record<string, unknown>; excluded_value: string | null }[];
}

export type MissionKind =
  | 'reorder' | 'clear_dead' | 'supplier_talk' | 'chase_partial' | 'approval_waiting' | 'review_unpaid' | 'data_issue';
export type MissionState = 'open' | 'reviewed' | 'changed_since_review' | 'snoozed';

export interface Mission {
  key: string; kind: MissionKind; params: Record<string, any>; weight_kd: number | null; fingerprint: string;
  state: MissionState; state_by: string | null; state_at: string | null; snooze_until: string | null;
  history_events: number;
}

export interface StaffMember { name: string; name_ar: string | null; role: string | null; location: string | null }

export interface Snapshot {
  meta: {
    generated_at: string; sales_through: string; outlet: string; snapshot_key: string;
    stock: { stock_synced_at: string | null; source: string; cache_computed_at: string | null };
    po: { last_sync: string | null; records: number; active: number; cancelled: number; merged: number };
    receipt_log_started_at: string | null;
    rules: Record<string, number>;
    definitions: Record<string, string>;
  };
  floor: { totals: Partial<Record<Ownership, ClassFigures & { retail_value: number; classes: Partial<Record<StockClass, ClassFigures>> }>>; shelves: Shelf[] };
  payments: {
    total: number; pos: number; goods_received: number; goods_not_received: number; estimated_portion: number;
    review_count: number; by_supplier: SupplierUnpaid[]; list: UnpaidPo[];
  };
  commitments: {
    open_pos: number; open_po_value: number; outstanding_units: number; outstanding_value: number;
    by_status: Record<string, { pos: number; value: number }>; list: OpenPo[];
  };
  receipts: {
    partial: PartialPo[]; closed_short: number; marked_full_but_short: number; awaiting: number;
    log: { events: number; recent: ReceiptEvent[] };
  };
  data_issues: DataIssue[];
  missions: Mission[];
  people: { owners: { name: string }[]; staff: StaffMember[] };
}

export interface PoSearchRow {
  id: string; po_number: string; source: string; record_class: 'active' | 'cancelled' | 'merged';
  status: string; receipt_state: string; supplier: string | null; supplier_key: string | null; brand: string | null;
  outlet: string | null; created_date: string; age_days: number; total_cost: number | null;
  amount_paid: number | null; amount_paid_reliable: boolean; payment_status: string | null; recorded_unpaid: number;
  ordered_qty: number; received_qty: number; lines: number; lines_short: number;
  merged_into: string | null; merged_into_po_number: string | null; issues: string[];
}

export interface PoSearch { total: number; limit: number; offset: number; rows: PoSearchRow[] }

export interface PoDetail {
  po: Record<string, any> & { po_number: string; amount_paid_reliable: boolean; goods_not_received: number };
  lines: { id: string; sku: string | null; name: string | null; brand: string | null; ordered_qty: number | null; received_qty: number | null; cost: number | null; line_cost: number }[];
  merged_into: { id: string; po_number: string; status: string } | null;
  merged_records: { id: string; po_number: string; status: string; total_cost: number | null; amount_paid: number | null; created_date: string }[];
  receipt_events: (Omit<ReceiptEvent, 'po_id' | 'po_number'> & { line_id: string | null })[];
  issues: { code: string; severity: string; rule: string; exclusion: string; excluded_value: string | null }[];
}

export interface MissionEvent { action: string; snooze_until: string | null; note: string | null; by: string; at: string }
