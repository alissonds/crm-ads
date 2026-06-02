import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Megaphone, Activity,
  BarChart3, Zap, RefreshCw, Webhook, LogOut,
  TrendingUp, UserCog, Building2, Smartphone,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAccountStore, ALL_ACCOUNTS } from '../../store/accountStore';
import AccountSwitcher from './AccountSwitcher';
import clsx from 'clsx';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/campaigns', icon: Megaphone, label: 'Campanhas' },
  { to: '/traffic', icon: Activity, label: 'Tráfego' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/automations', icon: Zap, label: 'Automações' },
  { to: '/conversions', icon: RefreshCw, label: 'Conversões' },
  { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
  { to: '/accounts', icon: Building2, label: 'Contas', adminOnly: true },
  { to: '/users', icon: UserCog, label: 'Usuários', adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { selected } = useAccountStore();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };
  const isFiltered = selected.id !== '__all__';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <TrendingUp size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">CRM ADS</p>
            <p className="text-gray-400 text-xs">Google & Meta</p>
          </div>
        </div>

        {/* Account Switcher (admin only) */}
        <div className="pt-3">
          <p className="text-gray-500 text-xs uppercase tracking-wider px-5 mb-2">Visualizando</p>
          <AccountSwitcher />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto border-t border-gray-800">
          {NAV.filter(item => !item.adminOnly || user?.role === 'admin').map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            )}>
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Active account badge */}
        {isFiltered && (
          <div className="mx-3 mb-2 bg-blue-900/40 border border-blue-700/40 rounded-xl px-3 py-2.5">
            <p className="text-xs text-blue-300 font-semibold truncate">{selected.client_name}</p>
            {selected.meta_ad_account_name && (
              <p className="text-xs text-blue-400/70 truncate flex items-center gap-1 mt-0.5">
                <Building2 size={10} /> {selected.meta_ad_account_name}
              </p>
            )}
            {selected.whatsapp_display_number && (
              <p className="text-xs text-green-400/80 truncate flex items-center gap-1 mt-0.5">
                <Smartphone size={10} /> {selected.whatsapp_display_number}
              </p>
            )}
          </div>
        )}

        {/* User */}
        <div className="border-t border-gray-800 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-gray-400 text-xs capitalize">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Sair">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
