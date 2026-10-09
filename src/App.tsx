import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout, { canAccessPath } from './components/Layout';
import LoginPage from './components/LoginPage';
import Dashboard from './pages/Dashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import SalesPage from './pages/Sales';
import CrmPage from './pages/Crm';
import FollowUpsPage from './pages/FollowUps';
import StockPage from './pages/Stock';
import HistoryLogPage from './pages/HistoryLog';
import MyPortalPage from './pages/MyPortal';
import InboxPage from './pages/Inbox';
import AssignTasksPage from './pages/AssignTasks';
import NotificationSettingsPage from './pages/NotificationSettings';
import NotificationsPage from './pages/Notifications';
import InstagramPage from './pages/Instagram';
import UserActivityPage from './pages/UserActivity';
import SettingsPage from './pages/Settings';
import LeavePage from './pages/Leave';
import AttendancePage from './pages/Attendance';
import OpenShiftsPage from './pages/OpenShifts';
import InfluencerProfilePage from './pages/InfluencerProfile';
import PerformancePage from './pages/Performance';
import { PurchaseOrdersPage } from './pages/PurchaseOrders';
import {
  WaitingListPage, PreOrdersPage, ConsignmentsPage,
  VipCustomersPage, EmployeesPage, CompanyDocsPage, LimitedProjectsPage, RepairWatchesPage, ContentPlannerPage, InfluencersPage,
} from './pages/modules';
import { AdsPage } from './pages/Ads';
import { ClientAdsPage } from './pages/ClientAds';
import { MarketingOverviewPage } from './pages/MarketingOverview';
import { Spinner } from './components/ui';
import WorldRoute from './components/WorldRoute';

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
