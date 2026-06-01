import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { webhooksAPI } from '../services/api';
import { Plus, Copy, Webhook, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function WebhooksPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['webhook-configs'],
    queryFn: () => webhooksAPI.listConfigs().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => webhooksAPI.createConfig(data),
    onSuccess: () => { qc.invalidateQueries(['webhook-configs']); setShowCreate(false); toast.success('Webhook criado!'); },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    createMutation.mutate({
      name: fd.get('name'),
      source: fd.get('source'),
    });
  };

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
    toast.success('URL copiada!');
  };

  const configs = data?.configs || [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-gray-500 text-sm">Receba leads de qualquer plataforma via webhook</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> Novo Webhook
        </button>
      </div>

      {/* Info card */}
      <div className="card p-5 bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">Como usar</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Crie um webhook e copie a URL gerada</li>
          <li>Configure no seu formulário, RD Station, ActiveCampaign, etc.</li>
          <li>Mapeie os campos (ex: <code className="bg-blue-100 px-1 rounded">nome</code> → <code className="bg-blue-100 px-1 rounded">name</code>)</li>
          <li>Os leads chegam automaticamente ao CRM</li>
        </ol>
        <p className="text-xs text-blue-600 mt-3">
          Meta Lead Ads: <code className="bg-blue-100 px-1 rounded">/api/webhook/meta</code> (configurar no Meta Business Manager)
        </p>
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="card p-8 text-center text-gray-400">Carregando...</div>
        ) : configs.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">
            <Webhook size={32} className="mx-auto mb-2 opacity-30" />
            <p>Nenhum webhook configurado</p>
          </div>
        ) : configs.map(c => {
          const url = `${window.location.protocol}//${window.location.hostname}:3001/api/webhook/lead/${c.endpoint_token}`;
          return (
            <div key={c.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Webhook size={16} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Origem: {c.source} · Recebidos: {c.received_count || 0}</p>
                    {c.last_received_at && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Último: {new Date(c.last_received_at).toLocaleString('pt-BR')}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-600 truncate max-w-md">{url}</code>
                      <button
                        onClick={() => copyUrl(url)}
                        className="flex-shrink-0 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        {copied === url ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className={`badge ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Predefined: Meta webhook */}
      <div className="card p-5 border-dashed">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
            <span className="text-base">f</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900">Meta Lead Ads (Facebook/Instagram)</p>
            <p className="text-xs text-gray-500">Configure no Meta Business Manager → Webhooks</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-600">
            {window.location.protocol}//{window.location.hostname}:3001/api/webhook/meta
          </code>
          <button
            onClick={() => copyUrl(`${window.location.protocol}//${window.location.hostname}:3001/api/webhook/meta`)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
          >
            <Copy size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Token de verificação: defina em <code className="bg-gray-100 px-1 rounded">META_WEBHOOK_VERIFY_TOKEN</code> no .env</p>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b"><h2 className="font-bold">Novo Webhook</h2></div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="label">Nome</label>
                <input name="name" required className="input" placeholder="Ex: RD Station Leads" />
              </div>
              <div>
                <label className="label">Plataforma de origem</label>
                <select name="source" required className="input">
                  <option value="">Selecione</option>
                  <option value="rd_station">RD Station</option>
                  <option value="active_campaign">ActiveCampaign</option>
                  <option value="hotmart">Hotmart</option>
                  <option value="hubspot">HubSpot</option>
                  <option value="elementor">Elementor Forms</option>
                  <option value="woocommerce">WooCommerce</option>
                  <option value="generic">Genérico</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                Após criar, você poderá configurar o mapeamento de campos diretamente no banco de dados ou via API.
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary flex-1">
                  {createMutation.isPending ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
