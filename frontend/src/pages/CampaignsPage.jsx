import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Megaphone, AlertCircle, CalendarDays, MessageCircle, Layers, Image } from 'lucide-react';
import { campaignsAPI } from '../services/api';
import { useAccountStore } from '../store/accountStore';
import toast from 'react-hot-toast';

const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('pt-BR');
const fmtR = (n) => (n == null || n === '' || isNaN(Number(n))) ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtPct = (n) => (n == null || isNaN(Number(n))) ? '—' : Number(n).toFixed(2) + '%';
const fmtX = (n) => (n == null || isNaN(Number(n)) || Number(n) === 0) ? '—' : Number(n).toFixed(2) + 'x';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(d) { return new Date(Date.now() - d * 86400000).toISOString().slice(0, 10); }

const PRESETS = [
  { label: 'Hoje', from: () => todayStr(), to: () => todayStr() },
  { label: 'Ontem', from: () => daysAgoStr(1), to: () => daysAgoStr(1) },
  { label: '7 dias', from: () => daysAgoStr(6), to: () => todayStr() },
  { label: '30 dias', from: () => daysAgoStr(29), to: () => todayStr() },
  { label: '90 dias', from: () => daysAgoStr(89), to: () => todayStr() },
];

const STATUS_COLOR = (s) =>
  s === 'active' || s === 'enabled' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500';

function DateFilter({ dateFrom, dateTo, setDateFrom, setDateTo }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <CalendarDays size={15} /> Filtrar por período
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => { setDateFrom(p.from()); setDateTo(p.to()); }}
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
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-sm w-36" />
          <span className="text-gray-400 text-sm">→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input text-sm w-36" />
        </div>
      </div>
    </div>
  );
}

function SummaryCards({ items, spendKey = 'spend', impressKey = 'impressions', clicksKey = 'clicks', leadsKey = 'crm_leads', roasKey = 'roas' }) {
  const totalSpend = items.reduce((s, c) => s + parseFloat(c[spendKey] || 0), 0);
  const totalImpressions = items.reduce((s, c) => s + parseInt(c[impressKey] || 0), 0);
  const totalClicks = items.reduce((s, c) => s + parseInt(c[clicksKey] || 0), 0);
  const totalLeads = items.reduce((s, c) => s + parseInt(c[leadsKey] || 0), 0);
  const roasCamps = items.filter(c => c[roasKey] && parseFloat(c[roasKey]) > 0);
  const avgRoas = roasCamps.length ? roasCamps.reduce((s, c) => s + parseFloat(c[roasKey]), 0) / roasCamps.length : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {[
        ['Investido', fmtR(totalSpend)],
        ['Impressões', fmt(totalImpressions)],
        ['Cliques', fmt(totalClicks)],
        ['Leads CRM', fmt(totalLeads)],
        ['ROAS médio', avgRoas > 0 ? avgRoas.toFixed(2) + 'x' : '—'],
      ].map(([label, value]) => (
        <div key={label} className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Aba Campanhas ────────────────────────────────────────────────────────────
function TabCampaigns({ dateFrom, dateTo, platform, setPlatform, adAccountId, syncMeta, syncGoogle, syncMetaPending, syncGooglePending }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns-insights', platform, adAccountId, dateFrom, dateTo],
    queryFn: () => campaignsAPI.getInsights({ platform: platform || undefined, ad_account_id: adAccountId, date_from: dateFrom, date_to: dateTo }).then(r => r.data),
  });

  const campaigns = data?.campaigns || [];
  const hasDailyData = data?.has_daily_data ?? false;

  return (
    <div className="space-y-5">
      {!hasDailyData && campaigns.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-amber-700 text-sm">
          <AlertCircle size={15} className="shrink-0" />
          Dados diários não sincronizados. Clique em <strong className="mx-1">Meta Ads</strong> para atualizar métricas por período.
        </div>
      )}

      <SummaryCards items={campaigns} />

      <div className="flex gap-3">
        {['', 'google_ads', 'meta_ads'].map(p => (
          <button key={p} onClick={() => setPlatform(p)} className={`btn ${platform === p ? 'btn-primary' : 'btn-secondary'}`}>
            {p === '' ? 'Todas' : p === 'google_ads' ? 'Google Ads' : 'Meta Ads'}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? <div className="p-8 text-center text-gray-400">Carregando...</div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>{['Campanha','Plataforma','Status','Impressões','Cliques','CTR','CPC','Investido','ROAS','CPL CRM','Leads CRM'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {campaigns.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-56"><p className="font-medium text-gray-900 truncate">{c.name}</p></td>
                  <td className="px-4 py-3"><span className={`badge ${c.platform === 'google_ads' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>{c.platform === 'google_ads' ? 'Google' : 'Meta'}</span></td>
                  <td className="px-4 py-3"><span className={`badge ${STATUS_COLOR(c.status)}`}>{c.status}</span></td>
                  <td className="px-4 py-3 text-gray-600">{fmt(c.impressions)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt(c.clicks)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtPct(c.ctr)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtR(c.cpc)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{fmtR(c.spend)}</td>
                  <td className="px-4 py-3 font-semibold text-green-600">{fmtX(c.roas)}</td>
                  <td className="px-4 py-3 text-gray-600">{parseInt(c.crm_leads) > 0 ? fmtR(parseFloat(c.spend) / parseInt(c.crm_leads)) : '—'}</td>
                  <td className="px-4 py-3 font-medium text-blue-700">{fmt(c.crm_leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && campaigns.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            <Megaphone size={32} className="mx-auto mb-2 opacity-30" />
            <p>Nenhuma campanha. Sincronize via Meta Ads.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Aba Conjuntos ────────────────────────────────────────────────────────────
function TabAdSets({ dateFrom, dateTo, adAccountId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['adsets-insights', adAccountId, dateFrom, dateTo],
    queryFn: () => campaignsAPI.getAdSetsInsights({ ad_account_id: adAccountId, date_from: dateFrom, date_to: dateTo }).then(r => r.data),
  });

  const adsets = data?.adsets || [];
  const hasDailyData = data?.has_daily_data ?? false;

  return (
    <div className="space-y-5">
      {!hasDailyData && adsets.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-amber-700 text-sm">
          <AlertCircle size={15} className="shrink-0" />
          Sincronize Meta Ads para ver métricas por período nos conjuntos.
        </div>
      )}

      <SummaryCards items={adsets} />

      <div className="card overflow-x-auto">
        {isLoading ? <div className="p-8 text-center text-gray-400">Carregando...</div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>{['Conjunto','Campanha','Status','Impressões','Cliques','CTR','CPC','Investido','ROAS','Leads CRM'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {adsets.map(ag => (
                <tr key={ag.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-52"><p className="font-medium text-gray-900 truncate">{ag.name}</p></td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-40 truncate">{ag.campaign_name}</td>
                  <td className="px-4 py-3"><span className={`badge ${STATUS_COLOR(ag.status)}`}>{ag.status}</span></td>
                  <td className="px-4 py-3 text-gray-600">{fmt(ag.impressions)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt(ag.clicks)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtPct(ag.ctr)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtR(ag.cpc)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{fmtR(ag.spend)}</td>
                  <td className="px-4 py-3 font-semibold text-green-600">{fmtX(ag.roas)}</td>
                  <td className="px-4 py-3 font-medium text-blue-700">{fmt(ag.crm_leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && adsets.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            <Layers size={32} className="mx-auto mb-2 opacity-30" />
            <p>Nenhum conjunto. Sincronize via Meta Ads para carregar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Aba Anúncios ─────────────────────────────────────────────────────────────
function TabAds({ dateFrom, dateTo, adAccountId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ads-insights', adAccountId, dateFrom, dateTo],
    queryFn: () => campaignsAPI.getAdsInsights({ ad_account_id: adAccountId, date_from: dateFrom, date_to: dateTo }).then(r => r.data),
  });

  const ads = data?.ads || [];
  const totalSpend = ads.reduce((s, a) => s + parseFloat(a.spend || 0), 0);
  const totalClicks = ads.reduce((s, a) => s + parseInt(a.clicks || 0), 0);
  const totalImpressions = ads.reduce((s, a) => s + parseInt(a.impressions || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[['Investido', fmtR(totalSpend)], ['Impressões', fmt(totalImpressions)], ['Cliques', fmt(totalClicks)], ['Anúncios ativos', ads.filter(a => a.status === 'active').length]].map(([l, v]) => (
          <div key={l} className="card p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{l}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{v}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? <div className="p-8 text-center text-gray-400">Carregando...</div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>{['Anúncio','Conjunto','Status','Impressões','Cliques','CTR','CPC','Investido','Leads CRM'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ads.map(ad => (
                <tr key={ad.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-56">
                    <div className="flex items-center gap-2">
                      {ad.creative_url
                        ? <img src={ad.creative_url} className="w-8 h-8 rounded object-cover shrink-0" alt="" />
                        : <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center shrink-0"><Image size={14} className="text-gray-400" /></div>
                      }
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{ad.name}</p>
                        {ad.headline && <p className="text-xs text-gray-400 truncate">{ad.headline}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-36 truncate">{ad.adset_name || '—'}</td>
                  <td className="px-4 py-3"><span className={`badge ${STATUS_COLOR(ad.status)}`}>{ad.status}</span></td>
                  <td className="px-4 py-3 text-gray-600">{fmt(ad.impressions)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt(ad.clicks)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtPct(ad.ctr)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtR(ad.cpc)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{fmtR(ad.spend)}</td>
                  <td className="px-4 py-3 font-medium text-blue-700">{fmt(ad.crm_leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && ads.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            <Image size={32} className="mx-auto mb-2 opacity-30" />
            <p>Nenhum anúncio. Sincronize via Meta Ads para carregar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Aba WhatsApp ─────────────────────────────────────────────────────────────
function TabWhatsApp() {
  const backendUrl = import.meta.env.VITE_API_URL || window.location.origin;
  const webhookUrl = `${backendUrl}/api/webhook/whatsapp`;
  const verifyToken = 'atm_tracker_webhook_2024';

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} className="text-green-500" />
          <h3 className="font-semibold text-gray-800">Leads via WhatsApp (Click-to-WhatsApp)</h3>
        </div>
        <p className="text-sm text-gray-600">
          Quando alguém clica no seu anúncio e manda mensagem no WhatsApp, o CRM captura automaticamente como lead e registra a campanha de origem.
          Para ativar, configure o webhook abaixo no <strong>Meta Business Suite → WhatsApp → Configurações de conta → Webhooks</strong>.
        </p>

        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase mb-1">URL do Webhook</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 break-all">
                {webhookUrl}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('URL copiada!'); }}
                className="btn-secondary text-xs shrink-0"
              >Copiar</button>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase mb-1">Token de Verificação</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800">
                {verifyToken}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(verifyToken); toast.success('Token copiado!'); }}
                className="btn-secondary text-xs shrink-0"
              >Copiar</button>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
          <p className="font-semibold">Passo a passo no Meta:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Acesse <strong>business.facebook.com</strong> → WhatsApp → Configurações</li>
            <li>Vá em <strong>Webhooks</strong> e clique em <strong>Editar</strong></li>
            <li>Cole a URL do webhook e o token de verificação acima</li>
            <li>Marque o campo <strong>messages</strong> para assinar</li>
            <li>Clique em <strong>Verificar e salvar</strong></li>
          </ol>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          <p className="font-semibold mb-1">O que acontece depois de configurar:</p>
          <ul className="list-disc list-inside space-y-1 text-green-700">
            <li>Cada nova mensagem no WhatsApp cria um lead automaticamente no CRM</li>
            <li>Leads de anúncios CTWA são vinculados à campanha de origem</li>
            <li>Mensagem de boas-vindas é enviada automaticamente ao novo contato</li>
            <li>Histórico de conversa fica disponível no perfil do lead</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
  { id: 'adsets', label: 'Conjuntos', icon: Layers },
  { id: 'ads', label: 'Anúncios', icon: Image },
  { id: 'whatsapp', label: 'WhatsApp CTWA', icon: MessageCircle },
];

export default function CampaignsPage() {
  const [tab, setTab] = useState('campaigns');
  const [platform, setPlatform] = useState('');
  const [dateFrom, setDateFrom] = useState(daysAgoStr(29));
  const [dateTo, setDateTo] = useState(todayStr());
  const { selected } = useAccountStore();
  const qc = useQueryClient();

  const adAccountId = selected.id !== '__all__' ? selected.meta_ad_account_id : undefined;

  const syncGoogleMutation = useMutation({
    mutationFn: () => campaignsAPI.syncGoogle(),
    onSuccess: (res) => { qc.invalidateQueries(['campaigns-insights']); toast.success(res.data.message); },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao sincronizar Google Ads'),
  });

  const syncMetaMutation = useMutation({
    mutationFn: () => campaignsAPI.syncMeta(adAccountId),
    onSuccess: (res) => {
      qc.invalidateQueries(['campaigns-insights']);
      qc.invalidateQueries(['adsets-insights']);
      qc.invalidateQueries(['ads-insights']);
      toast.success(res.data.message);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro ao sincronizar Meta Ads'),
  });

  const showDateFilter = tab !== 'whatsapp';

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
          {showDateFilter && (
            <p className="text-gray-500 text-sm">Período: {dateFrom} → {dateTo}</p>
          )}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button onClick={() => syncGoogleMutation.mutate()} disabled={syncGoogleMutation.isPending} className="btn-secondary">
            <RefreshCw size={14} className={syncGoogleMutation.isPending ? 'animate-spin' : ''} />Google Ads
          </button>
          <button onClick={() => syncMetaMutation.mutate()} disabled={syncMetaMutation.isPending} className="btn-secondary">
            <RefreshCw size={14} className={syncMetaMutation.isPending ? 'animate-spin' : ''} />Meta Ads
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      {showDateFilter && (
        <DateFilter dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
      )}

      {/* Tab content */}
      {tab === 'campaigns' && (
        <TabCampaigns
          dateFrom={dateFrom} dateTo={dateTo}
          platform={platform} setPlatform={setPlatform}
          adAccountId={adAccountId}
          syncMeta={() => syncMetaMutation.mutate()}
          syncGoogle={() => syncGoogleMutation.mutate()}
          syncMetaPending={syncMetaMutation.isPending}
          syncGooglePending={syncGoogleMutation.isPending}
        />
      )}
      {tab === 'adsets' && <TabAdSets dateFrom={dateFrom} dateTo={dateTo} adAccountId={adAccountId} />}
      {tab === 'ads' && <TabAds dateFrom={dateFrom} dateTo={dateTo} adAccountId={adAccountId} />}
      {tab === 'whatsapp' && <TabWhatsApp />}
    </div>
  );
}
