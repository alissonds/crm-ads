import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationsAPI } from '../services/api';
import { Plus, Zap, Play, Trash2, Edit, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const TRIGGER_LABELS = {
  lead_created: 'Lead criado',
  lead_status_changed: 'Status alterado',
  lead_scored: 'Score calculado',
  keyword_matched: 'Keyword encontrada',
  campaign_matched: 'Campanha identificada',
  source_matched: 'Origem identificada',
};

const ACTION_TYPES = [
  { value: 'set_priority', label: 'Definir prioridade' },
  { value: 'set_status', label: 'Definir status' },
  { value: 'add_tag', label: 'Adicionar tag' },
  { value: 'assign_to', label: 'Atribuir a vendedor' },
  { value: 'set_score', label: 'Definir score' },
  { value: 'add_note', label: 'Adicionar nota' },
  { value: 'send_webhook', label: 'Enviar webhook' },
];

const EXAMPLE_AUTOMATIONS = [
  {
    name: 'Lead Google Ads → Alta Prioridade',
    trigger_type: 'lead_created',
    conditions: [{ field: 'utm_source', operator: 'equals', value: 'google' }],
    actions: [
      { type: 'set_priority', value: 'high' },
      { type: 'add_tag', value: 'google-ads' },
      { type: 'set_score', value: 70 },
    ],
  },
  {
    name: 'Keyword Luxo → Vendedor Premium',
    trigger_type: 'lead_created',
    conditions: [{ field: 'utm_term', operator: 'contains', value: 'luxo' }],
    actions: [
      { type: 'add_tag', value: 'alto-padrão' },
      { type: 'set_priority', value: 'urgent' },
      { type: 'set_score', value: 90 },
    ],
  },
  {
    name: 'Lead Ganho → Conversão Offline',
    trigger_type: 'lead_status_changed',
    conditions: [{ field: 'status', operator: 'equals', value: 'won' }],
    actions: [{ type: 'add_note', value: 'Venda concluída - conversão enviada para plataformas' }],
  },
];

export default function AutomationsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', trigger_type: 'lead_created', conditions: [], actions: [] });

  const { data, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: () => automationsAPI.list().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => automationsAPI.create(data),
    onSuccess: () => { qc.invalidateQueries(['automations']); setShowCreate(false); toast.success('Automação criada!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => automationsAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries(['automations']); toast.success('Automação removida'); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active, ...rest }) => automationsAPI.update(id, { ...rest, is_active: !is_active }),
    onSuccess: () => qc.invalidateQueries(['automations']),
  });

  const automations = data?.automations || [];

  const addCondition = () => setForm(f => ({
    ...f,
    conditions: [...f.conditions, { field: 'utm_source', operator: 'equals', value: '' }],
  }));

  const addAction = () => setForm(f => ({
    ...f,
    actions: [...f.actions, { type: 'add_tag', value: '' }],
  }));

  const loadExample = (ex) => {
    setForm(ex);
    setShowCreate(true);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automações</h1>
          <p className="text-gray-500 text-sm">Regras automáticas baseadas em origem, campanha e keyword</p>
        </div>
        <button onClick={() => { setForm({ name: '', trigger_type: 'lead_created', conditions: [], actions: [] }); setShowCreate(true); }} className="btn-primary">
          <Plus size={16} /> Nova Automação
        </button>
      </div>

      {/* Examples */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-700 mb-3 text-sm">Exemplos prontos — clique para usar</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {EXAMPLE_AUTOMATIONS.map((ex, i) => (
            <button key={i} onClick={() => loadExample(ex)}
              className="text-left p-3 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all">
              <p className="font-medium text-sm text-gray-800">{ex.name}</p>
              <p className="text-xs text-gray-500 mt-1">{TRIGGER_LABELS[ex.trigger_type]} · {ex.actions.length} ação(ões)</p>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="card p-8 text-center text-gray-400">Carregando...</div>
        ) : automations.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            <Zap size={32} className="mx-auto mb-2 opacity-30" />
            <p>Nenhuma automação configurada</p>
          </div>
        ) : automations.map(auto => (
          <div key={auto.id} className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${auto.is_active ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Zap size={16} className={auto.is_active ? 'text-green-600' : 'text-gray-400'} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{auto.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Gatilho: {TRIGGER_LABELS[auto.trigger_type]} ·
                    {auto.conditions?.length || 0} condição(ões) ·
                    {auto.actions?.length || 0} ação(ões) ·
                    Executada {auto.execution_count || 0}x
                  </p>
                  {/* Conditions */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(auto.conditions || []).map((c, i) => (
                      <span key={i} className="badge bg-yellow-100 text-yellow-700 text-xs">
                        {c.field} {c.operator} "{c.value}"
                      </span>
                    ))}
                    {(auto.actions || []).map((a, i) => (
                      <span key={i} className="badge bg-blue-100 text-blue-700 text-xs">
                        → {a.type}: {a.value}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleMutation.mutate(auto)}
                  className={`p-1.5 rounded-lg transition-colors ${auto.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                  title={auto.is_active ? 'Desativar' : 'Ativar'}
                >
                  {auto.is_active ? <CheckCircle size={18} /> : <XCircle size={18} />}
                </button>
                <button
                  onClick={() => { if (confirm('Remover automação?')) deleteMutation.mutate(auto.id); }}
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-8">
            <div className="p-5 border-b flex items-center gap-3">
              <Zap size={18} className="text-blue-600" />
              <h2 className="font-bold text-lg">Nova Automação</h2>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Nome</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="input" placeholder="Nome da automação" />
                </div>
                <div>
                  <label className="label">Gatilho</label>
                  <select value={form.trigger_type} onChange={e => setForm(f => ({...f, trigger_type: e.target.value}))} className="input">
                    {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Condições (SE)</label>
                  <button onClick={addCondition} className="btn-ghost text-xs py-1 px-2"><Plus size={12} /> Adicionar</button>
                </div>
                <div className="space-y-2">
                  {form.conditions.map((c, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={c.field} onChange={e => setForm(f => { const conds = [...f.conditions]; conds[i].field = e.target.value; return {...f, conditions: conds}; })} className="input text-sm w-36">
                        <option value="utm_source">utm_source</option>
                        <option value="utm_campaign">utm_campaign</option>
                        <option value="utm_term">utm_term (keyword)</option>
                        <option value="status">status</option>
                        <option value="priority">priority</option>
                        <option value="score">score</option>
                      </select>
                      <select value={c.operator} onChange={e => setForm(f => { const conds = [...f.conditions]; conds[i].operator = e.target.value; return {...f, conditions: conds}; })} className="input text-sm w-32">
                        {['equals','not_equals','contains','starts_with','greater_than','less_than','not_empty'].map(op => <option key={op} value={op}>{op}</option>)}
                      </select>
                      <input value={c.value} onChange={e => setForm(f => { const conds = [...f.conditions]; conds[i].value = e.target.value; return {...f, conditions: conds}; })} className="input text-sm flex-1" placeholder="valor" />
                      <button onClick={() => setForm(f => ({...f, conditions: f.conditions.filter((_, j) => j !== i)}))} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Ações (ENTÃO)</label>
                  <button onClick={addAction} className="btn-ghost text-xs py-1 px-2"><Plus size={12} /> Adicionar</button>
                </div>
                <div className="space-y-2">
                  {form.actions.map((a, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={a.type} onChange={e => setForm(f => { const acts = [...f.actions]; acts[i].type = e.target.value; return {...f, actions: acts}; })} className="input text-sm w-44">
                        {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <input value={a.value} onChange={e => setForm(f => { const acts = [...f.actions]; acts[i].value = e.target.value; return {...f, actions: acts}; })} className="input text-sm flex-1" placeholder="valor" />
                      <button onClick={() => setForm(f => ({...f, actions: f.actions.filter((_, j) => j !== i)}))} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || createMutation.isPending}
                className="btn-primary flex-1"
              >
                {createMutation.isPending ? 'Criando...' : 'Criar Automação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
