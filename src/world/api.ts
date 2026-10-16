import { supabase } from '../lib/supabase';
import type { MissionEvent, PoDetail, PoSearch, Snapshot } from './types';

/* The World's only way to its data: the six owner-only database functions.
   Each one checks the caller is an owner before reading anything, so these
   calls fail for anyone else whatever the screen shows. */

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const loadSnapshot = (outlet?: string | null) =>
  call<Snapshot>('world_snapshot', outlet ? { p_outlet: outlet } : {});

export const searchPos = (q: {
  query?: string; recordClass?: 'active' | 'cancelled' | 'merged' | null; limit?: number; offset?: number;
}) => call<PoSearch>('world_po_search', {
  p_query: q.query?.trim() || null,
  p_record_class: q.recordClass ?? null,
  p_limit: q.limit ?? 30,
  p_offset: q.offset ?? 0,
});

export const loadPo = (id: string) => call<PoDetail>('world_po_detail', { p_po_id: id });

/* Receiving-status changes the PO sync recorded (first-detected times), newest first. */
export interface StatusChange { po_id: string; po_number: string; supplier: string | null; brand: string | null; status: string; at: string; timestamp_basis: 'first_detected' }
export const loadStatusLog = () => call<StatusChange[]>('world_po_status_log');

/* The expected-arrival dates the owners set themselves, by purchase order id. Lightspeed's own due
   date is a separate field the sync rewrites; this one only the owners change. */
export interface OwnerExpected { on: string; note: string | null; by: string; at: string }
export const loadExpected = () => call<Record<string, OwnerExpected>>('world_po_expected');
/* A null date clears it. Every change is kept in the database's log. */
export const setExpected = (poId: string, on: string | null, note?: string | null) =>
  call<unknown>('world_po_expected_set', { p_po_id: poId, p_expected_on: on, p_note: note ?? null });

export const missionHistory = (key: string) => call<MissionEvent[]>('world_mission_history', { p_mission_key: key });

export const actOnMission = (a: {
  key: string; action: 'reviewed' | 'snoozed' | 'reopened' | 'note';
  snoozeUntil?: string | null; note?: string | null; fingerprint?: string | null;
}) => call<unknown>('world_mission_act', {
  p_mission_key: a.key, p_action: a.action,
  p_snooze_until: a.snoozeUntil ?? null, p_note: a.note ?? null, p_fingerprint: a.fingerprint ?? null,
});
