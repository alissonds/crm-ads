const db = require('../config/database');

async function overview(req, res) {
  try {
    const { date_from, date_to } = req.query;
    const df = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dt = date_to || new Date().toISOString().slice(0, 10);

    const [leadsRes, convRes, cplRes, roasRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'new') as new_leads,
          COUNT(*) FILTER (WHERE status = 'won') as won,
          COUNT(*) FILTER (WHERE status = 'lost') as lost,
          SUM(estimated_value) as pipeline_value,
          SUM(actual_value) FILTER (WHERE status = 'won') as revenue,
          AVG(score) as avg_score
        FROM leads WHERE created_at BETWEEN $1 AND $2
      `, [df, dt]),
      db.query(`
        SELECT COUNT(*) as total, SUM(conversion_value) as value
        FROM conversions WHERE created_at BETWEEN $1 AND $2 AND status = 'sent'
      `, [df, dt]),
      db.query(`
        SELECT c.platform,
          COALESCE(SUM(c.spend),0) as spend,
          COUNT(l.id) as leads,
          CASE WHEN COUNT(l.id) > 0 THEN SUM(c.spend) / COUNT(l.id) ELSE 0 END as cpl
        FROM campaigns c
        LEFT JOIN leads l ON l.campaign_id = c.id AND l.created_at BETWEEN $1 AND $2
        WHERE c.last_synced_at IS NOT NULL
        GROUP BY c.platform
      `, [df, dt]),
      db.query(`
        SELECT platform, SUM(spend) as spend, SUM(conversion_value) as revenue,
          CASE WHEN SUM(spend) > 0 THEN SUM(conversion_value) / SUM(spend) ELSE 0 END as roas
        FROM campaigns WHERE last_synced_at IS NOT NULL
        GROUP BY platform
      `),
    ]);

    res.json({
      leads: leadsRes.rows[0],
      conversions: convRes.rows[0],
      cplByPlatform: cplRes.rows,
      roas: roasRes.rows,
      period: { from: df, to: dt },
    });
  } catch (err) {
    console.error('overview error:', err);
    res.status(500).json({ error: 'Erro ao buscar overview' });
  }
}

async function campaignPerformance(req, res) {
  try {
    const { platform, date_from, date_to, limit = 20 } = req.query;
    const df = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dt = date_to || new Date().toISOString().slice(0, 10);

    const conditions = ['c.last_synced_at IS NOT NULL'];
    const params = [df, dt];
    let p = 3;
    if (platform) { conditions.push(`c.platform = $${p++}`); params.push(platform); }
    // Não-admins só veem a conta atribuída
    if (req.user.role !== 'admin' && req.user.meta_ad_account_id) {
      conditions.push(`c.raw_data->>'ad_account_id' = $${p++}`);
      params.push(req.user.meta_ad_account_id);
    }

    const { rows } = await db.query(`
      SELECT c.id, c.name, c.platform, c.status,
        c.impressions, c.clicks, c.spend, c.conversions, c.conversion_value,
        c.cpc, c.cpm, c.ctr, c.cpa, c.roas,
        COUNT(l.id) as crm_leads,
        SUM(l.actual_value) FILTER (WHERE l.status = 'won') as crm_revenue
      FROM campaigns c
      LEFT JOIN leads l ON l.campaign_id = c.id AND l.created_at BETWEEN $1 AND $2
      WHERE ${conditions.join(' AND ')}
      GROUP BY c.id
      ORDER BY c.spend DESC NULLS LAST
      LIMIT $${p}
    `, [...params, parseInt(limit)]);

    res.json({ campaigns: rows });
  } catch (err) {
    console.error('campaignPerformance error:', err);
    res.status(500).json({ error: 'Erro ao buscar performance de campanhas' });
  }
}

async function keywordPerformance(req, res) {
  try {
    const { campaign_id, limit = 30 } = req.query;
    const conditions = [];
    const params = [];
    let p = 1;
    if (campaign_id) { conditions.push(`k.campaign_id = $${p++}`); params.push(campaign_id); }

    const { rows } = await db.query(`
      SELECT k.id, k.keyword_text, k.match_type, k.status,
        k.impressions, k.clicks, k.spend, k.conversions,
        k.cpc, k.ctr, k.quality_score,
        COUNT(l.id) as crm_leads
      FROM ad_keywords k
      LEFT JOIN leads l ON l.keyword_id = k.id
      ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
      GROUP BY k.id
      ORDER BY k.spend DESC NULLS LAST
      LIMIT $${p}
    `, [...params, parseInt(limit)]);

    res.json({ keywords: rows });
  } catch (err) {
    console.error('keywordPerformance error:', err);
    res.status(500).json({ error: 'Erro ao buscar performance de keywords' });
  }
}

async function attributionReport(req, res) {
  try {
    const { date_from, date_to } = req.query;
    const df = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dt = date_to || new Date().toISOString().slice(0, 10);

    const { rows } = await db.query(`
      SELECT
        a.platform,
        c.name as campaign_name,
        a.utm_source,
        a.utm_campaign,
        a.utm_term as keyword,
        COUNT(DISTINCT a.lead_id) as attributed_leads,
        SUM(a.attributed_value) as attributed_value,
        COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'won') as won_leads
      FROM attribution a
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      LEFT JOIN leads l ON a.lead_id = l.id AND l.created_at BETWEEN $1 AND $2
      GROUP BY a.platform, c.name, a.utm_source, a.utm_campaign, a.utm_term
      ORDER BY attributed_leads DESC
      LIMIT 50
    `, [df, dt]);

    res.json({ attribution: rows });
  } catch (err) {
    console.error('attributionReport error:', err);
    res.status(500).json({ error: 'Erro ao buscar relatório de atribuição' });
  }
}

async function dailyChart(req, res) {
  try {
    const { date_from, date_to, platform } = req.query;
    const df = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dt = date_to || new Date().toISOString().slice(0, 10);

    const params = [df, dt];
    let platformFilter = '';
    if (platform) {
      platformFilter = `AND utm_source = $3`;
      params.push(platform);
    }

    const { rows } = await db.query(`
      SELECT DATE(created_at) as date,
        COUNT(*) as leads,
        SUM(estimated_value) as value,
        utm_source
      FROM leads
      WHERE created_at BETWEEN $1 AND $2
      ${platformFilter}
      GROUP BY DATE(created_at), utm_source
      ORDER BY date
    `, params);

    res.json({ chart: rows });
  } catch (err) {
    console.error('dailyChart error:', err);
    res.status(500).json({ error: 'Erro ao buscar gráfico diário' });
  }
}

module.exports = { overview, campaignPerformance, keywordPerformance, attributionReport, dailyChart };
