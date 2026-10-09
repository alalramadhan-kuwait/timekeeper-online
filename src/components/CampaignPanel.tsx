import { useEffect, useState } from 'react';
import { Check, FileText, Image as ImageIcon, Film, Paperclip, MessageSquare, Clock, Target, ExternalLink, BarChart3 } from 'lucide-react';
import { Modal, Badge, Spinner } from './ui';
import {
  Campaign, CampaignAction, CampaignFile, loadCampaign, act, addFile, fileUrl, formOptions,
  STAGE_LABEL, STAGE_BADGE, APPROVAL_LABEL, UNIT_LABEL, CHANNEL_LABEL, CONTENT_LABEL, OFFER_LABEL,
  ARRIVAL_LABEL, ACTION_LABEL, EVENT_LABEL, FILE_TYPES,
} from '../lib/campaigns';

const KW = 'Asia/Kuwait';
const day = (d: string | null) => (!d ? '' : new Date(d.length === 10 ? `${d}T12:00:00+03:00` : d)
  .toLocaleDateString('en-GB', { timeZone: KW, day: 'numeric', month: 'short' }));
const when = (iso: string | null) => (!iso ? '' : new Date(iso)
  .toLocaleString('en-GB', { timeZone: KW, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }));
/** Now, as a datetime-local value in Kuwait time. */
const nowLocal = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16);
const hours = (h: number | null) => (h == null ? '' : h < 1 ? 'under an hour' : h < 24 ? `${Math.round(h)} h` : `${Math.round(h / 24 * 10) / 10} days`);

/** Actions that need something written or chosen before they go. */
const NEEDS_FORM: CampaignAction[] = ['add_draft', 'add_reference', 'comment', 'request_changes', 'confirm_published',
  'complete', 'cancel', 'hand_over', 'move_deadline'];
/** The one or two things the stage is waiting for, shown large; the rest sit below. */
const PRIMARY: CampaignAction[] = ['pick_up', 'add_draft', 'submit', 'approve', 'request_changes', 'confirm_published', 'complete'];

const DECISION: Record<CampaignFile['decision'], [string, string]> = {
  none: ['Not sent', 'bg-slate-100 text-slate-600 border-slate-200'],
  under_review: ['Under review', 'bg-amber-100 text-amber-800 border-amber-200'],
  approved: ['Approved', 'bg-emerald-100 text-emerald-700 border-emerald-200'],
  changes_requested: ['Changes asked', 'bg-rose-100 text-rose-700 border-rose-200'],
};

export default function CampaignPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: () => void }) {
  const [c, setC] = useState<Campaign | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<CampaignAction | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    loadCampaign(id).then((r) => { if (!live) return; if (r.campaign) setC(r.campaign); else setErr(r.error ?? 'Campaign not found'); });
    return () => { live = false; };
  }, [id]);

  async function run(action: CampaignAction, p: Record<string, unknown> = {}, file?: File | null) {
    setBusy(true); setErr(null);
    const r = action === 'add_draft' || action === 'add_reference'
      ? await addFile(id, action === 'add_draft' ? 'draft' : 'reference', file ?? null, String(p.caption_text ?? ''), String(p.note ?? ''))
      : await act(id, action, p);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setC(r.campaign!); setOpen(null); onChanged?.();
  }

  function press(a: CampaignAction) {
    if (NEEDS_FORM.includes(a)) setOpen(open === a ? null : a);
    else run(a);
  }

  return (
    <Modal title={c?.title ?? 'Campaign'} onClose={onClose}>
      {!c && !err && <Spinner />}
      {!c && err && <p className="text-sm text-rose-600">{err}</p>}
      {c && (
        <div className="space-y-6">
          {/* ── Where it stands ── */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={STAGE_BADGE[c.stage]}>{STAGE_LABEL[c.stage]}</Badge>
              {c.stage !== 'done' && c.stage !== 'cancelled' && c.approval_status !== 'not_submitted' &&
                <Badge className="bg-white text-slate-600 border-slate-200">{APPROVAL_LABEL[c.approval_status]}</Badge>}
              <Badge className="bg-white text-slate-600 border-slate-200">{c.objective_label}</Badge>
              {c.priority !== 'Normal' && <Badge className="bg-white text-slate-600 border-slate-200">{c.priority}</Badge>}
            </div>
            <div className="text-sm text-slate-600">
              Draft due <span className={c.overdue ? 'text-rose-600 font-semibold' : 'font-medium text-slate-800'}>{day(c.deadline)}{c.overdue ? ' · overdue' : ''}</span>
              {' · '}with {c.assignee_name ?? 'the marketing team'}{' · '}owner {c.campaign_owner_name}
            </div>
          </div>

          {/* ── What happens next ── */}
          {c.next_actions.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {c.next_actions.some((a) => PRIMARY.includes(a)) ? 'Next step' : c.stage === 'done' || c.stage === 'cancelled' ? 'Add a note' : 'Meanwhile'}
              </div>
              <div className="flex flex-wrap gap-2">
                {c.next_actions.filter((a) => PRIMARY.includes(a)).map((a) => (
                  <button key={a} disabled={busy} onClick={() => press(a)}
                    className={`px-3.5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                      a === 'request_changes' ? 'bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-300'
                        : open === a ? 'bg-slate-700 text-white focus-visible:ring-slate-400'
                        : 'bg-slate-900 text-white hover:bg-slate-700 focus-visible:ring-slate-400'}`}>
                    {ACTION_LABEL[a]}
                  </button>
                ))}
              </div>
              {c.next_actions.some((a) => !PRIMARY.includes(a)) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {c.next_actions.filter((a) => !PRIMARY.includes(a)).map((a) => (
                    <button key={a} disabled={busy} onClick={() => press(a)}
                      className={`text-sm hover:underline disabled:opacity-50 ${a === 'cancel' ? 'text-rose-600' : 'text-blue-700'} ${open === a ? 'font-semibold' : ''}`}>
                      {ACTION_LABEL[a]}
                    </button>
                  ))}
                </div>
              )}
              {open && <ActionForm key={open} action={open} c={c} busy={busy} onRun={run} onCancel={() => setOpen(null)} />}
              {err && <p className="text-sm text-rose-600">{err}</p>}
            </section>
          )}
          {c.next_actions.length === 0 && err && <p className="text-sm text-rose-600">{err}</p>}

          <Brief c={c} />
          <Files c={c} />
          <Execution c={c} />
          <Performance c={c} />
          <History c={c} />
        </div>
      )}
    </Modal>
  );
}

/* ── The small form behind an action that needs input ── */
function ActionForm({ action, c, busy, onRun, onCancel }: {
  action: CampaignAction; c: Campaign; busy: boolean;
  onRun: (a: CampaignAction, p?: Record<string, unknown>, file?: File | null) => void; onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [at, setAt] = useState(nowLocal());
  const [links, setLinks] = useState('');
  const [lesson, setLesson] = useState(c.lesson ?? '');
  const [deadline, setDeadline] = useState(c.deadline);
  const [owners, setOwners] = useState<{ user_id: string; name: string }[]>([]);
  const [owner, setOwner] = useState('');

  useEffect(() => {
    if (action !== 'hand_over') return;
    formOptions().then((r) => setOwners((r.options?.owners ?? []).filter((o) => o.user_id !== c.campaign_owner)));
  }, [action, c.campaign_owner]);

  const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';
  const isFile = action === 'add_draft' || action === 'add_reference';
  const offlineOnly = c.channels.every((ch) => ch === 'in_store_display' || ch === 'whatsapp_broadcast');

  function go() {
    switch (action) {
      case 'add_draft': case 'add_reference': return onRun(action, { caption_text: caption, note }, file);
      case 'confirm_published': return onRun(action, {
        published_at: new Date(`${at}:00+03:00`).toISOString(),
        links: links.split(/\s+/).map((l) => l.trim()).filter(Boolean), note });
      case 'complete': return onRun(action, { lesson, note });
      case 'hand_over': return onRun(action, { campaign_owner: owner, note });
      case 'move_deadline': return onRun(action, { deadline, note });
      default: return onRun(action, { note });
    }
  }

  const noteLabel: Partial<Record<CampaignAction, string>> = {
    request_changes: 'What should change', cancel: 'Why it is cancelled', comment: 'Comment',
    move_deadline: 'Why the deadline moves', add_draft: 'Note for the owner (optional)',
    add_reference: 'Note (optional)', confirm_published: 'Note (optional)', complete: 'Note (optional)',
    hand_over: 'Note (optional)',
  };

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      {isFile && (
        <>
          <label className="block text-sm">
            <span className="text-slate-600">{action === 'add_draft' ? 'Draft file — image, video or PDF, up to 25 MB' : 'Reference file'}</span>
            <input id="campaign-file" type="file" accept={FILE_TYPES} onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-white" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Caption {action === 'add_draft' ? '(the post text, if there is one)' : '(optional)'}</span>
            <textarea id="campaign-caption" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} className={`${field} mt-1`} />
          </label>
        </>
      )}
      {action === 'confirm_published' && (
        <>
          <label className="block text-sm">
            <span className="text-slate-600">When it actually went out</span>
            <input id="campaign-published-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Link to the post{offlineOnly ? ' (optional for in-store and WhatsApp)' : ''}</span>
            <textarea id="campaign-links" rows={2} value={links} onChange={(e) => setLinks(e.target.value)}
              placeholder="https://www.instagram.com/p/…" className={`${field} mt-1`} />
          </label>
          <p className="text-xs text-slate-500">Post it yourself first. This only records that it is out — nothing is published from here.</p>
        </>
      )}
      {action === 'complete' && (
        <label className="block text-sm">
          <span className="text-slate-600">What did we learn? (kept in the campaign history)</span>
          <textarea id="campaign-lesson" rows={3} maxLength={500} value={lesson} onChange={(e) => setLesson(e.target.value)} className={`${field} mt-1`} />
        </label>
      )}
      {action === 'move_deadline' && (
        <label className="block text-sm">
          <span className="text-slate-600">New draft deadline</span>
          <input id="campaign-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`${field} mt-1`} />
        </label>
      )}
      {action === 'hand_over' && (
        <label className="block text-sm">
          <span className="text-slate-600">New campaign owner</span>
          <select id="campaign-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={`${field} mt-1`}>
            <option value="">Choose…</option>
            {owners.map((o) => <option key={o.user_id} value={o.user_id}>{o.name}</option>)}
          </select>
        </label>
      )}
      <label className="block text-sm">
        <span className="text-slate-600">{noteLabel[action] ?? 'Note'}</span>
        <textarea id="campaign-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-1`} />
      </label>
      <div className="flex gap-2">
        <button disabled={busy} onClick={go}
          className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
          {busy ? 'Saving…' : ACTION_LABEL[action]}
        </button>
        <button disabled={busy} onClick={onCancel} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Not now</button>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">{icon}{title}</h3>
      {children}
    </section>
  );
}

function Brief({ c }: { c: Campaign }) {
  const target = `${Number(c.target_value).toLocaleString('en-GB')} ${UNIT_LABEL[c.target_unit] ?? c.target_unit.replace(/_/g, ' ')}`;
  return (
    <Section icon={<Target size={15} className="text-slate-500" />} title="Brief">
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-slate-500">Target</dt>
        <dd className="text-slate-800">{target} in the {c.window_days} days after it goes out</dd>
        <dt className="text-slate-500">Channels</dt>
        <dd className="text-slate-800">{c.channels.map((ch) => CHANNEL_LABEL[ch] ?? ch).join(', ')}</dd>
        {c.content_kind && <><dt className="text-slate-500">Content</dt><dd className="text-slate-800">{CONTENT_LABEL[c.content_kind] ?? c.content_kind}</dd></>}
        {c.offer !== 'none' && <><dt className="text-slate-500">Offer</dt><dd className="text-slate-800">{OFFER_LABEL[c.offer]}{c.offer_pct ? ` · ${c.offer_pct}%` : ''}</dd></>}
        {c.budget_cap_kd != null && <><dt className="text-slate-500">Budget cap</dt>
          <dd className="text-slate-800">{c.budget_cap_kd} KD <span className="text-slate-500">· recorded only; nothing is spent from here</span></dd></>}
        {c.brand && <><dt className="text-slate-500">Brand</dt><dd className="text-slate-800">{c.brand}</dd></>}
      </dl>
      {c.brief && <p className="text-sm text-slate-700 whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-100 p-3">{c.brief}</p>}
      {c.products.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {c.products.map((p) => (
            <li key={p.product_id} className="px-3 py-2 text-sm">
              <div className="font-medium text-slate-800">{p.name}</div>
              <div className="text-xs text-slate-500">
                {p.brand}
                {c.objective === 'new_arrivals' && p.arrived_on && (
                  <> · arrived {day(p.arrived_on)}{' '}
                    <span className={p.arrival_basis === 'estimated_from_creation' ? 'text-amber-700' : ''}>
                      ({ARRIVAL_LABEL[p.arrival_basis ?? ''] ?? 'no record'})
                    </span></>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Files({ c }: { c: Campaign }) {
  const [opening, setOpening] = useState<string | null>(null);
  // pictures show in place, so a review can be done from the phone without opening each file
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    const images = c.files.filter((f) => f.storage_path && f.mime?.startsWith('image/') && f.mime !== 'image/heic');
    Promise.all(images.map(async (f) => [f.id, await fileUrl(f.storage_path!)] as const)).then((pairs) => {
      if (live) setThumbs(Object.fromEntries(pairs.filter(([, u]) => u)) as Record<string, string>);
    });
    return () => { live = false; };
  }, [c.files]);
  async function view(f: CampaignFile) {
    if (!f.storage_path) return;
    // open the tab inside the tap, so iPhone Safari does not block it
    const w = window.open('', '_blank');
    setOpening(f.id);
    const url = await fileUrl(f.storage_path);
    setOpening(null);
    if (url && w) w.location.href = url; else w?.close();
  }
  if (c.files.length === 0) return (
    <Section icon={<Paperclip size={15} className="text-slate-500" />} title="Drafts and files">
      <p className="text-sm text-slate-500">Nothing uploaded yet.</p>
    </Section>
  );
  return (
    <Section icon={<Paperclip size={15} className="text-slate-500" />} title="Drafts and files">
      <ul className="space-y-2">
        {[...c.files].reverse().map((f) => {
          const Icon = f.mime?.startsWith('image/') ? ImageIcon : f.mime?.startsWith('video/') ? Film : FileText;
          return (
            <li key={f.id} className="rounded-lg border border-slate-200 p-3 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-800">Version {f.version}</span>
                <span className="text-slate-500">{f.kind === 'draft' ? 'draft' : 'reference'}</span>
                {f.kind === 'draft' && <Badge className={DECISION[f.decision][1]}>{DECISION[f.decision][0]}</Badge>}
              </div>
              {f.storage_path && (
                <button onClick={() => view(f)} className="flex items-center gap-1.5 text-blue-700 hover:underline text-left break-all">
                  <Icon size={14} className="shrink-0" />{opening === f.id ? 'Opening…' : f.file_name ?? 'Open file'}
                </button>
              )}
              {thumbs[f.id] && (
                <button onClick={() => view(f)} className="block" aria-label={`Open version ${f.version} full size`}>
                  <img src={thumbs[f.id]} alt={`Version ${f.version}`} loading="lazy"
                    className="max-h-80 max-w-full rounded-md border border-slate-200 bg-slate-50 object-contain" />
                </button>
              )}
              {f.caption_text && <p className="text-slate-700 whitespace-pre-wrap">{f.caption_text}</p>}
              <div className="text-xs text-slate-400">
                {f.uploaded_by} · {when(f.uploaded_at)}
                {f.decided_at && <> · {f.decision === 'approved' ? 'approved' : 'changes asked'} by {f.decided_by} {when(f.decided_at)}</>}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The work itself: how long each step took. Kept apart from the results. */
function Execution({ c }: { c: Campaign }) {
  const e = c.execution;
  const late = e.first_draft_days_vs_deadline;
  const steps: [string, string | null, string?][] = [
    ['Assigned', e.assigned_at],
    ['Started', e.picked_up_at, e.pickup_hours != null ? `${hours(e.pickup_hours)} after assigning` : undefined],
    ['First draft sent', e.first_submitted_at, late == null ? undefined : late <= 0 ? 'on time' : `${late} day${late === 1 ? '' : 's'} late`],
    ['Approved', e.approved_at, e.approved_at ? (e.revision_rounds === 0 ? 'first time' : `after ${e.revision_rounds} round${e.revision_rounds === 1 ? '' : 's'} of changes`) : undefined],
    ['Went out', e.published_at, e.approval_to_publication_hours != null ? `${hours(e.approval_to_publication_hours)} after approval` : undefined],
    ['Closed', e.completed_at, e.days_assigned_to_completed == null ? undefined
      : e.days_assigned_to_completed === 0 ? 'same day as assigned' : `${e.days_assigned_to_completed} day${e.days_assigned_to_completed === 1 ? '' : 's'} in all`],
  ];
  if (e.cancelled_at) steps.push(['Cancelled', e.cancelled_at]);
  return (
    <Section icon={<Clock size={15} className="text-slate-500" />} title="The work">
      <ol className="relative ml-1.5 border-l border-slate-200 space-y-2.5">
        {steps.map(([label, at, sub]) => (
          <li key={label} className="pl-4 relative text-sm">
            <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${at ? 'bg-emerald-500' : 'bg-white border border-slate-300'}`} />
            <span className={at ? 'text-slate-800' : 'text-slate-400'}>{label}</span>
            {at && <span className="text-slate-500"> · {when(at)}</span>}
            {at && sub && <span className="text-slate-500"> · {sub}</span>}
          </li>
        ))}
      </ol>
      {e.hours_with_owner != null && <p className="text-xs text-slate-500">Time waiting for review: {hours(e.hours_with_owner)}</p>}
      {c.post_links.length > 0 && (
        <ul className="text-sm space-y-1">
          {c.post_links.map((l) => (
            <li key={l}><a href={l} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline break-all">
              <ExternalLink size={13} className="shrink-0" />{l}</a></li>
          ))}
        </ul>
      )}
      {c.lesson && <p className="text-sm text-slate-700"><span className="text-slate-500">Lesson: </span>{c.lesson}</p>}
    </Section>
  );
}

/** Results come later and separately; until then, say when. */
function Performance({ c }: { c: Campaign }) {
  const p = c.performance;
  const text = p.status === 'not_published'
    ? `Results are measured over the ${c.window_days} days after it goes out, against the ${c.window_days} days before.`
    : p.status === 'window_running'
      ? `Measuring ${day(p.after_window_from)} – ${day(p.after_window_to)}. Results open on ${day(p.results_open_on)}.`
      : `The ${c.window_days}-day window closed on ${day(p.after_window_to)}.`;
  return (
    <Section icon={<BarChart3 size={15} className="text-slate-500" />} title="Results">
      <p className="text-sm text-slate-700">{text}</p>
      <p className="text-xs text-slate-500">
        Sales are compared before and after, with stock levels alongside — a change in sales is not proof the campaign caused it.
      </p>
    </Section>
  );
}

function History({ c }: { c: Campaign }) {
  return (
    <Section icon={<MessageSquare size={15} className="text-slate-500" />} title="History">
      <ul className="space-y-2">
        {[...c.history].reverse().map((h, i) => (
          <li key={i} className="text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-slate-800">{h.who}</span>
              <span className="text-slate-600">{EVENT_LABEL[h.action] ?? h.action}
                {h.action === 'file_added' && h.detail?.version ? ` (version ${h.detail.version})` : ''}
                {(h.action === 'submitted' || h.action === 'approved' || h.action === 'changes_requested') && h.detail?.version ? ` version ${h.detail.version}` : ''}
              </span>
              <span className="text-xs text-slate-400">{when(h.at)}</span>
            </div>
            {h.note && <p className="text-slate-600 whitespace-pre-wrap">{h.note}</p>}
          </li>
        ))}
      </ul>
      {c.stage === 'done' && <p className="flex items-center gap-1 text-xs text-emerald-700"><Check size={13} /> Closed.</p>}
    </Section>
  );
}
