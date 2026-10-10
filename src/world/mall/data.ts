import { supabase } from '../../lib/supabase';

/* What world_mall() returns (migrations 20261010060135..20261010061220). Owner-only: the
   database checks the caller is an owner before reading anything. */

export type SlotKind = 'boutique' | 'bay' | 'island';
export type SectionKey = 'grand_gallery' | 'collectors_arcade' | 'discovery_court';
export type Look = 'neutral' | 'man' | 'woman' | 'woman_hijab';
export type DutyState = 'on' | 'unclosed' | 'off';

export interface MallSlot { slot: string; section: SectionKey; kind: SlotKind; capacity: number; spare: boolean }
export interface MallPlace { brand: string; slot: string; position: number; how: 'initial' | 'new_brand' | 'owner'; placed_at: string; placed_by: string | null }
export interface MallSuggestion { kind: 'promote' | 'free' | 'below'; brand: string; reason: 'threshold' | 'featured' | 'empty'; days: number | null }
export interface MallStaff {
  employee_id: string; name: string; name_ar: string | null; role: string | null; location: string | null; look: Look;
  duty: { state: DutyState; clock_in: string | null; until: string | null; outlet: string | null };
}

export interface MallData {
  settings: {
    boutique_threshold_kd: number; promote_after_days: number; free_after_days: number;
    boutique_colours: Record<string, string>; updated_at: string; updated_by: string | null;
  };
  slots: MallSlot[];
  places: MallPlace[];
  featured: { brand: string; at: string; by: string }[];
  suggestions: MallSuggestion[];
  history: { first_day: string | null; last_day: string | null; days: number };
  sold: { day: string; by_brand: Record<string, number>; days_30_by_brand: Record<string, number> };
  staff: MallStaff[];
  generated_at: string;
}

export async function loadMall(): Promise<MallData> {
  const { data, error } = await supabase.rpc('world_mall');
  if (error) throw new Error(error.message);
  return data as MallData;
}

export type MallAction =
  | { action: 'feature'; brand: string; on: boolean }
  | { action: 'settings'; boutique_threshold_kd?: number; promote_after_days?: number; free_after_days?: number }
  | { action: 'colour'; brand: string; colour: string | null }
  | { action: 'look'; employee_id: string; look: Look }
  | { action: 'move'; moves: { brand: string; slot: string; position: number }[]; reason?: string };

/* The owners' changes. Nothing moves by itself: every place change is one of these. */
export async function actOnMall(a: MallAction): Promise<void> {
  const { action, ...args } = a;
  const { error } = await supabase.rpc('world_mall_act', { p_action: action, p_args: args });
  if (error) throw new Error(error.message);
}
