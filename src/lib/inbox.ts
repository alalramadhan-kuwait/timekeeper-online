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
  /** Which half of the chain this viewer is being asked for. */
  stage: 'manager' | 'final';
  /** The manager's step, so an owner can see whether it has happened. */
  managerStatus: string;
  /** Who the first approval is sitting with, when it has not happened yet. */
  withManager?: string | null;
}

export interface RequestApproval {
  id: string; request_type: string; details: string;
  requester: string; created_at: string;
  /* An attendance correction carries the day and the times it proposes, so the
     approver can see exactly what they are agreeing to and approving can write
     it onto the record. Null on an HR update, and on the free-text corrections
     raised before the form asked for times. */
  attendance_date: string | null;
  proposed_clock_in: string | null;
  proposed_clock_out: string | null;
  attendance_record_id: string | null;
  /** The person whose attendance it is — the record is theirs, not the
   *  requester's login, and the two are different rows. */
  employee_id: string | null;
  user_id: string | null;
  employee_name: string | null;
  employee_location: string | null;
}

export interface MyTask {
  id: string; title: string; details: string | null;
  priority: string; due_date: string | null; assigned_by: string | null;
  url?: string; // deep-link to the source record when the task came from a workflow
}

export interface InboxData {
  myTasks: MyTask[];
  tasks: InboxTask[];
  leaveApprovals: LeaveApproval[];
  /** Owners only: requests still with a manager. Shown to keep the owners in
      the picture, not to ask them for anything — they can still decide
      outright from Leave Tracking, which records the manager's step Skipped. */
  awaitingManager: LeaveApproval[];
  requestApprovals: RequestApproval[];
  isApprover: boolean;
  /** True when this viewer is the store manager giving the first approval. */
  isStoreManager: boolean;
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

/** Names + employee-record ids that identify this account. */
async function myIdentity(user: User, profile: Profile | null): Promise<{ names: Set<string>; empIds: string[] }> {
  const names = new Set<string>();
  if (profile?.full_name) names.add(norm(profile.full_name));
  if (profile?.sales_name) names.add(norm(profile.sales_name)); // cases.staff uses the DSR roster name
  const emp = await safe<{ id: string; full_name: string }>(
    supabase.from('employees').select('id, full_name').eq('user_id', user.id),
  );
  for (const e of emp) if (e.full_name) names.add(norm(e.full_name));
  return { names, empIds: emp.map((e) => e.id) };
}

export async function loadInbox(user: User, profile: Profile | null, role: Role | null): Promise<InboxData> {
  const [ident, content, ads, repairs, collabs, cases, demand] = await Promise.all([
    myIdentity(user, profile),
    safe<any>(supabase.from('content_tasks').select('id, title, owner, status, planned_date')),
    safe<any>(supabase.from('paid_ads').select('id, ad_name, owner, status, end_date')),
    safe<any>(supabase.from('repair_watches').select('id, repair_id, customer_name, assigned_to, status, estimated_completion')),
    safe<any>(supabase.from('influencer_collaborations').select('id, campaign, product_brand, owner, status, posted_date, agreed_date, influencer_id')),
    safe<any>(supabase.from('cases').select('id, case_id, customer_name, staff, status, promised_callback').eq('status', 'Open')),
    safe<any>(supabase.from('waiting_list').select('id, customer_name, staff_responsible, status, list_type, follow_up_date, expected_arrival')),
  ]);
  const { names, empIds } = ident;

  // tasks assigned to this person directly, or to their team (role)
  let myTasks: MyTask[] = [];
  const orParts: string[] = [];
  if (empIds.length > 0) orParts.push(`assignee_employee_id.in.(${empIds.join(',')})`);
  if (role) orParts.push(`assignee_role.eq.${role}`);
  if (orParts.length) {
    const rows = await safe<any>(
      supabase.from('assigned_tasks').select('id, title, details, priority, due_date, assigned_by, status, source_table, source_id')
        .or(orParts.join(',')).eq('status', 'Open').order('due_date', { ascending: true, nullsFirst: false }),
    );
    myTasks = rows.map((r) => ({
      id: r.id, title: r.title, details: r.details, priority: r.priority, due_date: r.due_date, assigned_by: r.assigned_by,
      url: r.source_table === 'limited_projects' && r.source_id ? `#/limited-projects?focus=${r.source_id}` : undefined,
    }));
  }

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
  // The database owns the routing: it knows which workplaces this manager
  // approves for. Asking it keeps one source of truth, and a manager who
  // covers nothing is simply not a first approver.
  let myLocations: string[] = [];
  if (role === 'manager') {
    try {
      const { data } = await supabase.rpc('my_approval_locations');
      myLocations = Array.isArray(data) ? data.filter(Boolean) : [];
    } catch { myLocations = []; }
  }
  const isStoreManager = myLocations.length > 0;
  let leaveApprovals: LeaveApproval[] = [];
  let awaitingManager: LeaveApproval[] = [];
  let requestApprovals: RequestApproval[] = [];

  if (isApprover) {
    const [lv, empRows, req, profRows, scopeRows] = await Promise.all([
      safe<any>(supabase.from('leave_records').select('id, employee_id, leave_type, leave_start, leave_end, days, notes, approval_status, manager_status').eq('approval_status', 'Pending')),
      safe<any>(supabase.from('employees').select('id, full_name, user_id, location')),
      safe<any>(supabase.from('employee_requests').select('id, request_type, details, created_at, user_id, employee_id, status, attendance_date, proposed_clock_in, proposed_clock_out, attendance_record_id').or('status.eq.Pending,status.is.null')),
      safe<any>(supabase.from('profiles').select('id, full_name')),
      safe<any>(supabase.from('manager_scopes').select('manager_id, location')),
    ]);
    const empById = new Map(empRows.map((e) => [e.id, e.full_name]));
    const empLocation = new Map(empRows.map((e) => [e.id, e.location as string | null]));
    // Who a workplace's first approval belongs to — so "with the manager" can
    // name her rather than leaving an owner to guess which manager it means.
    const managerAt = new Map<string, string>();
    for (const sc of scopeRows) {
      const who = profRows.find((p) => p.id === sc.manager_id)?.full_name;
      if (who && sc.location) managerAt.set(sc.location, who);
    }
    const empByUser = new Map(empRows.filter((e) => e.user_id).map((e) => [e.user_id, e.full_name]));
    const profById = new Map(profRows.map((p) => [p.id, p.full_name]));

    // A manager is asked only for the first approval, and only for the people
    // they cover. Filtering on manager_status alone was enough while there was
    // one manager; with a manager per workplace it would have put head office's
    // requests in front of the shops manager and the other way round.
    const asApproval = (l: any): LeaveApproval => ({
      id: l.id, employee_name: empById.get(l.employee_id) ?? 'Unknown',
      leave_type: l.leave_type ?? 'Annual', leave_start: l.leave_start, leave_end: l.leave_end,
      days: Number(l.days), notes: l.notes,
      stage: (isStoreManager ? 'manager' : 'final') as 'manager' | 'final',
      managerStatus: l.manager_status ?? 'Not required',
      withManager: managerAt.get(empLocation.get(l.employee_id) ?? '') ?? null,
    });
    const mine = lv.filter((l) => (isStoreManager
      ? l.manager_status === 'Pending' && myLocations.includes(empLocation.get(l.employee_id) ?? '')
      : role === 'admin'));
    // For an owner, a request still with a manager is news, not a job: listing
    // it beside the ones that are genuinely theirs to decide made every
    // request look equally overdue for their attention.
    leaveApprovals = mine.filter((l) => isStoreManager || l.manager_status !== 'Pending').map(asApproval);
    awaitingManager = isStoreManager ? []
      : mine.filter((l) => l.manager_status === 'Pending').map(asApproval);
    const empByUserRow = new Map(empRows.filter((e) => e.user_id).map((e) => [e.user_id, e]));
    requestApprovals = req.map((r) => {
      const emp = (r.employee_id && empRows.find((e) => e.id === r.employee_id)) || empByUserRow.get(r.user_id) || null;
      return {
        id: r.id, request_type: r.request_type, details: r.details, created_at: r.created_at,
        requester: (r.employee_id && empById.get(r.employee_id)) || empByUser.get(r.user_id) || profById.get(r.user_id) || 'Someone',
        attendance_date: r.attendance_date ?? null,
        proposed_clock_in: r.proposed_clock_in ?? null,
        proposed_clock_out: r.proposed_clock_out ?? null,
        attendance_record_id: r.attendance_record_id ?? null,
        employee_id: r.employee_id ?? null,
        user_id: r.user_id ?? null,
        employee_name: emp?.full_name ?? null,
        employee_location: emp?.location ?? null,
      };
    });
  }

  return { myTasks, tasks, leaveApprovals, awaitingManager, requestApprovals, isApprover, isStoreManager };
}

export function inboxCount(d: InboxData): number {
  return d.myTasks.length + d.tasks.length + d.leaveApprovals.length + d.requestApprovals.length;
}
