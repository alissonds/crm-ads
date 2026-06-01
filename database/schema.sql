-- ============================================================
-- CRM ADS - SCHEMA COMPLETO PostgreSQL
-- Suporte: Google Ads, Meta Ads, WhatsApp, Landing Pages
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- USUÁRIOS DO SISTEMA
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'agent' CHECK (role IN ('admin', 'manager', 'agent')),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORIGENS DE TRÁFEGO
-- ============================================================
CREATE TABLE IF NOT EXISTS traffic_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'google_ads', 'meta_ads', 'facebook_ads', 'instagram_ads',
    'whatsapp', 'organic', 'email', 'direct', 'referral', 'other'
  )),
  platform VARCHAR(100),
  account_id VARCHAR(255),
  account_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CAMPANHAS (sincronizadas de Google Ads e Meta Ads)
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(255),
  traffic_source_id UUID REFERENCES traffic_sources(id),
  name VARCHAR(500) NOT NULL,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('google_ads', 'meta_ads', 'other')),
  status VARCHAR(50) DEFAULT 'active',
  objective VARCHAR(100),
  budget_daily DECIMAL(15,4),
  budget_lifetime DECIMAL(15,4),
  budget_type VARCHAR(50),
  start_date DATE,
  end_date DATE,
  -- Métricas agregadas (sincronizadas da API)
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend DECIMAL(15,4) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_value DECIMAL(15,4) DEFAULT 0,
  cpc DECIMAL(15,4),
  cpm DECIMAL(15,4),
  ctr DECIMAL(10,4),
  cpa DECIMAL(15,4),
  roas DECIMAL(15,4),
  -- Metadados
  raw_data JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, platform)
);

-- ============================================================
-- GRUPOS DE ANÚNCIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS ad_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  name VARCHAR(500) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  bid_amount DECIMAL(15,4),
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend DECIMAL(15,4) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  raw_data JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, platform)
);

-- ============================================================
-- ANÚNCIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_group_id UUID REFERENCES ad_groups(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  name VARCHAR(500),
  platform VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  headline TEXT,
  description TEXT,
  creative_url TEXT,
  destination_url TEXT,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend DECIMAL(15,4) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  ctr DECIMAL(10,4),
  raw_data JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, platform)
);

-- ============================================================
-- KEYWORDS (Google Ads)
-- ============================================================
CREATE TABLE IF NOT EXISTS ad_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_group_id UUID REFERENCES ad_groups(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  keyword_text VARCHAR(500) NOT NULL,
  match_type VARCHAR(50) CHECK (match_type IN ('EXACT', 'PHRASE', 'BROAD', 'BROAD_MODIFIED')),
  status VARCHAR(50) DEFAULT 'active',
  bid DECIMAL(15,4),
  quality_score INTEGER,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend DECIMAL(15,4) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  cpc DECIMAL(15,4),
  ctr DECIMAL(10,4),
  avg_position DECIMAL(5,2),
  raw_data JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRACKING UTM (cada sessão/clique rastreado)
-- ============================================================
CREATE TABLE IF NOT EXISTS utm_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  -- UTM Parameters
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  utm_term VARCHAR(255),
  -- Google
  gclid VARCHAR(500),
  gbraid VARCHAR(500),
  wbraid VARCHAR(500),
  -- Meta
  fbclid VARCHAR(500),
  -- Campanha referenciada
  campaign_id UUID REFERENCES campaigns(id),
  ad_group_id UUID REFERENCES ad_groups(id),
  keyword_id UUID REFERENCES ad_keywords(id),
  -- Informações do visitante
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(50),  -- desktop, mobile, tablet
  device_brand VARCHAR(100),
  os_name VARCHAR(100),
  browser_name VARCHAR(100),
  screen_resolution VARCHAR(50),
  -- Localização
  country VARCHAR(100),
  state VARCHAR(100),
  city VARCHAR(100),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  -- Página
  landing_page_url TEXT,
  referer_url TEXT,
  page_title TEXT,
  -- Rede (Google Ads)
  network VARCHAR(50),    -- SEARCH, DISPLAY, YOUTUBE
  placement VARCHAR(255),
  -- Raw params
  raw_params JSONB DEFAULT '{}',
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Dados pessoais
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  company VARCHAR(255),
  -- Atribuição de origem
  utm_tracking_id UUID REFERENCES utm_tracking(id),
  campaign_id UUID REFERENCES campaigns(id),
  ad_group_id UUID REFERENCES ad_groups(id),
  ad_id UUID REFERENCES ads(id),
  keyword_id UUID REFERENCES ad_keywords(id),
  traffic_source_id UUID REFERENCES traffic_sources(id),
  -- Parâmetros de rastreamento resumidos
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  utm_term VARCHAR(255),
  gclid VARCHAR(500),
  fbclid VARCHAR(500),
  keyword VARCHAR(500),
  -- Qualificação
  status VARCHAR(50) DEFAULT 'new' CHECK (status IN (
    'new', 'contacted', 'qualified', 'proposal', 'negotiation',
    'won', 'lost', 'disqualified'
  )),
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  -- Segmentação
  tags TEXT[] DEFAULT '{}',
  segment VARCHAR(100),
  -- Financeiro
  estimated_value DECIMAL(15,2),
  actual_value DECIMAL(15,2),
  -- Origem
  source_channel VARCHAR(100),  -- whatsapp, form, api, manual
  landing_page_url TEXT,
  -- Responsável
  assigned_to UUID REFERENCES users(id),
  -- Dados adicionais
  notes TEXT,
  custom_fields JSONB DEFAULT '{}',
  -- Controle
  last_contact_at TIMESTAMPTZ,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATIVIDADES / TIMELINE DO LEAD
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'note', 'call', 'whatsapp', 'email', 'meeting',
    'status_change', 'assignment', 'tag_added', 'tag_removed',
    'conversion', 'score_change', 'automation'
  )),
  title VARCHAR(255),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EVENTOS DE ANALYTICS
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255),
  lead_id UUID REFERENCES leads(id),
  utm_tracking_id UUID REFERENCES utm_tracking(id),
  event_name VARCHAR(100) NOT NULL,
  event_category VARCHAR(100),
  event_label VARCHAR(255),
  event_value DECIMAL(15,4),
  page_url TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONVERSÕES (para envio às plataformas de anúncios)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'lead', 'qualified_lead', 'sale', 'checkout', 'call', 'form'
  )),
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('google_ads', 'meta_ads', 'ga4')),
  conversion_name VARCHAR(255),
  conversion_value DECIMAL(15,4),
  currency VARCHAR(10) DEFAULT 'BRL',
  -- Identificadores para deduplicação
  gclid VARCHAR(500),
  fbclid VARCHAR(500),
  order_id VARCHAR(255),
  -- Status de envio
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'failed', 'skipped'
  )),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  response_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ATRIBUIÇÃO DE LEADS
-- ============================================================
CREATE TABLE IF NOT EXISTS attribution (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),
  ad_group_id UUID REFERENCES ad_groups(id),
  ad_id UUID REFERENCES ads(id),
  keyword_id UUID REFERENCES ad_keywords(id),
  platform VARCHAR(50),
  model VARCHAR(50) DEFAULT 'last_touch' CHECK (model IN (
    'last_touch', 'first_touch', 'linear', 'time_decay', 'data_driven'
  )),
  touchpoint_order INTEGER DEFAULT 1,
  weight DECIMAL(5,4) DEFAULT 1.0,
  attributed_value DECIMAL(15,4),
  gclid VARCHAR(500),
  fbclid VARCHAR(500),
  utm_source VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_term VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUTOMAÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN (
    'lead_created', 'lead_status_changed', 'lead_scored',
    'keyword_matched', 'campaign_matched', 'source_matched', 'scheduled'
  )),
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id),
  status VARCHAR(50) CHECK (status IN ('success', 'failed', 'skipped')),
  actions_executed JSONB DEFAULT '[]',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WEBHOOKS CONFIGURADOS
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  source VARCHAR(100) NOT NULL,
  endpoint_token VARCHAR(255) UNIQUE NOT NULL,
  field_mapping JSONB DEFAULT '{}',
  default_values JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  received_count INTEGER DEFAULT 0,
  last_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOGS DE WEBHOOK RECEBIDOS
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_config_id UUID REFERENCES webhook_configs(id),
  lead_id UUID REFERENCES leads(id),
  raw_payload JSONB,
  headers JSONB,
  ip_address INET,
  status VARCHAR(50) CHECK (status IN ('processed', 'failed', 'duplicate')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MÉTRICAS DIÁRIAS (cache de relatórios)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  platform VARCHAR(50),
  campaign_id UUID REFERENCES campaigns(id),
  ad_group_id UUID REFERENCES ad_groups(id),
  keyword_id UUID REFERENCES ad_keywords(id),
  -- Volume
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend DECIMAL(15,4) DEFAULT 0,
  -- Leads
  leads_total INTEGER DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  leads_won INTEGER DEFAULT 0,
  -- Financeiro
  revenue DECIMAL(15,4) DEFAULT 0,
  conversion_value DECIMAL(15,4) DEFAULT 0,
  -- Calculados
  cpl DECIMAL(15,4),
  cpa DECIMAL(15,4),
  roas DECIMAL(15,4),
  roi DECIMAL(15,4),
  cpc DECIMAL(15,4),
  ctr DECIMAL(10,4),
  conversion_rate DECIMAL(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, platform, campaign_id, ad_group_id, keyword_id)
);

-- ============================================================
-- CONFIGURAÇÕES DO SISTEMA
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES DE PERFORMANCE
-- ============================================================

-- Leads
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX idx_leads_utm_source ON leads(utm_source);
CREATE INDEX idx_leads_gclid ON leads(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX idx_leads_fbclid ON leads(fbclid) WHERE fbclid IS NOT NULL;
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX idx_leads_tags ON leads USING GIN(tags);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_email ON leads(email);

-- UTM Tracking
CREATE INDEX idx_utm_session ON utm_tracking(session_id);
CREATE INDEX idx_utm_gclid ON utm_tracking(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX idx_utm_fbclid ON utm_tracking(fbclid) WHERE fbclid IS NOT NULL;
CREATE INDEX idx_utm_campaign ON utm_tracking(utm_campaign);
CREATE INDEX idx_utm_source ON utm_tracking(utm_source);
CREATE INDEX idx_utm_first_seen ON utm_tracking(first_seen_at DESC);

-- Analytics Events
CREATE INDEX idx_events_lead ON analytics_events(lead_id);
CREATE INDEX idx_events_session ON analytics_events(session_id);
CREATE INDEX idx_events_name ON analytics_events(event_name);
CREATE INDEX idx_events_created ON analytics_events(created_at DESC);

-- Conversions
CREATE INDEX idx_conversions_lead ON conversions(lead_id);
CREATE INDEX idx_conversions_status ON conversions(status);
CREATE INDEX idx_conversions_platform ON conversions(platform);
CREATE INDEX idx_conversions_gclid ON conversions(gclid) WHERE gclid IS NOT NULL;

-- Campaigns
CREATE INDEX idx_campaigns_platform ON campaigns(platform);
CREATE INDEX idx_campaigns_external ON campaigns(external_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- Keywords
CREATE INDEX idx_keywords_campaign ON ad_keywords(campaign_id);
CREATE INDEX idx_keywords_text ON ad_keywords USING GIN(to_tsvector('portuguese', keyword_text));

-- Daily Metrics
CREATE INDEX idx_metrics_date ON daily_metrics(date DESC);
CREATE INDEX idx_metrics_campaign ON daily_metrics(campaign_id);
CREATE INDEX idx_metrics_platform ON daily_metrics(platform);

-- Attribution
CREATE INDEX idx_attribution_lead ON attribution(lead_id);
CREATE INDEX idx_attribution_campaign ON attribution(campaign_id);

-- ============================================================
-- DADOS INICIAIS
-- ============================================================

-- Origens padrão
INSERT INTO traffic_sources (name, type, platform) VALUES
  ('Google Ads', 'google_ads', 'google'),
  ('Facebook Ads', 'facebook_ads', 'meta'),
  ('Instagram Ads', 'instagram_ads', 'meta'),
  ('WhatsApp Direto', 'whatsapp', 'whatsapp'),
  ('Orgânico Google', 'organic', 'google'),
  ('Tráfego Direto', 'direct', 'none')
ON CONFLICT DO NOTHING;

-- Admin padrão (senha: Admin@123)
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Admin', 'admin@crm.local', '$2a$10$LFJotB0eH3vawav/nw5Rx.iFE.FzfoGeQ3m.hjuo/W7ZqRLQo3PnG', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Configurações padrão do sistema
INSERT INTO system_settings (key, value, description) VALUES
  ('attribution_model', '"last_touch"', 'Modelo de atribuição padrão'),
  ('lead_score_rules', '{"google_ads": 30, "meta_ads": 25, "organic": 10, "whatsapp": 40}', 'Pontuação por origem'),
  ('auto_convert_gclid', 'true', 'Enviar conversões automáticas para Google Ads'),
  ('auto_convert_fbclid', 'true', 'Enviar conversões automáticas para Meta Ads'),
  ('whatsapp_number', '"5511999999999"', 'Número WhatsApp principal')
ON CONFLICT (key) DO NOTHING;
