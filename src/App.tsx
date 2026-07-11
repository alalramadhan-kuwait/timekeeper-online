import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout, { canAccessPath } from './components/Layout';
import LoginPage from './components/LoginPage';
import Dashboard from './pages/Dashboard';
import SalesPage from './pages/Sales';
import CrmPage from './pages/Crm';
import FollowUpsPage from './pages/FollowUps';
import StockPage from './pages/Stock';
import HistoryLogPage from './pages/HistoryLog';
import SettingsPage from './pages/Settings';
import LeavePage from './pages/Leave';
import AttendancePage from './pages/Attendance';
import {
  WaitingListPage, PreOrdersPage, PurchaseOrdersPage, ConsignmentsPage,
  VipCustomersPage, EmployeesPage, CompanyDocsPage, LimitedProjectsPage,
} from './pages/modules';
import { Spinner } from './components/ui';

function Shell() {
  const { user, loading, role, pageAccess } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <LoginPage />;

  // gate a route by page access; typing the URL is blocked too, not just the menu
  const g = (to: string, element: JSX.Element) =>
    canAccessPath(to, role, pageAccess) ? element : <Navigate to="/" />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
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
        <Route path="/hr" element={g('/hr', <EmployeesPage />)} />
        <Route path="/leave" element={g('/leave', <LeavePage />)} />
        <Route path="/limited-projects" element={g('/limited-projects', <LimitedProjectsPage />)} />
        <Route path="/company-documents" element={g('/company-documents', <CompanyDocsPage />)} />
        <Route path="/history" element={g('/history', <HistoryLogPage />)} />
        <Route path="/settings" element={g('/settings', <SettingsPage />)} />
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
