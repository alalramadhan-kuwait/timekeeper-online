import { supabase } from './supabase';
import { expiryTier, daysUntil, ExpiryTier } from './expiry';

export interface Alert {
  key: string;
  module: string;
  link: string;
  severity: ExpiryTier;
  message: string;
}

export interface AlertAction {
  alert_key: string;
  action: 'active' | 'dismissed' | 'snoozed';
  note: string | null;
  assigned_to: string | null;
  snooze_until: string | null;
}

const sevRank: Record<ExpiryTier, number> = { overdue: 0, d7: 1, d30: 2, d60: 3, ok: 9 };
const today = () => new Date().toISOString().slice(0, 10);

function push(alerts: Alert[], key: string, module: string, link: string, date: string | null | undefined, message: (days: number, tier: ExpiryTier) => string) {
  if (!date) return;
  const tier = expiryTier(date);
  if (tier === 'ok') return;
  const d = daysUntil(date);
  alerts.push({ key, module, link, severity: tier, message: message(d, tier) });
}

const dayWord = (d: number) => (d < 0 ? `${-d} day(s) overdue` : d === 0 ? 'today' : `in ${d} day(s)`);

export async function loadAlertActions(): Promise<Map<string, AlertAction>> {
  const { data } = await supabase.from('alert_actions').select('*');
  const map = new Map<string, AlertAction>();
  for (const r of (data ?? []) as AlertAction[]) map.set(r.alert_key, r);
  return map;
}

export async function saveAlertAction(key: string, patch: Partial<AlertAction>): Promise<void> {
  await supabase.from('alert_actions').upsert(
    { alert_key: key, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'alert_key' },
  );
}

function isActive(action: AlertAction | undefined): boolean {
  if (!action || action.action === 'active') return true;
  if (action.action === 'dismissed') return false;
  if (action.action === 'snoozed') return !!action.snooze_until && action.snooze_until <= today();
  return true;
}

/** Returns active (non-dismissed, non-snoozed) alerts sorted by severity. */
export async function buildAlerts(role: string | null): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const canHR = ['admin', 'manager', 'hr'].includes(role ?? '');

  const [wl, demandPO, pur, docs, emp, leave, vip, actions] = await Promise.all([
    supabase.from('waiting_list').select('customer_name, status, follow_up_date, list_type').eq('list_type', 'Waiting List').in('status', ['Open', 'Contacted']),
    supabase.from('waiting_list').select('customer_name, brand, product, status, expected_arrival').eq('list_type', 'Pre-Order').not('status', 'in', '("Delivered","Cancelled","Converted")'),
    supabase.from('purchase_orders').select('po_number, supplier, status, expected_arrival, invoice_received').not('status', 'in', '("Received","Cancelled","Returned")'),
    supabase.from('company_documents').select('doc_name, expiry_date, renewal_status'),
    canHR ? supabase.from('employees').select('full_name, residency_expiry, work_permit_expiry, status').in('status', ['Active', 'On leave']) : Promise.resolve({ data: [] as any[] }),
    canHR ? supabase.from('leave_records').select('id, approval_status').eq('approval_status', 'Pending') : Promise.resolve({ data: [] as any[] }),
    supabase.from('customers').select('display_name, birthday, occasions'),
    loadAlertActions(),
  ]);

  for (const r of wl.data ?? []) {
    const key = `wl_followup_${(r.customer_name ?? '').replace(/\s+/g, '_')}`;
    push(alerts, key, 'Waiting list', '/waiting-list', r.follow_up_date, (d) => `Follow up with ${r.customer_name} — ${dayWord(d)}`);
  }

  for (const r of demandPO.data ?? []) {
    const key = `pod_arrival_${(r.customer_name ?? '').replace(/\s+/g, '_')}`;
    push(alerts, key, 'Pre-orders', '/waiting-list', r.expected_arrival, (d) =>
      d < 0
        ? `Pre-order for ${r.customer_name} (${r.brand ?? ''} ${r.product ?? ''}) arrival ${dayWord(d)} — status still "${r.status}"`
        : `Pre-order for ${r.customer_name} expected ${dayWord(d)}`);
    if (r.status === 'Arrived') {
      const key2 = `pod_arrived_${(r.customer_name ?? '').replace(/\s+/g, '_')}`;
      alerts.push({ key: key2, module: 'Pre-orders', link: '/waiting-list', severity: 'd7', message: `Pre-order for ${r.customer_name} has arrived — pending delivery to customer` });
    }
  }

  for (const r of pur.data ?? []) {
    push(alerts, `pur_${r.po_number}`, 'Purchase orders', '/purchase-orders', r.expected_arrival, (d) =>
      d < 0 ? `PO ${r.po_number} (${r.supplier ?? ''}) is delayed — ${dayWord(d)}` : `PO ${r.po_number} expected ${dayWord(d)}`);
    if (!r.invoice_received && ['Dispatched', 'Partially received'].includes(r.status)) {
      alerts.push({ key: `pur_inv_${r.po_number}`, module: 'Purchase orders', link: '/purchase-orders', severity: 'd30', message: `PO ${r.po_number}: invoice not received` });
    }
  }

  for (const r of docs.data ?? []) {
    push(alerts, `doc_${(r.doc_name ?? '').replace(/\s+/g, '_')}`, 'Company documents', '/company-documents', r.expiry_date, (d) => `${r.doc_name} expires ${dayWord(d)}`);
  }

  for (const r of (emp as any).data ?? []) {
    push(alerts, `hr_res_${(r.full_name ?? '').replace(/\s+/g, '_')}`, 'HR', '/hr', r.residency_expiry, (d) => `${r.full_name}: residency expires ${dayWord(d)}`);
    push(alerts, `hr_wp_${(r.full_name ?? '').replace(/\s+/g, '_')}`, 'HR', '/hr', r.work_permit_expiry, (d) => `${r.full_name}: work permit expires ${dayWord(d)}`);
  }

  const pendingLeave = ((leave as any).data ?? []).length;
  if (pendingLeave > 0) {
    alerts.push({ key: 'leave_pending', module: 'Leave', link: '/leave', severity: 'd30', message: `${pendingLeave} leave request(s) pending approval` });
  }

  const todayDate = new Date();
  function nextOccurrenceDays(monthDay: string): number | null {
    const m = monthDay.match(/(\d{2})-(\d{2})$/);
    if (!m) return null;
    const target = new Date(todayDate.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (target < new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate())) target.setFullYear(target.getFullYear() + 1);
    return Math.round((target.getTime() - todayDate.getTime()) / 86400000);
  }
  for (const c of vip.data ?? []) {
    if (c.birthday) {
      const d = nextOccurrenceDays(c.birthday);
      if (d != null && d <= 30) {
        alerts.push({ key: `vip_bday_${(c.display_name ?? '').replace(/\s+/g, '_')}`, module: 'VIP', link: '/vip', severity: d <= 7 ? 'd7' : 'd30', message: `${c.display_name}: birthday ${dayWord(d)}` });
      }
    }
    for (const o of (Array.isArray(c.occasions) ? c.occasions : [])) {
      if (!o?.date) continue;
      const d = nextOccurrenceDays(o.date);
      if (d != null && d <= 30) {
        alerts.push({ key: `vip_occ_${(c.display_name ?? '').replace(/\s+/g, '_')}_${(o.label ?? '').replace(/\s+/g, '_')}`, module: 'VIP', link: '/vip', severity: d <= 7 ? 'd7' : 'd30', message: `${c.display_name}: ${o.label} ${dayWord(d)}` });
      }
    }
  }

  // Filter dismissed/snoozed
  const filtered = alerts.filter((a) => isActive(actions.get(a.key)));
  return filtered.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
}
