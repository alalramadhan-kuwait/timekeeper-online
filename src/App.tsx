import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './components/LoginPage';
import Dashboard from './pages/Dashboard';
import SalesPage from './pages/Sales';
import CrmPage from './pages/Crm';
import LeavePage from './pages/Leave';
import {
  WaitingListPage, PreOrdersPage, PurchaseOrdersPage, ConsignmentsPage,
  VipCustomersPage, EmployeesPage, CompanyDocsPage,
} from './pages/modules';
import { Spinner } from './components/ui';

function Shell() {
  const { user, loading, role } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <LoginPage />;

  const hrAllowed = ['admin', 'manager', 'hr'].includes(role ?? '');

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/waiting-list" element={<WaitingListPage />} />
        <Route path="/pre-orders" element={<PreOrdersPage />} />
        <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="/consignments" element={<ConsignmentsPage />} />
        <Route path="/vip" element={<VipCustomersPage />} />
        <Route path="/hr" element={hrAllowed ? <EmployeesPage /> : <Navigate to="/" />} />
        <Route path="/leave" element={hrAllowed ? <LeavePage /> : <Navigate to="/" />} />
        <Route path="/company-documents" element={<CompanyDocsPage />} />
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
