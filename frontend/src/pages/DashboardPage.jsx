import { useQuery } from '@tanstack/react-query';
import { Users, TrendingUp, DollarSign, Target, Zap, BarChart3, Activity, RefreshCw } from 'lucide-react';
import { analyticsAPI, campaignsAPI } from '../services/api';
import StatCard from '../components/common/StatCard';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('pt-BR');
const fmtR = (n) => n == null ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
const fmtPct = (n) => n == null ? '—' : Number(n).toFixed(2) + '%';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function DashboardPage() {
  const { data: overview, isLoading: loadingOv } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => analyticsAPI.overview({}).then(r => r.data),
    refetchInterval: 60000,
  });

  const { data: chart } = useQuery({
    queryKey: ['analytics-chart'],
    queryFn: () => analyticsAPI.chart({}).then(r => r.data),
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns-top'],
    queryFn: () => campaignsAPI.list({ limit: 5 }).then(r => r.data),
  });

  const leads = overview?.leads || {};
  const roas = overview?.roas || [];
  const cpl = overview?.cplByPlatform || [];

  // Agrupa dados do chart por data
  const chartData = (chart?.chart || []).reduce((acc, row) => {
    const existing = acc.find(d => d.date === row.date);
    if (existing) {
      existing.leads = (existing.leads || 0) + parseInt(row.leads);
    } else {
      acc.push({ date: row.date?.slice(5), leads: parseInt(row.leads) });
    }
    return acc;
  }, []).slice(-30);

  const statusData = [
    { name: 'Novos', value: parseInt(leads.new_leads || 0), color: '#3b82f6' },
    { name: 'Ganhos', value: parseInt(leads.won || 0), color: '#10b981' },
    { name: 'Perdidos', value: parseInt(leads.lost || 0), color: '#ef4444' },
  ];

  const platformData = cpl.map(p => ({
    name: p.platform === 'google_ads' ? 'Google Ads' : 'Meta Ads',
    leads: parseInt(p.leads || 0),
    spend: parseFloat(p.spend || 0),
    cpl: parseFloat(p.cpl || 0),
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Visão geral dos últimos 30 dias</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total de Leads"
          value={fmt(leads.total)}
          sub={`${fmt(leads.new_leads)} novos`}
          icon={Users}
          color="blue"
          loading={loadingOv}
        />
        <StatCard
          title="Leads Ganhos"
          value={fmt(leads.won)}
          sub={`Score médio: ${Number(leads.avg_score || 0).toFixed(0)}`}
          icon={Target}
          color="green"
          loading={loadingOv}
        />
        <StatCard
          title="Receita CRM"
          value={fmtR(leads.revenue)}
          sub="Oportunidades fechadas"
          icon={DollarSign}
          color="purple"
          loading={loadingOv}
        />
        <StatCard
          title="Pipeline"
          value={fmtR(leads.pipeline_value)}
          sub="Valor estimado"
          icon={TrendingUp}
          color="orange"
          loading={loadingOv}
        />
      </div>

      {/* ROAS / CPL */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {roas.map(r => (
          <StatCard
            key={r.platform}
            title={`ROAS ${r.platform === 'google_ads' ? 'Google' : 'Meta'}`}
            value={`${Number(r.roas || 0).toFixed(2)}x`}
            sub={`Investido: ${fmtR(r.spend)}`}
            icon={BarChart3}
            color={r.platform === 'google_ads' ? 'blue' : 'indigo'}
            loading={loadingOv}
          />
        ))}
        {platformData.map(p => (
          <StatCard
            key={p.name}
            title={`CPL ${p.name}`}
            value={fmtR(p.cpl)}
            sub={`${fmt(p.leads)} leads`}
            icon={Activity}
            color="orange"
            loading={loadingOv}
          />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads por dia */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-semibold text-gray-800 mb-4">Leads por dia</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v, 'Leads']} />
              <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="url(#leadGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status distribution */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Status dos Leads</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [v, 'Leads']} />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Platform performance */}
      {platformData.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Performance por Plataforma</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={platformData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
              <Tooltip />
              <Legend />
              <Bar dataKey="leads" fill="#3b82f6" name="Leads" radius={[0, 4, 4, 0]} />
              <Bar dataKey="spend" fill="#10b981" name="Investimento (R$)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top campaigns table */}
      {campaigns?.campaigns?.length > 0 && (
        <div className="card">
          <div className="p-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Top Campanhas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Campanha', 'Plataforma', 'Leads CRM', 'Investido', 'CPL', 'ROAS'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campaigns.campaigns.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-xs">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${c.platform === 'google_ads' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {c.platform === 'google_ads' ? 'Google' : 'Meta'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmt(c.crm_leads)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtR(c.spend)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtR(c.cpa)}</td>
                    <td className="px-4 py-3 font-semibold text-green-600">{c.roas ? c.roas.toFixed(2) + 'x' : '—'}</td>
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
