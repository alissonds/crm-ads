const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const metaAds = require('../services/metaAdsService');
const automationService = require('../services/automationService');

function verifyMeta(req, res) {
  return metaAds.verifyWebhook(req, res);
}

async function receiveMeta(req, res) {
  res.sendStatus(200);
  try {
    const leads = await metaAds.processLeadAdsWebhook(req.body);
    for (const lead of leads) {
      if (lead) await automationService.trigger('lead_created', lead);
    }
  } catch (err) {
    console.error('Meta webhook error:', err);
  }
}

async function receiveGeneric(req, res) {
  try {
    const { token } = req.params;
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;

    const { rows: [config] } = await db.query(
      `SELECT * FROM webhook_configs WHERE endpoint_token = $1 AND is_active = true`,
      [token]
    );

    if (!config) return res.status(404).json({ error: 'Webhook não encontrado' });

    const payload = req.body;
    let leadData = {};

    const mapping = config.field_mapping || {};
    for (const [crm_field, source_field] of Object.entries(mapping)) {
      const value = getNestedValue(payload, source_field);
      if (value) leadData[crm_field] = value;
    }

    const defaults = config.default_values || {};
    leadData = { ...defaults, ...leadData };

    let lead = null;
    let status = 'processed';
    let errorMsg = null;

    try {
      if (leadData.phone || leadData.email) {
        const { rows: [existing] } = await db.query(
          `SELECT id FROM leads WHERE (phone = $1 OR email = $2) AND created_at > NOW() - INTERVAL '24h' LIMIT 1`,
          [leadData.phone, leadData.email]
        );
        if (existing) {
          status = 'duplicate';
        } else {
          const { rows } = await db.query(`
            INSERT INTO leads (id, name, email, phone, whatsapp, utm_source, utm_medium, utm_campaign,
              source_channel, status, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',NOW(),NOW()) RETURNING *
          `, [
            uuidv4(),
            leadData.name, leadData.email, leadData.phone, leadData.whatsapp || leadData.phone,
            leadData.utm_source || config.source,
            leadData.utm_medium || 'webhook',
            leadData.utm_campaign,
            config.source,
          ]);
          lead = rows[0];
          setImmediate(() => automationService.trigger('lead_created', lead));
        }
      }
    } catch (err) {
      status = 'failed';
      errorMsg = err.message;
    }

    await db.query(`
      INSERT INTO webhook_logs (id, webhook_config_id, lead_id, raw_payload, headers, ip_address, status, error_message, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    `, [
      uuidv4(), config.id, lead?.id,
      JSON.stringify(payload), JSON.stringify(req.headers),
      ip, status, errorMsg,
    ]);

    await db.query(
      `UPDATE webhook_configs SET received_count = received_count + 1, last_received_at = NOW() WHERE id = $1`,
      [config.id]
    );

    res.json({ status, lead_id: lead?.id });
  } catch (err) {
    console.error('receiveGeneric error:', err);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
}

async function listConfigs(req, res) {
  try {
    const { rows } = await db.query('SELECT * FROM webhook_configs ORDER BY created_at DESC');
    res.json({ configs: rows });
  } catch (err) {
    console.error('listConfigs error:', err);
    res.status(500).json({ error: 'Erro ao listar configurações de webhook' });
  }
}

async function createConfig(req, res) {
  try {
    const { name, source, field_mapping = {}, default_values = {} } = req.body;
    if (!name || !source) return res.status(400).json({ error: 'Nome e source obrigatórios' });

    const token = uuidv4().replace(/-/g, '');
    const { rows } = await db.query(`
      INSERT INTO webhook_configs (id, name, source, endpoint_token, field_mapping, default_values, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *
    `, [uuidv4(), name, source, token, JSON.stringify(field_mapping), JSON.stringify(default_values)]);

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001/api';
    res.status(201).json({
      config: rows[0],
      webhook_url: `${baseUrl}/webhook/lead/${token}`,
    });
  } catch (err) {
    console.error('createConfig error:', err);
    res.status(500).json({ error: 'Erro ao criar configuração de webhook' });
  }
}

function getNestedValue(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

module.exports = { verifyMeta, receiveMeta, receiveGeneric, listConfigs, createConfig };
