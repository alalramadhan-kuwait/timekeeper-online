import { supabase } from './supabase';
import { expiryTier, daysUntil, ExpiryTier } from './expiry';

export interface Alert {
  module: string;
  link: string;
  severity: ExpiryTier; // overdue > d7 > d30 > d60
  message: string;
}

const sevRank: Record<ExpiryTier, number> = { overdue: 0, d7: 1, d30: 2, d60: 3, ok: 9 };

function push(alerts: Alert[], module: string, link: string, date: string | null | undefined, message: (days: number, tier: ExpiryTier) => string) {
  if (!date) return;
  const tier = expiryTier(date);
  if (tier === 'ok') return;
  const d = daysUntil(date);
  alerts.push({ module, link, severity: tier, message: message(d, tier) });
}

const dayWord = (d: number) => (d < 0 ? `${-d} day(s) overdue` : d === 0 ? 'today' : `in ${d} day(s)`);

/** Builds the full reminder list per spec: 60/30/7 days before + overdue. */
export async function buildAlerts(role: string | null): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const canHR = ['admin', 'manager', 'hr'].includes(role ?? '');

  const [wl, po, pur, docs, emp, leave, vip] = await Promise.all([
    supabase.from('waiting_list').select('customer_name, status, follow_up_date, expected_availability').in('status', ['Open', 'Contacted']),
    supabase.from('pre_orders').select('customer_name, brand, product, status, expected_arrival').not('status', 'in', '("Delivered","Cancelled")'),
    supabase.from('purchase_orders').select('po_number, supplier, status, expected_arrival, invoice_received').not('status', 'in', '("Received","Cancelled","Returned")'),
    supabase.from('company_documents').select('doc_name, expiry_date, renewal_status'),
    canHR ? supabase.from('employees').select('full_name, residency_expiry, work_permit_expiry, status').in('status', ['Active', 'On leave']) : Promise.resolve({ data: [] as any[] }),
    canHR ? supabase.from('leave_records').select('id, approval_status, employee_id').eq('approval_status', 'Pending') : Promise.resolve({ data: [] as any[] }),
    supabase.from('customers').select('display_name, birthday, occasions'),
  ]);

  for (const r of wl.data ?? []) {
    push(alerts, 'Waiting list', '/waiting-list', r.follow_up_date, (d) => `Follow up with ${r.customer_name} — ${dayWord(d)}`);
  }

  for (const r of po.data ?? []) {
    push(alerts, 'Pre-orders', '/pre-orders', r.expected_arrival, (d) =>
      d < 0
        ? `Pre-order for ${r.customer_name} (${r.brand ?? ''} ${r.product ?? ''}) arrival ${dayWord(d)} — status still "${r.status}"`
        : `Pre-order for ${r.customer_name} expected ${dayWord(d)}`);
    if (r.status === 'Arrived') {
      alerts.push({ module: 'Pre-orders', link: '/pre-orders', severity: 'd7', message: `Pre-order for ${r.customer_name} has arrived — pending delivery to customer` });
    }
  }

  for (const r of pur.data ?? []) {
    push(alerts, 'Purchase orders', '/purchase-orders', r.expected_arrival, (d) =>
      d < 0 ? `PO ${r.po_number} (${r.supplier ?? ''}) is delayed — ${dayWord(d)}` : `PO ${r.po_number} expected ${dayWord(d)}`);
    if (!r.invoice_received && ['Dispatched', 'Partially received'].includes(r.status)) {
      alerts.push({ module: 'Purchase orders', link: '/purchase-orders', severity: 'd30', message: `PO ${r.po_number}: invoice not received` });
    }
  }

  for (const r of docs.data ?? []) {
    if (r.renewal_status === 'Expired' || r.expiry_date) {
      push(alerts, 'Company documents', '/company-documents', r.expiry_date, (d) => `${r.doc_name} expires ${dayWord(d)}`);
    }
  }

  for (const r of (emp as any).data ?? []) {
    push(alerts, 'HR', '/hr', r.residency_expiry, (d) => `${r.full_name}: residency expires ${dayWord(d)}`);
    push(alerts, 'HR', '/hr', r.work_permit_expiry, (d) => `${r.full_name}: work permit expires ${dayWord(d)}`);
  }

  const pendingLeave = ((leave as any).data ?? []).length;
  if (pendingLeave > 0) {
    alerts.push({ module: 'Leave', link: '/leave', severity: 'd30', message: `${pendingLeave} leave request(s) pending approval` });
  }

  // Birthdays / occasions within the next 30 days (recurring yearly)
  const today = new Date();
  function nextOccurrenceDays(monthDay: string): number | null {
    const m = monthDay.match(/(\d{2})-(\d{2})$/);
    if (!m) return null;
    const target = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (target < new Date(today.getFullYear(), today.getMonth(), today.getDate())) target.setFullYear(target.getFullYear() + 1);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }
  for (const c of vip.data ?? []) {
    if (c.birthday) {
      const d = nextOccurrenceDays(c.birthday);
      if (d != null && d <= 30) {
        alerts.push({ module: 'VIP', link: '/vip', severity: d <= 7 ? 'd7' : 'd30', message: `${c.display_name}: birthday ${dayWord(d)}` });
      }
    }
    for (const o of (Array.isArray(c.occasions) ? c.occasions : [])) {
      if (!o?.date) continue;
      const d = nextOccurrenceDays(o.date);
      if (d != null && d <= 30) {
        alerts.push({ module: 'VIP', link: '/vip', severity: d <= 7 ? 'd7' : 'd30', message: `${c.display_name}: ${o.label} ${dayWord(d)}` });
      }
    }
  }

  return alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
}
