# CRM ADS — Guia de Configuração

## Requisitos
- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- npm 10+

---

## 1. Configuração Rápida (Local)

```bash
# 1. Instalar dependências do backend
cd backend
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 3. Criar banco de dados
createdb crm_ads  # ou via psql
npm run db:migrate

# 4. Iniciar backend
npm run dev

# 5. Em outro terminal — frontend
cd ../frontend
npm install
npm run dev
```

Acesse: **http://localhost:5173**
Login: `admin@crm.local` / `Admin@123`

---

## 2. Via Docker (Recomendado para produção)

```bash
# Copie e edite o .env
cp backend/.env.example backend/.env

# Suba todos os serviços
docker-compose up -d

# Verifique os logs
docker-compose logs -f backend
```

Acesse: **http://localhost**

---

## 3. Configuração Google Ads API

1. Acesse [Google Ads API Center](https://developers.google.com/google-ads/api/docs/start)
2. Crie um projeto no Google Cloud Console
3. Ative a Google Ads API
4. Crie credenciais OAuth 2.0 (tipo: Desktop App)
5. Obtenha o **Developer Token** no Google Ads Manager
6. Use o OAuth Playground para gerar o **Refresh Token**

Preencha no `.env`:
```
GOOGLE_ADS_DEVELOPER_TOKEN=xxx
GOOGLE_ADS_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=xxx
GOOGLE_ADS_REFRESH_TOKEN=xxx
GOOGLE_ADS_CUSTOMER_ID=1234567890
```

Sincronize: **Campanhas → Google Ads → Sincronizar**

---

## 4. Configuração Meta Ads API

1. Acesse [Meta for Developers](https://developers.facebook.com)
2. Crie um App (tipo: Business)
3. Adicione o produto **Marketing API**
4. Gere um **Access Token** de longa duração
5. Obtenha o **Ad Account ID** e **Pixel ID**

Preencha no `.env`:
```
META_APP_ID=xxx
META_APP_SECRET=xxx
META_ACCESS_TOKEN=xxx
META_AD_ACCOUNT_ID=act_xxxxx
META_PIXEL_ID=xxxxx
```

Para **Lead Ads Webhook**:
- Vá em Meta Business Manager → Webhooks
- URL: `https://seu-dominio.com/api/webhook/meta`
- Token: valor de `META_WEBHOOK_VERIFY_TOKEN`
- Assine o evento: `leadgen`

---

## 5. Tracking na Landing Page

Adicione o script antes do fechamento do `</head>`:

```html
<script src="https://seu-dominio.com/tracker.js" data-api="https://api.seu-dominio.com"></script>
```

Ou sirva o arquivo `tracking/tracker.js` via seu próprio domínio.

### Botão WhatsApp Inteligente

```html
<!-- O script detecta automaticamente os botões com este atributo -->
<a data-whatsapp-btn data-phone="5511999999999" href="#">
  Falar no WhatsApp
</a>
```

O botão automaticamente:
- Envia a origem (Google/Meta/Orgânico)
- Inclui nome da campanha
- Inclui keyword que originou o clique
- Inclui GCLID/FBCLID para rastreamento

### Formulário com tracking automático

```html
<form data-crm-form action="/contato" method="POST">
  <input name="name" placeholder="Nome" />
  <input name="email" placeholder="Email" />
  <input name="phone" placeholder="Telefone" />
  <button type="submit">Enviar</button>
</form>
```

---

## 6. Fluxo Completo de um Lead

```
Usuário clica anúncio Google
        ↓
Landing Page carrega tracker.js
        ↓
GCLID + UTMs capturados e salvos em cookie
        ↓
Usuário clica botão WhatsApp
        ↓
POST /api/track/event (whatsapp_click)
        ↓
Atendimento no WhatsApp
        ↓
Vendedor cria lead no CRM (/leads)
        ↓
Sistema vincula automaticamente:
  - Campanha Google Ads
  - Ad Group
  - Keyword
  - UTMs completas
        ↓
Automações disparam (tag, prioridade, etc.)
        ↓
Lead marcado como "Ganho"
        ↓
Conversão enviada automaticamente para:
  - Google Ads (via GCLID)
  - Meta Ads (via FBCLID + Conversions API)
```

---

## 7. API Endpoints

### Tracking (público)
- `POST /api/track/capture` — Captura sessão da landing page
- `POST /api/track/event` — Registra evento de analytics

### Leads
- `GET /api/leads` — Lista leads (com filtros)
- `POST /api/leads` — Criar lead
- `PUT /api/leads/:id` — Atualizar lead
- `POST /api/leads/:id/activities` — Adicionar atividade

### Webhooks (receber leads externos)
- `POST /api/webhook/lead/:token` — Webhook genérico
- `POST /api/webhook/meta` — Meta Lead Ads
- `GET /api/webhook/meta` — Verificação Meta

### Analytics
- `GET /api/analytics/overview`
- `GET /api/analytics/campaigns`
- `GET /api/analytics/keywords`
- `GET /api/analytics/attribution`

---

## 8. Workers Automáticos

| Worker | Frequência | Função |
|--------|-----------|--------|
| Google Ads Sync | A cada 6h | Sincroniza campanhas e keywords |
| Meta Ads Sync | A cada 6h (+30min) | Sincroniza campanhas |
| Retry Conversões | A cada hora | Reenvio de conversões com falha |
| Métricas Diárias | 00:05 | Agrega métricas do dia anterior |

---

## 9. Modelos de Atribuição Disponíveis

| Modelo | Descrição |
|--------|-----------|
| `last_touch` | 100% para o último ponto de contato (padrão) |
| `first_touch` | 100% para o primeiro ponto de contato |
| `linear` | Distribuição igual entre todos os touchpoints |
| `time_decay` | Peso maior para touchpoints mais recentes |

Configure via: Configurações → `attribution_model`

---

## 10. Segurança

- Todos os endpoints (exceto tracking e webhook) requerem JWT
- Webhooks Meta validados via HMAC-SHA256
- Webhooks genéricos protegidos por token único
- Rate limiting em todas as rotas
- Sanitização de parâmetros UTM (anti-injection)
- Logs completos de todos os webhooks recebidos
