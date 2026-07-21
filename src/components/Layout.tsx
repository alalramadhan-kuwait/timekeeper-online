import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, Hourglass, Truck, Handshake,
  Star, Users, CalendarRange, LogOut, Watch, Menu, Contact, Settings, Gem, ClipboardCheck, PhoneCall, Boxes, History, UserRound, Wrench, Instagram, Clapperboard, Megaphone, Activity, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth, Role } from '../context/AuthContext';
import { logActivity } from '../lib/activity';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

interface NavGroup {
  title: string | null; // null = no header (top-level)
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff', 'hr', 'viewer', 'sales', 'operations'] },
      { to: '/me', label: 'My Portal', icon: UserRound, roles: ['admin', 'manager', 'staff', 'hr', 'viewer', 'sales', 'operations'] },
    ],
  },
  {
    title: 'Sales & Customers',
    items: [
      { to: '/sales', label: 'Sales Reports', icon: TrendingUp, roles: ['admin', 'manager', 'staff', 'viewer', 'sales'] },
      { to: '/crm', label: 'CRM Customers', icon: Contact, roles: ['admin', 'manager', 'staff', 'viewer', 'sales'] },
      { to: '/follow-ups', label: 'Follow-up Board', icon: PhoneCall, roles: ['admin', 'manager', 'staff', 'viewer', 'sales'] },
      { to: '/vip', label: 'VIP Customers', icon: Star, roles: ['admin', 'manager', 'staff', 'viewer', 'sales'] },
      { to: '/waiting-list', label: 'Demand List', icon: Hourglass, roles: ['admin', 'manager', 'staff', 'viewer', 'sales', 'operations'] },
    ],
  },
  {
    title: 'Purchasing & Stock',
    items: [
      { to: '/stock', label: 'Stock (Lightspeed)', icon: Boxes, roles: ['admin', 'manager', 'staff', 'viewer', 'sales', 'operations'] },
      { to: '/purchase-orders', label: 'Supplier Payments', icon: Truck, roles: ['admin', 'manager', 'staff', 'viewer', 'operations'] },
      { to: '/consignments', label: 'Consignments', icon: Handshake, roles: ['admin', 'manager', 'staff', 'viewer', 'operations'] },
      { to: '/limited-projects', label: 'Limited Projects', icon: Gem, roles: ['admin', 'manager', 'staff', 'viewer', 'operations'] },
      { to: '/repairs', label: 'Repair Watches', icon: Wrench, roles: ['admin', 'manager', 'staff', 'viewer', 'operations'] },
    ],
  },
  {
    title: 'HR & Team',
    items: [
      // staff clock in from My Portal; this page is the manager dashboard
      { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, roles: ['admin', 'manager', 'hr'] },
      { to: '/hr', label: 'Employees', icon: Users, roles: ['admin', 'manager', 'hr'] },
      { to: '/leave', label: 'Leave Tracking', icon: CalendarRange, roles: ['admin', 'manager', 'hr'] },
      // Company Documents hidden from the menu while unused (module + data kept; direct URL still works)
    ],
  },
  {
    title: 'Media & Marketing',
    items: [
      { to: '/instagram', label: 'Instagram Performance', icon: Instagram, roles: ['admin', 'manager', 'marketing', 'sales'] },
      { to: '/content', label: 'Content Planner', icon: Clapperboard, roles: ['admin', 'manager', 'marketing', 'sales'] },
      { to: '/paid-ads', label: 'Paid Ads Tracker', icon: Megaphone, roles: ['admin', 'manager', 'marketing', 'sales'] },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/activity', label: 'User Activity', icon: Activity, roles: ['admin', 'manager'] },
      { to: '/history', label: 'History Log', icon: History, roles: ['admin', 'manager'] },
      { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'manager'] },
    ],
  },
];

/** Flat catalogue of every page, for the per-user access editor in Settings. */
export interface PageDef { to: string; label: string; group: string }
export const PAGES: PageDef[] = NAV_GROUPS.flatMap((g) =>
  g.items.filter((i) => i.to !== '/settings' && i.to !== '/me' && i.to !== '/').map((i) => ({ to: i.to, label: i.label, group: g.title ?? 'Main' })),
);

/** Whether a user may open a page, honouring per-user overrides then role defaults. */
export function canAccessPath(to: string, role: Role | null, pageAccess: string[] | null): boolean {
  if (to === '/' || to === '/me') return true; // dashboard and personal portal are always available
  // user management stays role-gated and cannot be granted via page_access
  if (to === '/settings') return role === 'admin' || role === 'manager';
  // hidden from the menu but still reachable by URL for HR (module kept per cleanup decision)
  if (to === '/company-documents') return ['admin', 'manager', 'hr'].includes(role ?? '');
  if (role === 'admin') return true;
  if (pageAccess && pageAccess.length > 0) return pageAccess.includes(to);
  const item = NAV_GROUPS.flatMap((g) => g.items).find((n) => n.to === to);
  return !!(item && role && item.roles.includes(role));
}

function groupsFor(role: Role | null, pageAccess: string[] | null): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((n) => canAccessPath(n.to, role, pageAccess)) }))
    .filter((g) => g.items.length > 0);
}

export default function Layout() {
  const { profile, role, pageAccess, signOut, user } = useAuth();
  const [open, setOpen] = useState(false);
  const groups = groupsFor(role, pageAccess);
  const location = useLocation();

  // record page visits for the admin User Activity page (throttled, fire-and-forget)
  useEffect(() => { logActivity(user?.id, location.pathname); }, [user?.id, location.pathname]);

  return (
    <div className="min-h-screen flex">
      <aside className={`${open ? 'flex' : 'hidden'} md:flex w-60 shrink-0 bg-slate-900 text-slate-200 flex-col fixed md:static inset-y-0 z-40`}>
        <div className="px-5 py-4 flex items-center gap-2 border-b border-slate-800">
          <Watch size={22} className="text-amber-400" />
          <div>
            <div className="font-bold text-white leading-tight">Timekeeper Online</div>
            <div className="text-[11px] text-slate-400">Operations Control</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {groups.map((g, gi) => (
            <div key={g.title ?? gi} className={gi > 0 ? 'mt-3' : ''}>
              {g.title && (
                <div className="px-5 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {g.title}
                </div>
              )}
              {g.items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-5 py-2 text-sm ${isActive ? 'bg-slate-800 text-white border-r-2 border-amber-400' : 'text-slate-300 hover:bg-slate-800/60'}`}
                >
                  <n.icon size={16} /> {n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-slate-800 text-sm">
          <div className="font-medium text-white">{profile?.full_name}</div>
          <div className="text-xs text-slate-400 capitalize mb-2">{role}</div>
          <button onClick={signOut} className="flex items-center gap-2 text-slate-300 hover:text-white text-xs">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="md:hidden flex items-center gap-3 bg-slate-900 text-white px-4 py-3">
          <button onClick={() => setOpen((o) => !o)} aria-label="Menu"><Menu size={20} /></button>
          <span className="font-semibold">Timekeeper Online</span>
        </div>
        {/* full available width — tables were leaving a large empty gutter on wide screens */}
        <main className="p-4 md:p-6 w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
