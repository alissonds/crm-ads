const db = require('../config/database');
const googleAds = require('../services/googleAdsService');
const metaAds = require('../services/metaAdsService');
const attribution = require('../services/attributionService');

async function list(req, res) {
  try {
    const { platform, status, limit = 50, page = 1, ad_account_id } = req.query;
    const conditions = [];
    const params = [];
    let p = 1;
    if (platform) { conditions.push(`platform = $${p++}`); params.push(platform); }
    if (status) { conditions.push(`status = $${p++}`); params.push(status); }
    if (ad_account_id) { conditions.push(`raw_data->>'campaign' LIKE $${p++}`); params.push(`%"account_id":"${ad_account_id}"%`); }

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

module.exports = { list, getById, syncGoogle, syncMeta, getRoas };
