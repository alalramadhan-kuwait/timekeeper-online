import { supabase } from './supabase';

// ── Marketing campaigns, as the Inbox shows them. ──
// Every write goes through campaign_create / campaign_act in the database,
// which decide who may do what; the buttons shown are the database's own
// next_actions list, so nothing here repeats the rules.

export type Objective = 'slow_stock' | 'new_arrivals' | 'best_seller' | 'brand_awareness';
export type Stage = 'assigned' | 'working' | 'in_review' | 'approved' | 'posted' | 'done' | 'cancelled';
export type ApprovalStatus = 'not_submitted' | 'awaiting' | 'changes_requested' | 'approved';
export type ArrivalBasis = 'lightspeed_receiving' | 'first_detected' | 'estimated_from_creation' | null;
export type CampaignAction = 'pick_up' | 'add_draft' | 'add_reference' | 'comment' | 'submit' | 'approve'
  | 'request_changes' | 'confirm_published' | 'complete' | 'cancel' | 'hand_over' | 'move_deadline';

export interface CampaignProduct {
  product_id: string; name: string; brand: string | null;
  arrived_on: string | null; arrival_basis: ArrivalBasis;
}

export interface CampaignFile {
  id: string; version: number; kind: 'draft' | 'reference';
  storage_path: string | null; file_name: string | null; mime: string | null; size_bytes: number | null;
  caption_text: string | null; uploaded_by: string; uploaded_at: string;
  decision: 'none' | 'under_review' | 'approved' | 'changes_requested';
  decided_by: string | null; decided_at: string | null;
}

export interface CampaignEvent {
  at: string; who: string; action: string; from_stage: string | null; to_stage: string;
  note: string | null; detail: Record<string, unknown>;
}

export interface Campaign {
  id: string; title: string; objective: Objective; objective_label: string;
  target_value: number; target_unit: string; window_days: number;
  brand: string | null; products: CampaignProduct[]; channels: string[];
  offer: string; offer_pct: number | null; content_kind: string | null;
  priority: string; deadline: string; budget_cap_kd: number | null; brief: string | null;
  stage: Stage; approval_status: ApprovalStatus;
  campaign_owner: string; campaign_owner_name: string;
  assignee_employee_id: string | null; assignee_name: string | null;
  post_links: string[]; lesson: string | null; created_at: string; updated_at: string;
  overdue: boolean;
  viewer: { is_owner: boolean; is_campaign_owner: boolean; is_assignee: boolean };
  next_actions: CampaignAction[];
  execution: {
    assigned_at: string; picked_up_at: string | null; first_submitted_at: string | null;
    approved_at: string | null; published_at: string | null; published_confirmed_at: string | null;
    completed_at: string | null; cancelled_at: string | null;
    pickup_hours: number | null; first_draft_days_vs_deadline: number | null; first_draft_on_time: boolean | null;
    revision_rounds: number; hours_with_owner: number | null;
    approval_to_publication_hours: number | null; days_assigned_to_completed: number | null;
  };
  performance: {
    status: 'not_published' | 'window_running' | 'window_closed';
    after_window_from: string | null; after_window_to: string | null; results_open_on: string | null; note: string;
  };
  files: CampaignFile[];
  history: CampaignEvent[];
}

export interface CampaignRow {
  id: string; title: string; objective: Objective; objective_label: string;
  stage: Stage; approval_status: ApprovalStatus; deadline: string; priority: string;
  campaign_owner_name: string; is_campaign_owner: boolean; assignee_name: string;
  overdue: boolean; waiting_on: 'owner' | 'team' | 'nobody'; updated_at: string;
}

export interface FormProduct extends CampaignProduct {
  retail_price: number | null; on_hand: number | null; units_90d: number | null; class: string | null;
  misfit: string | null;
}

export interface FormOptions {
  objectives: { objective: Objective; label: string; target_units: string[]; default_window_days: number;
    min_window_days: number; exception_note: string | null }[];
  owners: { user_id: string; name: string }[];
  team: { employee_id: string; name: string; job_title: string | null; open_campaigns: number; next_deadline: string | null }[];
  brands: string[];
  products: FormProduct[];
}

export const STAGE_LABEL: Record<Stage, string> = {
  assigned: 'Assigned', working: 'In progress', in_review: 'Awaiting review', approved: 'Approved — to post',
  posted: 'Posted', done: 'Done', cancelled: 'Cancelled',
};
export const STAGE_BADGE: Record<Stage, string> = {
  assigned: 'bg-slate-100 text-slate-700 border-slate-200',
  working: 'bg-blue-100 text-blue-700 border-blue-200',
  in_review: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  posted: 'bg-violet-100 text-violet-700 border-violet-200',
  done: 'bg-slate-800 text-white border-slate-800',
  cancelled: 'bg-rose-50 text-rose-600 border-rose-200',
};
export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  not_submitted: 'Not sent yet', awaiting: 'Waiting for approval',
  changes_requested: 'Changes requested', approved: 'Approved',
};
export const UNIT_LABEL: Record<string, string> = {
  units: 'units sold', products_first_sale: 'products with a first sale', retail_revenue_kd: 'KD at retail',
  reach: 'reach', saves: 'saves', profile_visits: 'profile visits',
};
export const CHANNEL_LABEL: Record<string, string> = {
  instagram_post: 'Instagram post', instagram_reel: 'Instagram reel', instagram_story: 'Instagram story',
  whatsapp_broadcast: 'WhatsApp broadcast', in_store_display: 'In-store display', paid_boost: 'Paid boost (proposal only)',
};
export const CONTENT_LABEL: Record<string, string> = {
  product_photo: 'Product photo', lifestyle_photo: 'Lifestyle photo', video: 'Video', wrist_shot: 'Wrist shot', carousel: 'Carousel',
};
export const OFFER_LABEL: Record<string, string> = { none: 'No offer', gift: 'Gift with purchase', discount: 'Discount', bundle: 'Bundle' };
/** How sure we are a product is new: receiving beats first sight beats the creation date. */
export const ARRIVAL_LABEL: Record<string, string> = {
  lightspeed_receiving: 'received in Lightspeed',
  first_detected: 'first seen received',
  estimated_from_creation: 'estimate: created in Lightspeed',
};
export const ACTION_LABEL: Record<CampaignAction, string> = {
  pick_up: 'Start working on it', add_draft: 'Upload a draft', add_reference: 'Add a reference', comment: 'Comment',
  submit: 'Send for review', approve: 'Approve', request_changes: 'Ask for changes',
  confirm_published: 'Confirm it is posted', complete: 'Close with a lesson', cancel: 'Cancel campaign',
  hand_over: 'Hand to another owner', move_deadline: 'Move the deadline',
};
export const EVENT_LABEL: Record<string, string> = {
  created: 'Created', assigned: 'Assigned', picked_up: 'Started', file_added: 'Added a file', comment: 'Commented',
  submitted: 'Sent for review', changes_requested: 'Asked for changes', approved: 'Approved', published: 'Confirmed posted',
  completed: 'Closed', cancelled: 'Cancelled', handed_over: 'Handed over', deadline_moved: 'Moved the deadline',
  reminded: 'Reminder',
};

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const FILE_TYPES = 'image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,application/pdf';

/** The database's own message, without the Postgres wrapping. */
const why = (e: { message?: string } | null) => (e?.message ?? 'Something went wrong').replace(/^.*?ERROR:\s*/, '');

export async function isCampaignOwner(): Promise<boolean> {
  const { data, error } = await supabase.rpc('mkt_is_owner');
  return !error && data === true;
}

/** Null when campaigns are not available (yet) to this account. */
export async function listCampaigns(): Promise<CampaignRow[] | null> {
  const { data, error } = await supabase.rpc('campaign_list');
  return error ? null : ((data as CampaignRow[]) ?? []);
}

export async function loadCampaign(id: string): Promise<{ campaign?: Campaign; error?: string }> {
  const { data, error } = await supabase.rpc('campaign_detail', { p_campaign: id });
  return error ? { error: why(error) } : { campaign: data as Campaign };
}

export async function act(id: string, action: CampaignAction | 'add_file', p: Record<string, unknown> = {}):
  Promise<{ campaign?: Campaign; error?: string }> {
  const { data, error } = await supabase.rpc('campaign_act', { p_campaign: id, p_action: action, p });
  return error ? { error: why(error) } : { campaign: data as Campaign };
}

/** Upload to the private store, then record it as the next version. */
export async function addFile(id: string, kind: 'draft' | 'reference', file: File | null, caption: string, note: string):
  Promise<{ campaign?: Campaign; error?: string }> {
  let path: string | null = null;
  if (file) {
    if (file.size > MAX_FILE_BYTES) return { error: 'That file is larger than 25 MB' };
    const safe = file.name.replace(/[^\w.-]+/g, '_');
    path = `${id}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from('campaign-files').upload(path, file, { contentType: file.type || undefined });
    if (error) return { error: `Could not upload: ${error.message}` };
  }
  return act(id, 'add_file', {
    kind, storage_path: path, file_name: file?.name ?? null, mime: file?.type || null, size_bytes: file?.size ?? null,
    caption_text: caption, note,
  });
}

/** Files are private; each view gets a link that lasts five minutes. */
export async function fileUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('campaign-files').createSignedUrl(path, 300);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

export async function formOptions(objective?: string | null, brand?: string | null, search?: string | null):
  Promise<{ options?: FormOptions; error?: string }> {
  const { data, error } = await supabase.rpc('campaign_form_options', {
    p_objective: objective || null, p_brand: brand || null, p_search: search || null,
  });
  return error ? { error: why(error) } : { options: data as FormOptions };
}

export async function createCampaign(p: Record<string, unknown>): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('campaign_create', { p });
  return error ? { error: why(error) } : { id: data as string };
}
