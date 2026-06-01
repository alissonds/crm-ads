const axios = require('axios');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

class MetaAdsService {
  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.adAccountId = process.env.META_AD_ACCOUNT_ID;
    this.pixelId = process.env.META_PIXEL_ID;
    this.appSecret = process.env.META_APP_SECRET;
  }

  async get(path, params = {}) {
    const res = await axios.get(`${GRAPH_URL}${path}`, {
      params: { access_token: this.accessToken, ...params },
    });
    return res.data;
  }

  // Sincroniza campanhas Meta
  async syncCampaigns() {
    const fields = [
      'id', 'name', 'status', 'objective',
      'daily_budget', 'lifetime_budget', 'budget_remaining',
      'start_time', 'stop_time',
    ].join(',');

    const insightsFields = [
      'impressions', 'clicks', 'spend', 'actions', 'action_values',
      'ctr', 'cpc', 'cpm', 'cpp', 'frequency',
    ].join(',');

    const data = await this.get(`/${this.adAccountId}/campaigns`, {
      fields,
      limit: 200,
    });

    const { rows: [source] } = await db.query(
      `SELECT id FROM traffic_sources WHERE type = 'meta_ads' LIMIT 1`
    );

    for (const c of data.data || []) {
      // Busca insights separadamente
      let insights = {};
      try {
        const insRes = await this.get(`/${c.id}/insights`, {
          fields: insightsFields,
          date_preset: 'last_30d',
          level: 'campaign',
        });
        insights = insRes.data?.[0] || {};
      } catch {}

      const spend = parseFloat(insights.spend || 0);
      const conversions = insights.actions?.find(a => a.action_type === 'purchase')?.value || 0;
      const convValue = insights.action_values?.find(a => a.action_type === 'purchase')?.value || 0;
      const cpa = spend > 0 && conversions > 0 ? spend / conversions : null;
      const roas = spend > 0 ? convValue / spend : null;

      await db.query(`
        INSERT INTO campaigns (id, external_id, traffic_source_id, name, platform, status, objective,
          budget_daily, budget_lifetime, start_date, end_date,
          impressions, clicks, spend, conversions, conversion_value,
          cpc, cpm, ctr, cpa, roas, raw_data, last_synced_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,'meta_ads',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),NOW(),NOW())
        ON CONFLICT (external_id, platform) DO UPDATE SET
          name = EXCLUDED.name, status = EXCLUDED.status,
          impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
          spend = EXCLUDED.spend, conversions = EXCLUDED.conversions,
          conversion_value = EXCLUDED.conversion_value,
          cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, ctr = EXCLUDED.ctr,
          cpa = EXCLUDED.cpa, roas = EXCLUDED.roas,
          raw_data = EXCLUDED.raw_data, last_synced_at = NOW(), updated_at = NOW()
      `, [
        uuidv4(), c.id, source?.id, c.name, c.status?.toLowerCase() || 'active', c.objective,
        c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
        c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
        c.start_time?.slice(0, 10), c.stop_time?.slice(0, 10),
        parseInt(insights.impressions || 0), parseInt(insights.clicks || 0),
        spend, parseInt(conversions), parseFloat(convValue),
        parseFloat(insights.cpc || 0), parseFloat(insights.cpm || 0),
        parseFloat(insights.ctr || 0), cpa, roas,
        JSON.stringify({ campaign: c, insights }),
      ]);
    }

    return data.data?.length || 0;
  }

  // Envia evento de Conversão para Meta (Conversions API)
  async sendConversion({ eventName, eventTime, userData, customData, eventSourceUrl, fbclid }) {
    const crypto = require('crypto');
    const hashField = (v) => v ? crypto.createHash('sha256').update(v.toLowerCase().trim()).digest('hex') : undefined;

    const payload = {
      data: [{
        event_name: eventName,
        event_time: eventTime || Math.floor(Date.now() / 1000),
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: {
          em: [hashField(userData.email)].filter(Boolean),
          ph: [hashField(userData.phone)].filter(Boolean),
          fn: [hashField(userData.firstName)].filter(Boolean),
          ln: [hashField(userData.lastName)].filter(Boolean),
          fbc: fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined,
        },
        custom_data: {
          currency: customData.currency || 'BRL',
          value: customData.value || 0,
          content_name: customData.contentName,
        },
      }],
      test_event_code: process.env.NODE_ENV !== 'production' ? process.env.META_TEST_EVENT_CODE : undefined,
    };

    const res = await axios.post(
      `${GRAPH_URL}/${this.pixelId}/events`,
      payload,
      { params: { access_token: this.accessToken } }
    );

    return res.data;
  }

  // Valida webhook de Lead Ads
  verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verificação falhou' });
  }

  // Processa lead recebido via webhook de Lead Ads
  async processLeadAdsWebhook(body) {
    const leads = [];
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'leadgen') continue;
        const leadgenId = change.value?.leadgen_id;
        if (!leadgenId) continue;

        try {
          const leadData = await this.get(`/${leadgenId}`, {
            fields: 'field_data,created_time,ad_id,campaign_id,form_id',
          });
          leads.push(await this._saveLeadFromMeta(leadData));
        } catch (err) {
          console.error('Erro ao processar leadgen:', err.message);
        }
      }
    }
    return leads;
  }

  async _saveLeadFromMeta(leadData) {
    const fields = {};
    for (const f of leadData.field_data || []) {
      fields[f.name] = f.values?.[0];
    }

    const { rows } = await db.query(`
      INSERT INTO leads (id, name, email, phone, whatsapp, fbclid, utm_source, utm_medium,
        source_channel, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$4,NULL,'facebook','lead_ads','webhook','new',NOW(),NOW())
      RETURNING *
    `, [
      uuidv4(),
      fields.full_name || fields.nome,
      fields.email,
      fields.phone_number || fields.telefone,
    ]);

    return rows[0];
  }

  async getAdAccountInsights(datePreset = 'last_30d') {
    return this.get(`/${this.adAccountId}/insights`, {
      fields: 'campaign_name,impressions,clicks,spend,actions,ctr,cpc,cpm',
      date_preset: datePreset,
      level: 'campaign',
      limit: 100,
    });
  }
}

module.exports = new MetaAdsService();
