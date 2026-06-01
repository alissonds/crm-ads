const conversionService = require('../services/conversionService');
const db = require('../config/database');

async function list(req, res) {
  const { status, platform, limit = 50 } = req.query;
  const conditions = [];
  const params = [];
  let p = 1;
  if (status) { conditions.push(`c.status = $${p++}`); params.push(status); }
  if (platform) { conditions.push(`c.platform = $${p++}`); params.push(platform); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await db.query(`
    SELECT c.*, l.name as lead_name, l.gclid, l.fbclid
    FROM conversions c LEFT JOIN leads l ON c.lead_id = l.id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT $${p}
  `, [...params, parseInt(limit)]);

  res.json({ conversions: rows });
}

async function send(req, res) {
  const { lead_id, type = 'lead', value = 0, currency = 'BRL' } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id obrigatório' });

  const results = await conversionService.sendConversion(lead_id, type, value, currency);
  res.json({ results });
}

async function retry(req, res) {
  await conversionService.retryFailed();
  res.json({ message: 'Reenvio de conversões falhas iniciado' });
}

module.exports = { list, send, retry };
