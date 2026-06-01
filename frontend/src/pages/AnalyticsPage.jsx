import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsAPI } from '../services/api';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import StatCard from '../components/common/StatCard';
import { BarChart3, Target, DollarSign, Key } from 'lucide-react';

const fmtR = (n) => n == null ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0 });

export default function AnalyticsPage() {
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const params = { date_from: dateFrom, date_to: dateTo };

  const { data: campaigns, isLoading: cLoading } = useQuery({
    queryKey: ['analytics-campaigns', params],
    queryFn: () => analyticsAPI.campaigns(params).then(r => r.data),
  });

  const { data: keywords, isLoading: kLoading } = useQuery({
    queryKey: ['analytics-keywords', params],
    queryFn: () => analyticsAPI.keywords({}).then(r => r.data),
  });

  const { data: attribution } = useQuery({
    queryKey: ['analytics-attribution', params],
    queryFn: () => analyticsAPI.attribution(params).then(r => r.data),
  });

  const topCampaigns = (campaigns?.campaigns || []).slice(0, 10);
  const topKeywords = (keywords?.keywords || []).slice(0, 10);

  const chartData = topCampaigns.map(c => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name,
    Investido: parseFloat(c.spend || 0),
    'Leads CRM': parseInt(c.crm_leads || 0),
    ROAS: parseFloat(c.roas || 0),
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm">Performance de campanhas, keywords e atribuição</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-sm w-36" />
          <span className="text-gray-400">→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input text-sm w-36" />
        </div>
      </div>

      {/* Campaign chart */}
      {chartData.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Performance das Campanhas</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={160} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Investido" fill="#3b82f6" radius={[0, 3, 3, 0]} />
              <Bar dataKey="Leads CRM" fill="#10b981" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Campaigns table */}
      <div className="card">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-800">Campanhas Detalhadas</h3>
        </div>
        <div className="overflow-x-auto">
          {cLoading ? (
            <div className="p-8 text-center text-gray-400">Carregando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Campanha', 'Plataforma', 'Investido', 'Imp.', 'Cliques', 'CTR', 'CPC', 'Conv.', 'CPA', 'ROAS', 'Leads CRM', 'Receita CRM'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topCampaigns.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 max-w-40 truncate font-medium text-gray-900">{c.name}</td>
                    <td className="px-3 py-2.5">
                      <span className={`badge ${c.platform === 'google_ads' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {c.platform === 'google_ads' ? 'G' : 'M'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{fmtR(c.spend)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{Number(c.impressions || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-gray-600">{Number(c.clicks || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-gray-600">{c.ctr ? Number(c.ctr).toFixed(2) + '%' : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmtR(c.cpc)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{c.conversions || 0}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmtR(c.cpa)}</td>
                    <td className="px-3 py-2.5 font-semibold text-green-600">{c.roas ? Number(c.roas).toFixed(2) + 'x' : '—'}</td>
                    <td className="px-3 py-2.5 text-blue-700 font-medium">{c.crm_leads || 0}</td>
                    <td className="px-3 py-2.5 text-purple-700 font-medium">{fmtR(c.crm_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Keywords */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Key size={16} className="text-gray-500" />
          <h3 className="font-semibold text-gray-800">Keywords</h3>
        </div>
        <div className="overflow-x-auto">
          {kLoading ? (
            <div className="p-8 text-center text-gray-400">Carregando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Keyword', 'Match', 'Impressões', 'Cliques', 'CTR', 'CPC', 'Investido', 'Conv.', 'QScore', 'Leads CRM'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topKeywords.map(k => (
                  <tr key={k.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900">{k.keyword_text}</td>
                    <td className="px-3 py-2.5">
                      <span className="badge bg-gray-100 text-gray-600 text-xs">{k.match_type || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{Number(k.impressions || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-gray-600">{Number(k.clicks || 0).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-gray-600">{k.ctr ? Number(k.ctr).toFixed(2) + '%' : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmtR(k.cpc)}</td>
                    <td className="px-3 py-2.5 font-medium">{fmtR(k.spend)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{k.conversions || 0}</td>
                    <td className="px-3 py-2.5">
                      {k.quality_score && (
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${k.quality_score >= 7 ? 'bg-green-500' : k.quality_score >= 5 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                          <span className="text-xs">{k.quality_score}/10</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-blue-700 font-medium">{k.crm_leads || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Attribution */}
      {attribution?.attribution?.length > 0 && (
        <div className="card">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-800">Relatório de Atribuição</h3>
            <p className="text-xs text-gray-500 mt-0.5">Modelo: last-touch por padrão</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Plataforma', 'Campanha', 'Origem', 'Keyword', 'Leads Atrib.', 'Valor Atrib.', 'Ganhos'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {attribution.attribution.slice(0, 20).map((a, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5">
                      <span className={`badge ${a.platform === 'google_ads' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {a.platform}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-40 truncate">{a.campaign_name || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{a.utm_source || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{a.keyword || '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-blue-700">{a.attributed_leads}</td>
                    <td className="px-3 py-2.5 text-gray-700">{fmtR(a.attributed_value)}</td>
                    <td className="px-3 py-2.5 text-green-700 font-medium">{a.won_leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
