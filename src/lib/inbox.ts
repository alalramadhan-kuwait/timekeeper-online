import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile, Role } from '../context/AuthContext';

// ── Per-account Inbox: pending items assigned to the signed-in person. ──
// Assignments across the app are stored as free-text names (owner / assigned_to /
// staff_responsible), so "mine" = the assignment matches this account's name(s):
// the profile full_name and the linked employee full_name (case/space-insensitive).

export interface InboxTask {
  key: string;
  module: string;   // human label, e.g. "Repairs"
  link: string;     // route to open the module
  title: string;
  subtitle?: string;
  status: string;
  due: string | null; // yyyy-mm-dd; overdue flagged in the UI
}

export interface LeaveApproval {
  id: string; employee_name: string; leave_type: string;
  leave_start: string; leave_end: string; days: number; notes: string | null;
}

export interface RequestApproval {
  id: string; request_type: string; details: string;
  requester: string; created_at: string;
}

export interface InboxData {
  tasks: InboxTask[];
  leaveApprovals: LeaveApproval[];
  requestApprovals: RequestApproval[];
  isApprover: boolean;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
export const isApproverRole = (role: Role | null) => ['admin', 'manager', 'hr'].includes(role ?? '');

// terminal statuses per module — anything else is still "open / pending"
const OPEN = {
  content: (s: string) => !['Posted', 'Cancelled'].includes(s),
  ads: (s: string) => !['Completed', 'Cancelled'].includes(s),
  repair: (s: string) => !['Returned to customer', 'Cancelled'].includes(s),
  collab: (s: string) => !['Completed', 'Cancelled'].includes(s),
  demand: (s: string) => !['Delivered', 'Converted', 'Cancelled'].includes(s),
};

async function safe<T>(p: PromiseLike<{ data: unknown }>): Promise<T[]> {
  try { const { data } = await p; return ((data as T[]) ?? []); } catch { return []; }
}

/** All the names that identify this account (for matching assignment fields). */
async function myNames(user: User, profile: Profile | null): Promise<Set<string>> {
  const names = new Set<string>();
  if (profile?.full_name) names.add(norm(profile.full_name));
  const emp = await safe<{ full_name: string }>(
    supabase.from('employees').select('full_name').eq('user_id', user.id),
  );
  for (const e of emp) if (e.full_name) names.add(norm(e.full_name));
  return names;
}

export async function loadInbox(user: User, profile: Profile | null, role: Role | null): Promise<InboxData> {
  const [names, content, ads, repairs, collabs, cases, demand] = await Promise.all([
    myNames(user, profile),
    safe<any>(supabase.from('content_tasks').select('id, title, owner, status, planned_date')),
    safe<any>(supabase.from('paid_ads').select('id, ad_name, owner, status, end_date')),
    safe<any>(supabase.from('repair_watches').select('id, repair_id, customer_name, assigned_to, status, estimated_completion')),
    safe<any>(supabase.from('influencer_collaborations').select('id, campaign, product_brand, owner, status, posted_date, agreed_date, influencer_id')),
    safe<any>(supabase.from('cases').select('id, case_id, customer_name, staff, status, promised_callback').eq('status', 'Open')),
    safe<any>(supabase.from('waiting_list').select('id, customer_name, staff_responsible, status, list_type, follow_up_date, expected_arrival')),
  ]);

  const mine = (v: unknown) => names.has(norm(v)) && norm(v) !== '';
  const tasks: InboxTask[] = [];

  for (const r of content)
    if (mine(r.owner) && OPEN.content(r.status))
      tasks.push({ key: `content_${r.id}`, module: 'Content Planner', link: '/content', title: r.title || 'Untitled', status: r.status, due: r.planned_date });

  for (const r of ads)
    if (mine(r.owner) && OPEN.ads(r.status))
      tasks.push({ key: `ads_${r.id}`, module: 'Paid Ads', link: '/paid-ads', title: r.ad_name || 'Ad', status: r.status, due: r.end_date });

  for (const r of repairs)
    if (mine(r.assigned_to) && OPEN.repair(r.status))
      tasks.push({ key: `repair_${r.id}`, module: 'Repairs', link: '/repairs', title: `${r.repair_id ?? 'Repair'} · ${r.customer_name ?? ''}`.trim(), status: r.status, due: r.estimated_completion });

  for (const r of collabs)
    if (mine(r.owner) && OPEN.collab(r.status))
      tasks.push({ key: `collab_${r.id}`, module: 'Influencers', link: r.influencer_id ? `/influencers/${r.influencer_id}` : '/influencers', title: [r.campaign, r.product_brand].filter(Boolean).join(' · ') || 'Collaboration', status: r.status, due: r.posted_date ?? r.agreed_date });

  for (const r of cases)
    if (mine(r.staff))
      tasks.push({ key: `case_${r.id}`, module: 'Follow-ups', link: '/follow-ups', title: `${r.case_id ?? 'Case'} · ${r.customer_name ?? ''}`.trim(), status: r.status, due: r.promised_callback });

  for (const r of demand)
    if (mine(r.staff_responsible) && OPEN.demand(r.status))
      tasks.push({ key: `demand_${r.id}`, module: r.list_type === 'Pre-Order' ? 'Pre-order' : 'Demand list', link: '/waiting-list', title: r.customer_name || 'Customer', status: r.status, due: r.follow_up_date ?? r.expected_arrival });

  // sort: overdue/soonest due first, undated last
  tasks.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));

  // ── Approvals waiting on me (admin / manager / hr) ──
  const isApprover = isApproverRole(role);
  let leaveApprovals: LeaveApproval[] = [];
  let requestApprovals: RequestApproval[] = [];

  if (isApprover) {
    const [lv, empRows, req, profRows] = await Promise.all([
      safe<any>(supabase.from('leave_records').select('id, employee_id, leave_type, leave_start, leave_end, days, notes, approval_status').eq('approval_status', 'Pending')),
      safe<any>(supabase.from('employees').select('id, full_name, user_id')),
      safe<any>(supabase.from('employee_requests').select('id, request_type, details, created_at, user_id, employee_id, status').or('status.eq.Pending,status.is.null')),
      safe<any>(supabase.from('profiles').select('id, full_name')),
    ]);
    const empById = new Map(empRows.map((e) => [e.id, e.full_name]));
    const empByUser = new Map(empRows.filter((e) => e.user_id).map((e) => [e.user_id, e.full_name]));
    const profById = new Map(profRows.map((p) => [p.id, p.full_name]));

    leaveApprovals = lv.map((l) => ({
      id: l.id, employee_name: empById.get(l.employee_id) ?? 'Unknown',
      leave_type: l.leave_type ?? 'Annual', leave_start: l.leave_start, leave_end: l.leave_end,
      days: Number(l.days), notes: l.notes,
    }));
    requestApprovals = req.map((r) => ({
      id: r.id, request_type: r.request_type, details: r.details, created_at: r.created_at,
      requester: (r.employee_id && empById.get(r.employee_id)) || empByUser.get(r.user_id) || profById.get(r.user_id) || 'Someone',
    }));
  }

  return { tasks, leaveApprovals, requestApprovals, isApprover };
}

export function inboxCount(d: InboxData): number {
  return d.tasks.length + d.leaveApprovals.length + d.requestApprovals.length;
}
