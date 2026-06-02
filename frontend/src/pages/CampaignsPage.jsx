import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Megaphone, AlertCircle, CalendarDays } from 'lucide-react';
import { campaignsAPI } from '../services/api';
import { useAccountStore } from '../store/accountStore';
import toast from 'react-hot-toast';

const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('pt-BR');
const fmtR = (n) => (n == null || n === '' || isNaN(Number(n))) ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtPct = (n) => (n == null || isNaN(Number(n))) ? '—' : Number(n).toFixed(2) + '%';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

const PRESETS = [
  { label: 'Hoje', from: () => todayStr(), to: () => todayStr() },
  { label: 'Ontem', from: () => daysAgoStr(1), to: () => daysAgoStr(1) },
  { label: '7 dias', from: () => daysAgoStr(6), to: () => todayStr() },
  { label: '30 dias', from: () => daysAgoStr(29), to: () => todayStr() },
  { label: '90 dias', from: () => daysAgoStr(89), to: () => todayStr() },
];

export default function CampaignsPage() {
  const [platform, setPlatform] = useState('');
  const [dateFrom, setDateFrom] = useState(daysAgoStr(29));
  const [dateTo, setDateTo] = useState(todayStr());
  const { selected } = useAccountStore();
  const qc = useQueryClient();

  const adAccountId = selected.id !== '__all__' ? selected.meta_ad_account_id : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns-insights', platform, adAccountId, dateFrom, dateTo],
    queryFn: () => campaignsAPI.getInsights({
      platform: platform || undefined,
      ad_account_id: adAccountId,
      date_from: dateFrom,
      date_to: dateTo,
    }).then(r => r.data),
  });

  const syncGoogleMutation = useMutation({
    mutationFn: () => campaignsAPI.syncGoogle(),
    onSuccess: (res) => {
      qc.invalidateQueries(['campaigns-insights']);
      toast.success(res.data.message);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao sincronizar Google Ads'),
  });

  const syncMetaMutation = useMutation({
    mutationFn: () => campaignsAPI.syncMeta(adAccountId),
    onSuccess: (res) => {
      qc.invalidateQueries(['campaigns-insights']);
      toast.success(res.data.message);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao sincronizar Meta Ads'),
  });

  const campaigns = data?.campaigns || [];
  const hasDailyData = data?.has_daily_data ?? false;

  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.spend || 0), 0);
  const totalLeads = campaigns.reduce((s, c) => s + parseInt(c.crm_leads || 0), 0);
  const totalImpressions = campaigns.reduce((s, c) => s + parseInt(c.impressions || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + parseInt(c.clicks || 0), 0);
  const roasCamps = campaigns.filter(c => c.roas && parseFloat(c.roas) > 0);
  const avgRoas = roasCamps.length
    ? roasCamps.reduce((s, c) => s + parseFloat(c.roas), 0) / roasCamps.length
    : 0;

  function applyPreset(preset) {
    setDateFrom(preset.from());
    setDateTo(preset.to());
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
          <p className="text-gray-500 text-sm">{campaigns.length} campanhas · período: {dateFrom} → {dateTo}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
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

      {/* Date filter */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <CalendarDays size={15} />
          Filtrar por período
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                dateFrom === p.from() && dateTo === p.to()
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="input text-sm w-36"
            />
            <span className="text-gray-400 text-sm">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="input text-sm w-36"
            />
          </div>
        </div>
      </div>

      {/* Warning: no daily data */}
      {!hasDailyData && campaigns.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-amber-700 text-sm">
          <AlertCircle size={15} className="shrink-0" />
          <span>
            Dados diários ainda não sincronizados. Clique em <strong>Meta Ads</strong> para sincronizar e ver métricas exatas por período.
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Investido</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmtR(totalSpend)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Impressões</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totalImpressions)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Cliques</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totalClicks)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Leads CRM</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totalLeads)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">ROAS médio</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{avgRoas > 0 ? avgRoas.toFixed(2) + 'x' : '—'}</p>
        </div>
      </div>

      {/* Platform filter */}
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
              {campaigns.map(c => {
                const cplCrm = parseInt(c.crm_leads) > 0
                  ? parseFloat(c.spend || 0) / parseInt(c.crm_leads)
                  : null;
                return (
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
                    <td className="px-4 py-3 font-semibold text-green-600">
                      {c.roas && parseFloat(c.roas) > 0 ? parseFloat(c.roas).toFixed(2) + 'x' : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtR(cplCrm)}</td>
                    <td className="px-4 py-3 font-medium text-blue-700">{fmt(c.crm_leads)}</td>
                  </tr>
                );
              })}
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
