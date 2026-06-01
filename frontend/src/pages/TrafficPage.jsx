import { useQuery } from '@tanstack/react-query';
import { trackingAPI } from '../services/api';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import StatCard from '../components/common/StatCard';
import { Activity, Globe, Smartphone, Monitor } from 'lucide-react';

export default function TrafficPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['traffic-dashboard'],
    queryFn: () => trackingAPI.dashboard({}).then(r => r.data),
    refetchInterval: 120000,
  });

  const sessions = data?.sessions || [];
  const bySource = data?.bySource || [];
  const byDevice = data?.byDevice || [];
  const keywords = data?.topKeywords || [];

  const totalSessions = sessions.reduce((s, d) => s + parseInt(d.sessions || 0), 0);
  const totalLeads = bySource.reduce((s, d) => s + parseInt(d.leads || 0), 0);

  const deviceIcon = { desktop: Monitor, mobile: Smartphone, tablet: Smartphone };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tráfego</h1>
        <p className="text-gray-500 text-sm">Rastreamento UTM, GCLID e FBCLID — últimos 30 dias</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Sessões" value={totalSessions.toLocaleString('pt-BR')} icon={Activity} color="blue" loading={isLoading} />
        <StatCard title="Leads Capturados" value={totalLeads.toLocaleString('pt-BR')} icon={Globe} color="green" loading={isLoading} />
        <StatCard
          title="Taxa Conversão"
          value={totalSessions > 0 ? ((totalLeads / totalSessions) * 100).toFixed(1) + '%' : '0%'}
          icon={Activity}
          color="purple"
          loading={isLoading}
        />
        <StatCard title="Fontes Ativas" value={bySource.length} icon={Globe} color="orange" loading={isLoading} />
      </div>

      {/* Sessions chart */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Sessões por dia</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={sessions.map(s => ({ date: s.date?.slice(5), sessions: parseInt(s.sessions) }))}>
            <defs>
              <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area type="monotone" dataKey="sessions" stroke="#8b5cf6" fill="url(#sessGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By source */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Top Origens</h3>
          <div className="space-y-2">
            {bySource.slice(0, 10).map(s => (
              <div key={`${s.utm_source}-${s.utm_medium}`} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">
                      {s.utm_source || 'direto'} {s.utm_medium ? `/ ${s.utm_medium}` : ''}
                    </span>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>{parseInt(s.sessions || 0).toLocaleString()} sessões</span>
                      <span className="text-blue-600 font-medium">{parseInt(s.leads || 0)} leads</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (parseInt(s.sessions) / Math.max(...bySource.map(x => parseInt(x.sessions)))) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By device */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Dispositivos</h3>
          <div className="space-y-3">
            {byDevice.map(d => {
              const Icon = deviceIcon[d.device_type] || Globe;
              const pct = totalSessions > 0 ? ((parseInt(d.count) / totalSessions) * 100).toFixed(1) : 0;
              return (
                <div key={d.device_type} className="flex items-center gap-3">
                  <Icon size={18} className="text-gray-400" />
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm capitalize text-gray-700">{d.device_type || 'desconhecido'}</span>
                      <span className="text-sm font-medium text-gray-900">{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top keywords */}
      {keywords.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Top Keywords</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Keyword', 'Sessões', 'Leads', 'Conv. Rate'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {keywords.map(kw => (
                  <tr key={kw.keyword} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{kw.keyword}</td>
                    <td className="px-4 py-2.5 text-gray-600">{parseInt(kw.sessions).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-blue-700 font-medium">{parseInt(kw.leads)}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {kw.sessions > 0 ? ((kw.leads / kw.sessions) * 100).toFixed(1) + '%' : '0%'}
                    </td>
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
