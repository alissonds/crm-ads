import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageCircle, Phone, Mail, MapPin, Tag, Clock, Zap, DollarSign, Send } from 'lucide-react';
import { leadsAPI, conversionsAPI } from '../services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Novo', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Contactado', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'qualified', label: 'Qualificado', color: 'bg-purple-100 text-purple-700' },
  { value: 'proposal', label: 'Proposta', color: 'bg-orange-100 text-orange-700' },
  { value: 'negotiation', label: 'Negociação', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'won', label: 'Ganho', color: 'bg-green-100 text-green-700' },
  { value: 'lost', label: 'Perdido', color: 'bg-red-100 text-red-700' },
];

const ACTIVITY_ICONS = {
  note: '📝', call: '📞', whatsapp: '💬', email: '✉️',
  meeting: '🤝', status_change: '🔄', conversion: '💰',
  assignment: '👤', automation: '⚡',
};

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [actForm, setActForm] = useState({ type: 'note', title: '', description: '' });
  const [showConversion, setShowConversion] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsAPI.getById(id).then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (upd) => leadsAPI.update(id, upd),
    onSuccess: () => { qc.invalidateQueries(['lead', id]); toast.success('Atualizado!'); },
  });

  const actMutation = useMutation({
    mutationFn: (data) => leadsAPI.addActivity(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['lead', id]);
      setActForm({ type: 'note', title: '', description: '' });
      toast.success('Atividade adicionada!');
    },
  });

  const convMutation = useMutation({
    mutationFn: (data) => conversionsAPI.send(data),
    onSuccess: () => { setShowConversion(false); toast.success('Conversão enviada para as plataformas!'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Erro'),
  });

  if (isLoading) return <div className="p-8 text-center text-gray-400">Carregando...</div>;
  const { lead, activities, attribution } = data || {};
  if (!lead) return <div className="p-8 text-center text-gray-400">Lead não encontrado</div>;

  const currentStatus = STATUS_OPTIONS.find(s => s.value === lead.status);
  const whatsappUrl = lead.whatsapp || lead.phone
    ? `https://wa.me/${(lead.whatsapp || lead.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${lead.name || ''}! Entrando em contato...`)}`
    : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/leads')} className="btn-ghost p-2">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{lead.name || '(sem nome)'}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`badge ${currentStatus?.color}`}>{currentStatus?.label}</span>
            <span className="text-xs text-gray-400">Score: {lead.score}/100</span>
            <span className="text-xs text-gray-400">Criado: {new Date(lead.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="btn bg-green-500 text-white hover:bg-green-600 gap-2">
              <MessageCircle size={15} /> WhatsApp
            </a>
          )}
          <button onClick={() => setShowConversion(true)} className="btn-secondary">
            <DollarSign size={15} /> Conversão
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Info + Status */}
        <div className="space-y-4">
          {/* Contact */}
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-700 text-sm">Contato</h3>
            {lead.email && <div className="flex items-center gap-2 text-sm text-gray-600"><Mail size={14} />{lead.email}</div>}
            {lead.phone && <div className="flex items-center gap-2 text-sm text-gray-600"><Phone size={14} />{lead.phone}</div>}
            {lead.whatsapp && <div className="flex items-center gap-2 text-sm text-gray-600"><MessageCircle size={14} />{lead.whatsapp}</div>}
            {lead.company && <div className="flex items-center gap-2 text-sm text-gray-600"><MapPin size={14} />{lead.company}</div>}
          </div>

          {/* Status change */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">Status</h3>
            <div className="space-y-1.5">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => updateMutation.mutate({ status: s.value })}
                  className={clsx(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-all',
                    lead.status === s.value ? `${s.color} font-medium` : 'hover:bg-gray-50 text-gray-600'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority & Value */}
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-gray-700 text-sm">Qualificação</h3>
            <div>
              <label className="label text-xs">Prioridade</label>
              <select
                value={lead.priority}
                onChange={(e) => updateMutation.mutate({ priority: e.target.value })}
                className="input text-sm"
              >
                {['low', 'medium', 'high', 'urgent'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs">Valor estimado (R$)</label>
              <input
                type="number"
                defaultValue={lead.estimated_value}
                onBlur={(e) => updateMutation.mutate({ estimated_value: e.target.value })}
                className="input text-sm"
              />
            </div>
          </div>
        </div>

        {/* Center: Attribution + Activities */}
        <div className="lg:col-span-2 space-y-4">
          {/* UTM Attribution */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2">
              <Tag size={14} /> Rastreamento / Atribuição
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                ['Origem', lead.utm_source],
                ['Meio', lead.utm_medium],
                ['Campanha', lead.utm_campaign],
                ['Keyword', lead.utm_term || lead.keyword],
                ['Conteúdo', lead.utm_content],
                ['GCLID', lead.gclid ? lead.gclid.slice(0, 20) + '...' : null],
                ['FBCLID', lead.fbclid ? lead.fbclid.slice(0, 20) + '...' : null],
                ['Canal', lead.source_channel],
                ['Campanha API', lead.campaign_name],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs text-gray-400 font-medium">{k}</p>
                  <p className="text-sm text-gray-700 font-medium truncate">{v}</p>
                </div>
              ))}
            </div>
            {lead.landing_page_url && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-gray-400 mb-1">Landing Page</p>
                <a href={lead.landing_page_url} target="_blank" rel="noreferrer"
                   className="text-xs text-blue-600 hover:underline truncate block">
                  {lead.landing_page_url}
                </a>
              </div>
            )}
          </div>

          {/* Attribution model */}
          {attribution?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-700 text-sm mb-3">Touchpoints de Atribuição</h3>
              <div className="space-y-2">
                {attribution.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">{a.touchpoint_order}</span>
                    <span className="flex-1 text-gray-700">{a.campaign_name || a.utm_campaign || a.utm_source}</span>
                    <span className="text-gray-400 text-xs">{(a.weight * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add activity */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">Adicionar Atividade</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select value={actForm.type} onChange={e => setActForm(f => ({...f, type: e.target.value}))} className="input text-sm">
                  {['note', 'call', 'whatsapp', 'email', 'meeting'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  value={actForm.title}
                  onChange={e => setActForm(f => ({...f, title: e.target.value}))}
                  className="input text-sm"
                  placeholder="Título"
                />
              </div>
              <textarea
                value={actForm.description}
                onChange={e => setActForm(f => ({...f, description: e.target.value}))}
                className="input text-sm h-20 resize-none"
                placeholder="Notas, observações..."
              />
              <button
                onClick={() => actMutation.mutate(actForm)}
                disabled={!actForm.title || actMutation.isPending}
                className="btn-primary"
              >
                <Send size={14} /> Registrar
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-700 text-sm mb-4 flex items-center gap-2">
              <Clock size={14} /> Timeline
            </h3>
            <div className="space-y-3">
              {activities?.map(act => (
                <div key={act.id} className="flex gap-3">
                  <span className="text-lg leading-none">{ACTIVITY_ICONS[act.type] || '📌'}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-gray-800">{act.title}</p>
                      <span className="text-xs text-gray-400">{act.user_name || 'Sistema'}</span>
                    </div>
                    {act.description && <p className="text-xs text-gray-500 mt-0.5">{act.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(act.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
              {!activities?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhuma atividade ainda</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Conversion modal */}
      {showConversion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b">
              <h2 className="font-bold">Enviar Conversão</h2>
              <p className="text-sm text-gray-500 mt-0.5">Envia para Google Ads e/ou Meta Ads</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              convMutation.mutate({ lead_id: id, type: fd.get('type'), value: parseFloat(fd.get('value')), currency: 'BRL' });
            }} className="p-5 space-y-4">
              <div>
                <label className="label">Tipo</label>
                <select name="type" className="input">
                  <option value="lead">Lead</option>
                  <option value="qualified_lead">Lead Qualificado</option>
                  <option value="sale">Venda</option>
                  <option value="checkout">Checkout</option>
                </select>
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input name="value" type="number" step="0.01" defaultValue={lead.actual_value || lead.estimated_value || 0} className="input" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowConversion(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={convMutation.isPending} className="btn-primary flex-1">
                  {convMutation.isPending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
