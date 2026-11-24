import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, TrendingUp, Hourglass, Truck, Handshake,
  Users, CalendarRange, LogOut, Watch, Menu, Contact, Settings, Gem, ClipboardCheck, PhoneCall, Boxes, History, UserRound, Wrench, Instagram, Megaphone, Target, Sparkles, Gauge, Inbox, ClipboardList, ChevronDown, BellRing, Bell, Download, Share, Wallet, Landmark, Scale, BarChart3, type LucideIcon,
} from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth, Role } from '../context/AuthContext';
import { logActivity } from '../lib/activity';
import { loadInbox, inboxCount } from '../lib/inbox';
import { unreadNotificationCount, markNotificationsRead } from '../lib/notifications';
import { getInstallPrompt, promptInstall, isStandalone, isIos } from '../lib/pwaInstall';
import { supabase } from '../lib/supabase';
import { X as CloseIcon } from 'lucide-react';
import { VersionChip } from './WhatsNew';
import AskMohammed, { AskMohammedButton } from './AskMohammed';
import { Spinner } from './ui';
import { useScrollMemory } from '../lib/scrollMemory';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /* Shown only to the owners on stock_ai_access, whatever their role. */
  owners?: boolean;
  /* Left out of the phone's menu, where the top bar already offers it. */
  wideOnly?: boolean;
  roles: Role[];
}

interface NavGroup {
  title: string | null; // null = no header (top-level)
  items: NavItem[];
}

/* The menu, reorganised on 14 Nov 2026 (duplication audit, phase 3): one section
   per kind of work, the owners' pages together, and Settings on its own. Paths
   did not change except Owner view (/owner → /money); old links redirect. */
const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      // admin and manager land on the manager's day; everyone else on their role's dashboard
      { to: '/', label: 'Today', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff', 'hr', 'viewer', 'sales', 'operations'] },
      { to: '/inbox', label: 'Inbox', icon: Inbox, roles: ['admin', 'manager', 'staff', 'hr', 'viewer', 'sales', 'operations'] },
      { to: '/me', label: 'My Portal', icon: UserRound, roles: ['admin', 'manager', 'staff', 'hr', 'viewer', 'sales', 'operations'] },
      // the phone's top bar already has the bell, so this row is for wide screens only
      { to: '/notifications', label: 'Notifications', icon: Bell, wideOnly: true, roles: ['admin', 'manager', 'staff', 'hr', 'viewer', 'sales', 'operations', 'marketing'] },
    ],
  },
  {
    title: 'Sales & customers',
    items: [
      // till revenue by outlet and day against the target; who may open it follows /sales (canAccessPath)
      { to: '/till-sales', label: 'Till sales', icon: BarChart3, roles: [] },
      // what the shop teams log in the DSR: visits, lost sales and the sales they note down (till revenue is Till sales)
      { to: '/sales', label: 'Visits & lost sales', icon: TrendingUp, roles: ['admin', 'manager', 'staff', 'viewer', 'sales'] },
      { to: '/crm', label: 'Customers', icon: Contact, roles: ['admin', 'manager', 'staff', 'viewer', 'sales'] },
      { to: '/follow-ups', label: 'Follow-ups', icon: PhoneCall, roles: ['admin', 'manager', 'staff', 'viewer', 'sales'] },
      { to: '/waiting-list', label: 'Demand list', icon: Hourglass, roles: ['admin', 'manager', 'staff', 'viewer', 'sales', 'operations'] },
    ],
  },
  {
    title: 'Stock & suppliers',
    items: [
      { to: '/stock', label: 'Stock', icon: Boxes, roles: ['admin', 'manager', 'staff', 'viewer', 'sales', 'operations'] },
      { to: '/purchase-orders', label: 'Suppliers', icon: Truck, roles: ['admin', 'manager', 'staff', 'viewer', 'operations'] },
      { to: '/consignments', label: 'Consignments', icon: Handshake, roles: ['admin', 'manager', 'staff', 'viewer', 'operations'] },
      { to: '/limited-projects', label: 'Limited projects', icon: Gem, roles: ['admin', 'manager', 'staff', 'viewer', 'operations'] },
      { to: '/repairs', label: 'Repairs', icon: Wrench, roles: ['admin', 'manager', 'staff', 'viewer', 'operations'] },
    ],
  },
  {
    title: 'Team',
    items: [
      // staff clock in from My Portal; this page is the manager dashboard
      { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, roles: ['admin', 'manager', 'hr'] },
      { to: '/leave', label: 'Leave', icon: CalendarRange, roles: ['admin', 'manager', 'hr'] },
      { to: '/hr', label: 'Employees', icon: Users, roles: ['admin', 'manager', 'hr'] },
      // app activity is a tab of this page now (was its own User Activity page)
      { to: '/performance', label: 'Performance', icon: Gauge, roles: ['admin', 'manager'] },
      { to: '/tasks', label: 'Assign tasks', icon: ClipboardList, roles: ['admin', 'manager'] },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { to: '/marketing', label: 'Overview', icon: TrendingUp, roles: ['admin', 'manager', 'marketing'] },
      // the money we spend on ads (Meta campaigns and proposals)
      { to: '/ads', label: 'Our ads', icon: Target, roles: ['admin', 'manager', 'marketing'] },
      // jobs clients pay us for; client prices, so not for sales
      { to: '/client-ads', label: 'Client ad jobs', icon: Megaphone, roles: ['admin', 'manager', 'marketing'] },
      { to: '/instagram', label: 'Instagram', icon: Instagram, roles: ['admin', 'manager', 'marketing', 'sales'] },
      { to: '/influencers', label: 'Influencers', icon: Sparkles, roles: ['admin', 'manager', 'marketing', 'sales'] },
    ],
  },
  {
    title: 'Owners',
    items: [
      // the money view of the business (was Owner view): sales, what we owe, stock
      { to: '/money', label: 'Money', icon: Briefcase, roles: ['admin'] },
      // the three owners only (the database checks again)
      { to: '/financials', label: 'Financial reports', icon: Landmark, roles: ['admin'], owners: true },
      { to: '/valuation', label: 'Business valuation', icon: Scale, roles: ['admin'], owners: true },
      { to: '/payroll', label: 'Payroll', icon: Wallet, roles: ['admin'], owners: true },
    ],
  },
  {
    title: 'Settings',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'manager'] },
      { to: '/notification-settings', label: 'Notification settings', icon: BellRing, roles: ['admin'] },
      { to: '/history', label: 'History log', icon: History, roles: ['admin', 'manager'] },
    ],
  },
];

/** Flat catalogue of every page, for the per-user access editor in Settings. */
export interface PageDef { to: string; label: string; group: string }
export const PAGES: PageDef[] = NAV_GROUPS.flatMap((g) =>
  g.items.filter((i) => !i.owners && i.to !== '/till-sales' && i.to !== '/settings' && i.to !== '/me' && i.to !== '/' && i.to !== '/inbox' && i.to !== '/notifications').map((i) => ({ to: i.to, label: i.label, group: g.title ?? 'Main' })),
);

/** Whether a user may open a page, honouring per-user overrides then role defaults. */
export function canAccessPath(to: string, role: Role | null, pageAccess: string[] | null): boolean {
  if (to === '/' || to === '/me' || to === '/inbox' || to === '/notifications') return true; // always available to everyone
  // user management stays role-gated and cannot be granted via page_access
  if (to === '/settings') return role === 'admin' || role === 'manager';
  // the owners' pages: the page and the database check the owner list itself
  if (to === '/payroll' || to === '/financials' || to === '/valuation') return role === 'admin';
  /* Till sales is the detail behind the till figures that Today and Money show
     to whoever may open /sales, so it follows that page rather than having an
     access setting of its own (the database's own rules still apply). */
  if (to === '/till-sales') return canAccessPath('/sales', role, pageAccess);
  if (role === 'admin') return true;
  // an explicit list — even an empty one — replaces the role defaults, so a
  // salesperson can be limited to Dashboard, My Portal, Inbox and Notifications
  if (Array.isArray(pageAccess)) return pageAccess.includes(to);
  const item = NAV_GROUPS.flatMap((g) => g.items).find((n) => n.to === to);
  return !!(item && role && item.roles.includes(role));
}

function groupsFor(role: Role | null, pageAccess: string[] | null, owner = false): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((n) => canAccessPath(n.to, role, pageAccess) && (!n.owners || owner)) }))
    .filter((g) => g.items.length > 0);
}

export default function Layout() {
  const { profile, role, pageAccess, signOut, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [inboxN, setInboxN] = useState(0);
  const [notifN, setNotifN] = useState(0);

  // install-as-app button
  const [canInstall, setCanInstall] = useState(!!getInstallPrompt());
  const [showIosHelp, setShowIosHelp] = useState(false);
  useEffect(() => {
    const on = () => setCanInstall(true);
    const off = () => setCanInstall(false);
    window.addEventListener('pwa-installable', on);
    window.addEventListener('pwa-installed', off);
    return () => { window.removeEventListener('pwa-installable', on); window.removeEventListener('pwa-installed', off); };
  }, []);
  const showInstall = !isStandalone() && (canInstall || isIos());
  async function handleInstall() {
    if (getInstallPrompt()) { await promptInstall(); setCanInstall(!!getInstallPrompt()); }
    else if (isIos()) setShowIosHelp(true);
  }
  const location = useLocation();
  /* a new page starts at the top; Back returns to where the page was left */
  useScrollMemory();

  // Ask Mohammed is for the owners on stock_ai_access, whatever their role; the backend checks again
  const [askAllowed, setAskAllowed] = useState(false);
  useEffect(() => {
    if (!user) return;
    supabase.rpc('stock_ai_allowed').then(({ data }) => setAskAllowed(!!data), () => setAskAllowed(false));
  }, [user?.id]);
  const groups = groupsFor(role, pageAccess, askAllowed);

  // which section contains the current route (so it opens automatically)
  const activeGroup = groups.find((g) => g.title && g.items.some((n) => n.to !== '/' && location.pathname.startsWith(n.to)))?.title ?? null;

  // collapsible sections — collapsed by default, only the active one open, choice persisted
  const NAV_KEY = 'nav-open-groups';
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem(NAV_KEY); if (s) return new Set<string>(JSON.parse(s)); } catch { /* ignore */ }
    return new Set();
  });
  useEffect(() => {
    if (activeGroup && !openGroups.has(activeGroup)) setOpenGroups((p) => new Set(p).add(activeGroup));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);
  const toggleGroup = (title: string) => setOpenGroups((p) => {
    const n = new Set(p); n.has(title) ? n.delete(title) : n.add(title);
    try { localStorage.setItem(NAV_KEY, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  // the phone's menu closes with Escape, like its backdrop and its close button
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // record page visits for the admin User Activity page (throttled, fire-and-forget)
  useEffect(() => { logActivity(user?.id, location.pathname); }, [user?.id, location.pathname]);

  // inbox badge — refresh on login and whenever the user opens the Inbox (acting on items updates it)
  useEffect(() => {
    if (!user) { setInboxN(0); return; }
    loadInbox(user, profile, role).then((d) => setInboxN(inboxCount(d))).catch(() => {});
  }, [user?.id, role, location.pathname === '/inbox']);

  // unread notification-centre badge (refresh on login and when the feed is opened)
  useEffect(() => {
    if (!user) { setNotifN(0); return; }
    unreadNotificationCount(user, profile, role).then(setNotifN).catch(() => {});
  }, [user?.id, role, location.pathname === '/notifications']);

  // notification tap: ?n=<id> marks it opened + shows a context banner (also indicates the item when the exact record can't open)
  const [params, setParams] = useSearchParams();
  const nHandled = useRef<string | null>(null);
  const [notifBanner, setNotifBanner] = useState<{ title: string; body: string } | null>(null);
  useEffect(() => {
    const nId = params.get('n');
    if (!nId || nHandled.current === nId) return;
    nHandled.current = nId;
    supabase.rpc('mark_notification_opened', { p_id: nId });
    if (user) markNotificationsRead(user.id, [nId]); // also clear it from the notification centre
    supabase.from('notifications').select('title, body').eq('id', nId).single()
      .then(({ data }) => { if (data) { setNotifBanner(data as any); setTimeout(() => setNotifBanner(null), 9000); } });
    const next = new URLSearchParams(params); next.delete('n'); setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <div className="min-h-screen flex">
      {open && <div className="fixed inset-0 z-[35] bg-slate-900/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={`${open ? 'flex' : 'hidden'} md:flex w-60 shrink-0 bg-slate-900 text-slate-200 flex-col fixed md:static inset-y-0 z-40`}
        style={{ paddingLeft: 'var(--sa-l)' }} aria-label="Menu">
        <div className="px-5 py-4 flex items-center gap-2 border-b border-slate-800" style={{ paddingTop: 'calc(1rem + var(--sa-t))' }}>
          <Watch size={22} className="text-amber-400" />
          <div className="flex-1">
            <div className="font-bold text-white leading-tight">Timekeeper Online</div>
            <div className="text-[12px] text-slate-300">Operations Control</div>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu"
            className="md:hidden -mr-3 grid h-11 w-11 place-items-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white">
            <CloseIcon size={20} />
          </button>
        </div>
        {/* On a wide screen Ask Mohammed lives here, not floating over the page */}
        {user && askAllowed && (
          <div className="hidden md:block px-4 pt-3">
            <AskMohammedButton onOpen={() => setAskOpen(true)} />
          </div>
        )}
        <nav className="flex-1 overflow-y-auto py-3">
          {(() => {
            const NavItem = (n: NavItem) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `${n.wideOnly ? 'hidden md:flex' : 'flex'} min-h-[44px] md:min-h-[36px] items-center gap-3 px-5 py-2 text-sm ${isActive ? 'bg-slate-800 text-white border-r-2 border-amber-400' : 'text-slate-300 hover:bg-slate-800/60'}`}
              >
                <n.icon size={16} /> <span className="flex-1">{n.label}</span>
                {n.to === '/inbox' && inboxN > 0 && (
                  <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-400 text-slate-900 text-[12px] font-bold flex items-center justify-center">{inboxN}</span>
                )}
                {n.to === '/notifications' && notifN > 0 && (
                  <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-400 text-slate-900 text-[12px] font-bold flex items-center justify-center">{notifN}</span>
                )}
              </NavLink>
            );
            return groups.map((g, gi) => {
              if (!g.title) return <div key={gi}>{g.items.map(NavItem)}</div>;
              const isOpen = openGroups.has(g.title);
              const count = g.items.reduce((s, n) => s + (n.to === '/inbox' ? inboxN : 0), 0);
              return (
                <div key={g.title} className="mt-3">
                  <button onClick={() => toggleGroup(g.title!)}
                    className="w-full flex min-h-[44px] md:min-h-0 items-center gap-2 px-5 pt-1 pb-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-300 hover:text-white">
                    <span className="flex-1 text-left">{g.title}</span>
                    {!isOpen && count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />}
                    <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && g.items.map(NavItem)}
                </div>
              );
            });
          })()}
        </nav>
        <div className="px-5 py-4 border-t border-slate-800 text-sm"
             style={{ paddingBottom: 'calc(1rem + var(--sa-b))' }}>
          <div className="font-medium text-white">{profile?.full_name}</div>
          <div className="text-xs text-slate-300 capitalize">{role}</div>
          <button onClick={signOut} className="flex min-h-[44px] items-center gap-2 text-slate-300 hover:text-white text-xs">
            <LogOut size={14} /> Sign out
          </button>
          <div className="mt-1">
            <VersionChip tone="dark" className="text-[12px] text-slate-300 before:absolute before:-inset-y-3 before:inset-x-0 before:content-['']" />
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* The phone's top bar, opaque so the page never shows through it. Every control is a 44px target; Ask Mohammed sits
            here rather than floating over the figures. */}
        <div className="md:hidden flex items-center gap-1.5 text-white px-2 py-1.5 sticky top-0 z-30 bg-slate-900"
          style={{ paddingTop: 'calc(0.375rem + var(--sa-t))',
                   paddingLeft: 'calc(0.5rem + var(--sa-l))',
                   paddingRight: 'calc(0.5rem + var(--sa-r))' }}>
          <button onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-white/10"><Menu size={22} /></button>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-semibold">Timekeeper Online</div>
            {/* the version under the title opens What's new; its tap area reaches 44px tall */}
            <VersionChip tone="light" compact
              className="text-[12px] text-white/80 before:absolute before:-inset-y-3 before:inset-x-0 before:content-['']" />
          </div>
          {user && askAllowed && (
            <AskMohammedButton onOpen={() => setAskOpen(true)} label="Ask"
              labelClass={showInstall ? 'hidden min-[400px]:inline' : 'hidden min-[340px]:inline'} />
          )}
          {showInstall && (
            <button onClick={handleInstall} aria-label="Install app"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-white/10"><Download size={20} /></button>
          )}
          <NavLink to="/notifications" aria-label="Notifications"
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-white/10">
            <Bell size={20} />
            {notifN > 0 && <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-bold flex items-center justify-center">{notifN}</span>}
          </NavLink>
        </div>
        {/* full available width — tables were leaving a large empty gutter on wide screens */}
        <main className="p-4 md:p-6 w-full"
              style={{ paddingBottom: 'calc(1.5rem + var(--sa-b))',
                       paddingLeft: 'calc(1rem + var(--sa-l))',
                       paddingRight: 'calc(1rem + var(--sa-r))' }}>
          {notifBanner && (
            <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{notifBanner.title}</div>
                <div className="text-sm text-amber-700">{notifBanner.body}</div>
              </div>
              <button onClick={() => setNotifBanner(null)} aria-label="Dismiss" className="shrink-0 text-amber-500 hover:text-amber-700"><CloseIcon size={16} /></button>
            </div>
          )}
          <div key={location.pathname} className="tk-route">
            {/* A page opened for the first time arrives as its own file; until it
                does, the space it will fill says Loading… as the pages themselves
                do while they fetch, and the menu and header stay where they are. */}
            <Suspense fallback={<Spinner />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {user && askAllowed && <AskMohammed open={askOpen} onClose={() => setAskOpen(false)} />}

      {showIosHelp && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setShowIosHelp(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><Download size={18} className="text-slate-700" /><h3 className="font-semibold text-slate-800">Install Timekeeper</h3></div>
            <p className="text-sm text-slate-600">Add it to your home screen so it opens like an app (and can send you notifications):</p>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2">1. Tap the <span className="inline-flex items-center gap-1 font-medium">Share <Share size={15} /></span> button in Safari's toolbar.</li>
              <li>2. Scroll down and choose <span className="font-medium">“Add to Home Screen”</span>.</li>
              <li>3. Open <span className="font-medium">Timekeeper</span> from your home screen.</li>
            </ol>
            <button onClick={() => setShowIosHelp(false)} className="mt-4 w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
