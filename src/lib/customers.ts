/**
 * Customers, as the database answers them.
 *
 * customer_list() and customer_profile() run under the caller's own rules, so
 * this file never filters: an owner gets everyone, a manager the shop's, a
 * salesperson their own. The same helpers exist in the shop app's db layer;
 * the shape is kept identical so a customer reads the same in both.
 */
import { supabase } from './supabase';

export interface CustomerListRow {
  id: string; name: string; contact: string; phoneE164: string | null; isVip: boolean;
  responsibleEmployeeId: string | null; responsible: string | null; mine: boolean;
  visits: number; lastVisit: string | null; openFollowups: number;
  purchases: number; purchasesKD: number; lastPurchase: string | null;
  nextOccasion: string | null; nextOccasionLabel: string | null; nextOccasionDays: number | null;
}

export async function getCustomerList(): Promise<CustomerListRow[]> {
  const { data, error } = await supabase.rpc('customer_list');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: r.id as string, name: r.name as string, contact: r.contact as string, phoneE164: (r.phone_e164 as string | null) ?? null,
    isVip: !!r.is_vip, responsibleEmployeeId: (r.responsible_employee_id as string | null) ?? null,
    responsible: (r.responsible as string | null) ?? null, mine: !!r.mine,
    visits: Number(r.visits ?? 0), lastVisit: (r.last_visit as string | null) ?? null, openFollowups: Number(r.open_followups ?? 0),
    purchases: Number(r.purchases ?? 0), purchasesKD: Number(r.purchases_kd ?? 0), lastPurchase: (r.last_purchase as string | null) ?? null,
    nextOccasion: (r.next_occasion as string | null) ?? null, nextOccasionLabel: (r.next_occasion_label as string | null) ?? null,
    nextOccasionDays: r.next_occasion_days == null ? null : Number(r.next_occasion_days),
  }));
}

export interface CustomerCore {
  id: string; contact: string; phone_e164: string | null; display_name: string | null; email: string | null;
  birthday: string | null; anniversary: string | null; instagram: string | null; snapchat: string | null; twitter: string | null;
  personal_notes: string | null; is_vip: boolean | null; customer_type: string | null; preferred_brands: string[] | null;
  responsible_employee_id: string | null; created_at: string;
}
export interface ProfileVisit {
  id: string; case_id: string; at: string; staff: string; outlet: string | null; case_type: string; brand: string | null;
  product: string; amount_kd: number | null; status: string; notes: string | null; promised_callback: string | null;
  lost_reason: string | null; follow_up_action: string | null;
}
export interface ProfilePurchase {
  id: string; at: string; outlet: string | null; total: number; status: string; is_return: boolean; receipt: string | null;
  salesperson: string | null; items: { name: string | null; brand: string | null; sku: string | null; qty: number; total: number }[] | null;
}
export interface ProfileHandoff { at: string; template: string; lang: string; by: string | null; shared: boolean }
export interface ProfileOccasion { id: number; label: string; month: number; day: number; year: number | null }
export interface CustomerProfile {
  customer: CustomerCore; responsible: string | null; mine: boolean;
  knownBy: { name: string | null; source: string; last_at: string }[];
  visits: ProfileVisit[]; purchases: ProfilePurchase[]; handoffs: ProfileHandoff[]; occasions: ProfileOccasion[];
  contactChanges: { at: string; from: string; to: string }[];
}

export async function getCustomerProfile(id: string): Promise<CustomerProfile | null> {
  const { data, error } = await supabase.rpc('customer_profile', { p_customer: id });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    customer: d.customer as CustomerCore, responsible: (d.responsible as string | null) ?? null, mine: !!d.mine,
    knownBy: (d.known_by as CustomerProfile['knownBy']) ?? [], visits: (d.visits as ProfileVisit[]) ?? [],
    purchases: (d.purchases as ProfilePurchase[]) ?? [], handoffs: (d.handoffs as ProfileHandoff[]) ?? [],
    occasions: (d.occasions as ProfileOccasion[]) ?? [], contactChanges: (d.contact_changes as CustomerProfile['contactChanges']) ?? [],
  };
}

export interface CustomerDetailsPatch {
  displayName?: string; email?: string; birthday?: string | null; anniversary?: string | null;
  personalNotes?: string; isVip?: boolean; preferredBrands?: string[]; instagram?: string;
}

export async function updateCustomerDetails(id: string, patch: CustomerDetailsPatch): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.displayName !== undefined) row.display_name = patch.displayName.trim() || null;
  if (patch.email !== undefined) row.email = patch.email.trim() || null;
  if (patch.birthday !== undefined) row.birthday = patch.birthday || null;
  if (patch.anniversary !== undefined) row.anniversary = patch.anniversary || null;
  if (patch.personalNotes !== undefined) row.personal_notes = patch.personalNotes.trim() || null;
  if (patch.isVip !== undefined) row.is_vip = patch.isVip;
  if (patch.preferredBrands !== undefined) row.preferred_brands = patch.preferredBrands;
  if (patch.instagram !== undefined) row.instagram = patch.instagram.trim() || null;
  const { error } = await supabase.from('customers').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

/** The database normalises, refuses non-numbers, duplicates and Lightspeed-held numbers, and audits. Its words come back as the error. */
export async function updateCustomerPhone(id: string, contact: string): Promise<void> {
  const { error } = await supabase.from('customers').update({ contact: contact.trim(), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function assignResponsible(id: string, employeeId: string | null): Promise<void> {
  const { error } = await supabase.from('customers').update({ responsible_employee_id: employeeId }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addOccasion(customerId: string, label: string, month: number, day: number, year?: number | null): Promise<void> {
  const { error } = await supabase.from('customer_occasions').insert({ customer_id: customerId, label: label.trim(), month, day, year: year ?? null });
  if (error) throw new Error(error.message);
}

export async function removeOccasion(id: number): Promise<void> {
  const { error } = await supabase.from('customer_occasions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Roster name → employee id, the one thing every login may ask about the team. */
export async function getRosterEmployees(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('roster_employees');
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { employee_id: string; staff_name: string }[]).map(r => [r.staff_name, r.employee_id]));
}

export interface MessageTemplate { key: string; lang: 'en' | 'ar'; title: string; body: string }

export async function getMessageTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await supabase.from('message_templates').select('key, lang, title, body').eq('active', true).order('key');
  if (error) throw new Error(error.message);
  return (data ?? []) as MessageTemplate[];
}

export async function logWhatsAppHandoff(customerId: string, templateKey: string, lang: 'en' | 'ar', employeeId?: string | null, caseId?: string | null): Promise<void> {
  const { error } = await supabase.rpc('log_whatsapp_handoff', {
    p_customer: customerId, p_template: templateKey, p_lang: lang, p_employee: employeeId ?? null, p_case: caseId ?? null,
  });
  if (error) throw new Error(error.message);
}

export interface Occasion {
  customerId: string; name: string; phone: string | null; kind: string; label: string; date: string; daysUntil: number; year: number | null;
}

export async function getUpcomingOccasions(days = 7): Promise<Occasion[]> {
  const { data, error } = await supabase.rpc('upcoming_occasions', { p_days: days });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { customer_id: string; kind: string; label: string; occasion_date: string; days_until: number; occasion_year: number | null }[];
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map(r => r.customer_id)));
  const { data: people } = await supabase.from('customers').select('id, display_name, contact, phone_e164').in('id', ids);
  const byId = new Map((people ?? []).map(p => [p.id as string, p as { display_name: string | null; contact: string | null; phone_e164: string | null }]));
  return rows.map(r => {
    const p = byId.get(r.customer_id);
    return {
      customerId: r.customer_id, name: p?.display_name?.trim() || p?.contact || 'Customer', phone: p?.phone_e164 ?? null,
      kind: r.kind, label: r.label, date: r.occasion_date, daysUntil: r.days_until, year: r.occasion_year,
    };
  }).sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
}
