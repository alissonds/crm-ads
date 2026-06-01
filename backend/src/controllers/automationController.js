const automationService = require('../services/automationService');

async function list(req, res) {
  const automations = await automationService.list();
  res.json({ automations });
}

async function create(req, res) {
  const automation = await automationService.create(req.body, req.user.id);
  res.status(201).json({ automation });
}

async function update(req, res) {
  const automation = await automationService.update(req.params.id, req.body);
  if (!automation) return res.status(404).json({ error: 'Automação não encontrada' });
  res.json({ automation });
}

async function remove(req, res) {
  await automationService.remove(req.params.id);
  res.json({ message: 'Automação removida' });
}

async function test(req, res) {
  const { lead_id } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id obrigatório' });

  const db = require('../config/database');
  const { rows: [automation] } = await db.query('SELECT * FROM automations WHERE id = $1', [req.params.id]);
  const { rows: [lead] } = await db.query('SELECT * FROM leads WHERE id = $1', [lead_id]);

  if (!automation || !lead) return res.status(404).json({ error: 'Automação ou lead não encontrado' });

  await automationService.trigger(automation.trigger_type, lead);
  res.json({ message: 'Automação executada em modo teste' });
}

module.exports = { list, create, update, remove, test };
