import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, Hourglass, PackageCheck, Truck, Handshake,
  Star, Users, CalendarRange, FileWarning, LogOut, Watch, Menu, Contact, Settings, Gem, ClipboardCheck, type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth, Role } from '../context/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff', 'hr', 'viewer'] },
  { to: '/sales', label: 'Sales Reports', icon: TrendingUp, roles: ['admin', 'manager', 'staff', 'viewer'] },
  { to: '/crm', label: 'CRM Customers', icon: Contact, roles: ['admin', 'manager', 'staff', 'viewer'] },
  { to: '/waiting-list', label: 'Demand List', icon: Hourglass, roles: ['admin', 'manager', 'staff', 'viewer'] },
  { to: '/purchase-orders', label: 'PO & Inbound', icon: Truck, roles: ['admin', 'manager', 'staff', 'viewer'] },
  { to: '/consignments', label: 'Consignments', icon: Handshake, roles: ['admin', 'manager', 'staff', 'viewer'] },
  { to: '/vip', label: 'VIP Customers', icon: Star, roles: ['admin', 'manager', 'staff', 'viewer'] },
  { to: '/limited-projects', label: 'Limited Projects', icon: Gem, roles: ['admin', 'manager', 'staff', 'viewer'] },
  { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, roles: ['admin', 'manager', 'staff', 'hr'] },
  { to: '/hr', label: 'HR — Employees', icon: Users, roles: ['admin', 'manager', 'hr'] },
  { to: '/leave', label: 'Leave Tracking', icon: CalendarRange, roles: ['admin', 'manager', 'hr'] },
  { to: '/company-documents', label: 'Company Documents', icon: FileWarning, roles: ['admin', 'manager', 'hr', 'viewer'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'manager'] },
];

export function navForRole(role: Role | null): NavItem[] {
  return NAV.filter((n) => role && n.roles.includes(role));
}

export default function Layout() {
  const { profile, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const items = navForRole(role);

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
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm ${isActive ? 'bg-slate-800 text-white border-r-2 border-amber-400' : 'text-slate-300 hover:bg-slate-800/60'}`}
            >
              <n.icon size={16} /> {n.label}
            </NavLink>
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
        <main className="p-4 md:p-6 max-w-7xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
