import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Building2, Smartphone, Check, LayoutGrid } from 'lucide-react';
import api from '../../services/api';
import { useAccountStore, ALL_ACCOUNTS } from '../../store/accountStore';
import { useAuthStore } from '../../store/authStore';

export default function AccountSwitcher() {
  const { user } = useAuthStore();
  const { selected, select } = useAccountStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Carrega contas Meta direto da API (sem precisar vincular cliente primeiro)
  const { data: accountsData, isLoading } = useQuery({
    queryKey: ['meta-accounts-switcher'],
    queryFn: () => api.get('/client-configs/meta-accounts').then(r => r.data),
    enabled: user?.role === 'admin',
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (user?.role !== 'admin') return null;

  const accounts = accountsData?.accounts || [];
  const isAll = selected.id === '__all__';

  return (
    <div ref={ref} className="relative px-3 pb-3">
      {/* Botão principal */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl px-3 py-2.5 transition-colors text-left"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isAll ? 'bg-gray-600' : 'bg-blue-600'}`}>
          {isAll ? <LayoutGrid size={14} className="text-gray-300" /> : <Building2 size={14} className="text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold truncate leading-tight">
            {isAll ? 'Todas as contas' : (selected.meta_ad_account_name || selected.client_name)}
          </p>
          {!isAll && selected.client_name && selected.meta_ad_account_name && (
            <p className="text-gray-400 text-xs truncate leading-tight">👤 {selected.client_name}</p>
          )}
        </div>
        <ChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {/* Todas as contas */}
          <button
            onClick={() => { select(ALL_ACCOUNTS); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-700 transition-colors ${isAll ? 'bg-gray-700' : ''}`}
          >
            <div className="w-7 h-7 rounded-lg bg-gray-600 flex items-center justify-center flex-shrink-0">
              <LayoutGrid size={13} className="text-gray-300" />
            </div>
            <span className="text-sm text-gray-200 flex-1">Todas as contas</span>
            {isAll && <Check size={13} className="text-blue-400 flex-shrink-0" />}
          </button>

          {accounts.length > 0 && <div className="border-t border-gray-700" />}

          {isLoading && (
            <p className="text-xs text-gray-500 text-center py-3">Carregando contas...</p>
          )}

          {/* Contas Meta */}
          {accounts.map(acc => {
            const cfg = acc.assigned_config;
            const isSelected = selected.id === acc.id;
            return (
              <button
                key={acc.id}
                onClick={() => {
                  select({
                    id: acc.id,
                    meta_ad_account_id: acc.id,
                    meta_ad_account_name: acc.name,
                    user_id: cfg?.user_id || null,
                    client_name: cfg?.client_name || null,
                    whatsapp_display_number: cfg?.whatsapp_display_number || null,
                    whatsapp_phone_number_id: cfg?.whatsapp_phone_number_id || null,
                  });
                  setOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-gray-700 transition-colors ${isSelected ? 'bg-gray-700' : ''}`}
              >
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Building2 size={13} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{acc.name}</p>
                  <p className="text-xs text-gray-500 font-mono truncate">{acc.id}</p>
                  {cfg?.client_name && (
                    <p className="text-xs text-blue-400 truncate mt-0.5">👤 {cfg.client_name}</p>
                  )}
                  {cfg?.whatsapp_display_number && (
                    <p className="text-xs text-green-400 truncate flex items-center gap-1 mt-0.5">
                      <Smartphone size={10} /> {cfg.whatsapp_display_number}
                    </p>
                  )}
                </div>
                {isSelected && <Check size={13} className="text-blue-400 flex-shrink-0 mt-1" />}
              </button>
            );
          })}

          {!isLoading && accounts.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-3 px-3">
              Nenhuma conta Meta encontrada.<br />Verifique o META_ACCESS_TOKEN.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
