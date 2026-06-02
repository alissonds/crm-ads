import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useAccountStore } from './store/accountStore';
import api from './services/api';
import Layout from './components/common/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import CampaignsPage from './pages/CampaignsPage';
import TrafficPage from './pages/TrafficPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AutomationsPage from './pages/AutomationsPage';
import ConversionsPage from './pages/ConversionsPage';
import WebhooksPage from './pages/WebhooksPage';
import UsersPage from './pages/UsersPage';
import RegisterPage from './pages/RegisterPage';
import AccountsPage from './pages/AccountsPage';

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token) return <Navigate to="/login" replace />;
  // Aguarda carregar o user antes de redirecionar
  if (user && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

// Carrega automaticamente a conta atribuída para usuários não-admin
function NonAdminAccountLoader() {
  const user = useAuthStore((s) => s.user);
  const { selected, select } = useAccountStore();

  useEffect(() => {
    if (!user || user.role === 'admin') return;
    // Só carrega se ainda não tem uma conta selecionada
    if (selected.id !== '__all__') return;

    api.get(`/client-configs/${user.id}`).then(r => {
      const cfg = r.data?.config;
      if (cfg?.meta_ad_account_id) {
        select({
          id: cfg.meta_ad_account_id,
          meta_ad_account_id: cfg.meta_ad_account_id,
          meta_ad_account_name: cfg.meta_ad_account_name || '',
          user_id: cfg.user_id,
          client_name: user.name,
          whatsapp_display_number: cfg.whatsapp_display_number || null,
          whatsapp_phone_number_id: cfg.whatsapp_phone_number_id || null,
        });
      }
    }).catch(() => {});
  }, [user?.id]);

  return null;
}

export default function App() {
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<><NonAdminAccountLoader /><DashboardPage /></>} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<LeadDetailPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="traffic" element={<TrafficPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="conversions" element={<ConversionsPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
        <Route path="accounts" element={<AdminRoute><AccountsPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
