import { lazy, type ComponentType } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout, { canAccessPath } from './components/Layout';
import LoginPage from './components/LoginPage';
import Dashboard from './pages/Dashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import { Spinner } from './components/ui';
import WorldRoute from './components/WorldRoute';

/* Every other page arrives as its own file the first time it is opened.

   The two dashboards stay in the main file because one of them is the first
   thing everybody sees, and splitting it off would only add a second download
   before anything appears. The rest — thirty-odd pages, most of which any one
   person never opens — no longer hold up the start. The service worker keeps
   all of them for offline, so after the first visit they open from the device.

   A page file can go missing under an open tab: each deploy deletes the
   previous build's files, and a phone without the worker (Chrome on iPhone)
   still asks for the old name. Reloading once lands on the current build and
   the same page; a second failure within the minute is a real one and reaches
   the error screen rather than reloading in a loop. */
const RELOADED = 'tk:page-reload';
function page<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch((err) => {
    try {
      const last = Number(sessionStorage.getItem(RELOADED) ?? 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOADED, String(Date.now()));
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
    } catch { /* no storage to remember by: do not risk a loop */ }
    throw err;
  }));
}
const modules = () => import('./pages/modules');

const SalesPage = page(() => import('./pages/Sales'));
const CrmPage = page(() => import('./pages/Crm'));
const FollowUpsPage = page(() => import('./pages/FollowUps'));
const StockPage = page(() => import('./pages/Stock'));
const HistoryLogPage = page(() => import('./pages/HistoryLog'));
const MyPortalPage = page(() => import('./pages/MyPortal'));
const InboxPage = page(() => import('./pages/Inbox'));
const AssignTasksPage = page(() => import('./pages/AssignTasks'));
const NotificationSettingsPage = page(() => import('./pages/NotificationSettings'));
const NotificationsPage = page(() => import('./pages/Notifications'));
const InstagramPage = page(() => import('./pages/Instagram'));
const UserActivityPage = page(() => import('./pages/UserActivity'));
const SettingsPage = page(() => import('./pages/Settings'));
const LeavePage = page(() => import('./pages/Leave'));
const PayrollPage = page(() => import('./pages/Payroll'));
const AttendancePage = page(() => import('./pages/Attendance'));
const OpenShiftsPage = page(() => import('./pages/OpenShifts'));
const InfluencerProfilePage = page(() => import('./pages/InfluencerProfile'));
const PerformancePage = page(() => import('./pages/Performance'));
const PurchaseOrdersPage = page(() => import('./pages/PurchaseOrders').then((m) => ({ default: m.PurchaseOrdersPage })));
const WaitingListPage = page(() => modules().then((m) => ({ default: m.WaitingListPage })));
const PreOrdersPage = page(() => modules().then((m) => ({ default: m.PreOrdersPage })));
const ConsignmentsPage = page(() => modules().then((m) => ({ default: m.ConsignmentsPage })));
const VipCustomersPage = page(() => modules().then((m) => ({ default: m.VipCustomersPage })));
const EmployeesPage = page(() => modules().then((m) => ({ default: m.EmployeesPage })));
const CompanyDocsPage = page(() => modules().then((m) => ({ default: m.CompanyDocsPage })));
const LimitedProjectsPage = page(() => modules().then((m) => ({ default: m.LimitedProjectsPage })));
const RepairWatchesPage = page(() => modules().then((m) => ({ default: m.RepairWatchesPage })));
const ContentPlannerPage = page(() => modules().then((m) => ({ default: m.ContentPlannerPage })));
const InfluencersPage = page(() => modules().then((m) => ({ default: m.InfluencersPage })));
const AdsPage = page(() => import('./pages/Ads').then((m) => ({ default: m.AdsPage })));
const ClientAdsPage = page(() => import('./pages/ClientAds').then((m) => ({ default: m.ClientAdsPage })));
const MarketingOverviewPage = page(() => import('./pages/MarketingOverview').then((m) => ({ default: m.MarketingOverviewPage })));

/** The manager runs the day, so admin and manager land on the manager's screen; the owner's money view is at /owner. Everyone else keeps the role-based dashboard. */
function Home() {
  const { role } = useAuth();
  return ['admin', 'manager'].includes(role ?? '') ? <ManagerDashboard /> : <Dashboard />;
}

function Shell() {
  const { user, loading, role, pageAccess } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <LoginPage />;

  // gate a route by page access; typing the URL is blocked too, not just the menu
  const g = (to: string, element: JSX.Element) =>
    canAccessPath(to, role, pageAccess) ? element : <Navigate to="/" />;

  return (
    <Routes>
      {/* owners only, full screen, outside the usual chrome */}
      <Route path="/world" element={<WorldRoute />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/owner" element={g('/owner', <Dashboard title="Owner view" />)} />
        <Route path="/me" element={<MyPortalPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/tasks" element={g('/tasks', <AssignTasksPage />)} />
        <Route path="/sales" element={g('/sales', <SalesPage />)} />
        <Route path="/crm" element={g('/crm', <CrmPage />)} />
        <Route path="/follow-ups" element={g('/follow-ups', <FollowUpsPage />)} />
        <Route path="/waiting-list" element={g('/waiting-list', <WaitingListPage />)} />
        <Route path="/pre-orders" element={g('/waiting-list', <PreOrdersPage />)} />
        <Route path="/purchase-orders" element={g('/purchase-orders', <PurchaseOrdersPage />)} />
        <Route path="/stock" element={g('/stock', <StockPage />)} />
        <Route path="/consignments" element={g('/consignments', <ConsignmentsPage />)} />
        <Route path="/vip" element={g('/vip', <VipCustomersPage />)} />
        <Route path="/attendance" element={g('/attendance', <AttendancePage />)} />
        <Route path="/open-shifts" element={g('/attendance', <OpenShiftsPage />)} />
        <Route path="/hr" element={g('/hr', <EmployeesPage />)} />
        <Route path="/leave" element={g('/leave', <LeavePage />)} />
        <Route path="/payroll" element={g('/payroll', <PayrollPage />)} />
        <Route path="/limited-projects" element={g('/limited-projects', <LimitedProjectsPage />)} />
        <Route path="/repairs" element={g('/repairs', <RepairWatchesPage />)} />
        <Route path="/instagram" element={g('/instagram', <InstagramPage />)} />
        <Route path="/content" element={g('/content', <ContentPlannerPage />)} />
        <Route path="/ads" element={g('/ads', <AdsPage />)} />
        <Route path="/client-ads" element={g('/client-ads', <ClientAdsPage />)} />
        {/* Merged into Ads and Client Ads (27 Sep); old links and notifications still land. */}
        <Route path="/meta-campaigns" element={<KeepSearch to="/ads" />} />
        <Route path="/campaign-proposals" element={<KeepSearch to="/ads" add={{ tab: 'proposals' }} />} />
        <Route path="/paid-ads" element={<KeepSearch to="/client-ads" />} />
        <Route path="/marketing" element={g('/marketing', <MarketingOverviewPage />)} />
        {/* Growth Review became Marketing Overview (27 Sep); old links and the
            Sunday notification keep working, with their query string. */}
        <Route path="/growth-review" element={<KeepSearch to="/marketing" />} />
        <Route path="/influencers" element={g('/influencers', <InfluencersPage />)} />
        <Route path="/influencers/:id" element={g('/influencers', <InfluencerProfilePage />)} />
        <Route path="/activity" element={g('/activity', <UserActivityPage />)} />
        <Route path="/performance" element={g('/performance', <PerformancePage />)} />
        <Route path="/company-documents" element={g('/company-documents', <CompanyDocsPage />)} />
        <Route path="/history" element={g('/history', <HistoryLogPage />)} />
        <Route path="/settings" element={g('/settings', <SettingsPage />)} />
        <Route path="/notification-settings" element={g('/notification-settings', <NotificationSettingsPage />)} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AuthProvider>
  );
}

/** A redirect that keeps the query string (a notification's ?n= among it). */
function KeepSearch({ to, add }: { to: string; add?: Record<string, string> }) {
  const { search } = useLocation();
  const q = new URLSearchParams(search);
  for (const [k, v] of Object.entries(add ?? {})) q.set(k, v);
  const s = q.toString();
  return <Navigate to={{ pathname: to, search: s ? `?${s}` : '' }} replace />;
}
