const axios = require('axios');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'https://googleads.googleapis.com/v17';

class GoogleAdsService {
  constructor() {
    this.developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    this.clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    this.refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    this.customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, '');
    this.loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');
    this._accessToken = null;
    this._tokenExpiry = 0;
  }

  async getAccessToken() {
    if (this._accessToken && Date.now() < this._tokenExpiry) return this._accessToken;

    const res = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    this._accessToken = res.data.access_token;
    this._tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return this._accessToken;
  }

  async request(query) {
    const token = await this.getAccessToken();
    const res = await axios.post(
      `${BASE_URL}/customers/${this.customerId}/googleAds:searchStream`,
      { query },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'developer-token': this.developerToken,
          'login-customer-id': this.loginCustomerId,
        },
      }
    );
    return res.data.flatMap(batch => batch.results || []);
  }

  // Sincroniza campanhas do Google Ads para o banco
  async syncCampaigns() {
    const rows = await this.request(`
      SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
        campaign.start_date, campaign.end_date,
        campaign_budget.amount_micros, campaign_budget.type,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value,
        metrics.ctr, metrics.average_cpc, metrics.average_cpm,
        metrics.cost_per_conversion, metrics.value_per_conversion
      FROM campaign
      WHERE campaign.status != 'REMOVED'
        AND segments.date DURING LAST_30_DAYS
    `);

    let { rows: [source] } = await db.query(
      `SELECT id FROM traffic_sources WHERE type = 'google_ads' LIMIT 1`
    );
    const sourceId = source?.id;

    for (const row of rows) {
      const c = row.campaign;
      const m = row.metrics;
      const b = row.campaignBudget;
      const spend = (m.costMicros || 0) / 1e6;
      const cpc = (m.averageCpc || 0) / 1e6;
      const cpm = (m.averageCpm || 0) / 1e6;
      const cpa = (m.costPerConversion || 0) / 1e6;
      const roas = spend > 0 ? (m.conversionsValue || 0) / spend : 0;

      await db.query(`
        INSERT INTO campaigns (id, external_id, traffic_source_id, name, platform, status,
          budget_daily, budget_type,
          impressions, clicks, spend, conversions, conversion_value,
          cpc, cpm, ctr, cpa, roas, raw_data, last_synced_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,'google_ads',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW(),NOW())
        ON CONFLICT (external_id, platform) DO UPDATE SET
          name = EXCLUDED.name, status = EXCLUDED.status,
          impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
          spend = EXCLUDED.spend, conversions = EXCLUDED.conversions,
          conversion_value = EXCLUDED.conversion_value,
          cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, ctr = EXCLUDED.ctr,
          cpa = EXCLUDED.cpa, roas = EXCLUDED.roas,
          raw_data = EXCLUDED.raw_data, last_synced_at = NOW(), updated_at = NOW()
      `, [
        uuidv4(), String(c.id), sourceId, c.name, c.status?.toLowerCase() || 'active',
        b ? (b.amountMicros || 0) / 1e6 : null, b?.type,
        m.impressions || 0, m.clicks || 0, spend, m.conversions || 0,
        m.conversionsValue || 0, cpc, cpm, m.ctr || 0, cpa, roas,
        JSON.stringify(row),
      ]);
    }

    return rows.length;
  }

  // Sincroniza keywords
  async syncKeywords() {
    const rows = await this.request(`
      SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        ad_group_criterion.status, ad_group_criterion.quality_info.quality_score,
        ad_group.id, campaign.id as campaign_ext_id,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.ctr, metrics.average_cpc
      FROM keyword_view
      WHERE ad_group_criterion.status != 'REMOVED'
        AND segments.date DURING LAST_30_DAYS
    `);

    for (const row of rows) {
      const kw = row.adGroupCriterion?.keyword;
      if (!kw) continue;

      const { rows: [campaign] } = await db.query(
        `SELECT id FROM campaigns WHERE external_id = $1 AND platform = 'google_ads' LIMIT 1`,
        [String(row.campaign?.id)]
      );
      if (!campaign) continue;

      const { rows: [adGroup] } = await db.query(
        `SELECT id FROM ad_groups WHERE external_id = $1 AND platform = 'google_ads' LIMIT 1`,
        [String(row.adGroup?.id)]
      );

      const m = row.metrics || {};
      await db.query(`
        INSERT INTO ad_keywords (id, campaign_id, ad_group_id, external_id, keyword_text, match_type, status, quality_score,
          impressions, clicks, spend, conversions, cpc, ctr, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
        ON CONFLICT (external_id, platform) DO UPDATE SET
          impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
          spend = EXCLUDED.spend, conversions = EXCLUDED.conversions,
          quality_score = EXCLUDED.quality_score
      `, [
        uuidv4(), campaign.id, adGroup?.id, String(row.adGroupCriterion?.resourceName),
        kw.text, kw.matchType, row.adGroupCriterion?.status?.toLowerCase() || 'active',
        row.adGroupCriterion?.qualityInfo?.qualityScore,
        m.impressions || 0, m.clicks || 0, (m.costMicros || 0) / 1e6,
        m.conversions || 0, (m.averageCpc || 0) / 1e6, m.ctr || 0,
      ]);
    }
    return rows.length;
  }

  // Envia conversão offline para o Google Ads
  async sendOfflineConversion({ gclid, conversionName, conversionValue, currencyCode = 'BRL', conversionDateTime }) {
    if (!gclid || !conversionName) throw new Error('gclid e conversionName obrigatórios');

    const token = await this.getAccessToken();
    const dt = conversionDateTime || new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '+00:00');

    const res = await axios.post(
      `${BASE_URL}/customers/${this.customerId}:uploadClickConversions`,
      {
        conversions: [{
          gclid,
          conversion_action: `customers/${this.customerId}/conversionActions/${conversionName}`,
          conversion_date_time: dt,
          conversion_value: conversionValue || 0,
          currency_code: currencyCode,
        }],
        partial_failure: true,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'developer-token': this.developerToken,
          'login-customer-id': this.loginCustomerId,
        },
      }
    );

    return res.data;
  }

  // Retorna performance por campanha
  async getCampaignReport(dateRange = 'LAST_30_DAYS') {
    return this.request(`
      SELECT campaign.name, campaign.status,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value, metrics.ctr,
        metrics.average_cpc, metrics.cost_per_conversion
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date DURING ${dateRange}
    `);
  }
}

module.exports = new GoogleAdsService();
