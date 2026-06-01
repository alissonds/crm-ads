const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Modelo de atribuição: last_touch por padrão
async function createAttribution(lead) {
  if (!lead.id) return;

  const model = await getAttributionModel();

  const touchpoints = await db.query(`
    SELECT ut.*
    FROM utm_tracking ut
    WHERE ut.id = $1
      OR ut.gclid = $2
      OR ut.fbclid = $3
    ORDER BY ut.first_seen_at
  `, [lead.utm_tracking_id, lead.gclid, lead.fbclid]);

  if (!touchpoints.rows.length) {
    // Atribuição direta dos dados do lead
    await insertAttribution(lead, {
      platform: detectPlatform(lead.utm_source),
      utm_source: lead.utm_source,
      utm_campaign: lead.utm_campaign,
      utm_term: lead.utm_term,
      gclid: lead.gclid,
      fbclid: lead.fbclid,
      campaign_id: lead.campaign_id,
      ad_group_id: lead.ad_group_id,
      keyword_id: lead.keyword_id,
    }, 1, 1.0, lead.estimated_value);
    return;
  }

  const weights = calculateWeights(touchpoints.rows, model);

  for (let i = 0; i < touchpoints.rows.length; i++) {
    const tp = touchpoints.rows[i];
    const weight = weights[i];
    await insertAttribution(lead, tp, i + 1, weight, (lead.estimated_value || 0) * weight);
  }
}

async function insertAttribution(lead, tp, order, weight, value) {
  await db.query(`
    INSERT INTO attribution (id, lead_id, campaign_id, ad_group_id, keyword_id, platform, model,
      touchpoint_order, weight, attributed_value, gclid, fbclid, utm_source, utm_campaign, utm_term, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
    ON CONFLICT DO NOTHING
  `, [
    uuidv4(), lead.id,
    tp.campaign_id || lead.campaign_id,
    tp.ad_group_id || lead.ad_group_id,
    tp.keyword_id || lead.keyword_id,
    detectPlatform(tp.utm_source || lead.utm_source),
    'last_touch', order, weight, value || 0,
    tp.gclid || lead.gclid,
    tp.fbclid || lead.fbclid,
    tp.utm_source || lead.utm_source,
    tp.utm_campaign || lead.utm_campaign,
    tp.utm_term || lead.utm_term,
  ]);
}

function calculateWeights(touchpoints, model) {
  const n = touchpoints.length;
  if (n === 1) return [1.0];

  switch (model) {
    case 'first_touch': return touchpoints.map((_, i) => i === 0 ? 1.0 : 0.0);
    case 'last_touch': return touchpoints.map((_, i) => i === n - 1 ? 1.0 : 0.0);
    case 'linear': return touchpoints.map(() => 1.0 / n);
    case 'time_decay': {
      const half = 7 * 86400000; // 7 dias
      const now = Date.now();
      const raw = touchpoints.map(tp => Math.pow(2, -(now - new Date(tp.first_seen_at).getTime()) / half));
      const sum = raw.reduce((a, b) => a + b, 0);
      return raw.map(w => w / sum);
    }
    default: return touchpoints.map((_, i) => i === n - 1 ? 1.0 : 0.0);
  }
}

function detectPlatform(source) {
  if (!source) return 'unknown';
  if (['google', 'google_ads', 'cpc'].includes(source.toLowerCase())) return 'google_ads';
  if (['facebook', 'instagram', 'fb', 'meta'].includes(source.toLowerCase())) return 'meta_ads';
  if (source.toLowerCase() === 'whatsapp') return 'whatsapp';
  return 'other';
}

async function getAttributionModel() {
  try {
    const { rows } = await db.query(`SELECT value FROM system_settings WHERE key = 'attribution_model'`);
    return JSON.parse(rows[0]?.value || '"last_touch"');
  } catch {
    return 'last_touch';
  }
}

// Calcula ROAS por campanha considerando receita do CRM
async function calculateROAS(campaignId, dateFrom, dateTo) {
  const { rows } = await db.query(`
    SELECT
      c.spend,
      SUM(l.actual_value) FILTER (WHERE l.status = 'won') as revenue,
      COUNT(l.id) as leads,
      COUNT(l.id) FILTER (WHERE l.status = 'won') as won
    FROM campaigns c
    LEFT JOIN leads l ON l.campaign_id = c.id
      AND l.created_at BETWEEN $2 AND $3
    WHERE c.id = $1
    GROUP BY c.spend
  `, [campaignId, dateFrom, dateTo]);

  const r = rows[0] || {};
  const spend = parseFloat(r.spend || 0);
  const revenue = parseFloat(r.revenue || 0);
  return {
    spend,
    revenue,
    roas: spend > 0 ? revenue / spend : 0,
    roi: spend > 0 ? ((revenue - spend) / spend) * 100 : 0,
    leads: parseInt(r.leads || 0),
    cpl: parseInt(r.leads || 0) > 0 ? spend / parseInt(r.leads) : 0,
    won: parseInt(r.won || 0),
  };
}

module.exports = { createAttribution, calculateROAS, detectPlatform };
