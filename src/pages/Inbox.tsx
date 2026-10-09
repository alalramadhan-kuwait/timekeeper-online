import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox as InboxIcon, CheckCircle, Clock, CalendarRange, FileText, Check, X, ChevronRight, ClipboardList, Info, Megaphone, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Spinner, Badge } from '../components/ui';
import { loadInbox, InboxData } from '../lib/inbox';
import RequestQueue from '../components/RequestQueue';
import { MONTHS } from '../lib/dateRange';
import { applyCorrection, isApplicable } from '../lib/attendanceCorrection';
import { CampaignRow, listCampaigns, isCampaignOwner, STAGE_LABEL, STAGE_BADGE } from '../lib/campaigns';
import CampaignPanel from '../components/CampaignPanel';
import CampaignForm from '../components/CampaignForm';

const todayKuwait = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
const kuwaitHM = (iso: string | null) => (!iso ? null : new Intl.DateTimeFormat('en-GB',
  { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)));
const kuwaitDay = (d: string) => new Date(`${d}T12:00:00+03:00`)
  .toLocaleDateString('en-GB', { timeZone: 'Asia/Kuwait', weekday: 'short', day: '2-digit', month: 'short' });

const MODULE_BADGE: Record<string, string> = {
  'Content Planner': 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  'Paid Ads': 'bg-orange-100 text-orange-700 border-orange-200',
  Repairs: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Influencers: 'bg-violet-100 text-violet-700 border-violet-200',
  'Follow-ups': 'bg-blue-100 text-blue-700 border-blue-200',
  'Demand list': 'bg-teal-100 text-teal-700 border-teal-200',
  'Pre-order': 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

export default function InboxPage() {
  const { user, profile, role } = useAuth();
  const [data, setData] = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  // A campaign opens over the Inbox: from its task, the owners' list, or a
  // notification link (#/inbox?campaign=…).
  const campaignId = sp.get('campaign');
  const openCampaign = (id: string | null) => setSp((cur) => {
    const n = new URLSearchParams(cur);
    if (id) n.set('campaign', id); else n.delete('campaign');
    n.delete('n');
    return n;
  });
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [newCampaign, setNewCampaign] = useState(false);
  // A refused approval must say so: the database, not this page, decides who
  // may sign off which half of a leave request.
  const [err, setErr] = useState<string | null>(null);
  const focusId = sp.get('focus');
  // a dashboard card links straight to the tab it counted
  const urlTab = sp.get('tab');
  const initialTab = urlTab === 'waiting' || urlTab === 'done' ? urlTab : undefined;
  // scroll to and highlight the record a notification pointed at
  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`nid-${focusId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, loading, data]);
  const hl = (id: string) => (id === focusId ? 'ring-2 ring-amber-400 rounded-lg' : '');

  async function reload() {
    if (!user) { setLoading(false); return; }
    const [inbox, owner] = await Promise.all([loadInbox(user, profile, role), isCampaignOwner()]);
    setData(inbox);
    setIsOwner(owner);
    // only the owners see the list; the team works from their tasks
    setCampaigns(owner ? await listCampaigns() : null);
    setLoading(false);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id, role]);

  async function markTaskDone(id: string) {
    setBusy(`tk-${id}`);
    await supabase.from('assigned_tasks').update({ status: 'Done' }).eq('id', id);
    await reload(); setBusy(null);
  }

  if (loading) return <Spinner />;
  if (!data) return null;

  const today = todayKuwait();
  const PRIORITY: Record<string, string> = {
    High: 'bg-rose-100 text-rose-700 border-rose-200',
    Medium: 'bg-amber-100 text-amber-700 border-amber-200',
    Low: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const ownerWaiting = (campaigns ?? []).filter((c) => c.is_campaign_owner && c.waiting_on === 'owner').length;
  const total = data.myTasks.length + data.tasks.length + data.leaveApprovals.length + data.requestApprovals.length + ownerWaiting;
  const openCampaigns = (campaigns ?? []).filter((c) => c.stage !== 'done' && c.stage !== 'cancelled');
  const closedCampaigns = (campaigns ?? []).filter((c) => c.stage === 'done' || c.stage === 'cancelled');

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center"><InboxIcon size={20} /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-tight">Inbox</h1>
          <p className="text-sm text-slate-500">Pending items assigned to you{data.isApprover ? ' and awaiting your approval' : ''}.</p>
        </div>
        {total > 0 && <Badge className="ml-auto bg-slate-900 text-white border-slate-900">{total} open</Badge>}
      </div>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
          <span className="flex-1">{err}</span>
          <button onClick={() => setErr(null)} className="text-rose-500 hover:text-rose-700 shrink-0">Dismiss</button>
        </div>
      )}

      {total === 0 && !isOwner && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <CheckCircle size={40} className="mx-auto text-emerald-500 mb-3" />
          <div className="font-semibold text-slate-700">You're all caught up</div>
          <div className="text-sm text-slate-400 mt-1">Nothing is assigned to you right now.</div>
        </div>
      )}

      {/* ── Tasks assigned to me by a manager ── */}
      {data.myTasks.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <ClipboardList size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">My tasks</h2>
            <Badge className="bg-slate-100 text-slate-600 border-slate-200">{data.myTasks.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.myTasks.map((t) => {
              const overdue = !!t.due_date && t.due_date < today;
              return (
                <li key={t.id} id={`nid-${t.id}`} className={`px-5 py-3 flex flex-wrap items-start gap-3 ${hl(t.id)}`}>
                  <div className={`min-w-0 flex-1 ${t.url || t.campaignId ? 'cursor-pointer' : ''}`}
                    onClick={() => (t.campaignId ? openCampaign(t.campaignId) : t.url && navigate(t.url.replace(/^#/, '')))}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{t.title}</span>
                      <Badge className={PRIORITY[t.priority] ?? PRIORITY.Medium}>{t.priority}</Badge>
                      {t.url && <span className="text-xs text-blue-600">Open →</span>}
                    </div>
                    {t.details && <p className="text-sm text-slate-500 mt-0.5">{t.details}</p>}
                    <div className="text-xs text-slate-400 mt-0.5">
                      {t.assigned_by ? `From ${t.assigned_by}` : 'Assigned'}
                      {t.due_date && <> · <span className={overdue ? 'text-rose-600 font-medium' : ''}>{overdue ? 'Overdue ' : 'Due '}{t.due_date}</span></>}
                    </div>
                  </div>
                  {/* a campaign task closes itself when the campaign does */}
                  {t.campaignId ? (
                    <button onClick={() => openCampaign(t.campaignId!)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"><Megaphone size={13} /> Open campaign</button>
                  ) : (
                  <button disabled={busy === `tk-${t.id}`} onClick={() => markTaskDone(t.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1"><Check size={13} /> Mark done</button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Marketing campaigns: the owners' view of every campaign ── */}
      {isOwner && campaigns && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <Megaphone size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Marketing campaigns</h2>
            {openCampaigns.length > 0 && <Badge className="bg-slate-100 text-slate-600 border-slate-200">{openCampaigns.length}</Badge>}
            <button onClick={() => setNewCampaign(true)}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1">
              <Plus size={13} /> New campaign</button>
          </div>
          {campaigns.length === 0 && <p className="px-5 py-4 text-sm text-slate-500">No campaigns yet.</p>}
          <ul className="divide-y divide-slate-100">
            {[...openCampaigns, ...closedCampaigns.slice(0, 5)].map((c) => {
              const mineToReview = c.is_campaign_owner && c.waiting_on === 'owner';
              return (
                <li key={c.id}>
                  <button onClick={() => openCampaign(c.id)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{c.title}</span>
                        <Badge className={STAGE_BADGE[c.stage]}>{STAGE_LABEL[c.stage]}</Badge>
                        {mineToReview && <Badge className="bg-amber-400 text-amber-950 border-amber-400">{c.stage === 'in_review' ? 'Your review' : 'Close it'}</Badge>}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {c.objective_label} · {c.assignee_name} · owner {c.campaign_owner_name}
                        {c.stage !== 'done' && c.stage !== 'cancelled' && <> · <span className={c.overdue ? 'text-rose-600 font-medium' : ''}>{c.overdue ? 'Overdue ' : 'Due '}{c.deadline}</span></>}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Assigned to me (from modules) ── */}
      {data.tasks.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
            <Clock size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Assigned to me</h2>
            <Badge className="bg-slate-100 text-slate-600 border-slate-200">{data.tasks.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.tasks.map((t) => {
              const overdue = !!t.due && t.due < today;
              return (
                <li key={t.key}>
                  <button onClick={() => navigate(t.link)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 transition-colors">
                    <Badge className={MODULE_BADGE[t.module] ?? 'bg-slate-100 text-slate-600 border-slate-200'}>{t.module}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{t.title}</div>
                      <div className="text-xs text-slate-400">{t.status}</div>
                    </div>
                    {t.due && (
                      <span className={`text-xs font-medium shrink-0 ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                        {overdue ? 'Overdue · ' : 'Due '}{t.due}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Every request, in three tabs ──
           Leave, corrections, HR updates and schedule changes were three
           separate lists with three ideas of what a request was. One queue now,
           and which tab a row sits in is decided in the database. */}
      {data.isApprover && <RequestQueue role={role} userId={user?.id ?? null} focusId={focusId} initialTab={initialTab} />}

      {campaignId && <CampaignPanel key={campaignId} id={campaignId} onClose={() => openCampaign(null)} onChanged={reload} />}
      {newCampaign && user && (
        <CampaignForm myId={user.id} onClose={() => setNewCampaign(false)}
          onCreated={(id) => { setNewCampaign(false); reload(); openCampaign(id); }} />
      )}
    </div>
  );
}
