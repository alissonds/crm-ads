const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const automationService = require('../services/automationService');
const attributionService = require('../services/attributionService');

async function list(req, res) {
  try {
    const {
      page = 1, limit = 50, status, source, campaign_id,
      utm_source, search, assigned_to, priority, tag,
      date_from, date_to, sort = 'created_at', order = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let p = 1;

    if (status) { conditions.push(`l.status = $${p++}`); params.push(status); }
    if (utm_source) { conditions.push(`l.utm_source = $${p++}`); params.push(utm_source); }
    if (campaign_id) { conditions.push(`l.campaign_id = $${p++}`); params.push(campaign_id); }
    // Clientes (não-admin) só veem seus próprios leads
    const effectiveAssignedTo = req.user.role !== 'admin' ? req.user.id : assigned_to;
    if (effectiveAssignedTo) { conditions.push(`l.assigned_to = $${p++}`); params.push(effectiveAssignedTo); }
    if (priority) { conditions.push(`l.priority = $${p++}`); params.push(priority); }
    if (tag) { conditions.push(`$${p++} = ANY(l.tags)`); params.push(tag); }
    if (date_from) { conditions.push(`l.created_at >= $${p++}`); params.push(date_from); }
    if (date_to) { conditions.push(`l.created_at <= $${p++}`); params.push(date_to); }
    if (search) {
      conditions.push(`(l.name ILIKE $${p} OR l.email ILIKE $${p} OR l.phone ILIKE $${p} OR l.whatsapp ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const allowedSorts = ['created_at', 'name', 'status', 'score', 'updated_at', 'estimated_value'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortDir = order === 'ASC' ? 'ASC' : 'DESC';

    const [dataRes, countRes] = await Promise.all([
      db.query(`
        SELECT l.*,
          c.name as campaign_name,
          c.platform as campaign_platform,
          u.name as assigned_to_name,
          ts.name as source_name
        FROM leads l
        LEFT JOIN campaigns c ON l.campaign_id = c.id
        LEFT JOIN users u ON l.assigned_to = u.id
        LEFT JOIN traffic_sources ts ON l.traffic_source_id = ts.id
        ${where}
        ORDER BY l.${sortCol} ${sortDir}
        LIMIT $${p++} OFFSET $${p++}
      `, [...params, parseInt(limit), offset]),
      db.query(`SELECT COUNT(*) FROM leads l ${where}`, params),
    ]);

    res.json({
      leads: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)),
    });
  } catch (err) {
    console.error('list leads error:', err);
    res.status(500).json({ error: 'Erro ao buscar leads' });
  }
}

async function getById(req, res) {
  try {
    const { id } = req.params;
    const [leadRes, activitiesRes, attributionRes] = await Promise.all([
      db.query(`
        SELECT l.*,
          c.name as campaign_name, c.platform as campaign_platform,
          ag.name as ad_group_name,
          k.keyword_text as keyword_text,
          u.name as assigned_to_name,
          ts.name as source_name
        FROM leads l
        LEFT JOIN campaigns c ON l.campaign_id = c.id
        LEFT JOIN ad_groups ag ON l.ad_group_id = ag.id
        LEFT JOIN ad_keywords k ON l.keyword_id = k.id
        LEFT JOIN users u ON l.assigned_to = u.id
        LEFT JOIN traffic_sources ts ON l.traffic_source_id = ts.id
        WHERE l.id = $1
      `, [id]),
      db.query(`
        SELECT la.*, u.name as user_name
        FROM lead_activities la
        LEFT JOIN users u ON la.user_id = u.id
        WHERE la.lead_id = $1
        ORDER BY la.created_at DESC
        LIMIT 50
      `, [id]),
      db.query(`
        SELECT a.*, c.name as campaign_name
        FROM attribution a
        LEFT JOIN campaigns c ON a.campaign_id = c.id
        WHERE a.lead_id = $1
        ORDER BY a.touchpoint_order
      `, [id]),
    ]);

    if (!leadRes.rows[0]) return res.status(404).json({ error: 'Lead não encontrado' });
    res.json({
      lead: leadRes.rows[0],
      activities: activitiesRes.rows,
      attribution: attributionRes.rows,
    });
  } catch (err) {
    console.error('getById lead error:', err);
    res.status(500).json({ error: 'Erro ao buscar lead' });
  }
}

async function create(req, res) {
  const {
    name, email, phone, whatsapp, company,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    gclid, fbclid, keyword, campaign_id, ad_group_id, keyword_id,
    utm_tracking_id, traffic_source_id, landing_page_url,
    source_channel = 'api', estimated_value, notes, custom_fields = {},
  } = req.body;

  if (!name && !phone && !whatsapp && !email) {
    return res.status(400).json({ error: 'Pelo menos nome, telefone ou email é obrigatório' });
  }

  try {
    const result = await db.transaction(async (client) => {
      const score = await calculateInitialScore({ utm_source, gclid, fbclid, keyword });

      const { rows } = await client.query(`
        INSERT INTO leads (
          id, name, email, phone, whatsapp, company,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          gclid, fbclid, keyword, campaign_id, ad_group_id, keyword_id,
          utm_tracking_id, traffic_source_id, landing_page_url,
          source_channel, estimated_value, notes, custom_fields,
          score, status, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'new',NOW(),NOW()
        ) RETURNING *
      `, [
        uuidv4(), name, email, phone, whatsapp, company,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        gclid, fbclid, keyword, campaign_id, ad_group_id, keyword_id,
        utm_tracking_id, traffic_source_id, landing_page_url,
        source_channel, estimated_value, notes, JSON.stringify(custom_fields),
        score,
      ]);

      await client.query(`
        INSERT INTO lead_activities (id, lead_id, type, title, metadata, created_at)
        VALUES ($1, $2, 'status_change', 'Lead criado', $3, NOW())
      `, [uuidv4(), rows[0].id, JSON.stringify({ source: utm_source, channel: source_channel })]);

      return rows[0];
    });

    setImmediate(async () => {
      try {
        await attributionService.createAttribution(result);
        await automationService.trigger('lead_created', result);
      } catch (e) {
        console.error('Post-create error:', e);
      }
    });

    res.status(201).json({ lead: result });
  } catch (err) {
    console.error('Create lead error:', err);
    res.status(500).json({ error: 'Erro ao criar lead' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const {
      name, email, phone, whatsapp, company, status, priority,
      score, tags, estimated_value, actual_value, notes,
      assigned_to, custom_fields, lost_reason,
    } = req.body;

    const { rows: existing } = await db.query('SELECT * FROM leads WHERE id = $1', [id]);
    if (!existing[0]) return res.status(404).json({ error: 'Lead não encontrado' });

    const updates = [];
    const params = [];
    let p = 1;

    const fields = { name, email, phone, whatsapp, company, status, priority,
      score, estimated_value, actual_value, notes, assigned_to, lost_reason };

    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) { updates.push(`${key} = $${p++}`); params.push(val); }
    }
    if (tags !== undefined) { updates.push(`tags = $${p++}`); params.push(tags); }
    if (custom_fields !== undefined) { updates.push(`custom_fields = $${p++}`); params.push(JSON.stringify(custom_fields)); }
    if (status === 'won') { updates.push(`won_at = NOW()`); }
    if (status === 'lost') { updates.push(`lost_at = NOW()`); }
    updates.push(`updated_at = NOW()`);

    params.push(id);
    const { rows } = await db.query(
      `UPDATE leads SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    );

    if (status && status !== existing[0].status) {
      await db.query(`
        INSERT INTO lead_activities (id, lead_id, user_id, type, title, metadata, created_at)
        VALUES ($1,$2,$3,'status_change',$4,$5,NOW())
      `, [uuidv4(), id, req.user.id, `Status: ${existing[0].status} → ${status}`,
          JSON.stringify({ from: existing[0].status, to: status, reason: lost_reason })]);

      setImmediate(() => automationService.trigger('lead_status_changed', rows[0]));
    }

    res.json({ lead: rows[0] });
  } catch (err) {
    console.error('update lead error:', err);
    res.status(500).json({ error: 'Erro ao atualizar lead' });
  }
}

async function addActivity(req, res) {
  try {
    const { id } = req.params;
    const { type, title, description, metadata = {} } = req.body;

    if (!type || !title) return res.status(400).json({ error: 'Tipo e título obrigatórios' });

    const { rows } = await db.query(`
      INSERT INTO lead_activities (id, lead_id, user_id, type, title, description, metadata, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *
    `, [uuidv4(), id, req.user.id, type, title, description, JSON.stringify(metadata)]);

    await db.query('UPDATE leads SET last_contact_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
    res.status(201).json({ activity: rows[0] });
  } catch (err) {
    console.error('addActivity error:', err);
    res.status(500).json({ error: 'Erro ao adicionar atividade' });
  }
}

async function stats(req, res) {
  try {
    const { date_from, date_to } = req.query;
    const params = [];
    let dateFilter;
    let campaignDateFilter;
    if (date_from && date_to) {
      dateFilter = `AND created_at BETWEEN $1 AND $2`;
      campaignDateFilter = `AND l.created_at BETWEEN $1 AND $2`;
      params.push(date_from, date_to);
    } else {
      dateFilter = `AND created_at >= NOW() - INTERVAL '30 days'`;
      campaignDateFilter = `AND l.created_at >= NOW() - INTERVAL '30 days'`;
    }

    const [statusRes, sourceRes, campaignRes] = await Promise.all([
      db.query(`SELECT status, COUNT(*) as count, SUM(estimated_value) as value FROM leads WHERE 1=1 ${dateFilter} GROUP BY status`, params),
      db.query(`SELECT utm_source, COUNT(*) as count FROM leads WHERE 1=1 ${dateFilter} GROUP BY utm_source ORDER BY count DESC LIMIT 10`, params),
      db.query(`SELECT c.name, c.platform, COUNT(l.id) as leads, SUM(l.estimated_value) as value
        FROM leads l JOIN campaigns c ON l.campaign_id = c.id
        WHERE 1=1 ${campaignDateFilter} GROUP BY c.id, c.name, c.platform ORDER BY leads DESC LIMIT 10`, params),
    ]);

    res.json({ byStatus: statusRes.rows, bySource: sourceRes.rows, byCampaign: campaignRes.rows });
  } catch (err) {
    console.error('stats error:', err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
}

async function calculateInitialScore({ utm_source, gclid, fbclid, keyword }) {
  let score = 10;
  if (gclid) score += 30;
  else if (fbclid) score += 25;
  else if (utm_source === 'google') score += 20;
  else if (utm_source === 'facebook' || utm_source === 'instagram') score += 15;
  if (keyword) score += 10;
  return Math.min(score, 100);
}

module.exports = { list, getById, create, update, addActivity, stats };
