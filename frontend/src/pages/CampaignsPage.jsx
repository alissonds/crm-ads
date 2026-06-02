import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, BarChart3, Megaphone } from 'lucide-react';
import { campaignsAPI } from '../services/api';
import { useAccountStore } from '../store/accountStore';
import toast from 'react-hot-toast';

const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('pt-BR');
const fmtR = (n) => n == null ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtPct = (n) => n == null ? '—' : Number(n).toFixed(2) + '%';

export default function CampaignsPage() {
  const [platform, setPlatform] = useState('');
  const { selected } = useAccountStore();
  const qc = useQueryClient();

  const adAccountId = selected.id !== '__all__' ? selected.meta_ad_account_id : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', platform, adAccountId],
    queryFn: () => campaignsAPI.list({ platform, limit: 100, ad_account_id: adAccountId }).then(r => r.data),
  });

  const syncGoogleMutation = useMutation({
    mutationFn: () => campaignsAPI.syncGoogle(),
    onSuccess: (res) => {
      qc.invalidateQueries(['campaigns']);
      toast.success(res.data.message);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao sincronizar Google Ads'),
  });

  const syncMetaMutation = useMutation({
    mutationFn: () => campaignsAPI.syncMeta(adAccountId),
    onSuccess: (res) => {
      qc.invalidateQueries(['campaigns']);
      toast.success(res.data.message);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao sincronizar Meta Ads'),
  });

  const campaigns = data?.campaigns || [];
  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.spend || 0), 0);
  const totalLeads = campaigns.reduce((s, c) => s + parseInt(c.crm_leads || 0), 0);
  const avgRoas = campaigns.filter(c => c.roas).reduce((s, c, _, a) => s + parseFloat(c.roas) / a.length, 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
          <p className="text-gray-500 text-sm">{campaigns.length} campanhas sincronizadas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => syncGoogleMutation.mutate()}
            disabled={syncGoogleMutation.isPending}
            className="btn-secondary"
          >
            <RefreshCw size={14} className={syncGoogleMutation.isPending ? 'animate-spin' : ''} />
            Google Ads
          </button>
          <button
            onClick={() => syncMetaMutation.mutate()}
            disabled={syncMetaMutation.isPending}
            className="btn-secondary"
          >
            <RefreshCw size={14} className={syncMetaMutation.isPending ? 'animate-spin' : ''} />
            Meta Ads
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Investido</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtR(totalSpend)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Leads CRM</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totalLeads)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">ROAS médio</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{avgRoas.toFixed(2)}x</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        {['', 'google_ads', 'meta_ads'].map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`btn ${platform === p ? 'btn-primary' : 'btn-secondary'}`}
          >
            {p === '' ? 'Todas' : p === 'google_ads' ? 'Google Ads' : 'Meta Ads'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Campanha', 'Plataforma', 'Status', 'Impressões', 'Cliques', 'CTR', 'CPC', 'Investido', 'Conv.', 'ROAS', 'CPL CRM', 'Leads CRM'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-56">
                    <p className="font-medium text-gray-900 truncate">{c.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${c.platform === 'google_ads' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      {c.platform === 'google_ads' ? 'Google' : 'Meta'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${c.status === 'active' || c.status === 'enabled' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fmt(c.impressions)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt(c.clicks)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtPct(c.ctr)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtR(c.cpc)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{fmtR(c.spend)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt(c.conversions)}</td>
                  <td className="px-4 py-3 font-semibold text-green-600">{c.roas ? c.roas.toFixed(2) + 'x' : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.crm_leads > 0 ? fmtR(parseFloat(c.spend || 0) / parseInt(c.crm_leads)) : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-blue-700">{fmt(c.crm_leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!isLoading && campaigns.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            <Megaphone size={32} className="mx-auto mb-2 opacity-30" />
            <p>Nenhuma campanha. Sincronize via Google Ads ou Meta Ads.</p>
          </div>
        )}
      </div>
    </div>
  );
}
