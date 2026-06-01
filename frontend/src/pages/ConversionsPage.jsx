import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversionsAPI } from '../services/api';
import { RefreshCw, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  pending: { label: 'Pendente', icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
  sent: { label: 'Enviado', icon: CheckCircle, color: 'text-green-600 bg-green-50' },
  failed: { label: 'Falhou', icon: XCircle, color: 'text-red-600 bg-red-50' },
  skipped: { label: 'Ignorado', icon: Clock, color: 'text-gray-500 bg-gray-50' },
};

export default function ConversionsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['conversions'],
    queryFn: () => conversionsAPI.list({}).then(r => r.data),
    refetchInterval: 30000,
  });

  const retryMutation = useMutation({
    mutationFn: () => conversionsAPI.retry(),
    onSuccess: () => { qc.invalidateQueries(['conversions']); toast.success('Reenvio iniciado!'); },
  });

  const conversions = data?.conversions || [];
  const sent = conversions.filter(c => c.status === 'sent').length;
  const failed = conversions.filter(c => c.status === 'failed').length;
  const pending = conversions.filter(c => c.status === 'pending').length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversões Offline</h1>
          <p className="text-gray-500 text-sm">Envio automático para Google Ads e Meta Ads</p>
        </div>
        <button
          onClick={() => retryMutation.mutate()}
          disabled={retryMutation.isPending}
          className="btn-secondary"
        >
          <RefreshCw size={14} className={retryMutation.isPending ? 'animate-spin' : ''} />
          Reenviar falhas
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Enviadas</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{sent}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pendentes</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{pending}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Falhas</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{failed}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Carregando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Lead', 'Tipo', 'Plataforma', 'Valor', 'GCLID/FBCLID', 'Status', 'Data', 'Erro'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {conversions.map(c => {
                  const st = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending;
                  const StIcon = st.icon;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.lead_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.type}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${c.platform === 'google_ads' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {c.platform === 'google_ads' ? 'Google' : 'Meta'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {c.conversion_value ? `R$ ${Number(c.conversion_value).toLocaleString('pt-BR')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">
                        {c.gclid ? c.gclid.slice(0, 16) + '…' : c.fbclid ? c.fbclid.slice(0, 16) + '…' : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${st.color} flex items-center gap-1 w-fit`}>
                          <StIcon size={11} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(c.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-red-500 text-xs max-w-40 truncate">
                        {c.error_message || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!isLoading && conversions.length === 0 && (
            <div className="p-12 text-center text-gray-400">
              <Send size={32} className="mx-auto mb-2 opacity-30" />
              <p>Nenhuma conversão registrada ainda</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
