import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, ChevronDown, MessageCircle, Tag, Star, Users } from 'lucide-react';
import { leadsAPI } from '../services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_CONFIG = {
  new: { label: 'Novo', color: 'bg-blue-100 text-blue-700' },
  contacted: { label: 'Contactado', color: 'bg-yellow-100 text-yellow-700' },
  qualified: { label: 'Qualificado', color: 'bg-purple-100 text-purple-700' },
  proposal: { label: 'Proposta', color: 'bg-orange-100 text-orange-700' },
  negotiation: { label: 'Negociação', color: 'bg-indigo-100 text-indigo-700' },
  won: { label: 'Ganho', color: 'bg-green-100 text-green-700' },
  lost: { label: 'Perdido', color: 'bg-red-100 text-red-700' },
  disqualified: { label: 'Desqualificado', color: 'bg-gray-100 text-gray-600' },
};

const PRIORITY_CONFIG = {
  low: { label: 'Baixa', color: 'text-gray-400' },
  medium: { label: 'Média', color: 'text-yellow-500' },
  high: { label: 'Alta', color: 'text-orange-500' },
  urgent: { label: 'Urgente', color: 'text-red-500' },
};

const SOURCE_ICON = {
  google: '🔵',
  google_ads: '🔵',
  facebook: '🟦',
  instagram: '🟣',
  whatsapp: '🟢',
  organic: '⚪',
};

export default function LeadsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', { search, status, page }],
    queryFn: () => leadsAPI.list({ search, status, page, limit: 30 }).then(r => r.data),
    keepPreviousData: true,
  });

  const createMutation = useMutation({
    mutationFn: (data) => leadsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['leads']);
      setShowCreate(false);
      toast.success('Lead criado!');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao criar lead'),
  });

  const handleCreate = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    createMutation.mutate(data);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-500 text-sm mt-0.5">{data?.total || 0} leads no total</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> Novo Lead
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
            placeholder="Buscar por nome, email, telefone..."
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="input w-40"
        >
          <option value="">Todos status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Lead', 'Origem', 'Campanha', 'Status', 'Score', 'Prioridade', 'Data', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.leads?.map(lead => (
                  <tr
                    key={lead.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/leads/${lead.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{lead.name || '(sem nome)'}</p>
                      <p className="text-gray-400 text-xs">{lead.email || lead.phone || lead.whatsapp}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-600">
                        <span>{SOURCE_ICON[lead.utm_source] || '⚫'}</span>
                        <span className="text-xs">{lead.utm_source || 'direto'}</span>
                      </span>
                      {lead.utm_campaign && (
                        <p className="text-xs text-gray-400 truncate max-w-32">{lead.utm_campaign}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-40 truncate">
                      {lead.campaign_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${STATUS_CONFIG[lead.status]?.color}`}>
                        {STATUS_CONFIG[lead.status]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${lead.score || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">{lead.score || 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${PRIORITY_CONFIG[lead.priority]?.color}`}>
                        {PRIORITY_CONFIG[lead.priority]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      {(lead.whatsapp || lead.phone) && (
                        <a
                          href={`https://wa.me/${(lead.whatsapp || lead.phone).replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-green-500 hover:text-green-600"
                        >
                          <MessageCircle size={16} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data?.leads?.length === 0 && (
              <div className="p-12 text-center text-gray-400">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p>Nenhum lead encontrado</p>
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {data?.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Página {data.page} de {data.pages} — {data.total} leads
            </p>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="btn-secondary text-xs py-1"
              >Anterior</button>
              <button
                disabled={page === data.pages}
                onClick={() => setPage(p => p + 1)}
                className="btn-secondary text-xs py-1"
              >Próxima</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="p-6 border-b">
              <h2 className="font-bold text-lg">Novo Lead</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Nome</label><input name="name" className="input" /></div>
                <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
                <div><label className="label">WhatsApp</label><input name="whatsapp" className="input" placeholder="55119..." /></div>
                <div><label className="label">Empresa</label><input name="company" className="input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Origem (utm_source)</label>
                  <select name="utm_source" className="input">
                    <option value="">Selecione</option>
                    <option value="google">Google</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="organic">Orgânico</option>
                  </select>
                </div>
                <div><label className="label">Campanha</label><input name="utm_campaign" className="input" /></div>
              </div>
              <div>
                <label className="label">Valor estimado (R$)</label>
                <input name="estimated_value" type="number" step="0.01" className="input" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
                  {createMutation.isPending ? 'Criando...' : 'Criar Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
