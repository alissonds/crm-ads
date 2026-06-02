const db = require('../config/database');
const googleAds = require('../services/googleAdsService');
const metaAds = require('../services/metaAdsService');
const attribution = require('../services/attributionService');

async function list(req, res) {
  try {
    const { platform, status, limit = 50, page = 1 } = req.query;
    const effectiveAccountId = req.user.role !== 'admin'
      ? req.user.meta_ad_account_id
      : (req.query.ad_account_id || null);

    const conditions = [];
    const params = [];
    let p = 1;
    if (platform) { conditions.push(`platform = $${p++}`); params.push(platform); }
    if (status) { conditions.push(`status = $${p++}`); params.push(status); }
    if (effectiveAccountId) { conditions.push(`raw_data->>'ad_account_id' = $${p++}`); params.push(effectiveAccountId); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [dataRes, countRes] = await Promise.all([
      db.query(`
        SELECT c.*, COUNT(l.id) as crm_leads,
          SUM(l.actual_value) FILTER (WHERE l.status = 'won') as crm_revenue
        FROM campaigns c
        LEFT JOIN leads l ON l.campaign_id = c.id
        ${where}
        GROUP BY c.id
        ORDER BY c.spend DESC NULLS LAST
        LIMIT $${p++} OFFSET $${p++}
      `, [...params, parseInt(limit), offset]),
      db.query(`SELECT COUNT(*) FROM campaigns ${where}`, params),
    ]);

    res.json({
      campaigns: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
    });
  } catch (err) {
    console.error('campaign list error:', err);
    res.status(500).json({ error: 'Erro ao listar campanhas' });
  }
}

async function getById(req, res) {
  try {
    const { id } = req.params;
    const [campRes, groupsRes, leadsRes] = await Promise.all([
      db.query('SELECT * FROM campaigns WHERE id = $1', [id]),
      db.query('SELECT * FROM ad_groups WHERE campaign_id = $1 ORDER BY spend DESC NULLS LAST LIMIT 20', [id]),
      db.query(`
        SELECT l.id, l.name, l.status, l.score, l.created_at, l.utm_term as keyword
        FROM leads l WHERE l.campaign_id = $1
        ORDER BY l.created_at DESC LIMIT 20
      `, [id]),
    ]);

    if (!campRes.rows[0]) return res.status(404).json({ error: 'Campanha não encontrada' });
    res.json({ campaign: campRes.rows[0], adGroups: groupsRes.rows, recentLeads: leadsRes.rows });
  } catch (err) {
    console.error('campaign getById error:', err);
    res.status(500).json({ error: 'Erro ao buscar campanha' });
  }
}

async function syncGoogle(req, res) {
  try {
    const count = await googleAds.syncCampaigns();
    await googleAds.syncKeywords();
    res.json({ synced: count, message: `${count} campanhas sincronizadas do Google Ads` });
  } catch (err) {
    console.error('Google Ads sync error:', err);
    res.status(500).json({ error: 'Erro ao sincronizar Google Ads: ' + err.message });
  }
}

async function syncMeta(req, res) {
  try {
    const { ad_account_id } = req.query;
    const count = await metaAds.syncCampaigns(ad_account_id || null);
    res.json({ synced: count, message: `${count} campanhas sincronizadas do Meta Ads` });
  } catch (err) {
    console.error('Meta Ads sync error:', err);
    res.status(500).json({ error: 'Erro ao sincronizar Meta Ads: ' + err.message });
  }
}

async function getInsights(req, res) {
  try {
    const { date_from, date_to, platform } = req.query;
    const ad_account_id = req.user.role !== 'admin'
      ? req.user.meta_ad_account_id
      : (req.query.ad_account_id || null);
    const df = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dt = date_to || new Date().toISOString().slice(0, 10);

    const conditions = [];
    const params = [df, dt];
    let p = 3;

    if (platform) { conditions.push(`c.platform = $${p++}`); params.push(platform); }
    if (ad_account_id) { conditions.push(`c.raw_data->>'ad_account_id' = $${p++}`); params.push(ad_account_id); }

    const where = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT
        c.id, c.name, c.platform, c.status,
        COALESCE(SUM(dm.impressions), 0)::bigint AS impressions,
        COALESCE(SUM(dm.clicks), 0)::bigint AS clicks,
        COALESCE(SUM(dm.spend), 0) AS spend,
        COALESCE(SUM(dm.conversion_value), 0) AS conversion_value,
        CASE WHEN SUM(dm.clicks) > 0 THEN SUM(dm.spend) / SUM(dm.clicks) ELSE 0 END AS cpc,
        CASE WHEN SUM(dm.impressions) > 0 THEN SUM(dm.clicks)::DECIMAL / SUM(dm.impressions) * 100 ELSE 0 END AS ctr,
        CASE WHEN SUM(dm.spend) > 0 THEN SUM(dm.conversion_value) / SUM(dm.spend) ELSE NULL END AS roas,
        COUNT(DISTINCT l.id) AS crm_leads,
        SUM(l.actual_value) FILTER (WHERE l.status = 'won') AS crm_revenue,
        (COUNT(dm.id) > 0) AS has_daily_data
      FROM campaigns c
      LEFT JOIN daily_metrics dm
        ON dm.campaign_id = c.id
        AND dm.date BETWEEN $1 AND $2
        AND dm.ad_group_id IS NULL
        AND dm.keyword_id IS NULL
      LEFT JOIN leads l
        ON l.campaign_id = c.id
        AND l.created_at >= $1::timestamp
        AND l.created_at < ($2::date + interval '1 day')
      WHERE 1=1 ${where}
      GROUP BY c.id
      ORDER BY COALESCE(SUM(dm.spend), 0) DESC, c.spend DESC NULLS LAST
    `, params);

    const hasDailyData = rows.some(r => r.has_daily_data);

    res.json({ campaigns: rows, period: { from: df, to: dt }, has_daily_data: hasDailyData });
  } catch (err) {
    console.error('getInsights error:', err);
    res.status(500).json({ error: 'Erro ao buscar insights por período' });
  }
}

async function getAdSetsInsights(req, res) {
  try {
    const { date_from, date_to, campaign_id } = req.query;
    const ad_account_id = req.user.role !== 'admin'
      ? req.user.meta_ad_account_id
      : (req.query.ad_account_id || null);
    const df = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dt = date_to || new Date().toISOString().slice(0, 10);

    const conditions = [];
    const params = [df, dt];
    let p = 3;
    if (campaign_id) { conditions.push(`ag.campaign_id = $${p++}`); params.push(campaign_id); }
    if (ad_account_id) { conditions.push(`c.raw_data->>'ad_account_id' = $${p++}`); params.push(ad_account_id); }
    const where = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT
        ag.id, ag.name, ag.platform, ag.status, ag.campaign_id,
        c.name AS campaign_name,
        COALESCE(SUM(dm.impressions),0)::bigint AS impressions,
        COALESCE(SUM(dm.clicks),0)::bigint AS clicks,
        COALESCE(SUM(dm.spend),0) AS spend,
        COALESCE(SUM(dm.conversion_value),0) AS conversion_value,
        CASE WHEN SUM(dm.clicks)>0 THEN SUM(dm.spend)/SUM(dm.clicks) ELSE 0 END AS cpc,
        CASE WHEN SUM(dm.impressions)>0 THEN SUM(dm.clicks)::DECIMAL/SUM(dm.impressions)*100 ELSE 0 END AS ctr,
        CASE WHEN SUM(dm.spend)>0 THEN SUM(dm.conversion_value)/SUM(dm.spend) ELSE NULL END AS roas,
        COUNT(DISTINCT l.id) AS crm_leads,
        (COUNT(dm.id)>0) AS has_daily_data
      FROM ad_groups ag
      JOIN campaigns c ON ag.campaign_id = c.id
      LEFT JOIN daily_metrics dm
        ON dm.ad_group_id = ag.id
        AND dm.date BETWEEN $1 AND $2
        AND dm.keyword_id IS NULL
      LEFT JOIN leads l
        ON l.ad_group_id = ag.id
        AND l.created_at >= $1::timestamp
        AND l.created_at < ($2::date + interval '1 day')
      WHERE ag.platform = 'meta_ads' ${where}
      GROUP BY ag.id, c.id
      ORDER BY COALESCE(SUM(dm.spend),0) DESC, ag.spend DESC NULLS LAST
    `, params);

    res.json({ adsets: rows, period: { from: df, to: dt }, has_daily_data: rows.some(r => r.has_daily_data) });
  } catch (err) {
    console.error('getAdSetsInsights error:', err);
    res.status(500).json({ error: 'Erro ao buscar conjuntos' });
  }
}

async function getAdsInsights(req, res) {
  try {
    const { date_from, date_to, campaign_id, ad_group_id } = req.query;
    const ad_account_id = req.user.role !== 'admin'
      ? req.user.meta_ad_account_id
      : (req.query.ad_account_id || null);
    const df = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dt = date_to || new Date().toISOString().slice(0, 10);

    const conditions = [];
    const params = [df, dt];
    let p = 3;
    if (campaign_id) { conditions.push(`a.campaign_id = $${p++}`); params.push(campaign_id); }
    if (ad_group_id) { conditions.push(`a.ad_group_id = $${p++}`); params.push(ad_group_id); }
    if (ad_account_id) { conditions.push(`c.raw_data->>'ad_account_id' = $${p++}`); params.push(ad_account_id); }
    const where = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT
        a.id, a.name, a.platform, a.status,
        a.headline, a.description, a.creative_url,
        a.campaign_id, a.ad_group_id,
        c.name AS campaign_name,
        ag.name AS adset_name,
        a.impressions, a.clicks, a.spend, a.conversions, a.ctr,
        CASE WHEN a.clicks>0 THEN a.spend/a.clicks ELSE 0 END AS cpc,
        COUNT(DISTINCT l.id) FILTER (
          WHERE l.created_at >= $1::timestamp AND l.created_at < ($2::date + interval '1 day')
        ) AS crm_leads
      FROM ads a
      JOIN campaigns c ON a.campaign_id = c.id
      LEFT JOIN ad_groups ag ON a.ad_group_id = ag.id
      LEFT JOIN leads l ON l.ad_id = a.id
      WHERE a.platform = 'meta_ads' ${where}
      GROUP BY a.id, c.id, ag.id
      ORDER BY a.spend DESC NULLS LAST
    `, params);

    res.json({ ads: rows, period: { from: df, to: dt } });
  } catch (err) {
    console.error('getAdsInsights error:', err);
    res.status(500).json({ error: 'Erro ao buscar anúncios' });
  }
}

async function getRoas(req, res) {
  try {
    const { id } = req.params;
    const { date_from, date_to } = req.query;
    const df = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dt = date_to || new Date().toISOString().slice(0, 10);

    const result = await attribution.calculateROAS(id, df, dt);
    res.json(result);
  } catch (err) {
    console.error('getRoas error:', err);
    res.status(500).json({ error: 'Erro ao calcular ROAS' });
  }
}

module.exports = { list, getById, syncGoogle, syncMeta, getRoas, getInsights, getAdSetsInsights, getAdsInsights };
