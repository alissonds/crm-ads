import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Pencil, X, Check, ShieldCheck, User, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';

const ROLE_LABEL = { admin: 'Admin', manager: 'Gerente', agent: 'Agente' };
const ROLE_COLOR = { admin: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700', agent: 'bg-gray-100 text-gray-600' };

const EMPTY_FORM = { name: '', email: '', password: '', role: 'agent' };

export default function UsersPage() {
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null); // null | 'create' | { ...user }
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.list().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (d) => usersAPI.create(d),
    onSuccess: () => { toast.success('Usuário criado!'); qc.invalidateQueries(['users']); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Erro ao criar usuário'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }) => usersAPI.update(id, d),
    onSuccess: () => { toast.success('Usuário atualizado!'); qc.invalidateQueries(['users']); closeModal(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Erro ao atualizar usuário'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => usersAPI.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries(['users']),
    onError: (e) => toast.error(e.response?.data?.error || 'Erro'),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setErrors({});
    setModal('create');
  }

  function openEdit(user) {
    setForm({ name: user.name, email: user.email, password: '', role: user.role });
    setErrors({});
    setModal(user);
  }

  function closeModal() { setModal(null); setErrors({}); }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Obrigatório';
    if (!form.email.trim()) e.email = 'Obrigatório';
    if (modal === 'create' && !form.password) e.password = 'Obrigatório';
    if (form.password && form.password.length < 8) e.password = 'Mínimo 8 caracteres';
    setErrors(e);
    return !Object.keys(e).length;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    if (modal === 'create') {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate({ id: modal.id, ...payload });
    }
  }

  const isAdmin = me?.role === 'admin';
  const users = data?.users || [];
  const total = data?.total || 0;
  const max = data?.max || 5;
  const canCreate = isAdmin && total < max;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} de {max} contas utilizadas</p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            disabled={!canCreate}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <UserPlus size={16} />
            Novo usuário
          </button>
        )}
      </div>

      {/* Barra de uso */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Contas ativas</span>
          <span className="text-sm text-gray-500">{total}/{max}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${total >= max ? 'bg-red-500' : 'bg-blue-500'}`}
            style={{ width: `${(total / max) * 100}%` }}
          />
        </div>
        {total >= max && (
          <p className="text-xs text-red-500 mt-2">Limite atingido. Desative um usuário para criar outro.</p>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                  {u.id === me?.id && <span className="text-xs text-blue-500">(você)</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">{u.email}</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLOR[u.role]}`}>
                {ROLE_LABEL[u.role]}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {u.is_active ? 'Ativo' : 'Inativo'}
              </span>
              {isAdmin && (
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => openEdit(u)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  {u.id !== me?.id && (
                    <button
                      onClick={() => toggleMutation.mutate({ id: u.id, is_active: !u.is_active })}
                      className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'text-gray-400 hover:text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                      title={u.is_active ? 'Desativar' : 'Ativar'}
                    >
                      {u.is_active ? <X size={14} /> : <Check size={14} />}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {modal === 'create' ? 'Novo usuário' : 'Editar usuário'}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-400' : 'border-gray-300'}`}
                  placeholder="Nome completo"
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${errors.email ? 'border-red-400' : 'border-gray-300'}`}
                  placeholder="email@exemplo.com"
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha {modal !== 'create' && <span className="text-gray-400 font-normal">(deixe em branco para não alterar)</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${errors.password ? 'border-red-400' : 'border-gray-300'}`}
                  placeholder="Mínimo 8 caracteres"
                />
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="agent">Agente — visualiza leads e campanhas</option>
                  <option value="manager">Gerente — acesso completo exceto usuários</option>
                  <option value="admin">Admin — acesso total</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
