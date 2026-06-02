import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Smartphone, Link2, X, Save, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const STATUS_MAP = { 1: 'Ativo', 2: 'Desativado', 3: 'Não confirmado', 7: 'Pendente revisão', 9: 'Em análise' };

export default function AccountsPage() {
  const qc = useQueryClient();
  const [openModal, setOpenModal] = useState(null); // { account } ou null
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [form, setForm] = useState({ user_id: '', whatsapp_phone_number_id: '', whatsapp_display_number: '', notes: '' });

  const { data: accountsData, isLoading: loadingAccounts, refetch } = useQuery({
    queryKey: ['meta-accounts'],
    queryFn: () => api.get('/client-configs/meta-accounts').then(r => r.data),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => api.post('/client-configs', data),
    onSuccess: () => {
      toast.success('Configuração salva!');
      qc.invalidateQueries(['meta-accounts']);
      qc.invalidateQueries(['client-configs']);
      setOpenModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Erro ao salvar'),
  });

  function openAssign(account) {
    const existing = account.assigned_config;
    setForm({
      user_id: existing?.user_id || '',
      whatsapp_phone_number_id: existing?.whatsapp_phone_number_id || '',
      whatsapp_display_number: existing?.whatsapp_display_number || '',
      notes: existing?.notes || '',
      meta_ad_account_id: account.id,
      meta_ad_account_name: account.name,
    });
    setOpenModal(account);
  }

  function handleSave(e) {
    e.preventDefault();
    if (!form.user_id) return toast.error('Selecione um cliente');
    saveMutation.mutate(form);
  }

  const accounts = accountsData?.accounts || [];
  const users = (usersData?.users || []).filter(u => u.is_active && u.role !== 'admin');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contas de Anúncio</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie e atribua contas Meta aos seus clientes</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-2 rounded-lg transition-colors">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {loadingAccounts ? (
        <div className="text-center py-16 text-gray-400">Carregando contas da Meta...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhuma conta de anúncio encontrada.</p>
          <p className="text-sm mt-1">Verifique o META_ACCESS_TOKEN no Railway.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => {
            const cfg = acc.assigned_config;
            const isExpanded = expandedAccount === acc.id;
            const spent = acc.amount_spent ? (parseInt(acc.amount_spent) / 100).toLocaleString('pt-BR', { style: 'currency', currency: acc.currency || 'BRL' }) : null;

            return (
              <div key={acc.id} className={`bg-white rounded-xl border transition-all ${cfg ? 'border-blue-200' : 'border-gray-200'}`}>
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg ? 'bg-blue-600' : 'bg-gray-100'}`}>
                    <Building2 size={18} className={cfg ? 'text-white' : 'text-gray-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{acc.name}</p>
                    {acc.business_name && (
                      <p className="text-xs text-blue-500 truncate">📁 {acc.business_name}</p>
                    )}
                    <p className="text-xs text-gray-400 font-mono">{acc.id}</p>
                  </div>
                  {spent && <span className="text-xs text-gray-500 hidden sm:block">Gasto: {spent}</span>}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${acc.account_status === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_MAP[acc.account_status] || 'Desconhecido'}
                  </span>
                  {cfg ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">{cfg.client_name}</span>
                      <button onClick={() => openAssign(acc)} className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">Editar</button>
                    </div>
                  ) : (
                    <button onClick={() => openAssign(acc)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                      Atribuir cliente
                    </button>
                  )}
                  <button onClick={() => setExpandedAccount(isExpanded ? null : acc.id)} className="p-1 text-gray-400 hover:text-gray-600">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {isExpanded && cfg && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 rounded-b-xl grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Cliente</p>
                      <p className="font-medium text-gray-800">{cfg.client_name}</p>
                      <p className="text-gray-500 text-xs">{cfg.client_email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">WhatsApp</p>
                      {cfg.whatsapp_display_number ? (
                        <p className="font-medium text-gray-800 flex items-center gap-1.5">
                          <Smartphone size={14} className="text-green-500" />
                          {cfg.whatsapp_display_number}
                        </p>
                      ) : <p className="text-gray-400 text-xs">Não configurado</p>}
                      {cfg.whatsapp_phone_number_id && (
                        <p className="text-gray-400 text-xs font-mono mt-0.5">ID: {cfg.whatsapp_phone_number_id}</p>
                      )}
                    </div>
                    {cfg.notes && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Observações</p>
                        <p className="text-gray-600">{cfg.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de atribuição */}
      {openModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Atribuir cliente</h2>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{openModal.name}</p>
              </div>
              <button onClick={() => setOpenModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select
                  value={form.user_id}
                  onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione um cliente...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <Smartphone size={13} /> Phone Number ID do WhatsApp
                </label>
                <input
                  value={form.whatsapp_phone_number_id}
                  onChange={e => setForm(f => ({ ...f, whatsapp_phone_number_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="Ex: 107405296913..."
                />
                <p className="text-xs text-gray-400 mt-1">Encontrado em Meta for Developers → WhatsApp → Etapa 1</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de WhatsApp</label>
                <input
                  value={form.whatsapp_display_number}
                  onChange={e => setForm(f => ({ ...f, whatsapp_display_number: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: 5511999999999"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações <span className="text-gray-400 font-normal">(opcional)</span></label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Notas sobre o cliente..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpenModal(null)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Save size={14} /> {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
